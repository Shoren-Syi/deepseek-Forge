import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('真实 Profile 中路由不改全局默认，预算暂停后可提高上限继续原会话', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forge-controls-'))
  try {
    // 独立 Node 使用同一套构建模块，避免测试转换器与 Loader 的模块身份混用。
    const runner = fileURLToPath(new URL('./fixtures/controls-runner.mjs', import.meta.url))
    const result = await promisify(execFile)(process.execPath, [runner, directory], { timeout: 55000, maxBuffer: 1024 * 1024, env: process.env })
    expect(result.stdout).toContain('FORGE_CONTROLS_OK')
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 60000)
