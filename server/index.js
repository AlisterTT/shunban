import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production')
const dataDir = path.join(root, 'data')
fs.mkdirSync(dataDir, { recursive: true })
const runtimeDbPath = path.join(dataDir, 'worktodo.db')
const demoDbPath = path.join(dataDir, 'demo.db')
const dbPath = process.env.WORKTODO_DB_PATH ? path.resolve(root, process.env.WORKTODO_DB_PATH) : runtimeDbPath
if (dbPath === runtimeDbPath && !fs.existsSync(runtimeDbPath) && fs.existsSync(demoDbPath)) fs.copyFileSync(demoDbPath, runtimeDbPath)
const db = new DatabaseSync(dbPath)

db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department_id INTEGER,
    role TEXT NOT NULL DEFAULT 'user',
    active INTEGER NOT NULL DEFAULT 1,
    is_system_admin INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(department_id) REFERENCES departments(id)
  );
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flow_code TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT '日常办公',
    owner_id INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'published',
    visibility TEXT NOT NULL DEFAULT 'private',
    visible_departments TEXT NOT NULL DEFAULT '[]',
    visible_users TEXT NOT NULL DEFAULT '[]',
    current_version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS template_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    graph TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, version),
    FOREIGN KEY(template_id) REFERENCES templates(id)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    template_id INTEGER NOT NULL,
    template_version INTEGER NOT NULL,
    owner_id INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'todo',
    graph_snapshot TEXT NOT NULL,
    progress TEXT NOT NULL DEFAULT '{}',
    notes TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(template_id) REFERENCES templates(id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`)

const departmentColumns = db.prepare('PRAGMA table_info(departments)').all().map(column => column.name)
if (!departmentColumns.includes('parent_id')) db.exec('ALTER TABLE departments ADD COLUMN parent_id INTEGER REFERENCES departments(id)')
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name)
if (!userColumns.includes('password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT')
if (!userColumns.includes('is_system_admin')) db.exec('ALTER TABLE users ADD COLUMN is_system_admin INTEGER NOT NULL DEFAULT 0')
db.prepare("UPDATE users SET is_system_admin=CASE WHEN username='admin' THEN 1 ELSE 0 END").run()
db.prepare("UPDATE users SET department_id=NULL WHERE username='admin'").run()
db.prepare("UPDATE users SET role='department_admin' WHERE is_system_admin=0 AND role='admin'").run()
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name)
if (!taskColumns.includes('times')) db.exec(`ALTER TABLE tasks ADD COLUMN times TEXT NOT NULL DEFAULT '{}'`)
const templateColumns = db.prepare('PRAGMA table_info(templates)').all().map(column => column.name)
if (!templateColumns.includes('flow_code')) db.exec('ALTER TABLE templates ADD COLUMN flow_code TEXT')
if (!templateColumns.includes('deleted_at')) db.exec('ALTER TABLE templates ADD COLUMN deleted_at TEXT')
db.prepare('SELECT id FROM templates WHERE flow_code IS NULL OR flow_code=?').all('').forEach(row => {
  db.prepare('UPDATE templates SET flow_code=? WHERE id=?').run(`FLOW-${String(row.id).padStart(6, '0')}`, row.id)
})
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_flow_code ON templates(flow_code)')
const createFlowCode = () => `FLOW-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
const legacyPasswordHash = password => createHash('sha256').update(String(password)).digest('hex')
const hashPassword = password => {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(String(password), salt, 32).toString('hex')
  return `scrypt$${salt}$${hash}`
}
const verifyPassword = (password, storedHash = '') => {
  if (!storedHash.startsWith('scrypt$')) return storedHash === legacyPasswordHash(password)
  const [, salt, expectedHex] = storedHash.split('$')
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = scryptSync(String(password), salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
const generatePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return [...randomBytes(12)].map(byte => alphabet[byte % alphabet.length]).join('')
}
db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all().forEach(user => db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword('123456'), user.id))

const count = db.prepare('SELECT COUNT(*) AS total FROM departments').get().total
if (!count) {
  db.exec(`
    INSERT INTO departments(name) VALUES ('综合部'), ('运营部'), ('财务部'), ('项目部');
    INSERT INTO users(username, name, department_id, role, is_system_admin) VALUES
      ('admin', '系统管理员', NULL, 'admin', 1),
      ('wangwei', '王伟', 4, 'user', 0),
      ('lixia', '李霞', 2, 'user', 0);
  `)

  const graph = {
    nodes: [
      { id: 'n1', type: 'step', position: { x: 60, y: 120 }, data: { title: '准备合同材料', department: '项目部', contact: '项目负责人', system: '', systemUrl: '', materials: '合同定稿、审批依据', action: '确认合同内容及份数，准备盖章材料。', note: '检查页码和签署位置', time: '', optional: false } },
      { id: 'n2', type: 'step', position: { x: 390, y: 120 }, data: { title: '综合部审核', department: '综合部', contact: '张三', system: '', systemUrl: '', materials: '合同、用印审批单', action: '请综合部核对用印材料是否齐全。', note: '先电话确认张三是否在办公室', time: '', optional: false } },
      { id: 'n3', type: 'step', position: { x: 720, y: 40 }, data: { title: '发起用印申请', department: '综合部', contact: '', system: 'OA 系统', systemUrl: 'http://oa.local', materials: '合同扫描件', action: '在 OA 中填写用印事由并提交。', note: '', time: '取得审核意见后', optional: false } },
      { id: 'n4', type: 'step', position: { x: 720, y: 230 }, data: { title: '准备归档目录', department: '项目部', contact: '本人', system: '档案系统', systemUrl: '', materials: '项目归档清单', action: '同步准备合同归档目录。', note: '此步骤可与申请并行', time: '', optional: true } },
      { id: 'n5', type: 'step', position: { x: 1050, y: 120 }, data: { title: '领取并登记', department: '运营部', contact: '李四', system: '', systemUrl: '', materials: '审批完成页面、纸质合同', action: '领取盖章合同，登记后留存扫描件。', note: '', time: '', optional: false } }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n2', target: 'n4' },
      { id: 'e4', source: 'n3', target: 'n5' },
      { id: 'e5', source: 'n4', target: 'n5' }
    ]
  }
  const template = db.prepare(`INSERT INTO templates(flow_code, name, description, category, visibility, visible_departments) VALUES (?, ?, ?, ?, ?, ?)`).run(
    createFlowCode(), '合同盖章办理', '从材料准备到领取归档的完整办理提示', '合同管理', 'department', '[1,4]'
  )
  db.prepare('INSERT INTO template_versions(template_id, version, graph) VALUES (?, 1, ?)').run(template.lastInsertRowid, JSON.stringify(graph))
  db.prepare(`INSERT INTO tasks(title, template_id, template_version, status, graph_snapshot, progress, notes) VALUES (?, ?, 1, 'doing', ?, ?, ?)`).run(
    '华川项目合作合同盖章', template.lastInsertRowid, JSON.stringify(graph), JSON.stringify({ n1: 'done', n2: 'current' }), JSON.stringify({ n1: '材料已核对，共两份' })
  )
}
db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all().forEach(user => db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword('123456'), user.id))

if (process.env.WORKTODO_INIT_ONLY === '1') {
  db.close()
  console.log(`数据库已初始化：${dbPath}`)
  process.exit(0)
}

const app = express()
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})
app.use(express.json({ limit: '2mb' }))
const loginAttempts = new Map()

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const publicUser = row => row && ({ id: row.id, username: row.username, name: row.name, role: row.role, is_system_admin: Boolean(row.is_system_admin), department_id: row.department_id, department_name: row.department_name })
const isDepartmentAdmin = user => user?.role === 'department_admin' && !user.is_system_admin
const canManageUsers = user => Boolean(user?.is_system_admin || isDepartmentAdmin(user))
const departmentScopeIds = rootId => rootId ? db.prepare(`WITH RECURSIVE scope(id) AS (
  SELECT id FROM departments WHERE id=?
  UNION ALL
  SELECT d.id FROM departments d JOIN scope s ON d.parent_id=s.id
) SELECT id FROM scope`).all(rootId).map(row => Number(row.id)) : []
const inDepartmentScope = (user, departmentId) => user.is_system_admin || departmentScopeIds(user.department_id).includes(Number(departmentId))
const sessionUser = req => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  return db.prepare(`SELECT u.*, d.name department_name, s.token FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN departments d ON d.id=u.department_id WHERE s.token=? AND s.expires_at > datetime('now')`).get(token)
}

app.post('/api/auth/login', (req, res) => {
  const key = req.ip || 'unknown'
  const now = Date.now()
  const attempt = loginAttempts.get(key)
  if (attempt && attempt.expiresAt > now && attempt.count >= 8) return res.status(429).json({ message: '登录尝试过多，请十分钟后再试' })
  if (attempt?.expiresAt <= now) loginAttempts.delete(key)
  const user = db.prepare(`SELECT u.*, d.name department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE u.username=?`).get(String(req.body.username || '').trim())
  if (!user || !verifyPassword(req.body.password || '', user.password_hash)) {
    const current = loginAttempts.get(key)
    loginAttempts.set(key, { count:(current?.count || 0) + 1, expiresAt:now + 10 * 60 * 1000 })
    return res.status(401).json({ message: '用户名或密码不正确' })
  }
  loginAttempts.delete(key)
  if (!user.password_hash.startsWith('scrypt$')) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(req.body.password), user.id)
  const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
  const days = req.body.remember ? 30 : 1
  db.prepare(`INSERT INTO sessions(token, user_id, expires_at) VALUES (?, ?, datetime('now', ?))`).run(token, user.id, `+${days} day`)
  res.json({ token, user: publicUser(user), remember: Boolean(req.body.remember) })
})

app.use('/api', (req, res, next) => {
  const user = sessionUser(req)
  if (!user) return res.status(401).json({ message: '请先登录' })
  req.user = user
  next()
})

app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) }))
app.post('/api/auth/logout', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(req.user.token)
  res.json({ ok: true })
})

app.patch('/api/auth/password', (req, res) => {
  if (!req.body.password || String(req.body.password).length < 6) return res.status(400).json({ message: '密码至少需要 6 位' })
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(req.body.password), req.user.id)
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(req.user.id, req.user.token)
  res.json({ ok: true })
})

const parseTemplate = row => row && ({
  ...row,
  visible_departments: JSON.parse(row.visible_departments || '[]'),
  visible_users: JSON.parse(row.visible_users || '[]'),
})
const departmentReferences = rows => {
  const byId = new Map(rows.map(row => [Number(row.id), row]))
  const labels = new Map()
  const labelFor = (id, visiting = new Set()) => {
    if (labels.has(id)) return labels.get(id)
    const row = byId.get(id)
    if (!row || visiting.has(id)) return row?.name || ''
    visiting.add(id)
    const parentLabel = row.parent_id ? labelFor(Number(row.parent_id), visiting) : ''
    visiting.delete(id)
    const label = parentLabel ? `${parentLabel} / ${row.name}` : row.name
    labels.set(id, label)
    return label
  }
  byId.forEach((_row, id) => labelFor(id))
  const byLabel = new Map([...labels].map(([id, label]) => [label, id]))
  const nameGroups = new Map()
  rows.forEach(row => nameGroups.set(row.name, [...(nameGroups.get(row.name) || []), Number(row.id)]))
  const byUniqueName = new Map([...nameGroups].filter(([, ids]) => ids.length === 1).map(([name, ids]) => [name, ids[0]]))
  return { labels, byLabel, byUniqueName }
}
const remapGraphDepartments = (graph, fromReferences, toReferences) => {
  const value = typeof graph === 'string' ? JSON.parse(graph) : graph
  return {
    ...value,
    nodes: (value?.nodes || []).map(node => {
      const data = node.data || {}
      const storedId = Number(data.departmentId)
      const departmentId = toReferences.labels.has(storedId)
        ? storedId
        : fromReferences.byLabel.get(data.department) || fromReferences.byUniqueName.get(data.department)
      if (!departmentId) return node
      return { ...node, data: { ...data, departmentId, department:toReferences.labels.get(departmentId) } }
    }),
  }
}
const normalizeGraphDepartments = graph => {
  const references = departmentReferences(db.prepare('SELECT * FROM departments').all())
  return remapGraphDepartments(graph, references, references)
}
const canViewTemplate = (user, template) => Boolean(template) && (
  user.is_system_admin || template.owner_id === user.id || template.visibility === 'public' ||
  template.visible_users.includes(user.id) || template.visible_departments.includes(user.department_id)
)

app.get('/api/bootstrap', (_req, res) => {
  const currentUser = publicUser(_req.user)
  const templates = db.prepare(`SELECT t.*, u.name owner_name FROM templates t LEFT JOIN users u ON u.id=t.owner_id WHERE t.deleted_at IS NULL ORDER BY t.updated_at DESC`).all().map(parseTemplate).filter(template => canViewTemplate(currentUser, template))
  const tasks = db.prepare(`SELECT t.*, p.name template_name FROM tasks t JOIN templates p ON p.id=t.template_id WHERE t.owner_id=? ORDER BY t.updated_at DESC`).all(currentUser.id).map(row => ({
    ...row,
    graph_snapshot: JSON.parse(row.graph_snapshot),
    progress: JSON.parse(row.progress),
    notes: JSON.parse(row.notes),
    times: JSON.parse(row.times || '{}'),
  }))
  res.json({
    currentUser,
    templates,
    tasks,
    departments: db.prepare('SELECT * FROM departments ORDER BY id').all(),
    users: db.prepare(`SELECT u.id, u.username, u.name, u.department_id, u.role, u.is_system_admin, d.name department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id ORDER BY u.id`).all(),
  })
})

app.get('/api/templates/:id', (req, res) => {
  const template = parseTemplate(db.prepare('SELECT * FROM templates WHERE id=? AND deleted_at IS NULL').get(req.params.id))
  if (!template) return res.status(404).json({ message: '流程不存在' })
  if (!canViewTemplate(req.user, template)) return res.status(403).json({ message: '无权查看这个流程' })
  const version = db.prepare('SELECT * FROM template_versions WHERE template_id=? AND version=?').get(template.id, template.current_version)
  res.json({ ...template, graph: JSON.parse(version.graph) })
})

app.post('/api/templates/:id/clone', (req, res) => {
  const source = parseTemplate(db.prepare('SELECT * FROM templates WHERE id=? AND deleted_at IS NULL').get(req.params.id))
  if (!source) return res.status(404).json({ message: '流程不存在' })
  if (!canViewTemplate(req.user, source)) return res.status(403).json({ message: '无权克隆这个流程' })
  const version = db.prepare('SELECT graph FROM template_versions WHERE template_id=? AND version=?').get(source.id, source.current_version)
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ message: '请填写新流程名称' })
  const result = db.prepare(`INSERT INTO templates(flow_code, name, description, category, visibility, visible_departments, visible_users, owner_id, current_version) VALUES (?, ?, ?, ?, 'private', '[]', '[]', ?, 1)`).run(
    createFlowCode(), name, source.description, source.category, req.user.id
  )
  db.prepare('INSERT INTO template_versions(template_id, version, graph) VALUES (?, 1, ?)').run(result.lastInsertRowid, version.graph)
  res.json({ id: Number(result.lastInsertRowid), version: 1 })
})

app.post('/api/templates', (req, res) => {
  const { name, description = '', category = '日常办公', visibility = 'private', visibleDepartments = [], visibleUsers = [], graph } = req.body
  const result = db.prepare(`INSERT INTO templates(flow_code, name, description, category, visibility, visible_departments, visible_users, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    createFlowCode(), name, description, category, visibility, JSON.stringify(visibleDepartments), JSON.stringify(visibleUsers), req.user.id
  )
  db.prepare('INSERT INTO template_versions(template_id, version, graph) VALUES (?, 1, ?)').run(result.lastInsertRowid, JSON.stringify(normalizeGraphDepartments(graph)))
  res.json({ id: Number(result.lastInsertRowid), version: 1 })
})

app.put('/api/templates/:id', (req, res) => {
  const current = db.prepare('SELECT * FROM templates WHERE id=? AND deleted_at IS NULL').get(req.params.id)
  if (!current) return res.status(404).json({ message: '流程不存在' })
  if (current.owner_id !== req.user.id) return res.status(403).json({ message: '只能编辑自己创建的流程' })
  const next = current.current_version + 1
  const { name, description = '', category = '日常办公', visibility = 'private', visibleDepartments = [], visibleUsers = [], graph } = req.body
  db.prepare(`UPDATE templates SET name=?, description=?, category=?, visibility=?, visible_departments=?, visible_users=?, current_version=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    name, description, category, visibility, JSON.stringify(visibleDepartments), JSON.stringify(visibleUsers), next, req.params.id
  )
  db.prepare('INSERT INTO template_versions(template_id, version, graph) VALUES (?, ?, ?)').run(req.params.id, next, JSON.stringify(normalizeGraphDepartments(graph)))
  res.json({ id: Number(req.params.id), version: next })
})

app.delete('/api/templates/:id', (req, res) => {
  const template = db.prepare('SELECT * FROM templates WHERE id=? AND deleted_at IS NULL').get(req.params.id)
  if (!template) return res.status(404).json({ message: '流程不存在' })
  if (template.owner_id !== req.user.id && !req.user.is_system_admin) return res.status(403).json({ message: '只能删除自己创建的流程' })
  db.prepare("UPDATE templates SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/tasks', (req, res) => {
  const template = parseTemplate(db.prepare('SELECT * FROM templates WHERE id=? AND deleted_at IS NULL').get(req.body.templateId))
  if (!template) return res.status(404).json({ message: '流程不存在' })
  if (!canViewTemplate(req.user, template)) return res.status(403).json({ message: '无权调用这个流程' })
  const version = db.prepare('SELECT graph FROM template_versions WHERE template_id=? AND version=?').get(template.id, template.current_version)
  const graph = JSON.parse(version.graph)
  const progress = {}
  const targets = new Set(graph.edges.map(edge => edge.target))
  graph.nodes.filter(node => !targets.has(node.id)).forEach(node => { progress[node.id] = 'current' })
  const result = db.prepare(`INSERT INTO tasks(title, template_id, template_version, status, graph_snapshot, progress, owner_id) VALUES (?, ?, ?, 'doing', ?, ?, ?)`).run(
    req.body.title || template.name, template.id, template.current_version, version.graph, JSON.stringify(progress), req.user.id
  )
  res.json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND owner_id=?').get(req.params.id, req.user.id)
  if (!task) return res.status(404).json({ message: '待办不存在' })
  db.prepare(`UPDATE tasks SET status=?, progress=?, notes=?, times=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
    req.body.status || task.status,
    JSON.stringify(req.body.progress ?? JSON.parse(task.progress)),
    JSON.stringify(req.body.notes ?? JSON.parse(task.notes)),
    JSON.stringify(req.body.times ?? JSON.parse(task.times || '{}')),
    req.params.id
  )
  res.json({ ok: true })
})

app.delete('/api/tasks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id=? AND owner_id=?').run(req.params.id, req.user.id)
  if (!result.changes) return res.status(404).json({ message: '待办不存在' })
  res.json({ ok: true })
})

app.post('/api/users', (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: '没有用户管理权限' })
  if (!req.body.username?.trim() || !req.body.name?.trim()) return res.status(400).json({ message: '请填写用户名和姓名' })
  if (!req.body.password || String(req.body.password).length < 6) return res.status(400).json({ message: '初始密码至少需要 6 位' })
  const departmentId = Number(req.body.departmentId) || (req.user.is_system_admin ? null : req.user.department_id)
  if (!req.user.is_system_admin && !departmentId) return res.status(400).json({ message: '部门管理员尚未分配部门，不能添加用户' })
  if (!req.user.is_system_admin && !inDepartmentScope(req.user, departmentId)) return res.status(403).json({ message: '只能向本部门及下级部门添加用户' })
  const requestedRole = req.body.role === 'admin' ? 'department_admin' : (req.body.role || 'user')
  if (!req.user.is_system_admin && requestedRole !== 'user') return res.status(403).json({ message: '只有系统管理员可以创建部门管理员' })
  const role = req.user.is_system_admin && requestedRole === 'department_admin' ? 'department_admin' : 'user'
  if (role === 'department_admin' && !departmentId) return res.status(400).json({ message: '部门管理员必须先分配所属部门' })
  if (departmentId && !db.prepare('SELECT id FROM departments WHERE id=?').get(departmentId)) return res.status(400).json({ message: '所属部门不存在' })
  const result = db.prepare('INSERT INTO users(username, name, department_id, role, password_hash) VALUES (?, ?, ?, ?, ?)').run(req.body.username.trim(), req.body.name.trim(), departmentId, role, hashPassword(req.body.password))
  res.json({ id: Number(result.lastInsertRowid) })
})

app.delete('/api/users/:id', (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: '没有用户管理权限' })
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!target) return res.status(404).json({ message: '用户不存在' })
  if (target.is_system_admin) return res.status(400).json({ message: '系统管理员 admin 不能删除' })
  if (target.id === req.user.id) return res.status(400).json({ message: '当前登录账号不能删除自己' })
  if (!req.user.is_system_admin && (!inDepartmentScope(req.user, target.department_id) || target.role !== 'user')) return res.status(403).json({ message: '部门管理员只能删除本部门及下级部门的普通用户' })
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/users/:id/reset-password', (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: '没有用户管理权限' })
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!target) return res.status(404).json({ message: '用户不存在' })
  if (target.id === req.user.id) return res.status(400).json({ message: '当前账号请使用“修改密码”；admin 忘记密码需从数据库恢复' })
  if (!req.user.is_system_admin && (!inDepartmentScope(req.user, target.department_id) || target.role !== 'user')) return res.status(403).json({ message: '部门管理员只能重置本部门及下级部门普通用户的密码' })
  const password = generatePassword()
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), target.id)
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id)
  res.json({ password })
})

app.patch('/api/users/:id/settings', (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: '没有用户管理权限' })
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!target) return res.status(404).json({ message: '用户不存在' })
  if (target.is_system_admin) return res.status(400).json({ message: '系统管理员账号不能修改' })
  const departmentId = Number(req.body.departmentId)
  if (!departmentId || !db.prepare('SELECT id FROM departments WHERE id=?').get(departmentId)) return res.status(400).json({ message: '请选择有效的所属部门' })
  if (!req.user.is_system_admin) {
    if (target.role !== 'user' || !inDepartmentScope(req.user, target.department_id)) return res.status(403).json({ message: '部门管理员只能设置管理范围内的普通用户' })
    if (!inDepartmentScope(req.user, departmentId)) return res.status(403).json({ message: '只能调入本部门及下级部门' })
    if (req.body.role && req.body.role !== 'user') return res.status(403).json({ message: '只有系统管理员可以修改角色' })
    db.prepare('UPDATE users SET department_id=? WHERE id=?').run(departmentId, target.id)
    return res.json({ ok: true })
  }
  const role = req.body.role === 'department_admin' ? 'department_admin' : req.body.role === 'user' ? 'user' : null
  if (!role) return res.status(400).json({ message: '角色类型不正确' })
  db.prepare('UPDATE users SET department_id=?, role=? WHERE id=?').run(departmentId, role, target.id)
  if (role !== target.role) db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id)
  res.json({ ok: true })
})

app.patch('/api/users/:id/department', (req, res) => {
  if (!canManageUsers(req.user)) return res.status(403).json({ message: '没有用户管理权限' })
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!target) return res.status(404).json({ message: '用户不存在' })
  if (target.is_system_admin) return res.status(400).json({ message: '系统管理员不属于部门，不能调整' })
  const departmentId = Number(req.body.departmentId)
  if (!departmentId || !db.prepare('SELECT id FROM departments WHERE id=?').get(departmentId)) return res.status(400).json({ message: '请选择有效的目标部门' })
  if (!req.user.is_system_admin) {
    if (target.role !== 'user' || !inDepartmentScope(req.user, target.department_id)) return res.status(403).json({ message: '部门管理员只能调整管理范围内的普通用户' })
    if (!inDepartmentScope(req.user, departmentId)) return res.status(403).json({ message: '只能调入本部门及下级部门' })
  }
  db.prepare('UPDATE users SET department_id=? WHERE id=?').run(departmentId, target.id)
  res.json({ ok: true })
})

app.patch('/api/users/:id/role', (req, res) => {
  if (!req.user.is_system_admin) return res.status(403).json({ message: '只有系统管理员可以修改角色' })
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!target) return res.status(404).json({ message: '用户不存在' })
  if (target.is_system_admin) return res.status(400).json({ message: '系统管理员角色不能修改' })
  const role = req.body.role === 'department_admin' ? 'department_admin' : req.body.role === 'user' ? 'user' : null
  if (!role) return res.status(400).json({ message: '角色类型不正确' })
  if (role === 'department_admin' && !target.department_id) return res.status(400).json({ message: '请先为该用户分配部门，再设为部门管理员' })
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role, target.id)
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id)
  res.json({ ok: true })
})

app.post('/api/departments', (req, res) => {
  if (!req.user.is_system_admin && !isDepartmentAdmin(req.user)) return res.status(403).json({ message: '没有部门管理权限' })
  if (!req.body.name?.trim()) return res.status(400).json({ message: '请填写部门名称' })
  const parentId = Number(req.body.parentId) || null
  if (!req.user.is_system_admin && (!parentId || !inDepartmentScope(req.user, parentId))) return res.status(403).json({ message: '只能在本部门及下级部门中添加子部门' })
  const result = db.prepare('INSERT INTO departments(name, parent_id) VALUES (?, ?)').run(req.body.name.trim(), parentId)
  res.json({ id: Number(result.lastInsertRowid) })
})

app.patch('/api/departments/:id', (req, res) => {
  if (!req.user.is_system_admin && !isDepartmentAdmin(req.user)) return res.status(403).json({ message: '没有部门管理权限' })
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ message: '请填写部门名称' })
  const department = db.prepare('SELECT * FROM departments WHERE id=?').get(req.params.id)
  if (!department) return res.status(404).json({ message: '部门不存在' })
  if (!req.user.is_system_admin && (Number(department.id) === Number(req.user.department_id) || !inDepartmentScope(req.user, department.id))) return res.status(403).json({ message: '部门管理员只能修改本部门的下级部门' })
  if (department.name === name) return res.json({ ok: true })

  const beforeRows = db.prepare('SELECT * FROM departments').all()
  const beforeReferences = departmentReferences(beforeRows)
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE departments SET name=? WHERE id=?').run(name, department.id)
    const afterReferences = departmentReferences(db.prepare('SELECT * FROM departments').all())
    const updateVersion = db.prepare('UPDATE template_versions SET graph=? WHERE id=?')
    db.prepare('SELECT id, graph FROM template_versions').all().forEach(row => {
      updateVersion.run(JSON.stringify(remapGraphDepartments(row.graph, beforeReferences, afterReferences)), row.id)
    })
    const updateTask = db.prepare('UPDATE tasks SET graph_snapshot=? WHERE id=?')
    db.prepare('SELECT id, graph_snapshot FROM tasks').all().forEach(row => {
      updateTask.run(JSON.stringify(remapGraphDepartments(row.graph_snapshot, beforeReferences, afterReferences)), row.id)
    })
    db.exec('COMMIT')
    res.json({ ok: true })
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
})

app.delete('/api/departments/:id', (req, res) => {
  if (!req.user.is_system_admin && !isDepartmentAdmin(req.user)) return res.status(403).json({ message: '没有部门管理权限' })
  const department = db.prepare('SELECT * FROM departments WHERE id=?').get(req.params.id)
  if (!department) return res.status(404).json({ message: '部门不存在' })
  if (!req.user.is_system_admin && (Number(department.id) === Number(req.user.department_id) || !inDepartmentScope(req.user, department.id))) return res.status(403).json({ message: '部门管理员只能删除本部门的下级部门' })
  const children = db.prepare('SELECT COUNT(*) total FROM departments WHERE parent_id=?').get(req.params.id).total
  const users = db.prepare('SELECT COUNT(*) total FROM users WHERE department_id=?').get(req.params.id).total
  if (children) return res.status(400).json({ message: '请先删除该部门下的子部门' })
  if (users) return res.status(400).json({ message: '该部门下还有用户，暂不能删除' })
  db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (/UNIQUE constraint failed: users\.username/.test(error.message || '')) return res.status(409).json({ message: '用户名已存在' })
  if (/UNIQUE constraint failed: departments\.name/.test(error.message || '')) return res.status(409).json({ message: '部门名称已存在' })
  res.status(500).json({ message: '服务器处理失败，请稍后重试' })
})

if (isProduction) {
  app.use(express.static(path.join(root, 'dist')))
  app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
}

const port = Number(process.env.PORT || 8787)
app.listen(port, '0.0.0.0', () => console.log(`顺办服务已启动：http://localhost:${port}`))
