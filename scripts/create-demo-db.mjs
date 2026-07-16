import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const demoPath = path.join(root, 'data', 'demo.db')

fs.rmSync(demoPath, { force: true })
const result = spawnSync(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, WORKTODO_DB_PATH: 'data/demo.db', WORKTODO_INIT_ONLY: '1' },
  stdio: 'inherit',
})

if (result.status !== 0) process.exit(result.status || 1)
console.log('演示数据库已生成：data/demo.db')
