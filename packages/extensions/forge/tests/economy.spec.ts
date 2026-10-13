import { Context } from '@deepseek-ai/cordis'
import Sessions from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import { createMessage } from '@deepseek-ai/dsh-llm'
import { RetryId } from '@deepseek-ai/dsh-llm-retry'
import { expect, it } from 'vitest'
import { economyProjection } from '../src/economy.ts'
import { routeFor, estimateCost } from '../src/controls.ts'

it('分模型累计包含失败尝试，最终用量替换部分用量且推理不重复收费', async () => {
  const ctx = new Context()
  await ctx.plugin(Sessions)
  await ctx.plugin(Projections)
  ctx.sessionProjections.register(economyProjection)
  const session = ctx.sessions.create()
  try {
    session.append('request/header', { reason: 'initial', header: { config: { provider: 'fixture', model: 'fast' } } })
    session.append('assistant/attempt', { turn: 1, step: 1, stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 20 } } }] })
    const usage = { inputTokens: 12, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 3, reasoningTokens: 4 }
    session.append('assistant/message', { turn: 1, step: 1, usage, stream: [], message: createMessage({ role: 'assistant', content: [], source: { kind: 'model', provider: 'fixture', model: 'fast' } }) }, { surfaceOp: 'append' })
    expect(ctx.sessionProjections.snapshot(session).values.forgeEconomy?.models).toEqual([{ provider: 'fixture', model: 'fast', input: 12, output: 5, cacheRead: 20, cacheWrite: 3 }])
    session.append('llm/retry-started', { retryId: RetryId('economy-retry'), turn: 1, step: 1, retry: 1 })
    session.append('assistant/attempt', { turn: 1, step: 1, stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage: { inputTokens: 8, outputTokens: 1 } } }] })
    session.append('request/header', { reason: 'change', header: { config: { provider: 'fixture', model: 'deep' } } })
    session.append('assistant/attempt', { turn: 2, step: 1, stream: [{ type: 'chunk', time: 0, chunk: { type: 'usage', usage: { inputTokens: 30, outputTokens: 9 } } }] })
    const value = ctx.sessionProjections.snapshot(session).values.forgeEconomy!
    expect(value.models).toEqual([
      { provider: 'fixture', model: 'fast', input: 20, output: 6, cacheRead: 20, cacheWrite: 3 },
      { provider: 'fixture', model: 'deep', input: 30, output: 9, cacheRead: 0, cacheWrite: 0 },
    ])
    expect(value.retries).toBe(1)
    expect(value.modelSwitches).toBe(1)
  } finally { await ctx.fiber.dispose() }
})

it('确定的任务信号选择角色模型，否定复杂要求和不确定任务不升级', () => {
  const routes = { fast: { provider: 'fixture', model: 'fast' }, deep: { provider: 'fixture', model: 'deep' } }
  expect(routeFor('调整 CSS，不涉及架构', routes)).toEqual(routes.fast)
  expect(routeFor('修复跨模块并发事务', routes)).toEqual(routes.deep)
  expect(routeFor('处理当前工作', routes)).toBeUndefined()
})

it('估算按缓存分类计费，缺少同币种单价保持未知', () => {
  const models = [{ provider: 'fixture', model: 'fast', input: 1000000, output: 1000000, cacheRead: 1000000, cacheWrite: 1000000 }]
  const prices = [{ provider: 'fixture', model: 'fast', input: 2, output: 3, cacheRead: 0.5, cacheWrite: 1, currency: 'CNY', source: '测试样例' }]
  expect(estimateCost(models, prices, 'CNY')).toBe(6.5)
  expect(estimateCost(models, prices, 'USD')).toBeUndefined()
})
