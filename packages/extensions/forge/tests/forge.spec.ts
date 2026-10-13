import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as Forge from '../src/index.ts'

it('工作要求原样装配，插件卸载后不会留在下一次提示中', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt, { includeRuntimeContext: false })
    const instructions = '简单、稳定、高效。保留字面量 {{example}}。'
    const fiber = await ctx.plugin(Forge, { instructions })
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain(instructions)
    await fiber.dispose()
    expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain(instructions)
  } finally {
    await ctx.fiber.dispose()
  }
})
