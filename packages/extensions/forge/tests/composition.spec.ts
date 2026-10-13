import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-agent'
import { bootProductionProfile } from '../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

it('独立 Forge 可以修改文件、报告命令失败、停止工具并在重启后续接', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forge-composition-'))
  const previous = { DSH_HOME: process.env.DSH_HOME, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL, FORGE_WORKSPACE_ROOT: process.env.FORGE_WORKSPACE_ROOT }
  const server = await startMockLlmServer({
    sequence: ['tool_call_success', 'success', 'tool_call_success', 'success', 'tool_call_success', 'success'],
    successText: 'Forge 工具调用已完成。',
    toolName: 'pwsh',
    toolArguments: JSON.stringify({ command: [
      "if (Test-Path 'cancel-tool.flag') {",
      "  Set-Content -LiteralPath 'tool-started.flag' -Value 'STARTED' -Encoding utf8",
      '  Start-Sleep -Seconds 30',
      "  Set-Content -LiteralPath 'after-cancel.flag' -Value 'UNEXPECTED' -Encoding utf8",
      "} elseif (Test-Path 'forge-check.txt') {",
      "  Write-Error 'FORGE_EXPECTED_FAILURE'",
      '  exit 7',
      '} else {',
      "  Set-Content -LiteralPath 'forge-check.txt' -Value 'FORGE_TOOL_OK' -Encoding utf8",
      '}',
    ].join('\n'), description: '检查文件修改、失败与取消' }),
  })
  let ctx: Awaited<ReturnType<typeof bootProductionProfile>> | undefined
  try {
    process.env.DSH_HOME = join(directory, 'home')
    process.env.DEEPSEEK_API_KEY = 'forge-local-check'
    process.env.DEEPSEEK_BASE_URL = `${server.baseURL}/v1`
    const workspace = join(directory, 'workspace')
    await mkdir(workspace)
    process.env.FORGE_WORKSPACE_ROOT = workspace
    await writeFile(join(workspace, 'user-change.txt'), '用户已有修改', 'utf8')
    const checkPatch = join(directory, 'check.patch.yml')
    await writeFile(checkPatch, '- id: hmr\n  disabled: true\n', 'utf8')
    const boot = () => bootProductionProfile({
      binName: 'forge-composition-check', profile: 'web',
      overlayPaths: [checkPatch],
      prepare: ctx => {
        ctx.provide('cmdlineArgs', { get: () => ['--port', '0', '--no-open'] })
        ctx.provide('appExit', code => { throw new Error(`启动退出码 ${code}`) })
      },
    })
    ctx = await boot()
    await ctx.loader.await()
    const created = await ctx.sessionController.create({ cwd: workspace })
    expect(created.agentPreset).toBe('forge')
    const agent = ctx.agents.get(created.sessionId)!
    const answers: string[] = []
    ctx.on('session/event', (session, event) => {
      if (session === agent.session && event.type === 'assistant/message') answers.push(JSON.stringify(event.data))
    })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: '执行一次本地工具检查。' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    await ctx.sessions.flush(agent.session)
    expect((await readFile(join(workspace, 'forge-check.txt'), 'utf8')).trim()).toBe('FORGE_TOOL_OK')
    expect(server.requests).toHaveLength(2)
    expect(JSON.stringify(server.requests[0]?.body)).toContain('不要过多的防御和验证')
    expect(answers.join('\n')).toContain('Forge 工具调用已完成。')
    expect(await readFile(join(workspace, 'user-change.txt'), 'utf8')).toBe('用户已有修改')

    agent.followup(createUserMessage({ content: [{ type: 'text', text: '检查错误反馈。' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(server.requests).toHaveLength(4)
    expect(JSON.stringify(server.requests[3]?.body)).toContain('FORGE_EXPECTED_FAILURE')
    expect(JSON.stringify(server.requests[3]?.body)).toContain('exit code: 7')

    await writeFile(join(workspace, 'cancel-tool.flag'), '启动长命令', 'utf8')
    agent.followup(createUserMessage({ content: [{ type: 'text', text: '执行可停止的长命令。' }], source: { kind: 'user' } }))
    await expect.poll(async () => {
      try { await access(join(workspace, 'tool-started.flag')); return true }
      catch { return false }
    }, { timeout: 10_000 }).toBe(true)
    expect(ctx.sessionController.cancel({ sessionId: created.sessionId })).toEqual({ accepted: true })
    await agent.whenIdle()
    const ended = agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1)
    expect(ended?.data.reason.kind).toBe('aborted')
    await expect(access(join(workspace, 'after-cancel.flag'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(server.requests).toHaveLength(5)
    await ctx.sessions.flush(agent.session)

    await ctx.fiber.dispose()
    ctx = await boot()
    await ctx.loader.await()
    await ctx.sessionController.create({ sessionId: created.sessionId, cwd: workspace })
    const resumed = ctx.agents.get(created.sessionId)!
    expect(JSON.stringify(resumed.session.snapshotEvents())).toContain('FORGE_EXPECTED_FAILURE')
    resumed.followup(createUserMessage({ content: [{ type: 'text', text: '从保留的会话继续。' }], source: { kind: 'user' } }))
    await resumed.whenIdle()
    expect(server.requests).toHaveLength(6)
    expect(JSON.stringify(server.requests[5]?.body)).toContain('从保留的会话继续')
    expect((await readFile(join(workspace, 'forge-check.txt'), 'utf8')).trim()).toBe('FORGE_TOOL_OK')
    expect(await readFile(join(workspace, 'user-change.txt'), 'utf8')).toBe('用户已有修改')
  } finally {
    await ctx?.fiber.dispose()
    await server.close()
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
