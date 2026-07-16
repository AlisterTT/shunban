import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  addEdge, useEdgesState, useNodesState, MarkerType
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Archive, ArrowLeft, Building2, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleUserRound, Clock3, Copy, Database, ExternalLink, FileText,
  Eye, EyeOff, FolderTree, GitBranch, GripVertical, Home, KeyRound, ListTodo, LockKeyhole, LogOut,
  Menu, MoreHorizontal, Network, Pencil, Plus, RotateCcw, Search,
  Settings, Share2, Sparkles, Trash2, UploadCloud, UserRound, Users, X
} from 'lucide-react'
import './styles.css'

const getToken = () => localStorage.getItem('worktodo_token') || sessionStorage.getItem('worktodo_token')
const copyrightNotice = import.meta.env.VITE_COPYRIGHT_NOTICE || 'Copyright © 2026 AlisterTT · MIT License'
const saveToken = (token, remember) => {
  localStorage.removeItem('worktodo_token'); sessionStorage.removeItem('worktodo_token')
  ;(remember ? localStorage : sessionStorage).setItem('worktodo_token', token)
}
const clearToken = () => { localStorage.removeItem('worktodo_token'); sessionStorage.removeItem('worktodo_token') }
const api = async (url, options = {}) => {
  const token = getToken()
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
  const text = await response.text()
  let result = {}
  try { result = text ? JSON.parse(text) : {} } catch { result = {} }
  if (!response.ok) { const error = new Error(result.message || '操作失败'); error.status = response.status; throw error }
  return result
}

const blankStep = () => ({
  title: '新步骤', department: '', contact: '', systems: [],
  materials: '', action: '', note: '', optional: false,
})

const getSystems = data => Array.isArray(data.systems) ? data.systems : (data.system || data.systemUrl ? [{ name:data.system || '', url:data.systemUrl || '' }] : [])
const safeSystemUrl = value => { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : '' } catch { return '' } }

function StepNode({ data, selected }) {
  const systems = getSystems(data)
  return <div className={`flow-node ${selected ? 'selected' : ''} ${data.status || ''}`}>
    <Handle type="target" position={Position.Left} />
    <div className="flow-node-top">
      <span className="step-dot">{data.status === 'done' ? <Check size={13} /> : ''}</span>
      <span className="flow-node-kicker">{data.department || '未设部门'}</span>
      {data.optional && <span className="optional">可跳过</span>}
    </div>
    <strong>{data.title}</strong>
    <div className="flow-node-meta">
      <span>{data.contact || '未设联系人'}</span>
      {systems[0]?.name && <span>· {systems[0].name}{systems.length > 1 ? ` 等 ${systems.length} 个系统` : ''}</span>}
    </div>
    <Handle type="source" position={Position.Right} />
  </div>
}

const nodeTypes = { step: StepNode }
const defaultEdgeOptions = { type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2, stroke: '#aeb8b1' } }

function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username:'', password:'', remember:true })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async event => {
    event.preventDefault(); setError(''); setLoading(true)
    try { await onLogin(await api('/api/auth/login', { method:'POST', body:JSON.stringify(form) })) }
    catch (err) { setError(err.message); setLoading(false) }
  }
  return <main className="login-page">
    <section className="login-intro">
      <Brand />
      <div className="login-statement"><span>WORKFLOW NOTES</span><h1>把复杂的事，<br/>按顺序办完。</h1><p>记录部门、联系人、系统和材料。下次再办，直接从第一步开始。</p></div>
      <div className="login-flow" aria-hidden="true"><i/><span>准备材料</span><i/><span>联系经办人</span><i/><span>完成办理</span></div>
    </section>
    <section className="login-form-side">
      <form className="login-form" onSubmit={submit}>
        <div className="login-heading"><span className="eyebrow">共享工作台</span><h2>登录顺办</h2><p>使用管理员分配的账号继续。</p></div>
        <Field label="用户名"><input autoFocus required value={form.username} onChange={e => setForm({...form,username:e.target.value})} autoComplete="username"/></Field>
        <Field label="密码"><div className="password-input"><input required type={showPassword?'text':'password'} value={form.password} onChange={e => setForm({...form,password:e.target.value})} autoComplete="current-password"/><button type="button" aria-label={showPassword?'隐藏密码':'显示密码'} onClick={() => setShowPassword(!showPassword)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></Field>
        <label className="remember-row"><input type="checkbox" checked={form.remember} onChange={e => setForm({...form,remember:e.target.checked})}/><i/><span><b>保持登录状态</b><small>在这台设备上保留 30 天</small></span></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary login-submit" disabled={loading}>{loading?'正在登录…':'进入工作台'}<span>→</span></button>
      </form>
      <Copyright className="login-copyright" />
    </section>
  </main>
}

function App() {
  const [data, setData] = useState({ templates: [], tasks: [], departments: [], users: [], currentUser: null })
  const [authReady, setAuthReady] = useState(false)
  const [view, setView] = useState('tasks')
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [modal, setModal] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const reload = useCallback(async () => {
    try { setData(await api('/api/bootstrap')) }
    catch (error) { if (error.status === 401) { clearToken(); setData(current => ({ ...current, currentUser:null })) } else throw error }
    finally { setAuthReady(true) }
  }, [])
  useEffect(() => { if (getToken()) reload(); else setAuthReady(true) }, [reload])
  useEffect(() => {
    const onKey = event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const notify = msg => { setToast(msg); window.setTimeout(() => setToast(''), 2400) }

  const navigate = next => { setView(next); setSelectedTask(null); setEditingTemplate(null); setMobileNav(false) }
  const openTemplate = async id => {
    const template = await api(`/api/templates/${id}`)
    setEditingTemplate(template)
    setView('editor')
  }
  const newTemplate = () => {
    setEditingTemplate({ name: '未命名流程', description: '', category: '日常办公', visibility: 'private', visible_departments: [], visible_users: [], graph: { nodes: [], edges: [] } })
    setView('editor')
  }
  const openTask = task => { setSelectedTask(task); setView('task') }
  const logout = async () => { try { await api('/api/auth/logout', { method:'POST' }) } catch {} clearToken(); setData(current => ({ ...current, currentUser:null })); setView('tasks') }

  if (!authReady) return <div className="auth-loading"><span className="brand-mark"><GitBranch size={21}/></span><small>正在进入顺办…</small></div>
  if (!data.currentUser) return <LoginPage onLogin={async result => { saveToken(result.token, result.remember); setAuthReady(false); await reload() }} />

  const titles = { tasks: '我的待办', library: '流程库', editor: '流程设计', task: '办理事项', users: '用户管理', departments: '部门管理' }
  return <div className="app-shell">
    <Sidebar view={view} navigate={navigate} mobileNav={mobileNav} close={() => setMobileNav(false)} notify={notify} changePassword={() => setModal('password')} user={data.currentUser} logout={logout} />
    <header className="mobile-header">
      <button className="icon-button" onClick={() => setMobileNav(true)}><Menu size={21} /></button>
      <Brand compact />
      <span className="avatar small">{data.currentUser.name.slice(-1)}</span>
    </header>
    <main className="main">
      <div className="topbar">
        <div>
          <span className="eyebrow">个人工作流程</span>
          <h1>{titles[view]}</h1>
        </div>
        <div className="top-actions">
          <button className="search-button" aria-haspopup="dialog" onClick={() => setSearchOpen(true)}><Search size={16} /><span>搜索</span><kbd>⌘ K</kbd></button>
          <span className="avatar">{data.currentUser.name.slice(-1)}</span>
        </div>
      </div>
      {view === 'tasks' && <TasksView data={data} openTask={openTask} newTask={() => setModal('newTask')} />}
      {view === 'library' && <LibraryView data={data} openTemplate={openTemplate} newTemplate={newTemplate} startTask={id => setModal({ type: 'newTask', templateId: id })} reload={reload} notify={notify} />}
      {view === 'editor' && editingTemplate && <Editor template={editingTemplate} data={data} back={() => navigate('library')} reload={reload} notify={notify} />}
      {view === 'task' && selectedTask && <TaskView initialTask={selectedTask} back={() => navigate('tasks')} reload={reload} notify={notify} />}
      {view === 'users' && <UsersView data={data} reload={reload} notify={notify} />}
      {view === 'departments' && <DepartmentsView data={data} reload={reload} notify={notify} />}
    </main>
    {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}
    {(modal === 'newTask' || (modal && typeof modal === 'object')) && <NewTaskModal data={data} preset={modal && typeof modal === 'object' ? modal.templateId : null} close={() => setModal(null)} done={async id => { await reload(); setModal(null); const all = await api('/api/bootstrap'); openTask(all.tasks.find(x => x.id === id)); notify('待办已创建') }} />}
    {modal === 'password' && <PasswordModal close={() => setModal(null)} done={() => { setModal(null); notify('密码已修改') }} />}
    {searchOpen && <SearchModal data={data} close={() => setSearchOpen(false)} openTask={task => { setSearchOpen(false); openTask(task) }} openTemplate={id => { setSearchOpen(false); openTemplate(id) }} />}
    {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
  </div>
}

function Brand({ compact }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><span className="brand-mark"><GitBranch size={20} /></span><div><b>顺办</b>{!compact && <small>工作流程备忘</small>}</div></div>
}

function Copyright({ className = '' }) {
  return <small className={`copyright ${className}`}>{copyrightNotice}</small>
}

function Sidebar({ view, navigate, mobileNav, close, notify, changePassword, user, logout }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const nav = [
    ['tasks', ListTodo, '我的待办'],
    ['library', Network, '流程库'],
    ...(user.role === 'admin' ? [['users', Users, '用户管理'], ['departments', Building2, '部门管理']] : []),
  ]
  return <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
    <div className="side-head"><Brand /><button className="icon-button side-close" onClick={close}><X size={19}/></button></div>
    <nav>
      <span className="nav-label">工作区</span>
      {nav.map(([id, Icon, label]) => <button key={id} className={view === id || (id === 'tasks' && view === 'task') || (id === 'library' && view === 'editor') ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19}/><span>{label}</span>{id === 'tasks' && <em>1</em>}</button>)}
    </nav>
    <div className="side-tip"><Sparkles size={17}/><div><b>把经验留下来</b><p>常办事项做成流程，下次照着办。</p></div></div>
    <div className="profile-wrap">
      {profileOpen && <div className="profile-menu"><button onClick={() => { setProfileOpen(false); changePassword() }}><KeyRound size={15}/>修改密码</button><button onClick={() => { setProfileOpen(false); notify(`${user.name} · ${user.department_name || '未设部门'}`) }}><UserRound size={15}/>查看个人资料</button><button onClick={logout}><LogOut size={15}/>退出登录</button></div>}
      <div className="profile"><span className="avatar">{user.name.slice(-1)}</span><div><b>{user.name}</b><small>{user.department_name || '未设部门'}</small></div><button className="profile-more" onClick={() => setProfileOpen(!profileOpen)} aria-label="用户菜单"><MoreHorizontal size={18}/></button></div>
    </div>
    <Copyright className="sidebar-copyright" />
  </aside>
}

function TasksView({ data, openTask, newTask }) {
  const [filter, setFilter] = useState('doing')
  const visible = data.tasks.filter(t => filter === 'all' || (filter === 'done' ? t.status === 'done' : t.status !== 'done'))
  return <section className="page enter">
    <div className="page-lead">
      <div><h2>今天接着办</h2><p>每次只关注当前该做的一步。</p></div>
      <button className="primary" onClick={newTask}><Plus size={18}/>新建待办</button>
    </div>
    <div className="tabs">
      <button className={filter === 'doing' ? 'active' : ''} onClick={() => setFilter('doing')}>进行中 <span>{data.tasks.filter(t => t.status !== 'done').length}</span></button>
      <button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>已完成</button>
      <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
    </div>
    <div className="task-list">
      {visible.map(task => {
        const done = Object.values(task.progress).filter(x => x === 'done' || x === 'skipped').length
        const total = task.graph_snapshot.nodes.length
        const currentId = Object.keys(task.progress).find(k => task.progress[k] === 'current')
        const current = task.graph_snapshot.nodes.find(n => n.id === currentId)
        return <button className="task-row" key={task.id} onClick={() => openTask(task)}>
          <span className={`task-status ${task.status}`}><CheckCircle2 size={18}/></span>
          <div className="task-main"><span className="task-template">{task.template_name} · V{task.template_version}</span><strong>{task.title}</strong><span className="current-line">{task.status === 'done' ? '全部步骤已完成' : <>当前：<b>{current?.data.title || '继续办理'}</b>{current?.data.department && ` · ${current.data.department}`}</>}</span></div>
          <div className="progress-wrap"><span>{done}/{total}</span><div className="progress"><i style={{ width: `${total ? done / total * 100 : 0}%` }} /></div></div>
          <span className="row-arrow">→</span>
        </button>
      })}
      {!visible.length && <Empty icon={CheckCircle2} title="这里还没有待办" text="从流程库调用一个流程，开始记录办理进度。" />}
    </div>
  </section>
}

function LibraryView({ data, openTemplate, newTemplate, startTask, reload, notify }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [cloneTarget, setCloneTarget] = useState(null)
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)
  const currentUser = data.currentUser
  const matchesFilter = template => {
    if (filter === 'mine') return template.owner_id === currentUser.id
    if (filter === 'shared') return template.owner_id !== currentUser.id && (template.visibility === 'public' || template.visible_users.includes(currentUser.id) || template.visible_departments.includes(currentUser.department_id))
    if (filter === 'department') return template.visible_departments.includes(currentUser.department_id)
    return true
  }
  const templates = data.templates.filter(matchesFilter).filter(t => `${t.name}${t.description}${t.category}`.includes(query))
  const filters = [['all','全部流程'],['mine','我创建的'],['shared','分享给我的'],['department','部门流程']]
  const visibility = { private: '仅自己', department: '指定部门', users: '指定用户', mixed: '部门和用户', public: '全体用户' }
  const prepareClone = template => { setCloneTarget(template); setCloneName(template.name) }
  const cloneTemplate = async event => {
    event.preventDefault()
    if (!cloneName.trim()) return notify('请填写新流程名称')
    setCloning(true)
    try {
      const result = await api(`/api/templates/${cloneTarget.id}/clone`, { method:'POST', body:JSON.stringify({ name:cloneName.trim() }) })
      await reload(); setCloneTarget(null); notify('已克隆为独立流程，版本从 V1 开始'); await openTemplate(result.id)
    } finally { setCloning(false) }
  }
  return <><section className="page enter">
    <div className="page-lead">
      <div><h2>可复用的办事经验</h2><p>找到合适的流程，调用后就是你自己的待办。</p></div>
      <button className="primary" onClick={newTemplate}><Plus size={18}/>新建流程</button>
    </div>
    <div className="library-tools">
      <div className="filter-chips">{filters.map(([id,label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>
      <label className="inline-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索流程" /></label>
    </div>
    <div className="template-grid">
      {templates.map((template, index) => <article className="template-item" key={template.id} style={{ '--delay': `${index * 50}ms` }}>
        <div className="template-icon"><Network size={23}/></div>
        <div className="template-copy"><div className="template-meta"><span>{template.category}</span><span>V{template.current_version}</span><span><Share2 size={13}/>{visibility[template.visibility]}</span></div><h3>{template.name}</h3><p>{template.description || '暂无说明'}</p><small>{template.flow_code} · {template.owner_name} 创建</small></div>
        <div className="template-actions"><button className="ghost" onClick={() => prepareClone(template)}><Copy size={16}/>克隆</button>{template.owner_id === currentUser.id && <button className="ghost" onClick={() => openTemplate(template.id)}><Pencil size={16}/>编辑</button>}<button className="secondary" onClick={() => startTask(template.id)}>调用流程</button></div>
      </article>)}
      {!templates.length && <Empty icon={query ? Search : Network} title={query ? '没有找到流程' : '当前分类还没有流程'} text={query ? '换个关键词试试。' : '可以新建流程，或切换到其他分类。'} />}
    </div>
  </section>{cloneTarget && <div className="modal-wrap"><div className="scrim" onClick={() => setCloneTarget(null)}/><form className="modal" onSubmit={cloneTemplate}><div className="modal-head"><div><span className="eyebrow">克隆流程</span><h2>给新流程起个名字</h2></div><button type="button" className="icon-button" onClick={() => setCloneTarget(null)}><X size={20}/></button></div><p className="modal-intro">将从“{cloneTarget.name}”复制当前版本，并创建一个独立的 V1 流程。</p><Field label="新流程名称"><input autoFocus required value={cloneName} onChange={e => setCloneName(e.target.value)} /></Field><button className="primary full" disabled={cloning}>{cloning ? '正在克隆…' : '确认克隆'}</button></form></div>}</>
}

function Editor({ template, data, back, reload, notify }) {
  const [meta, setMeta] = useState({ name: template.name, description: template.description, category: template.category, visibility: template.visibility, visibleDepartments: template.visible_departments || [], visibleUsers: template.visible_users || [] })
  const [showSettings, setShowSettings] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState(template.graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(template.graph.edges)
  const [selectedId, setSelectedId] = useState(nodes[0]?.id || null)
  const [saving, setSaving] = useState(false)
  const selected = nodes.find(n => n.id === selectedId)
  const selectedSystems = selected ? getSystems(selected.data) : []
  const departmentChoices = departmentOptions(data.departments)
  const connect = useCallback(params => setEdges(eds => addEdge({ ...params, id: `e-${Date.now()}` }, eds)), [setEdges])
  const updateSelected = (key, value) => setNodes(list => list.map(n => n.id === selectedId ? { ...n, data: { ...n.data, [key]: value } } : n))
  const addNode = () => {
    const id = `n-${Date.now()}`
    const x = selected ? selected.position.x + 320 : 120
    const y = selected ? selected.position.y : 140
    setNodes(list => [...list, { id, type: 'step', position: { x, y }, data: blankStep() }])
    if (selected) setEdges(list => [...list, { id: `e-${Date.now()}`, source: selected.id, target: id }])
    setSelectedId(id)
  }
  const insertBefore = nodeData => {
    const target = selected || nodes[0]
    const id = `n-${Date.now()}`
    const position = target ? { x: target.position.x - 320, y: target.position.y } : { x: 120, y: 140 }
    setNodes(list => [...list, { id, type: 'step', position, data: nodeData }])
    if (target) setEdges(list => {
      const redirected = list.map(edge => edge.target === target.id ? { ...edge, target: id } : edge)
      return [...redirected, { id: `e-${Date.now()}-next`, source: id, target: target.id }]
    })
    setSelectedId(id)
  }
  const addPrevious = () => insertBefore({ ...blankStep(), title: '上一步' })
  const removeSelected = () => {
    setNodes(list => list.filter(n => n.id !== selectedId))
    setEdges(list => list.filter(e => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }
  const save = async () => {
    if (!meta.name.trim()) return notify('请填写流程名称')
    setSaving(true)
    const payload = { ...meta, graph: { nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })), edges: edges.map(({ id, source, target }) => ({ id, source, target })) } }
    if (template.id) await api(`/api/templates/${template.id}`, { method: 'PUT', body: JSON.stringify(payload) })
    else await api('/api/templates', { method: 'POST', body: JSON.stringify(payload) })
    await reload(); setSaving(false); setPublishOpen(false); notify(template.id ? `已发布 V${template.current_version + 1}` : '流程已创建')
  }
  const deleteTemplate = async () => {
    setSaving(true)
    try { await api(`/api/templates/${template.id}`, { method:'DELETE' }); await reload(); notify('流程已删除，已有待办仍会保留'); back() }
    finally { setSaving(false) }
  }
  const decorated = nodes.map(n => ({ ...n, data: { ...n.data } }))
  return <section className="editor-page enter">
    <div className="editor-bar">
      <button className="icon-button" onClick={back}><ArrowLeft size={20}/></button>
      <div className="editor-title"><input aria-label="流程名称" title="点击修改流程名称" value={meta.name} onChange={e => setMeta({ ...meta, name: e.target.value })}/><span>{template.id ? `${template.flow_code} · 当前 V${template.current_version} · 名称可修改` : '新流程草稿 · 名称可修改'}</span></div>
      <div className="editor-actions"><button className="secondary" onClick={() => setShowSettings(true)}><Share2 size={16}/><span className="hide-mobile">流程设置</span></button><button className="primary" onClick={() => template.id ? setPublishOpen(true) : save()} disabled={saving}>{saving ? '保存中…' : template.id ? '发布新版本' : '创建流程'}</button></div>
    </div>
    <div className="editor-workspace">
      <div className="canvas-wrap">
        <div className="canvas-toolbar"><div className="tool-group"><button onClick={addPrevious}><ArrowLeft size={16}/>上一步</button><button onClick={addNode}><Plus size={16}/>下一步</button></div></div>
        <ReactFlow nodes={decorated} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} nodeTypes={nodeTypes} defaultEdgeOptions={defaultEdgeOptions} onNodeClick={(_, node) => setSelectedId(node.id)} fitView fitViewOptions={{ padding: .25 }} minZoom={.35}>
          <Background color="#d8ddd8" gap={22} size={1}/><Controls showInteractive={false}/><MiniMap pannable zoomable nodeColor="#dbe8df" maskColor="rgba(244,245,241,.75)"/>
        </ReactFlow>
        {!nodes.length && <button className="canvas-empty" onClick={addNode}><span><Plus size={24}/></span><b>添加第一个步骤</b><small>从这里开始梳理办理顺序</small></button>}
      </div>
      <aside className="inspector">
        {selected ? <>
          <div className="inspector-head"><div><span className="eyebrow">步骤设置</span><h3>{selected.data.title}</h3></div></div>
          <div className="form-scroll">
            <Field label="步骤名称"><input value={selected.data.title} onChange={e => updateSelected('title', e.target.value)}/></Field>
            <div className="field-row"><Field label="所属部门"><select value={selected.data.department || ''} onChange={e => updateSelected('department', e.target.value)}><option value="">不指定部门</option>{departmentChoices.map(department => <option key={department.id} value={department.label}>{department.label}</option>)}</select></Field><Field label="联系人"><input value={selected.data.contact} onChange={e => updateSelected('contact', e.target.value)} placeholder="例如：张三"/></Field></div>
            <Field label="要办理的事情"><textarea value={selected.data.action} onChange={e => updateSelected('action', e.target.value)} placeholder="说清楚到这里要做什么"/></Field>
            <Field label="所需材料（仅文字记录）"><textarea value={selected.data.materials} onChange={e => updateSelected('materials', e.target.value)} placeholder="例如：合同原件两份、审批单"/></Field>
            <div className="systems-editor"><div className="systems-head"><span>使用系统</span><button type="button" onClick={() => updateSelected('systems',[...selectedSystems,{name:'',url:''}])}><Plus size={14}/>添加系统</button></div>{selectedSystems.map((system,index) => <div className="system-row" key={index}><input value={system.name} onChange={e => updateSelected('systems',selectedSystems.map((item,i)=>i===index?{...item,name:e.target.value}:item))} placeholder="系统名称"/><input value={system.url} onChange={e => updateSelected('systems',selectedSystems.map((item,i)=>i===index?{...item,url:e.target.value}:item))} placeholder="系统地址 http://"/><button type="button" aria-label={`删除第${index + 1}个系统`} onClick={() => updateSelected('systems',selectedSystems.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}{!selectedSystems.length && <p>暂未指定系统，可按需要添加多个。</p>}</div>
            <Field label="注意事项"><textarea value={selected.data.note} onChange={e => updateSelected('note', e.target.value)} placeholder="容易忘记的细节"/></Field>
            <label className="switch-row"><div><b>允许跳过</b><span>实际办理时可以略过此步骤</span></div><input type="checkbox" checked={selected.data.optional} onChange={e => updateSelected('optional', e.target.checked)}/><i/></label>
            <button className="danger-link" onClick={removeSelected}>删除这个步骤</button>
          </div>
        </> : <div className="inspector-empty"><GripVertical size={26}/><b>选择一个步骤</b><p>点击流程图中的节点，在这里编辑详细内容。</p></div>}
      </aside>
    </div>
    {showSettings && <div className="modal-wrap"><div className="scrim" onClick={() => setShowSettings(false)}/><div className="modal settings-modal">
      <div className="modal-head"><div><span className="eyebrow">模板信息</span><h2>流程设置与分享</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={20}/></button></div>
      <Field label="流程简介"><textarea value={meta.description} onChange={e => setMeta({...meta, description:e.target.value})} placeholder="简单说明这个流程解决什么问题"/></Field>
      <Field label="流程分类"><input value={meta.category} onChange={e => setMeta({...meta, category:e.target.value})} placeholder="例如：合同管理"/></Field>
      <Field label="谁可以看到"><select value={meta.visibility} onChange={e => setMeta({...meta, visibility:e.target.value})}><option value="private">仅自己</option><option value="department">指定部门</option><option value="users">指定用户</option><option value="mixed">指定部门和用户</option><option value="public">全体用户</option></select></Field>
      {(meta.visibility === 'department' || meta.visibility === 'mixed') && <ChoiceGroup label="选择部门" items={data.departments} selected={meta.visibleDepartments} onChange={visibleDepartments => setMeta({...meta, visibleDepartments})}/>} 
      {(meta.visibility === 'users' || meta.visibility === 'mixed') && <GroupedUserChoice departments={data.departments} users={data.users} selected={meta.visibleUsers} onChange={visibleUsers => setMeta({...meta, visibleUsers})}/>} 
      <button className="primary full" onClick={() => setShowSettings(false)}>确认设置</button>
      {template.id && <div className="flow-danger-zone"><div><b>删除流程</b><span>已有待办保留，但流程将从流程库移除。</span></div><button onClick={() => { setShowSettings(false); setDeleteOpen(true) }}>删除</button></div>}
    </div></div>}
    {publishOpen && <div className="modal-wrap"><div className="scrim" onClick={() => setPublishOpen(false)}/><div className="modal confirm-modal"><div className="confirm-icon"><UploadCloud size={23}/></div><div className="modal-head"><div><span className="eyebrow">确认发布</span><h2>发布为 V{template.current_version + 1}？</h2></div><button className="icon-button" onClick={() => setPublishOpen(false)}><X size={20}/></button></div><p className="modal-intro">流程编号仍为 {template.flow_code}。新建待办将使用这个版本，已经创建的待办不会变化。</p><div className="publish-summary"><span>流程名称</span><b>{meta.name || '未命名流程'}</b><small>当前 V{template.current_version} → 新版本 V{template.current_version + 1}</small></div><div className="modal-actions"><button className="ghost" onClick={() => setPublishOpen(false)}>再检查一下</button><button className="primary" onClick={save} disabled={saving}>{saving ? '正在发布…' : '确认发布'}</button></div></div></div>}
    {deleteOpen && <div className="modal-wrap"><div className="scrim" onClick={() => setDeleteOpen(false)}/><div className="modal confirm-modal danger-confirm"><div className="confirm-icon"><Trash2 size={23}/></div><div className="modal-head"><div><span className="eyebrow">删除流程</span><h2>确定删除“{template.name}”？</h2></div><button className="icon-button" onClick={() => setDeleteOpen(false)}><X size={20}/></button></div><p className="modal-intro">{template.flow_code} 的版本将不再出现在流程库，也不能再创建新待办；已有待办不会受影响。</p><div className="modal-actions"><button className="ghost" onClick={() => setDeleteOpen(false)}>取消</button><button className="danger-button" onClick={deleteTemplate} disabled={saving}>{saving ? '正在删除…' : '确认删除流程'}</button></div></div></div>}
  </section>
}

function TaskView({ initialTask, back, reload, notify }) {
  const [task, setTask] = useState(initialTask)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(Object.keys(task.progress).find(k => task.progress[k] === 'current') || task.graph_snapshot.nodes[0]?.id)
  const [note, setNote] = useState(task.notes[selectedId] || '')
  const [time, setTime] = useState(task.times?.[selectedId] || '')
  const selected = task.graph_snapshot.nodes.find(n => n.id === selectedId)
  const selectedSystems = selected ? getSystems(selected.data) : []
  const edges = task.graph_snapshot.edges
  const saveState = async (progress, notes, status, times = task.times || {}) => {
    await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ progress, notes, status, times }) })
    setTask({ ...task, progress, notes, status, times }); await reload()
  }
  const saveTime = async () => {
    const times = { ...(task.times || {}) }
    if (time) times[selectedId] = time; else delete times[selectedId]
    await saveState(task.progress, task.notes, task.status, times)
  }
  const saveNote = async () => {
    if ((task.notes[selectedId] || '') === note) return
    await saveState(task.progress, { ...task.notes, [selectedId]:note }, task.status, task.times || {})
    notify('办理备注已保存')
  }
  const complete = async (skip = false) => {
    const progress = { ...task.progress, [selectedId]: skip ? 'skipped' : 'done' }
    const notes = { ...task.notes, [selectedId]: note }
    const times = { ...(task.times || {}) }
    if (time) times[selectedId] = time; else delete times[selectedId]
    const nextIds = edges.filter(e => e.source === selectedId).map(e => e.target)
    const available = nextIds.filter(id => {
      const incoming = edges.filter(e => e.target === id).map(e => e.source)
      return incoming.every(source => progress[source] === 'done' || progress[source] === 'skipped')
    })
    available.forEach(id => { if (!progress[id]) progress[id] = 'current' })
    const finished = task.graph_snapshot.nodes.every(n => progress[n.id] === 'done' || progress[n.id] === 'skipped')
    await saveState(progress, notes, finished ? 'done' : 'doing', times)
    if (finished) notify('这个事项已经全部办完')
    else if (available[0]) { setSelectedId(available[0]); setNote(notes[available[0]] || ''); setTime(times[available[0]] || ''); notify(skip ? '已跳过，进入下一步' : '当前步骤已完成') }
    else notify('步骤已记录完成')
  }
  const reopenStep = async () => {
    const descendants = new Set()
    const queue = [selectedId]
    while (queue.length) {
      const source = queue.shift()
      edges.filter(edge => edge.source === source).forEach(edge => { if (!descendants.has(edge.target)) { descendants.add(edge.target); queue.push(edge.target) } })
    }
    const progress = { ...task.progress, [selectedId]:'current' }
    descendants.forEach(id => { delete progress[id] })
    await saveState(progress, { ...task.notes, [selectedId]:note }, 'doing', task.times || {})
    notify('已撤销完成，可以重新办理这一步')
  }
  const deleteTask = async () => {
    await api(`/api/tasks/${task.id}`, { method:'DELETE' })
    await reload(); notify('待办已删除'); back()
  }
  const graphNodes = task.graph_snapshot.nodes.map(n => ({ ...n, data: { ...n.data, status: task.progress[n.id] || '' }, draggable: false }))
  const stages = buildFlowStages(graphNodes, edges)
  const orderedNodes = stages.flat()
  const done = Object.values(task.progress).filter(v => v === 'done' || v === 'skipped').length
  return <section className="task-page enter">
    <div className="task-head">
      <button className="icon-button" onClick={back}><ArrowLeft size={20}/></button>
      <div><span>{task.template_name} · V{task.template_version}</span><h2>{task.title}</h2></div>
      <div className="task-head-progress"><b>{done}/{graphNodes.length}</b><span>已完成</span></div>
      <button className="task-delete-button" aria-label="删除待办" onClick={() => setDeleteOpen(true)}><Trash2 size={17}/></button>
    </div>
    <div className="task-workspace">
      <div className="vertical-flow">
        <div className="vertical-flow-head"><div><span className="eyebrow">办理顺序</span><h3>按步骤从上到下完成</h3></div><span>{stages.length} 个阶段</span></div>
        <div className="stage-list">{stages.map((stage, stageIndex) => <div className="flow-stage" key={stageIndex}>
          <div className="stage-index"><span>{String(stageIndex + 1).padStart(2,'0')}</span><i/></div>
          <div className="stage-content">{stage.length > 1 && <div className="parallel-label"><GitBranch size={13}/>以下 {stage.length} 项可并行办理</div>}<div className={`stage-steps ${stage.length > 1 ? 'parallel' : ''}`}>{stage.map(node => {
            const status = task.progress[node.id] || 'waiting'
            return <button key={node.id} className={`vertical-step ${status} ${selectedId === node.id ? 'selected' : ''}`} onClick={() => { setSelectedId(node.id); setNote(task.notes[node.id] || ''); setTime(task.times?.[node.id] || '') }}>
              <span className="vertical-status">{status === 'done' ? <Check size={15}/> : status === 'skipped' ? '—' : status === 'current' ? <span/> : <LockKeyhole size={13}/>}</span>
              <div><b>{node.data.title}</b><small>{[node.data.department,node.data.contact,task.times?.[node.id] ? formatTaskTime(task.times[node.id]) : ''].filter(Boolean).join(' · ') || '未填写办理信息'}</small></div>
              <ChevronRight size={17}/>
            </button>
          })}</div></div>
        </div>)}</div>
      </div>
      <aside className="step-panel">
        {selected && <>
          <div className="step-sequence"><span>当前查看</span><b>{orderedNodes.findIndex(n => n.id === selectedId) + 1} / {graphNodes.length}</b></div>
          <h2>{selected.data.title}</h2>
          <div className="step-tags">{selected.data.department && <span>{selected.data.department}</span>}{selected.data.contact && <span><CircleUserRound size={15}/>{selected.data.contact}</span>}{task.times?.[selectedId] && <span><Clock3 size={15}/>{formatTaskTime(task.times[selectedId])}</span>}</div>
          <Detail label="要做什么" value={selected.data.action}/>
          <Detail label="需要带什么" value={selected.data.materials}/>
          {!!selectedSystems.length && <Detail label="使用系统" value={<span className="system-links">{selectedSystems.map((system,index) => { const url = safeSystemUrl(system.url); return <span className="system-link-row" key={index}><b>{system.name || `系统 ${index + 1}`}</b>{url && <a href={url} target="_blank" rel="noreferrer noopener"><ExternalLink size={14}/>打开系统</a>}</span> })}</span>}/>} 
          <Detail label="注意事项" value={selected.data.note}/>
          <Field label="本次办理时间（可选）"><input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} onBlur={saveTime}/></Field>
          <Field label="我的办理备注"><textarea value={note} onChange={e => setNote(e.target.value)} onBlur={saveNote} placeholder="记录本次办理的情况…"/></Field>
          <div className="step-actions">
            {selected.data.optional && task.progress[selectedId] === 'current' && <button className="ghost" onClick={() => complete(true)}>跳过此步</button>}
            {task.progress[selectedId] === 'current' && <button className="primary grow" onClick={() => complete(false)}><Check size={18}/>完成当前步骤</button>}
            {(task.progress[selectedId] === 'done' || task.progress[selectedId] === 'skipped') && <><button className="ghost" onClick={reopenStep}><RotateCcw size={16}/>撤销完成</button><span className="completed grow"><CheckCircle2 size={18}/>{task.progress[selectedId] === 'skipped' ? '已跳过' : '已完成'}</span></>}
            {!task.progress[selectedId] && <button className="waiting grow" disabled><LockKeyhole size={17}/>完成前置步骤后开放</button>}
          </div>
        </>}
      </aside>
    </div>
    {deleteOpen && <div className="modal-wrap"><div className="scrim" onClick={() => setDeleteOpen(false)}/><div className="modal confirm-modal danger-confirm"><div className="confirm-icon"><Trash2 size={23}/></div><div className="modal-head"><div><span className="eyebrow">删除待办</span><h2>确定删除“{task.title}”？</h2></div><button className="icon-button" onClick={() => setDeleteOpen(false)}><X size={20}/></button></div><p className="modal-intro">办理进度、时间和备注都会一起删除，此操作不能撤销。</p><div className="modal-actions"><button className="ghost" onClick={() => setDeleteOpen(false)}>取消</button><button className="danger-button" onClick={deleteTask}>确认删除待办</button></div></div></div>}
  </section>
}

function UsersView({ data, reload, notify }) {
  const [open, setOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetResult, setResetResult] = useState(null)
  const [resetting, setResetting] = useState(false)
  const [form, setForm] = useState({ username: '', name: '', departmentId: '', role: 'user', password: '' })
  const options = departmentOptions(data.departments)
  const submit = async e => { e.preventDefault(); await api('/api/users', { method: 'POST', body: JSON.stringify(form) }); setOpen(false); setForm({ username: '', name: '', departmentId: '', role: 'user', password: '' }); await reload(); notify('用户已添加') }
  const remove = async () => { try { await api(`/api/users/${deleteTarget.id}`, { method: 'DELETE' }); setDeleteTarget(null); await reload(); notify('用户已删除') } catch (error) { notify(error.message) } }
  const resetPassword = async () => { setResetting(true); try { const result = await api(`/api/users/${resetTarget.id}/reset-password`, { method:'POST' }); setResetResult({ ...resetTarget, password:result.password }) } catch (error) { notify(error.message) } finally { setResetting(false) } }
  const closeReset = () => { setResetTarget(null); setResetResult(null) }
  const copyPassword = async () => { try { await navigator.clipboard.writeText(resetResult.password); notify('新密码已复制') } catch { notify('复制失败，请手动选择密码') } }
  return <section className="page enter">
    <div className="page-lead"><div><h2>登录用户</h2><p>管理用户名、密码和所属部门；流程联系人仍然是自由文字。</p></div><button className="primary" onClick={() => setOpen(true)}><Plus size={18}/>添加用户</button></div>
    <div className="user-table">
      <div className="table-head"><span>用户</span><span>用户名</span><span>部门</span><span>角色</span><span/></div>
      {data.users.map(u => {
        const isCurrent = u.id === data.currentUser.id
        const isSystemAdmin = Boolean(u.is_system_admin)
        const canReset = !isCurrent && (data.currentUser.is_system_admin || u.role === 'user')
        const canDelete = !isCurrent && !isSystemAdmin && (data.currentUser.is_system_admin || u.role !== 'admin')
        return <div className="table-row" key={u.id}><span className="user-cell"><i>{u.name.slice(-1)}</i><b>{u.name}</b></span><span>{u.username}</span><span>{u.department_name || '—'}</span><span>{isSystemAdmin ? '系统管理员' : u.role === 'admin' ? '管理员' : '普通用户'}</span><span className="user-actions">{isCurrent && <small className="current-user">当前登录</small>}{!isCurrent && isSystemAdmin && <small className="protected-user">不可删除</small>}{canReset && <button className="reset-button" aria-label={`重置${u.name}的密码`} onClick={() => { setResetTarget(u); setResetResult(null) }}><KeyRound size={15}/></button>}{canDelete && <button className="delete-button" aria-label={`删除${u.name}`} onClick={() => setDeleteTarget(u)}><Trash2 size={16}/></button>}</span></div>
      })}
    </div>
    {open && <div className="modal-wrap"><div className="scrim" onClick={() => setOpen(false)}/><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">用户管理</span><h2>添加登录用户</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}><X size={20}/></button></div><Field label="姓名"><input required value={form.name} onChange={e => setForm({...form, name:e.target.value})}/></Field><Field label="用户名"><input required value={form.username} onChange={e => setForm({...form, username:e.target.value})}/></Field><Field label="初始密码"><input required minLength="6" type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} placeholder="至少 6 位"/></Field><Field label="所属部门"><select value={form.departmentId} onChange={e => setForm({...form, departmentId:e.target.value})}><option value="">请选择</option>{options.map(d => <option value={d.id} key={d.id}>{d.label}</option>)}</select></Field><Field label="角色"><select value={form.role} onChange={e => setForm({...form, role:e.target.value})}><option value="user">普通用户</option>{data.currentUser.is_system_admin && <option value="admin">管理员</option>}</select></Field><button className="primary full">确认添加</button></form></div>}
    {deleteTarget && <div className="modal-wrap"><div className="scrim" onClick={() => setDeleteTarget(null)}/><div className="modal confirm-modal danger-confirm"><div className="confirm-icon"><Trash2 size={23}/></div><div className="modal-head"><div><span className="eyebrow">删除用户</span><h2>确定删除“{deleteTarget.name}”？</h2></div><button className="icon-button" onClick={() => setDeleteTarget(null)}><X size={20}/></button></div><p className="modal-intro">该用户将无法继续登录。此操作不会删除其他用户。</p><div className="modal-actions"><button className="ghost" onClick={() => setDeleteTarget(null)}>取消</button><button className="danger-button" onClick={remove}>确认删除用户</button></div></div></div>}
    {resetTarget && <div className="modal-wrap"><div className="scrim" onClick={closeReset}/><div className="modal confirm-modal reset-password-modal"><div className="confirm-icon"><KeyRound size={23}/></div><div className="modal-head"><div><span className="eyebrow">随机重置密码</span><h2>{resetResult ? '新密码已生成' : `重置“${resetTarget.name}”的密码？`}</h2></div><button className="icon-button" onClick={closeReset}><X size={20}/></button></div>{resetResult ? <><p className="modal-intro">旧密码和该账号原有登录已失效，请将下面的新密码交给本人。</p><div className="reset-password-value"><code>{resetResult.password}</code><button onClick={copyPassword}><Copy size={15}/>复制密码</button></div><button className="primary full" onClick={closeReset}>完成</button></> : <><p className="modal-intro">系统会生成一个随机密码，并立即让该账号的旧密码及已有登录失效。</p><div className="modal-actions"><button className="ghost" onClick={closeReset}>取消</button><button className="primary" onClick={resetPassword} disabled={resetting}>{resetting ? '正在重置…' : '确认随机重置'}</button></div></>}</div></div>}
  </section>
}

function DepartmentsView({ data, reload, notify }) {
  const [addingTo, setAddingTo] = useState(undefined)
  const [name, setName] = useState('')
  const tree = buildDepartmentTree(data.departments)
  const submit = async e => { e.preventDefault(); try { await api('/api/departments', { method:'POST', body:JSON.stringify({ name, parentId: addingTo?.id || null }) }); setAddingTo(undefined); setName(''); await reload(); notify('部门已添加') } catch(error) { notify(error.message) } }
  const remove = async id => { try { await api(`/api/departments/${id}`, { method:'DELETE' }); await reload(); notify('部门已删除') } catch(error) { notify(error.message) } }
  return <section className="page enter">
    <div className="page-lead"><div><h2>组织架构</h2><p>部门可以无限分级，添加用户时可选择任意一级部门。</p></div><button className="primary" onClick={() => setAddingTo(null)}><Plus size={18}/>添加一级部门</button></div>
    <div className="department-panel"><div className="department-head"><span>部门层级</span><span>{data.departments.length} 个部门</span></div>{tree.map(node => <DepartmentRow key={node.id} node={node} depth={0} add={setAddingTo} remove={remove} users={data.users}/>)}</div>
    {addingTo !== undefined && <div className="modal-wrap"><div className="scrim" onClick={() => setAddingTo(undefined)}/><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">部门管理</span><h2>{addingTo ? `在“${addingTo.name}”下添加` : '添加一级部门'}</h2></div><button type="button" className="icon-button" onClick={() => setAddingTo(undefined)}><X size={20}/></button></div><Field label="部门名称"><input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="例如：项目一部"/></Field><button className="primary full">确认添加</button></form></div>}
  </section>
}

function DepartmentRow({ node, depth, add, remove, users }) {
  const userCount = users.filter(user => user.department_id === node.id).length
  return <><div className="department-row" style={{ '--depth': depth }}><span className="tree-guide"/><span className="department-icon"><Building2 size={17}/></span><div><b>{node.name}</b><small>{userCount ? `${userCount} 名用户` : '暂无用户'}</small></div><button className="ghost tiny" onClick={() => add(node)}><Plus size={14}/>添加子部门</button><button className="delete-button" aria-label={`删除${node.name}`} onClick={() => remove(node.id)}><Trash2 size={15}/></button></div>{node.children.map(child => <DepartmentRow key={child.id} node={child} depth={depth + 1} add={add} remove={remove} users={users}/>)}</>
}

function SearchModal({ data, close, openTask, openTemplate }) {
  const [query, setQuery] = useState('')
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close])
  const text = query.trim().toLowerCase()
  const templates = text ? data.templates.filter(item => `${item.name}${item.description}${item.category}`.toLowerCase().includes(text)) : []
  const tasks = text ? data.tasks.filter(item => `${item.title}${item.template_name}`.toLowerCase().includes(text)) : []
  return <div className="modal-wrap search-wrap"><div className="scrim" onClick={close}/><div className="search-modal" role="dialog" aria-modal="true" aria-label="搜索流程或待办"><div className="search-input"><Search size={20}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="输入流程或待办名称"/><button className="icon-button" aria-label="关闭搜索" onClick={close}><X size={18}/></button></div><div className="search-results">{!text && <div className="search-hint"><Search size={25}/><span>输入关键词查找流程和待办</span></div>}{text && <><span className="result-label">流程</span>{templates.map(item => <button key={`t-${item.id}`} onClick={() => openTemplate(item.id)}><Network size={17}/><div><b>{item.name}</b><small>{item.category} · V{item.current_version}</small></div><ChevronRight size={17}/></button>)}<span className="result-label">待办</span>{tasks.map(item => <button key={`d-${item.id}`} onClick={() => openTask(item)}><ListTodo size={17}/><div><b>{item.title}</b><small>{item.template_name}</small></div><ChevronRight size={17}/></button>)}{!templates.length && !tasks.length && <div className="search-hint">没有找到匹配内容</div>}</>}</div></div></div>
}

function PasswordModal({ close, done }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const submit = async e => { e.preventDefault(); if (password !== confirm) return setError('两次输入的密码不一致'); try { await api('/api/auth/password', { method:'PATCH', body:JSON.stringify({password}) }); done() } catch(err) { setError(err.message) } }
  return <div className="modal-wrap"><div className="scrim" onClick={close}/><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">账号安全</span><h2>修改我的密码</h2></div><button type="button" className="icon-button" onClick={close}><X size={20}/></button></div><Field label="新密码"><input required minLength="6" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位"/></Field><Field label="再次输入"><input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)}/></Field>{error && <p className="form-error">{error}</p>}<button className="primary full">确认修改</button></form></div>
}

function NewTaskModal({ data, preset, close, done }) {
  const [templateId, setTemplateId] = useState(preset || data.templates[0]?.id || '')
  const selected = data.templates.find(t => t.id === Number(templateId))
  const [title, setTitle] = useState(selected?.name || '')
  useEffect(() => { const t = data.templates.find(x => x.id === Number(templateId)); if (t) setTitle(t.name) }, [templateId, data.templates])
  const submit = async e => { e.preventDefault(); const result = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ templateId: Number(templateId), title }) }); done(result.id) }
  return <div className="modal-wrap"><div className="scrim" onClick={close}/><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">调用流程</span><h2>新建个人待办</h2></div><button type="button" className="icon-button" onClick={close}><X size={20}/></button></div><Field label="选择流程"><select value={templateId} onChange={e => setTemplateId(e.target.value)}>{data.templates.map(t => <option key={t.id} value={t.id}>{t.name} · V{t.current_version}</option>)}</select></Field><Field label="本次事项名称"><input required value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：华川项目合同盖章"/></Field><button className="primary full">创建并开始办理</button></form></div>
}

function buildDepartmentTree(departments) {
  const byId = new Map(departments.map(item => [item.id, { ...item, children: [] }]))
  const roots = []
  byId.forEach(item => { const parent = byId.get(item.parent_id); if (parent) parent.children.push(item); else roots.push(item) })
  return roots
}
function departmentOptions(departments) {
  const result = []
  const visit = (nodes, prefix = '') => nodes.forEach(node => { result.push({ id:node.id, label:`${prefix}${node.name}` }); visit(node.children, `${prefix}${node.name} / `) })
  visit(buildDepartmentTree(departments))
  return result
}
function buildFlowStages(nodes, edges) {
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const predecessors = new Map(nodes.map(node => [node.id, edges.filter(edge => edge.target === node.id).map(edge => edge.source)]))
  const levels = new Map()
  const pending = new Set(nodes.map(node => node.id))
  while (pending.size) {
    const ready = [...pending].filter(id => predecessors.get(id).every(source => levels.has(source) || !nodeById.has(source)))
    if (!ready.length) { [...pending].forEach(id => levels.set(id, levels.size)); break }
    ready.forEach(id => {
      const priorLevels = predecessors.get(id).map(source => levels.get(source)).filter(level => level !== undefined)
      levels.set(id, priorLevels.length ? Math.max(...priorLevels) + 1 : 0)
      pending.delete(id)
    })
  }
  const maxLevel = Math.max(0, ...levels.values())
  return Array.from({ length:maxLevel + 1 }, (_, level) => nodes.filter(node => levels.get(node.id) === level).sort((a,b) => (a.position?.y || 0) - (b.position?.y || 0))).filter(stage => stage.length)
}
function formatTaskTime(value) { return value ? value.replace('T',' ') : '' }
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label> }
function ChoiceGroup({ label, items, selected, onChange }) { return <div className="choice-group"><span>{label}</span><div className="choice-list">{items.map(item => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={e => onChange(e.target.checked ? [...selected,item.id] : selected.filter(id=>id!==item.id))}/><i>{item.name}</i></label>)}</div></div> }
function GroupedUserChoice({ departments, users, selected, onChange }) {
  const [query, setQuery] = useState('')
  const options = departmentOptions(departments)
  const departmentNames = new Map(options.map(item => [item.id, item.label]))
  const text = query.trim().toLowerCase()
  const visibleUsers = users.filter(user => user.active !== 0).filter(user => !text || `${user.name}${user.username}${departmentNames.get(user.department_id) || ''}`.toLowerCase().includes(text))
  const groups = options.map(department => ({ ...department, users:visibleUsers.filter(user => user.department_id === department.id) })).filter(group => group.users.length)
  const unassigned = visibleUsers.filter(user => !departmentNames.has(user.department_id))
  const toggle = (id, checked) => onChange(checked ? [...new Set([...selected,id])] : selected.filter(value => value !== id))
  return <div className="choice-group user-choice-group"><span>选择用户</span><label className="user-choice-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名、用户名或部门"/></label><div className="user-choice-scroll">{groups.map(group => <section className="user-choice-department" key={group.id}><div><b>{group.label}</b><small>{group.users.length} 人</small></div><div className="user-choice-list">{group.users.map(user => <label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} onChange={event => toggle(user.id,event.target.checked)}/><i><span>{user.name.slice(-1)}</span><b>{user.name}</b><small>{user.username}</small></i></label>)}</div></section>)}{unassigned.length > 0 && <section className="user-choice-department"><div><b>未分配部门</b><small>{unassigned.length} 人</small></div><div className="user-choice-list">{unassigned.map(user => <label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} onChange={event => toggle(user.id,event.target.checked)}/><i><span>{user.name.slice(-1)}</span><b>{user.name}</b><small>{user.username}</small></i></label>)}</div></section>}{!groups.length && !unassigned.length && <p className="user-choice-empty">没有找到用户</p>}</div></div>
}
function Detail({ label, value }) { if (!value) return null; return <div className="detail"><span>{label}</span><p>{value}</p></div> }
function Empty({ icon: Icon, title, text }) { return <div className="empty"><Icon size={27}/><b>{title}</b><p>{text}</p></div> }

const rootElement = document.getElementById('root')
const appRoot = globalThis.__worktodoRoot || createRoot(rootElement)
globalThis.__worktodoRoot = appRoot
appRoot.render(<App />)
