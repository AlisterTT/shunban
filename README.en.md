# Shunban · Personal Workflow Notes

English | [简体中文](./README.md)

Shunban is a lightweight system for sharing workflow knowledge and keeping step-by-step task notes. It turns cross-department and cross-system procedures into reusable workflow templates. Calling a workflow creates an independent task snapshot that can be completed step by step. It can be deployed on either a private network or the public internet with appropriate security controls.

## Features

- Visual workflow designer with sequential and parallel branches, step insertion, and free-form connections
- Versioned templates and immutable task snapshots; names can change without affecting workflow IDs or history
- Private, department-based, user-based, or public workflow sharing
- Workflow cloning, version publishing, renaming, and deletion
- Vertical task execution view with undo, notes, and optional dates
- Step records for departments, contacts, materials, notes, and multiple system links
- Nested departments, department renaming synchronized to workflows and tasks, and tiered system/department administrator permissions
- Department deletion clears template references while preserving department names in existing task snapshots
- SQLite single-file storage with no external database service required
- Responsive desktop and mobile layouts

## Quick Start

Node.js 22.5 or later is required.

```bash
git clone https://github.com/AlisterTT/shunban.git
cd shunban
npm run setup
npm start
```

Open <http://localhost:8787>. The demo database uses username `admin` and password `123456`. Change this password immediately after the first login.

`npm run setup` installs locked dependencies, builds the web application, and initializes the database. An existing `data/worktodo.db` is never overwritten. To prepare and start the foreground service in one command, run:

```bash
npm run deploy
```

## Roles and Permissions

- System administrator `admin`: manages all users and departments and can change the role and department of any non-system account.
- Department administrator: manages its department subtree, including child-department maintenance and regular-user creation, transfer, deletion, and password resets. It cannot modify its own root department or manage other branches or administrators.
- Regular user: uses personal tasks and workflows shared within the configured visibility scope.

## Docker Deployment (Recommended)

With Docker and Docker Compose installed, run this command in the project directory:

```bash
docker compose up -d --build
```

Open `http://server-ip:8787`. The container restarts automatically, and runtime data is stored in the `worktodo_data` Docker volume. Rebuilding the image does not remove business data.

Useful commands:

```bash
docker compose logs -f worktodo
docker compose restart worktodo
docker compose down
```

## Database Maintenance

The default runtime database is `data/worktodo.db`; the clean demo source is `data/demo.db`.

### Initialize

```bash
npm run db:init
```

This creates the runtime database from the demo database only when it does not already exist.

### Back Up

```bash
npm run db:backup
```

Backups are written to `data/backups/`. The script uses SQLite's consistent backup mechanism so WAL data is not missed.

### Reset

Stop the running service first, then run:

```bash
npm run db:reset
```

You must type `RESET` to confirm. The current database is backed up automatically before it is replaced with the clean `data/demo.db`. For explicit non-interactive automation:

```bash
npm run db:reset -- --yes
```

Reset a Docker deployment with:

```bash
docker compose stop worktodo
docker compose run --rm worktodo npm run db:reset -- --yes
docker compose up -d
```

### Rebuild the Demo Database

```bash
npm run demo:db
```

This only rebuilds the repository-safe `data/demo.db`; it does not touch the runtime database.

## Development

```bash
npm ci
npm run dev
```

The development frontend runs at <http://localhost:5173>, while the API listens on port `8787` by default.

Run checks before committing:

```bash
npm run test:smoke
npm run build
```

## Configuration

| Environment variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | HTTP listening port |
| `WORKTODO_DB_PATH` | `data/worktodo.db` | Runtime SQLite database path |
| `NODE_ENV` | — | Set to `production` to serve the built web application |
| `VITE_COPYRIGHT_NOTICE` | `Copyright © 2026 AlisterTT · MIT License` | Full copyright notice embedded in the login page and sidebar at build time |

## Data and Security

- `data/worktodo.db`, WAL files, and `data/backups/` are ignored by Git.
- Keep real names, workflows, and passwords out of `data/demo.db`.
- For public-internet deployments, use HTTPS behind a reverse proxy, restrict administrative access, and apply appropriate network controls.
- Back up the database regularly and change the default administrator password after deployment.
- This project is released under the [MIT License](./LICENSE). You may use, modify, and distribute it; the software is provided as is.
