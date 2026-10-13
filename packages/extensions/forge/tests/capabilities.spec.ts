import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it } from 'vitest'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { readPrimaryRuntime, workspaceDependencyPaths } from '@deepseek-ai/dsh-tool-workspace-dependencies'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-agent'
import { bootProductionProfile } from '../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

it.each(['code', 'browser', 'office', 'desktop'] as const)('Forge %s 能力在所选会话中完成实际操作', async kind => {
  const directory = await mkdtemp(join(tmpdir(), 'forge-capability-'))
  const workspace = join(directory, 'workspace')
  await mkdir(workspace)
  const old = { DSH_HOME: process.env.DSH_HOME, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL, FORGE_WORKSPACE_ROOT: process.env.FORGE_WORKSPACE_ROOT }
  const website = createServer((_request, response) => response.end('<!doctype html><h1>FORGE_BROWSER_READY</h1>'))
  let command: string
  let toolName: string
  let argumentsValue: object
  if (kind === 'code') {
    await writeFile(join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'nodenext', strict: true }, include: ['*.ts'] }), 'utf8')
    await writeFile(join(workspace, 'definitions.ts'), "export function greet(name: string) { return 'Hello ' + name }\n", 'utf8')
    await writeFile(join(workspace, 'consumer.ts'), "import { greet } from './definitions.js'\nconsole.log(greet('Forge'))\n", 'utf8')
    toolName = 'lsp'
    argumentsValue = { operation: 'goToDefinition', file_path: join(workspace, 'consumer.ts'), line: 2, character: 14 }
  } else if (kind === 'browser') {
    website.listen(0, '127.0.0.1')
    await once(website, 'listening')
    const address = website.address()
    if (!address || typeof address === 'string') throw new Error('本地页面启动失败')
    toolName = 'mcp__playwright-mcp__browser_navigate'
    argumentsValue = { url: `http://127.0.0.1:${address.port}` }
  } else if (kind === 'office') {
    const source = process.env.FORGE_PRIMARY_RUNTIME!
    const runtime = await readPrimaryRuntime(source)
    const paths = workspaceDependencyPaths(source, runtime)
    await writeFile(join(workspace, 'office-check.py'), [
      'from openpyxl import Workbook', 'from docx import Document', 'from pptx import Presentation',
      'book = Workbook()', 'book.active["A1"] = "FORGE_OFFICE_READY"', 'book.save("check.xlsx")',
      'document = Document()', 'document.add_paragraph("FORGE_OFFICE_READY")', 'document.save("check.docx")',
      'slides = Presentation()', 'slide = slides.slides.add_slide(slides.slide_layouts[0])',
      'slide.shapes.title.text = "FORGE_OFFICE_READY"', 'slides.save("check.pptx")',
      'print("FORGE_OFFICE_READY")',
    ].join('\n'), 'utf8')
    command = `& '${paths.python}' 'office-check.py'`
    toolName = 'pwsh'
    argumentsValue = { command, description: '创建三个真实 Office 文件' }
  } else {
    toolName = 'pwsh'
    argumentsValue = { command: 'Write-Output FORGE_DESKTOP_READY', description: '检查桌面工具装载' }
  }
  const model = await startMockLlmServer({ sequence: ['tool_call_success', 'success'], toolName,
    toolArguments: JSON.stringify(argumentsValue), successText: '能力检查已完成。' })
  let ctx: Awaited<ReturnType<typeof bootProductionProfile>> | undefined
  try {
    process.env.DSH_HOME = join(directory, 'home')
    process.env.FORGE_WORKSPACE_ROOT = workspace
    process.env.DEEPSEEK_API_KEY = 'forge-local-capability-check'
    process.env.DEEPSEEK_BASE_URL = `${model.baseURL}/v1`
    const patch = join(directory, 'test.patch.yml')
    await writeFile(patch, '- id: hmr\n  disabled: true\n', 'utf8')
    ctx = await bootProductionProfile({ profile: 'web', binName: 'forge-capability-check', overlayPaths: [patch],
      prepare: ctx => {
        ctx.provide('cmdlineArgs', { get: () => ['--port', '0', '--no-open'] })
        ctx.provide('appExit', code => { throw new Error(`启动退出码 ${code}`) })
      },
    })
    await ctx.loader.await()
    const roster = await ctx.agentPresets.list()
    expect(roster.filter(preset => preset.id.startsWith('forge'))).toHaveLength(6)
    const created = await ctx.sessionController.create({ cwd: workspace, agentPreset: kind === 'code' || kind === 'browser' ? 'forge' : `forge-${kind}` })
    const agent = ctx.agents.get(created.sessionId)!
    if (kind === 'browser') await ctx.agentPresets.select(agent, 'forge-browser')
    if (kind === 'desktop') {
      const names = ctx.tools.schemas(agent).map(tool => tool.name)
      expect(names.some(name => name.startsWith('cua_driver_native__'))).toBe(true)
      expect(names).not.toContain('lsp')
      expect(names.some(name => name.startsWith('mcp__playwright'))).toBe(false)
    }
    agent.followup(createUserMessage({ content: [{ type: 'text', text: '执行一次所选能力。' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(model.requests).toHaveLength(2)
    const result = JSON.stringify(model.requests[1]?.body)
    if (kind === 'browser') {
      expect(result).toContain('page.goto')
      const snapshot = result.match(/\.playwright-mcp\\\\(page-[^)]*\.yml)/)?.[1]
      expect(snapshot).toBeDefined()
      expect(await readFile(join(workspace, '.playwright-mcp', snapshot!), 'utf8')).toContain('FORGE_BROWSER_READY')
    } else expect(result).toContain(kind === 'code' ? 'definitions.ts' : kind === 'office' ? 'FORGE_OFFICE_READY' : 'FORGE_DESKTOP_READY')
    if (kind === 'office') {
      for (const extension of ['xlsx', 'docx', 'pptx']) expect((await readFile(join(workspace, `check.${extension}`))).subarray(0, 2).toString()).toBe('PK')
    }
  } finally {
    await ctx?.fiber.dispose()
    await model.close()
    website.closeAllConnections()
    await new Promise<void>(resolve => website.close(() => resolve()))
    for (const [name, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(directory, { recursive: true, force: true })
  }
}, 90_000)
