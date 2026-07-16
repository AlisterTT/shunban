import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = 8793
const base = `http://127.0.0.1:${port}`
const tempDb = path.join(os.tmpdir(), `worktodo-smoke-${process.pid}.db`)
fs.copyFileSync(path.join(root, 'data', 'demo.db'), tempDb)

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT:String(port), WORKTODO_DB_PATH:tempDb },
  stdio: 'ignore',
})

const cleanup = () => {
  server.kill('SIGTERM')
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${tempDb}${suffix}`, { force:true })
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const request = async (url, { token, method='GET', body } = {}) => {
  const response = await fetch(`${base}${url}`, { method, headers:{ 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) })
  const data = await response.json().catch(() => ({}))
  return { status:response.status, data }
}
const expectStatus = (result, expected, label) => {
  if (result.status !== expected) throw new Error(`${label}: 期望 ${expected}，实际 ${result.status}`)
}
const login = async (username, password='123456') => {
  const result = await request('/api/auth/login', { method:'POST', body:{ username, password, remember:false } })
  expectStatus(result, 200, `${username} 登录`)
  return result.data.token
}

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(`${base}/`); if (response.status) break } catch {}
    await wait(50)
  }

  const adminToken = await login('admin')
  const privateFlow = await request('/api/templates', { token:adminToken, method:'POST', body:{ name:'权限测试流程', visibility:'private', graph:{ nodes:[], edges:[] } } })
  expectStatus(privateFlow, 200, '创建私有流程')
  const flowId = privateFlow.data.id

  const createAdmin = await request('/api/users', { token:adminToken, method:'POST', body:{ username:'smokeadmin', name:'测试管理员', password:'123456', role:'admin' } })
  expectStatus(createAdmin, 200, '系统管理员创建管理员')
  const extraAdminToken = await login('smokeadmin')
  const userToken = await login('wangwei')

  expectStatus(await request(`/api/templates/${flowId}`, { token:userToken }), 403, '普通用户读取私有流程')
  expectStatus(await request(`/api/templates/${flowId}/clone`, { token:userToken, method:'POST', body:{ name:'越权克隆' } }), 403, '普通用户克隆私有流程')
  expectStatus(await request('/api/tasks', { token:userToken, method:'POST', body:{ templateId:flowId, title:'越权调用' } }), 403, '普通用户调用私有流程')
  expectStatus(await request(`/api/templates/${flowId}`, { token:extraAdminToken }), 403, '普通管理员读取他人私有流程')
  expectStatus(await request('/api/users', { token:extraAdminToken, method:'POST', body:{ username:'badadmin', name:'越权管理员', password:'123456', role:'admin' } }), 403, '普通管理员创建管理员')
  expectStatus(await request('/api/users/1/reset-password', { token:extraAdminToken, method:'POST' }), 403, '普通管理员重置系统管理员')
  expectStatus(await request('/api/users/1', { token:extraAdminToken, method:'DELETE' }), 400, '删除系统管理员')

  const reset = await request('/api/users/2/reset-password', { token:extraAdminToken, method:'POST' })
  expectStatus(reset, 200, '普通管理员重置普通用户')
  if (typeof reset.data.password !== 'string' || reset.data.password.length !== 12) throw new Error('随机密码格式不正确')
  expectStatus(await request('/api/bootstrap', { token:userToken }), 401, '重置密码后旧会话失效')

  console.log('权限与登录冒烟测试通过')
} finally {
  cleanup()
}
