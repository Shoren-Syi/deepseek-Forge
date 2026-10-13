import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeForgeProfiles } from './profile.mjs'

test('升级只迁移旧默认项，用户设置与凭据保持原样', async () => {
  const home = await mkdtemp(join(tmpdir(), 'forge-upgrade-'))
  const manifest = fileURLToPath(new URL('../vendor/include/package.json', import.meta.url))
  const directory = join(home, 'profiles', 'desktop')
  try {
    await mkdir(directory, { recursive: true })
    const legacy = await readFile(new URL('./legacy.patch.yml', import.meta.url), 'utf8')
    const text = `${legacy}\n- id: user-model\n  config:\n    apiKey: fake-local-test-key\n    endpoint: https://example.invalid/v1\n- id: user-plugin\n  name: example-user-plugin\n  config:\n    enabled: true\n`
    const file = join(directory, 'cordis.patch.yml')
    await writeFile(file, text, 'utf8')
    await initializeForgeProfiles(home, manifest)
    const migrated = await readFile(file, 'utf8')
    assert.match(migrated, /fake-local-test-key/)
    assert.match(migrated, /example-user-plugin/)
    assert.doesNotMatch(migrated, /preset-forge/)
    assert.equal(await readFile(`${file}.before-forge-upgrade`, 'utf8'), text)
    await initializeForgeProfiles(home, manifest)
    assert.equal(await readFile(file, 'utf8'), migrated)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
