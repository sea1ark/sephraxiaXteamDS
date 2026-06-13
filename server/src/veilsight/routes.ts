// VeilSight — platform-owner-only "root" panel. Spy + control surface over the
// whole instance: every user, every server, broadcasts, ghost ops and a few
// trollish powers. Gated hard behind isOwner; every route 403s otherwise.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { VeilOverview } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { toPublicUser } from '../lib/serialize';
import {
  getOnlineUserIds,
  broadcastServersChanged,
  broadcastUserUpdate,
  emitVeilNotice,
  forceDisconnect,
} from '../socket';

async function assertOwner(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isOwner: true } });
  return !!u?.isOwner;
}

export async function veilsightRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  // Hard gate: only the platform owner may touch ANY veilsight route.
  app.addHook('preHandler', async (request, reply) => {
    if (!(await assertOwner(request.user!.sub))) {
      return reply.code(403).send({ error: 'classified' });
    }
  });

  // Full instance overview: every user (with presence), every server.
  app.get('/veilsight/overview', async (): Promise<VeilOverview> => {
    const online = new Set(getOnlineUserIds());
    const users = await prisma.user.findMany({
      include: { roles: true },
      orderBy: { createdAt: 'asc' },
    });
    const servers = await prisma.server.findMany({
      include: { members: { select: { userId: true } }, _count: { select: { channels: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const [messages, dms, configs] = await Promise.all([
      prisma.message.count(),
      prisma.directMessage.count(),
      prisma.configPost.count(),
    ]);
    return {
      stats: {
        users: users.length,
        online: online.size,
        servers: servers.length,
        messages,
        dms,
        configs,
      },
      users: users.map((u) => ({
        ...toPublicUser(u),
        status: online.has(u.id) ? (toPublicUser(u).status as never) : 'offline',
      })),
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        ownerId: s.ownerId,
        inviteCode: s.inviteCode,
        memberCount: s.members.length,
        channelCount: s._count.channels,
        memberIds: s.members.map((m) => m.userId),
        createdAt: s.createdAt.toISOString(),
      })),
    };
  });

  // Grant / revoke platform-owner (root) on another account.
  app.post('/veilsight/users/:id/owner', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ owner: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'owner:boolean required' });
    const user = await prisma.user.update({
      where: { id },
      data: { isOwner: body.data.owner },
      include: { roles: true },
    });
    broadcastUserUpdate(toPublicUser(user));
    return { ok: true };
  });

  // Shadow-join any server (invisible membership — see servers shadow rule).
  app.post('/veilsight/servers/:id/shadow-join', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) return reply.code(404).send({ error: 'server not found' });
    await prisma.serverMember.upsert({
      where: { serverId_userId: { serverId: id, userId: request.user!.sub } },
      create: { serverId: id, userId: request.user!.sub },
      update: {},
    });
    broadcastServersChanged();
    return { ok: true };
  });

  // Broadcast a system DM-style notification to everyone (or one target).
  app.post('/veilsight/broadcast', async (request, reply) => {
    const body = z
      .object({ text: z.string().trim().min(1).max(500), targetId: z.string().nullish() })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'text required' });
    emitVeilNotice(body.data.targetId ?? null, body.data.text);
    return { ok: true };
  });

  // Force a user's sessions to disconnect (ghost "yank").
  app.post('/veilsight/users/:id/yank', async (request, reply) => {
    const { id } = request.params as { id: string };
    forceDisconnect(id);
    return { ok: true };
  });
}
