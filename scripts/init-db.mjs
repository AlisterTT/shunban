import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = spawnSync(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, WORKTODO_INIT_ONLY: '1' },
  stdio: 'inherit',
})

if (result.status !== 0) process.exit(result.status || 1)
