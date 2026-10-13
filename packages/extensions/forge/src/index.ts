/** Forge 工作提示直接进入原生提示装配，不另建执行控制器。 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { applyControls, type ForgeControls } from './controls.ts'

export type * from './types.ts'

export const name = 'forge'
export const inject = ['systemPrompt']

/** 具体工作要求由 Forge Profile 配置。 */
export interface Config extends ForgeControls {
  instructions?: string | undefined
  role: 'workflow' | 'controls'
}

const route = z.object({ provider: z.string().required(), model: z.string().required(), reasoningEffort: z.string() })
export const Config = z.object({
  instructions: z.string(),
  role: z.union(['workflow', 'controls']).default('workflow'),
    policies: z.dict(z.object({
      mode: z.union(['manual', 'rules']).default('manual'),
      maxSteps: z.number().min(0).step(1).default(0),
      tokenBudget: z.number().min(0).step(1).default(0),
      estimatedCostBudget: z.number().min(0).default(0),
      currency: z.string().default('CNY'),
    })).default({}).volatile(),
    routes: z.object({ fast: z.union([route, z.const(null)]).default(null), deep: z.union([route, z.const(null)]).default(null) }).default({}).volatile(),
    prices: z.array(z.object({
      provider: z.string().required(), model: z.string().required(), currency: z.string().default('CNY'),
      input: z.number().min(0).required(), output: z.number().min(0).required(),
      cacheRead: z.number().min(0).required(), cacheWrite: z.number().min(0).required(),
      source: z.string().required(),
    })).default([]).volatile(),
})

/**
 * 注册当前插件作用域的工作提示；卸载时由 Cordis 清理。
 * @param ctx - 原生插件上下文。
 * @param config - 当前 Profile 的工作要求。
 */
export function apply(ctx: Context, config: Config): void {
  const instructions = config.instructions
  if (instructions) ctx.effect(() => ctx.systemPrompt.section({
    name: 'forge:workflow',
    order: 80,
    text: instructions,
    interpolate: false,
  }), 'forge.workflow')
  if (config.role === 'controls') ctx.inject(['sessionProjections', 'sessionController'], inner => {
    applyControls(inner, config)
  })
}
