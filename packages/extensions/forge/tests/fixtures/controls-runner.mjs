import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { startMockLlmServer } from '../../../../test-support/llm-mock-server/lib/index.js'
import { bootProductionProfile } from '../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'
const directory = process.argv[2]
const workspace = join(directory, 'workspace')
await mkdir(workspace)
process.env.DSH_HOME = join(directory, 'home')
process.env.FORGE_WORKSPACE_ROOT = workspace
const model = await startMockLlmServer({ sequence: ['tool_call_success', 'success', 'tool_call_success', 'success'], toolName: 'pwsh', toolArguments: JSON.stringify({ command: "Set-Content -LiteralPath 'changed.txt' -Value 'ROUTED' -Encoding utf8", description: '记录路由执行结果' }) })
process.env.DEEPSEEK_API_KEY = 'forge-local-controls-check'
process.env.DEEPSEEK_BASE_URL = `${model.baseURL}/v1`
const patch = join(directory, 'check.patch.yml')
await writeFile(patch, '- id: hmr\n  disabled: true\n', 'utf8')
const ctx = await bootProductionProfile({ profile: 'web', binName: 'forge-controls-check', overlayPaths: [patch], prepare: inner => {
  inner.provide('cmdlineArgs', { get: () => ['--port', '0', '--no-open'] })
  inner.provide('appExit', code => { throw new Error(`启动退出码 ${code}`) })
} })
await ctx.loader.await()
try {
    const original = ctx.agentDefaultModel.currentSelection()
    const created = await ctx.sessionController.create({ cwd: workspace, agentPreset: 'forge' })
    const agent = ctx.agents.get(created.sessionId)
    await ctx.settings.update('forge-controls', { policies: { [agent.id]: { mode: 'rules', maxSteps: 1, tokenBudget: 0 } }, routes: { deep: { provider: original.provider, model: 'deepseek-v4-pro' } } })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: '修复跨模块并发问题，先执行一次工具。' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    assert.equal(model.requests.length, 1)
    assert.equal(model.requests[0]?.body.model, 'deepseek-v4-pro')
    assert.deepEqual(ctx.agentDefaultModel.currentSelection(), original)
    assert.equal((await readFile(join(workspace, 'changed.txt'), 'utf8')).trim(), 'ROUTED')
    assert.equal(agent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1)?.data.reason.kind, 'blocked')
    await ctx.settings.update('forge-controls', { policies: { [agent.id]: { mode: 'rules', maxSteps: 0, tokenBudget: 0 } } })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: '预算已提高，继续并报告结果。' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    assert.equal(model.requests.length, 2)
    assert.equal(model.requests[1]?.body.model, 'deepseek-v4-pro')
    assert.equal(ctx.sessionProjections.snapshot(agent.session).values.forgeEconomy?.models[0]?.model, 'deepseek-v4-pro')

  const tokenSession = await ctx.sessionController.create({ cwd: workspace, agentPreset: 'forge' })
  const tokenAgent = ctx.agents.get(tokenSession.sessionId)
  await ctx.settings.update('forge-controls', { policies: { [tokenAgent.id]: { mode: 'manual', maxSteps: 0, tokenBudget: 1 } } })
  tokenAgent.followup(createUserMessage({ content: [{ type: 'text', text: '执行工具后按 Token 预算暂停。' }], source: { kind: 'user' } }))
  await tokenAgent.whenIdle()
  assert.equal(model.requests.length, 3)
  assert.equal(tokenAgent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1)?.data.reason.kind, 'blocked')
  const priceSession = await ctx.sessionController.create({ cwd: workspace, agentPreset: 'forge' })
  const priceAgent = ctx.agents.get(priceSession.sessionId)
  await ctx.settings.update('forge-controls', { policies: { [priceAgent.id]: { mode: 'manual', maxSteps: 0, tokenBudget: 0, estimatedCostBudget: 1, currency: 'CNY' } } })
  priceAgent.followup(createUserMessage({ content: [{ type: 'text', text: '缺少价格时不得猜测费用。' }], source: { kind: 'user' } }))
  await priceAgent.whenIdle()
  assert.equal(model.requests.length, 3)
  assert.equal(priceAgent.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1)?.data.reason.kind, 'blocked')
  console.log('FORGE_CONTROLS_OK')
} finally {
  await ctx.fiber.dispose()
  await model.close()
}