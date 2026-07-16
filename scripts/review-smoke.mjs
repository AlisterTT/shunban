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

  const departmentFlow = await request('/api/templates', { token:adminToken, method:'POST', body:{
    name:'部门改名测试流程', visibility:'private', graph:{ nodes:[{ id:'dept-step', type:'step', position:{ x:0, y:0 }, data:{ title:'联系综合部', departmentId:1, department:'综合部' } }], edges:[] },
  } })
  expectStatus(departmentFlow, 200, '创建带部门流程')
  const departmentTask = await request('/api/tasks', { token:adminToken, method:'POST', body:{ templateId:departmentFlow.data.id, title:'部门改名测试待办' } })
  expectStatus(departmentTask, 200, '创建带部门待办')
  expectStatus(await request('/api/departments/1', { token:adminToken, method:'PATCH', body:{ name:'综合管理部' } }), 200, '修改部门名称')
  const renamedFlow = await request(`/api/templates/${departmentFlow.data.id}`, { token:adminToken })
  expectStatus(renamedFlow, 200, '读取改名后的流程')
  if (renamedFlow.data.graph.nodes[0].data.department !== '综合管理部' || renamedFlow.data.graph.nodes[0].data.departmentId !== 1) throw new Error('流程步骤未关联新部门名称')
  const renamedBootstrap = await request('/api/bootstrap', { token:adminToken })
  const renamedTask = renamedBootstrap.data.tasks.find(task => task.id === departmentTask.data.id)
  if (renamedTask?.graph_snapshot.nodes[0].data.department !== '综合管理部') throw new Error('待办快照未同步新部门名称')

  const createAdmin = await request('/api/users', { token:adminToken, method:'POST', body:{ username:'smokedeptadmin', name:'测试部门管理员', departmentId:4, password:'123456', role:'department_admin' } })
  expectStatus(createAdmin, 200, '系统管理员创建部门管理员')
  const departmentAdminToken = await login('smokedeptadmin')
  const userToken = await login('wangwei')

  expectStatus(await request(`/api/templates/${flowId}`, { token:userToken }), 403, '普通用户读取私有流程')
  expectStatus(await request(`/api/templates/${flowId}/clone`, { token:userToken, method:'POST', body:{ name:'越权克隆' } }), 403, '普通用户克隆私有流程')
  expectStatus(await request('/api/tasks', { token:userToken, method:'POST', body:{ templateId:flowId, title:'越权调用' } }), 403, '普通用户调用私有流程')
  expectStatus(await request(`/api/templates/${flowId}`, { token:departmentAdminToken }), 403, '部门管理员读取他人私有流程')
  expectStatus(await request('/api/users', { token:departmentAdminToken, method:'POST', body:{ username:'badadmin', name:'越权管理员', departmentId:4, password:'123456', role:'department_admin' } }), 403, '部门管理员创建部门管理员')
  expectStatus(await request('/api/users', { token:departmentAdminToken, method:'POST', body:{ username:'outsideuser', name:'外部门用户', departmentId:2, password:'123456', role:'user' } }), 403, '部门管理员跨部门添加用户')
  const insideUser = await request('/api/users', { token:departmentAdminToken, method:'POST', body:{ username:'insideuser', name:'本部门用户', departmentId:4, password:'123456', role:'user' } })
  expectStatus(insideUser, 200, '部门管理员添加本部门用户')
  expectStatus(await request(`/api/users/${insideUser.data.id}`, { token:departmentAdminToken, method:'DELETE' }), 200, '部门管理员删除本部门普通用户')
  expectStatus(await request('/api/departments', { token:departmentAdminToken, method:'POST', body:{ name:'项目一组', parentId:4 } }), 200, '部门管理员添加子部门')
  const childDepartment = await request('/api/departments', { token:departmentAdminToken, method:'POST', body:{ name:'项目二组', parentId:4 } })
  expectStatus(childDepartment, 200, '部门管理员添加第二个子部门')
  expectStatus(await request(`/api/departments/${childDepartment.data.id}`, { token:departmentAdminToken, method:'PATCH', body:{ name:'项目二部' } }), 200, '部门管理员修改子部门')
  expectStatus(await request(`/api/departments/${childDepartment.data.id}`, { token:departmentAdminToken, method:'DELETE' }), 200, '部门管理员删除子部门')
  expectStatus(await request('/api/departments/4', { token:departmentAdminToken, method:'PATCH', body:{ name:'越权改名' } }), 403, '部门管理员修改所属根部门')
  expectStatus(await request('/api/departments', { token:departmentAdminToken, method:'POST', body:{ name:'越权一级部门' } }), 403, '部门管理员添加一级部门')
  expectStatus(await request('/api/users/1/reset-password', { token:departmentAdminToken, method:'POST' }), 403, '部门管理员重置系统管理员')
  expectStatus(await request('/api/users/3/reset-password', { token:departmentAdminToken, method:'POST' }), 403, '部门管理员重置外部门用户')
  expectStatus(await request(`/api/users/${createAdmin.data.id}/role`, { token:departmentAdminToken, method:'PATCH', body:{ role:'user' } }), 403, '部门管理员修改角色')

  const reset = await request('/api/users/2/reset-password', { token:departmentAdminToken, method:'POST' })
  expectStatus(reset, 200, '部门管理员重置本部门普通用户')
  if (typeof reset.data.password !== 'string' || reset.data.password.length !== 12) throw new Error('随机密码格式不正确')
  expectStatus(await request('/api/bootstrap', { token:userToken }), 401, '重置密码后旧会话失效')

  const promotedUser = await request('/api/users', { token:adminToken, method:'POST', body:{ username:'promoted', name:'待提升用户', departmentId:2, password:'123456', role:'user' } })
  expectStatus(promotedUser, 200, '系统管理员创建普通用户')
  expectStatus(await request(`/api/users/${promotedUser.data.id}/role`, { token:adminToken, method:'PATCH', body:{ role:'department_admin' } }), 200, '系统管理员提升部门管理员')
  const promotedRow = (await request('/api/bootstrap', { token:adminToken })).data.users.find(user => user.id === promotedUser.data.id)
  if (promotedRow?.role !== 'department_admin') throw new Error('系统管理员修改角色未生效')

  console.log('权限与登录冒烟测试通过')
} finally {
  cleanup()
}
