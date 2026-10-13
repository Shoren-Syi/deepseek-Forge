import { readFileSync, mkdirSync, globSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(repository, 'package.json'))
const yaml = require('js-yaml')
const workspace = yaml.load(readFileSync(join(repository, 'pnpm-workspace.yaml'), 'utf8'))
const available = new Map(globSync(workspace.packages.map(pattern => `${pattern}/package.json`), { cwd: repository })
  .map(file => { const manifest = JSON.parse(readFileSync(join(repository, file), 'utf8')); return [manifest.name, { directory: dirname(file).replaceAll('\\', '/'), manifest }] }))
const selected = new Map()

// 只打包桌面应用实际依赖的第一方闭包；官方发布及签名由上游自己的流程负责。
function visit(name) {
  if (selected.has(name)) return
  const entry = available.get(name)
  if (!entry) return
  if (entry.manifest.os && !entry.manifest.os.includes(process.platform)) return
  if (entry.manifest.cpu && !entry.manifest.cpu.includes(process.arch)) return
  selected.set(name, entry)
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependency of Object.keys(entry.manifest[section] ?? {})) visit(dependency)
  }
}
visit('@deepseek-ai/dsh')
visit('@deepseek-ai/dsh-desktop-host')
const output = resolve(process.argv[2])
for (const bucket of ['dsh', 'vendor', 'landlock']) mkdirSync(join(output, bucket), { recursive: true })
const pnpm = process.env.FORGE_PNPM_CLI ?? join(repository, 'forge/.local/tools/pnpm/node_modules/pnpm/bin/pnpm.cjs')
async function pack([name, entry]) {
  const bucket = entry.directory.startsWith('vendor/') ? 'vendor' : entry.directory.startsWith('native/') ? 'landlock' : 'dsh'
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pnpm, '--dir', entry.directory, 'pack', '--pack-destination', join(output, bucket)], {
      cwd: repository, stdio: 'inherit', env: process.env,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`打包失败：${name} (${code ?? signal})`)))
  })
}
// 各运行包输出文件互不重名，四个工作进程减少反复启动 pnpm 的等待。
const pending = selected.entries()
const workers = await Promise.allSettled(Array.from({ length: 4 }, async () => {
  for (const entry of pending) await pack(entry)
}))
const failed = workers.find(result => result.status === 'rejected')
if (failed) throw failed.reason
console.log(`已打包 ${selected.size} 个第一方运行包。`)
