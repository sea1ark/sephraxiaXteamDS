# sephraxia

Self-hosted desktop messenger with a dark glass aesthetic. Electron + React client,
Fastify + Socket.io + Prisma/SQLite server, shared TypeScript types.

## Layout

```
sephraxia/
├── client/   Electron + React + Vite + Tailwind
├── server/   Fastify REST + Socket.io realtime + Prisma (SQLite)
└── shared/   Shared TypeScript types (User, Channel, Message, Role, socket events)
```

## Setup

```bash
npm install              # installs all workspaces
npm run db:migrate       # create the SQLite db + tables (server workspace)
```

## Run (development)

```bash
npm run dev              # server + client together
# or individually:
npm run dev:server       # Fastify on http://localhost:4000
npm run dev:client       # Electron window via electron-vite (renderer on :5173)
```

Register an account in the app, create a text channel, and messages flow in
realtime over Socket.io. Open a second instance / account to see presence and
typing indicators.

## Phase 1 scope

Auth (JWT access + refresh), channel CRUD, channel message history + realtime
messaging, presence, typing indicators, the four-column glass UI. Roles and DMs
exist only as database models (no UI yet). Voice, file uploads, and notifications
are later phases.
