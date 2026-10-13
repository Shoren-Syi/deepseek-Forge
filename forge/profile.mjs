import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

/** 将旧版复制的 Forge 默认项迁回内置配置，保留用户自己的设置和凭据。 */
export async function initializeForgeProfiles(home, includeManifest) {
  const require = createRequire(includeManifest)
  const yaml = require('js-yaml')
  const { entryListSchema } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis-plugin-include')).href)
  const legacy = yaml.load(await readFile(new URL('./legacy.patch.yml', import.meta.url), 'utf8'), { schema: entryListSchema })
  const defaults = new Map(legacy.flatMap(entry => entry.insert ?? [entry]).map(entry => [entry.id, entry]))
  for (const name of ['desktop', 'forge']) {
    const file = join(home, 'profiles', name, 'cordis.patch.yml')
    let text
    try { text = await readFile(file, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    const entries = yaml.load(text, { schema: entryListSchema }) ?? []
    const patched = []
    let changed = false
    for (const entry of entries) {
      if (entry.insert) {
        const inserted = []
        for (const child of entry.insert) {
          const original = defaults.get(child.id)
          if (!original) { inserted.push(child); continue }
          changed = true
          if (!isDeepStrictEqual(child, original)) patched.push({ ...child, name: undefined })
        }
        if (inserted.length) patched.push({ ...entry, insert: inserted })
      } else if (isDeepStrictEqual(entry, defaults.get(entry.id))) {
        changed = true
      } else {
        patched.push(entry)
      }
    }
    if (changed) {
      try { await writeFile(`${file}.before-forge-upgrade`, text, { encoding: 'utf8', flag: 'wx' }) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
      await writeFile(file, yaml.dump(patched, { schema: entryListSchema, lineWidth: -1 }), 'utf8')
    }
  }
  const desktop = join(home, 'profiles', 'desktop')
  await mkdir(desktop, { recursive: true })
  const patch = join(desktop, 'cordis.patch.yml')
  try { await writeFile(patch, '[]\n', { encoding: 'utf8', flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await initializeForgeProfiles(process.argv[2], join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor/include/package.json'))
}
