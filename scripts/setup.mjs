import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const [major, minor] = process.versions.node.split('.').map(Number)

if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`需要 Node.js 22.5 或更高版本，当前版本为 ${process.versions.node}`)
  process.exit(1)
}

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status || 1)
}

console.log('1/3 安装固定版本依赖…')
run(npm, ['ci'])
console.log('2/3 构建网页…')
run(npm, ['run', 'build'])
console.log('3/3 初始化数据库（已有数据不会覆盖）…')
run(process.execPath, ['scripts/init-db.mjs'])
console.log('\n部署准备完成。运行 npm start 启动服务。')

if (process.argv.includes('--start')) run(npm, ['start'])
