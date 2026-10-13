import { createRequire } from 'node:module'
import { readFile, writeFile, access, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { initializeForgeProfiles } from './profile.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
const portable = process.env.FORGE_PORTABLE_ROOT
const outputs = portable ?? resolve(repository, '..')
const home = resolve(process.argv[2] ?? process.env.DSH_HOME ?? (portable ? join(portable, 'ForgeData/home') : join(repository, 'forge/.local/home')))
const workspace = resolve(process.argv[3] ?? join(outputs, 'Forge-Operations'))
if (![home, workspace].every(path => /^d:[\\/]/i.test(path))) throw new Error('Forge 配置与新任务目录必须位于 D 盘。')
const server = join(outputs, portable ? 'resources/forge/mcp/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js' : 'Forge-MCP/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js')
const includeManifest = portable ? join(portable, 'resources/dsh/node_modules/@deepseek-ai/cordis-plugin-include/package.json') : join(repository, 'vendor/include/package.json')
const require = createRequire(includeManifest)
const yaml = require('js-yaml')
const { entryListSchema } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis-plugin-include')).href)
await Promise.all([access(server), mkdir(workspace, { recursive: true })])
await initializeForgeProfiles(home, includeManifest)
const factory = yaml.load(await readFile(new URL('./cordis.patch.yml', import.meta.url), 'utf8'), { schema: entryListSchema })
const base = factory.flatMap(entry => entry.insert ?? []).find(entry => entry.id === 'preset-forge-extensions')
const file = join(home, 'profiles/desktop/cordis.patch.yml')
const previous = await readFile(file, 'utf8')
const entries = yaml.load(previous, { schema: entryListSchema }) ?? []
const id = 'preset-forge-local-mcp'
const existing = entries.flatMap(entry => entry.insert ?? [entry]).find(entry => entry.id === id)
const connection = { id: 'mcp-local-files', name: '@deepseek-ai/dsh-mcp-client', config: {
  serverName: 'forge_files', transport: 'stdio',
  command: yaml.load('!!js process.env.FORGE_NODE ?? process.execPath', { schema: entryListSchema }),
  args: [server, workspace], cwd: workspace, failOnStartupError: true,
} }
if (existing) {
  const active = existing.config.plugins.find(entry => entry.id === connection.id)
  if (!active) throw new Error('现有本地 MCP 预设缺少连接项，请先在预设配置中修复。')
  active.config = { ...active.config, ...connection.config }
} else {
  // 外部服务只属于这个预设，沿用原生加载和关闭，不增加连接控制器。
  entries.push({ insert: [{ id, name: '@deepseek-ai/dsh-agent-preset', config: {
    id: 'forge-local-mcp', name: 'Forge · 本地 MCP', description: '通过本地文件 MCP 服务处理指定的 D 盘目录。', order: 6,
    plugins: [...base.config.plugins, connection],
  } }] })
}
const updated = yaml.dump(entries, { schema: entryListSchema, lineWidth: -1 })
if (updated === previous) console.log('本地 MCP 预设已经配置。')
else {
  try { await writeFile(`${file}.before-local-mcp`, previous, { encoding: 'utf8', flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  await writeFile(file, updated, 'utf8')
  console.log('已配置 Forge · 本地 MCP。')
}
