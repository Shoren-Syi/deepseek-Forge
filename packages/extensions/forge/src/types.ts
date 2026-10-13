/** 模型路由使用供应商真实标识，推理强度由供应商解释。 */
export interface ForgeRoute {
  provider: string
  model: string
  reasoningEffort?: string
}

/** 一份会话的可选执行预算；零表示不限，规则路由只在新任务首轮选择。 */
export interface ForgeTaskPolicy {
  mode: 'manual' | 'rules'
  maxSteps: number
  tokenBudget: number
  estimatedCostBudget: number
  currency: string
}

/** 用户配置的每百万 Token 单价，仅用于估算，不冒充供应商账单。 */
export interface ForgePrice {
  provider: string
  model: string
  currency: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  source: string
}

/** 控制项保存在原生设置，实际用量仍来自原生事件。 */
export interface ForgeControlValues {
  policies: Record<string, ForgeTaskPolicy>
  routes: { fast?: ForgeRoute | null; deep?: ForgeRoute | null }
  prices: ForgePrice[]
}

/** 一个实际模型路线的累计计费 Token。各桶互斥，推理不重复计入输出。 */
export interface ForgeModelUsage {
  provider: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** 按模型拆分的原生用量和重试次数，未另建成本账本。 */
export interface ForgeEconomy {
  models: ForgeModelUsage[]
  retries: number
  modelSwitches: number
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Forge 按实际请求模型汇总的用量。 */
    forgeEconomy: ForgeEconomy
  }
}
