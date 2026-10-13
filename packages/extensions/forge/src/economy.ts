import { z } from 'zod'
import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { ForgeEconomy } from './types.ts'

const usageSchema = z.object({
  provider: z.string(), model: z.string(),
  input: z.number().nonnegative(), output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(), cacheWrite: z.number().nonnegative(),
})
const viewSchema = z.object({ models: z.array(usageSchema), retries: z.number().int().nonnegative(), modelSwitches: z.number().int().nonnegative() })
const stateSchema = z.object({
  totals: viewSchema,
  route: z.object({ provider: z.string(), model: z.string() }).nullable(),
  last: z.object({ turn: z.number(), step: z.number(), buckets: usageSchema }).nullable(),
})
type EconomyState = z.infer<typeof stateSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    forgeEconomy: EconomyState
  }
}

/** 同一尝试的最终用量替换部分用量，重试则作为新的付费尝试累计。 */
export const economyProjection = {
  key: 'forgeEconomy', stateVersion: 1, stateSchema,
  init: (): EconomyState => ({ totals: { models: [], retries: 0, modelSwitches: 0 }, route: null, last: null }),
  apply: (state, event) => {
    if (event.type === 'request/header') {
      const { provider, model } = event.data.header.config
      const changed = state.route !== null && (state.route.provider !== provider || state.route.model !== model)
      return { ...state, route: { provider, model }, totals: { ...state.totals, modelSwitches: state.totals.modelSwitches + Number(changed) } }
    }
    if (event.type === 'llm/retry-started') return { ...state, last: null, totals: { ...state.totals, retries: state.totals.retries + 1 } }
    if ((event.type !== 'assistant/message' && event.type !== 'assistant/attempt') || state.route === null) return state
    const usage = event.type === 'assistant/message' && event.data.usage !== undefined
      ? event.data.usage : lastAssistantStreamChunk(event.data.stream, 'usage')?.usage
    if (usage === undefined) return state
    const { turn, step } = event.data
    const buckets = { ...state.route, input: usage.inputTokens, output: usage.outputTokens, cacheRead: usage.cacheReadTokens ?? 0, cacheWrite: usage.cacheWriteTokens ?? 0 }
    const previous = state.last?.turn === turn && state.last.step === step ? state.last.buckets : undefined
    const models = state.totals.models.map(row => ({ ...row }))
    const adjust = (value: typeof buckets, sign: number) => {
      let row = models.find(item => item.provider === value.provider && item.model === value.model)
      if (!row) { row = { provider: value.provider, model: value.model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }; models.push(row) }
      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) row[key] += sign * value[key]
    }
    if (previous) adjust(previous, -1)
    adjust(buckets, 1)
    return { ...state, totals: { ...state.totals, models }, last: { turn, step, buckets } }
  },
  wire: { viewSchema, view: (state): ForgeEconomy => state.totals },
} satisfies ProjectionDefinition<'forgeEconomy', EconomyState>
