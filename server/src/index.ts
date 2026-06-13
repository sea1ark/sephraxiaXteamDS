// Sephraxia server bootstrap: Fastify (REST) + Socket.io (realtime).
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { env } from './env';
import { authRoutes } from './auth/routes';
import { channelRoutes } from './channels/routes';
import { userRoutes, UPLOAD_DIR } from './users/routes';
import { roleRoutes } from './roles/routes';
import { dmRoutes } from './dms/routes';
import { uploadRoutes } from './uploads/routes';
import { moderationRoutes } from './moderation/routes';
import { friendRoutes } from './friends/routes';
import { serverRoutes, ensureHomeServer } from './servers/routes';
import { configRoutes } from './configs/routes';
import { veilsightRoutes } from './veilsight/routes';
import { setupSocket } from './socket';
import { prisma } from './prisma';
import { mkdir } from 'node:fs/promises';

// If no owner exists yet (e.g. accounts created before the isOwner field),
// promote the earliest-registered user so the server is always manageable.
async function ensureOwner() {
  const owners = await prisma.user.count({ where: { isOwner: true } });
  if (owners > 0) return;
  const first = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (first) {
    await prisma.user.update({ where: { id: first.id }, data: { isOwner: true } });
  }
}

// Assign sequential public UIDs (1, 2, 3…) to any users created before the
// field existed, ordered by registration time so seniority is preserved.
async function assignUids() {
  const missing = await prisma.user.findMany({
    where: { uid: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (missing.length === 0) return;
  let next = ((await prisma.user.aggregate({ _max: { uid: true } }))._max.uid ?? 0) + 1;
  for (const u of missing) {
    await prisma.user.update({ where: { id: u.id }, data: { uid: next++ } });
  }
}

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: env.clientOrigins,
    credentials: true,
  });

  // File uploads (avatars + message attachments, max 25 MB) and static serving.
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  await mkdir(UPLOAD_DIR, { recursive: true });
  await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/' });

  app.get('/health', async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(channelRoutes);
  await app.register(userRoutes);
  await app.register(roleRoutes);
  await app.register(dmRoutes);
  await app.register(uploadRoutes);
  await app.register(moderationRoutes);
  await app.register(friendRoutes);
  await app.register(serverRoutes);
  await app.register(configRoutes);
  await app.register(veilsightRoutes);

  await ensureOwner();
  await assignUids();
  await ensureHomeServer();
  // Give the platform owner a "root" badge if they don't have one yet.
  await prisma.user
    .updateMany({ where: { isOwner: true, badge: null }, data: { badge: 'root', badgeColor: '#ff4d6d' } })
    .catch(() => {});

  // Bind Socket.io to Fastify's underlying HTTP server. `ready()` ensures the
  // server exists before we attach.
  await app.ready();
  setupSocket(app.server);

  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info(`Sephraxia server listening on http://localhost:${env.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
