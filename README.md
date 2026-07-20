# 顺办 · 工作流程备忘

[English](./README.en.md) | 简体中文

顺办是一套轻量的共享工作流程备忘系统。它把跨部门、跨系统的办事经验整理成可复用流程；用户调用流程后会得到独立待办，并按步骤记录办理进度。系统既可以部署在内网，也可以在做好安全防护后部署到公网。

## 功能概览

- 流程图设计，支持串行、并行、插入上一步/下一步和自由连线
- 流程版本与执行快照；改名不影响专属流程编号和历史版本
- 私有、指定部门、指定用户或全体可见的流程分享
- 克隆流程、发布新版本和删除流程
- 纵向待办执行视图、步骤撤销、办理备注和可选时间
- 步骤可记录部门、联系人、材料、注意事项及多个系统地址
- 多级部门、部门改名自动同步流程与待办，以及系统管理员/部门管理员分级权限
- 删除部门后流程模板改为未指定部门，已创建待办保留原部门名称
- SQLite 单文件存储，无需单独安装数据库服务
- 桌面端与手机端响应式界面

## 快速体验

需要 Node.js 22.5 或更高版本。

```bash
git clone https://github.com/AlisterTT/shunban.git
cd shunban
npm run setup
npm start
```

打开 <http://localhost:8787>。演示库初始账号为 `admin`，密码为 `123456`；首次登录后请立即修改密码。

`npm run setup` 会自动完成依赖安装、网页构建和数据库初始化。已有的 `data/worktodo.db` 不会被覆盖。如果希望准备完成后直接以前台方式启动，也可以运行：

```bash
npm run deploy
```

## 角色权限

- 系统管理员 `admin`：管理全部用户和部门，可调整非系统管理员账号的角色与所属部门。
- 部门管理员：管理本部门及全部下级部门，可以增删改子部门，并管理范围内普通用户的新增、删除、部门调换和密码重置；不能修改自己的根部门，也不能管理其他部门或管理员。
- 普通用户：使用个人待办和按可见范围共享的流程。

## Docker 部署（推荐）

服务器安装 Docker 和 Docker Compose 后，在项目目录运行：

```bash
docker compose up -d --build
```

打开 `http://服务器IP:8787`。容器会自动重启，运行数据库保存在 Docker 数据卷 `worktodo_data` 中，更新镜像不会清除业务数据。

常用命令：

```bash
docker compose logs -f worktodo
docker compose restart worktodo
docker compose down
```

## 数据库维护

默认运行库为 `data/worktodo.db`，演示初始库为 `data/demo.db`。

### 初始化

```bash
npm run db:init
```

只在运行库不存在时从演示库创建，不覆盖已有数据。

### 备份

```bash
npm run db:backup
```

备份会保存到 `data/backups/`。脚本使用 SQLite 一致性备份方式，可以避免只复制主文件时遗漏 WAL 数据。

### 重置

先停止正在运行的服务，然后执行：

```bash
npm run db:reset
```

必须手动输入 `RESET` 确认。重置前会自动备份当前运行库，随后恢复 `data/demo.db` 的初始状态。自动化环境可显式确认：

```bash
npm run db:reset -- --yes
```

Docker 部署的重置方式：

```bash
docker compose stop worktodo
docker compose run --rm worktodo npm run db:reset -- --yes
docker compose up -d
```

### 重新生成演示库

```bash
npm run demo:db
```

这个命令只重建可提交到仓库的 `data/demo.db`，不会修改运行库。

## 开发

```bash
npm ci
npm run dev
```

开发网页地址为 <http://localhost:5173>，API 默认监听 `8787` 端口。

提交前检查：

```bash
npm run test:smoke
npm run build
```

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务监听端口 |
| `WORKTODO_DB_PATH` | `data/worktodo.db` | SQLite 运行库路径 |
| `NODE_ENV` | — | 设置为 `production` 时提供构建后的网页 |
| `VITE_COPYRIGHT_NOTICE` | `Copyright © 2026 AlisterTT · MIT License` | 构建时写入登录页和侧栏的完整版权声明 |

## 数据与安全

- `data/worktodo.db`、WAL 文件和 `data/backups/` 已被 Git 忽略，不会提交。
- `data/demo.db` 只应包含演示数据，不要写入真实姓名、流程或密码。
- 对外或跨网段使用时，应在反向代理后启用 HTTPS，并限制访问来源。
- 请定期备份数据库，并在首次部署后修改默认管理员密码。
- 本项目使用 [MIT License](./LICENSE)，可以自由使用、修改和分发，但软件按现状提供。
