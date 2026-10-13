import { app } from 'electron'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve, delimiter } from 'node:path'

const metadata = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { forgeEdition?: boolean }
export const forgeDesktop = metadata.forgeEdition === true || process.env.FORGE_DESKTOP === '1'

// Forge 使用自己的数据根，在 Electron 创建日志、缓存和账户目录之前完成设置。
if (forgeDesktop) {
  const root = resolve(process.env.FORGE_DATA_ROOT ?? (process.execPath.toLowerCase().startsWith('d:')
    ? join(dirname(process.execPath), 'ForgeData') : 'D:/DeepSeekForge/ForgeData'))
  if (process.platform === 'win32' && !root.toLowerCase().startsWith('d:')) throw new Error('Forge 数据目录必须位于 D 盘。')
  for (const directory of ['home', 'electron', 'tmp', 'cache', 'data', 'crashes']) mkdirSync(join(root, directory), { recursive: true })
  process.env.FORGE_DESKTOP = '1'
  process.env.FORGE_DATA_ROOT = root
  process.env.DSH_HOME = join(root, 'home')
  process.env.DSH_CLIENT_TITLE = 'DeepSeek Forge'
  process.env.FORGE_WORKSPACE_ROOT ??= join(root, 'workspace')
  process.env.FORGE_BROWSER_PATH ??= join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  process.env.TEMP = process.env.TMP = join(root, 'tmp')
  process.env.XDG_CACHE_HOME = join(root, 'cache')
  process.env.XDG_DATA_HOME = join(root, 'data')
  process.env.DSH_TELEMETRY_DISABLED = '1'
  if (app.isPackaged) {
    process.env.FORGE_PWSH_PATH = join(process.resourcesPath, 'forge', 'pwsh', 'pwsh.exe')
    process.env.PATH = `${join(process.resourcesPath, 'forge', 'pwsh')}${delimiter}${process.env.PATH ?? ''}`
  }
  app.setName('DeepSeek Forge')
  app.setPath('userData', join(root, 'electron'))
  app.setPath('temp', join(root, 'tmp'))
  app.setPath('crashDumps', join(root, 'crashes'))
  if (process.platform === 'win32') app.setAppUserModelId('ai.deepseek.forge')
}
