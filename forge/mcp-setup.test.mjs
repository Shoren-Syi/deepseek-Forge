import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, resolve, sep } from 'node:path'

test('MCP 配置可重复执行和更换目录，同时保留用户设置', async () => {
  const repository = fileURLToPath(new URL('../', import.meta.url))
  const temporaryRoot = join(repository, 'forge/.local/tmp')
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(join(temporaryRoot, 'mcp-setup-'))
  const home = join(directory, 'home')
  const profile = join(home, 'profiles/desktop')
  const file = join(profile, 'cordis.patch.yml')
  const configure = workspace => {
    const result = spawnSync(process.execPath, [join(repository, 'forge/Connect-Filesystem-Mcp.mjs'), home, workspace], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  try {
    await mkdir(profile, { recursive: true })
    await writeFile(file, '- id: user-settings\n  config:\n    label: 保留用户设置\n    token: fake-local-test-token\n', 'utf8')
    configure(join(directory, 'first'))
    const first = await readFile(file, 'utf8')
    configure(join(directory, 'first'))
    assert.equal(await readFile(file, 'utf8'), first)
    configure(join(directory, 'second'))
    const second = await readFile(file, 'utf8')
    assert.match(second, /fake-local-test-token/)
    assert.match(second, /保留用户设置/)
    assert.equal(second.match(/id: preset-forge-local-mcp/g)?.length, 1)
    assert.ok(second.includes(join(directory, 'second')))
    assert.ok(!second.includes(join(directory, 'first')))
  } finally {
    if (!resolve(directory).startsWith(resolve(temporaryRoot) + sep)) throw new Error('测试清理目录越界。')
    await rm(directory, { recursive: true, force: true })
  }
})
