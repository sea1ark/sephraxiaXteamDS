// Multi-server (guild) support. Servers own channels and have explicit
// members. Shadow access: the PLATFORM owner (isOwner) can see and fully
// administer every server, but is NOT listed among its members unless someone
// explicitly added them — other members simply don't see them.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerInfo } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { broadcastServersChanged, broadcastChannelsChanged } from '../socket';

const createServerSchema = z.object({
  name: z.string().trim().min(1).max(48),
  icon: z.string().trim().max(4).nullish(),
});

interface DbServer {
  id: string;
  name: string;
  icon: string | null;
  inviteCode: string;
  ownerId: string;
  createdAt: Date;
  members: { userId: string }[];
}

async function isPlatformOwner(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isOwner: true } });
  return !!u?.isOwner;
}

/**
 * Serialize a server for a given viewer. Shadow rule: platform owners are
 * stripped from the member list unless they are the server's own creator —
 * their explicit membership row stays invisible to everyone but themselves.
 */
function toServerInfo(
  s: DbServer,
  viewerId: string,
  viewerIsPlatformOwner: boolean,
  platformOwnerIds: Set<string>,
): ServerInfo {
  const memberIds = s.members
    .map((m) => m.userId)
    .filter(
      (id) =>
        id === viewerId || // you always see yourself
        s.ownerId === id || // the server creator is always visible
        !platformOwnerIds.has(id), // hide shadow admins from everyone else
    );
  const isMember = s.members.some((m) => m.userId === viewerId);
  const canSeeInvite = viewerId === s.ownerId || viewerIsPlatformOwner;
  return {
    id: s.id,
    name: s.name,
    icon: s.icon,
    ownerId: s.ownerId,
    createdAt: s.createdAt.toISOString(),
    inviteCode: canSeeInvite ? s.inviteCode : undefined,
    memberIds,
    isMember,
  };
}

const memberInclude = { members: { select: { userId: true } } } as const;

export async function serverRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // My servers. Platform owners see EVERY server (shadow access).
  app.get('/servers', async (request) => {
    const me = request.user!.sub;
    const amOwner = await isPlatformOwner(me);
    const owners = await prisma.user.findMany({ where: { isOwner: true }, select: { id: true } });
    const ownerIds = new Set(owners.map((o) => o.id));

    const servers = await prisma.server.findMany({
      where: amOwner ? {} : { members: { some: { userId: me } } },
      orderBy: { createdAt: 'asc' },
      include: memberInclude,
    });
    return servers.map((s) => toServerInfo(s, me, amOwner, ownerIds));
  });

  // Create a server: creator becomes its owner + first member, with a default
  // #general channel.
  app.post('/servers', async (request, reply) => {
    const parsed = createServerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const me = request.user!.sub;
    const server = await prisma.server.create({
      data: {
        name: parsed.data.name,
        icon: parsed.data.icon || null,
        ownerId: me,
        members: { create: { userId: me } },
        channels: { create: { name: 'general', type: 'text', position: 0 } },
      },
      include: memberInclude,
    });
    broadcastServersChanged();
    broadcastChannelsChanged();
    const amOwner = await isPlatformOwner(me);
    return reply.code(201).send(toServerInfo(server, me, amOwner, new Set()));
  });

  // Join by invite code.
  app.post('/servers/join', async (request, reply) => {
    const body = z.object({ code: z.string().trim().min(4) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invite code required' });
    const me = request.user!.sub;
    const server = await prisma.server.findUnique({
      where: { inviteCode: body.data.code },
      include: memberInclude,
    });
    if (!server) return reply.code(404).send({ error: 'недействительный инвайт' });
    if (!server.members.some((m) => m.userId === me)) {
      await prisma.serverMember.create({ data: { serverId: server.id, userId: me } });
      broadcastServersChanged();
    }
    const fresh = await prisma.server.findUnique({
      where: { id: server.id },
      include: memberInclude,
    });
    const amOwner = await isPlatformOwner(me);
    return toServerInfo(fresh!, me, amOwner, new Set());
  });

  // Add a member directly (server owner or platform admin).
  app.post('/servers/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({ userId: z.string() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'userId required' });
    const me = request.user!.sub;
    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) return reply.code(404).send({ error: 'server not found' });
    if (server.ownerId !== me && !(await isPlatformOwner(me))) {
      return reply.code(403).send({ error: 'только владелец сервера может добавлять участников' });
    }
    await prisma.serverMember.upsert({
      where: { serverId_userId: { serverId: id, userId: body.data.userId } },
      create: { serverId: id, userId: body.data.userId },
      update: {},
    });
    broadcastServersChanged();
    return { ok: true };
  });

  // Leave a server (the owner can't leave their own — delete instead).
  app.post('/servers/:id/leave', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.user!.sub;
    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) return reply.code(404).send({ error: 'server not found' });
    if (server.ownerId === me) {
      return reply.code(400).send({ error: 'владелец не может покинуть свой сервер — удали его' });
    }
    await prisma.serverMember.deleteMany({ where: { serverId: id, userId: me } });
    broadcastServersChanged();
    return { ok: true };
  });

  // Delete a server (its owner or a platform admin). The seeded home server
  // is protected.
  app.delete('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = request.user!.sub;
    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) return reply.code(404).send({ error: 'server not found' });
    if (server.ownerId !== me && !(await isPlatformOwner(me))) {
      return reply.code(403).send({ error: 'только владелец может удалить сервер' });
    }
    const first = await prisma.server.findFirst({ orderBy: { createdAt: 'asc' } });
    if (first?.id === id) {
      return reply.code(400).send({ error: 'домашний сервер удалить нельзя' });
    }
    await prisma.server.delete({ where: { id } });
    broadcastServersChanged();
    broadcastChannelsChanged();
    return reply.code(204).send();
  });
}

/**
 * Boot-time migration: ensure a home server exists, owns every orphan channel,
 * and includes every existing user as a member. New users join it on register.
 */
export async function ensureHomeServer(): Promise<void> {
  let home = await prisma.server.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!home) {
    const owner =
      (await prisma.user.findFirst({ where: { isOwner: true } })) ??
      (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));
    if (!owner) return; // empty database — nothing to seed yet
    home = await prisma.server.create({
      data: { name: 'sephraxia', icon: '✦', ownerId: owner.id },
    });
  }
  // Adopt channels and roles that predate multi-server support.
  await prisma.channel.updateMany({ where: { serverId: null }, data: { serverId: home.id } });
  await prisma.role.updateMany({ where: { serverId: null }, data: { serverId: home.id } });
  // Make sure every existing user is a member of home.
  const users = await prisma.user.findMany({ select: { id: true } });
  const members = await prisma.serverMember.findMany({
    where: { serverId: home.id },
    select: { userId: true },
  });
  const have = new Set(members.map((m) => m.userId));
  const missing = users.filter((u) => !have.has(u.id));
  if (missing.length > 0) {
    await prisma.serverMember.createMany({
      data: missing.map((u) => ({ serverId: home!.id, userId: u.id })),
    });
  }
}

/** Add a newly registered user to the home server. */
export async function joinHomeServer(userId: string): Promise<void> {
  const home = await prisma.server.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!home) return;
  await prisma.serverMember
    .upsert({
      where: { serverId_userId: { serverId: home.id, userId } },
      create: { serverId: home.id, userId },
      update: {},
    })
    .catch(() => {});
}
