import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = process.env.WORKTODO_DB_PATH ? path.resolve(root, process.env.WORKTODO_DB_PATH) : path.join(root, 'data', 'worktodo.db')

if (!fs.existsSync(source)) {
  console.error(`数据库不存在：${source}`)
  process.exit(1)
}

const backupDir = path.join(root, 'data', 'backups')
fs.mkdirSync(backupDir, { recursive: true })
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const destination = path.join(backupDir, `worktodo-${stamp}.db`)
const escaped = destination.replaceAll("'", "''")
const db = new DatabaseSync(source)

try {
  db.exec(`VACUUM INTO '${escaped}'`)
} finally {
  db.close()
}

console.log(`数据库已备份：${path.relative(root, destination)}`)
