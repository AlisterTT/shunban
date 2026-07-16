import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimePath = process.env.WORKTODO_DB_PATH ? path.resolve(root, process.env.WORKTODO_DB_PATH) : path.join(root, 'data', 'worktodo.db')
const demoPath = path.join(root, 'data', 'demo.db')
const confirmed = process.argv.includes('--yes')

if (!fs.existsSync(demoPath)) {
  console.error('缺少 data/demo.db，请先运行 npm run demo:db')
  process.exit(1)
}

if (!confirmed) {
  if (!process.stdin.isTTY) {
    console.error('重置会清空当前运行数据。确认后请使用：npm run db:reset -- --yes')
    process.exit(1)
  }
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt.question('将备份并清空当前运行数据，恢复演示初始状态。请输入 RESET 继续：')
  prompt.close()
  if (answer.trim() !== 'RESET') {
    console.log('已取消，数据库未修改。')
    process.exit(0)
  }
}

if (fs.existsSync(runtimePath)) {
  const backup = spawnSync(process.execPath, ['scripts/backup-db.mjs'], {
    cwd: root,
    env: { ...process.env, WORKTODO_DB_PATH: runtimePath },
    stdio: 'inherit',
  })
  if (backup.status !== 0) {
    console.error('备份失败，已停止重置。')
    process.exit(backup.status || 1)
  }
}

for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${runtimePath}${suffix}`, { force: true })
fs.mkdirSync(path.dirname(runtimePath), { recursive: true })
fs.copyFileSync(demoPath, runtimePath)
console.log(`数据库已恢复演示初始状态：${runtimePath}`)
