import type { Context } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cosmokit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-token-meter'
import type {} from '@deepseek-ai/dsh-session-stats'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { ForgeControlValues, ForgeRoute, ForgeModelUsage, ForgePrice } from './types.ts'
import { economyProjection } from './economy.ts'

/** 原生设置通过稳定引用更新，不因编辑预算重建执行循环。 */
export interface ForgeControls {
  policies: Volatile<ForgeControlValues['policies']>
  routes: Volatile<ForgeControlValues['routes']>
  prices: Volatile<ForgeControlValues['prices']>
}

/**
 * 仅识别明确任务信号，不调用分类模型。
 * @param text - 用户任务文本。
 * @param routes - 用户选择的真实角色模型。
 * @returns 确定的路线；不确定或未配置时沿用当前模型。
 */
export function routeFor(text: string, routes: ForgeControlValues['routes']): ForgeRoute | undefined {
  const intent = text.replace(/(?:不需要|无需|不要|不涉及|不做)[^，,。；;\n]{0,30}(?:架构|跨模块|并发|事务|迁移)/gu, '')
  if (/架构|跨模块|并发|事务|迁移|architecture|concurren|migration|transaction/iu.test(intent)) return routes.deep ?? undefined
  if (/文案|样式|格式|错别字|css|typo|wording|format/iu.test(text)) return routes.fast ?? undefined
  return undefined
}

/**
 * 按同币种单价估算已用费用，不猜测汇率。
 * @param models - 实际按模型用量。
 * @param prices - 用户配置的每百万 Token 单价。
 * @param currency - 预算币种。
 * @returns 估算费用；缺少同币种单价时为 undefined。
 */
export function estimateCost(models: readonly ForgeModelUsage[], prices: readonly ForgePrice[], currency: string): number | undefined {
  let total = 0
  for (const row of models) {
    const price = prices.find(value => value.provider === row.provider && value.model === row.model && value.currency === currency)
    if (!price) return undefined
    total += (row.input * price.input + row.output * price.output + row.cacheRead * price.cacheRead + row.cacheWrite * price.cacheWrite) / 1_000_000
  }
  return total
}

/**
 * 注册一份会话的预算和首轮路由，已开始的请求仍由原生取消管理。
 * @param ctx - 原生能力上下文。
 * @param controls - 原生设置的稳定配置引用。
 */
export function applyControls(ctx: Context, controls: ForgeControls): void {
  ctx.sessionProjections.register(economyProjection)
  const intents = new WeakMap<Agent, string>()
  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    if (!intents.has(agent) && message.source.kind === 'user') {
      intents.set(agent, message.content.filter(block => block.type === 'text').map(block => block.text).join('\n'))
    }
  })
  ctx.on('system-prompt/assemble', async (_assembly, { agent }, next) => {
    if (agent && agent.session.requestHeader() === undefined) {
      const policy = controls.policies.get()[agent.id]
      const pending = ctx.sessionProjections.snapshot(agent.session).values.modelSelection?.next
      if (policy?.mode === 'rules' && pending == null) {
        const candidate = routeFor(intents.get(agent) ?? '', controls.routes.get())
        if (candidate) await ctx.sessionController.selectModel({ sessionId: agent.id, ...candidate, rememberDefault: false })
      }
    }
    return next()
  }, { prepend: true })
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const policy = controls.policies.get()[agent.id]
    if (policy === undefined) return next()
    const values = ctx.sessionProjections.snapshot(agent.session).values
    const usage = values.tokenUsage
    const spent = usage ? usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens : 0
    if ((policy.maxSteps > 0 && (values.sessionStats?.steps ?? 0) >= policy.maxSteps)
      || (policy.tokenBudget > 0 && spent >= policy.tokenBudget)) return { kind: 'reject' }
    if (policy.estimatedCostBudget > 0) {
      const prices = controls.prices.get()
      const current = values.modelSelection?.next ?? ctx.get('agentDefaultModel')?.currentSelection()
      const price = prices.find(value => value.provider === current?.provider && value.model === current?.model && value.currency === policy.currency)
      const amount = estimateCost(values.forgeEconomy?.models ?? [], prices, policy.currency)
      if (!price || amount === undefined || amount >= policy.estimatedCostBudget) return { kind: 'reject' }
    }
    return next()
  }, { prepend: true })
}
