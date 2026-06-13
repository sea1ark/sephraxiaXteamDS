// Channel CRUD, message history, pins, and message search.
// All routes require a valid access token.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Channel } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { getPermissions } from '../lib/permissions';
import { toMessage } from '../lib/serialize';
import { broadcastChannelsChanged } from '../socket';

const createChannelSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['text', 'voice']).default('text'),
  serverId: z.string().optional(), // defaults to the home server
});

/** Channel management rights: platform canManageChannels OR owning that server. */
async function canManageServerChannels(userId: string, serverId: string | null): Promise<boolean> {
  const perms = await getPermissions(userId);
  if (perms.canManageChannels) return true; // includes platform owner
  if (!serverId) return false;
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  return server?.ownerId === userId;
}

const updateChannelSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  topic: z.string().max(256).nullable().optional(),
});

const messageInclude = {
  author: { include: { roles: true } },
  replyTo: {
    select: { id: true, content: true, authorId: true, author: { select: { username: true } } },
  },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' as const } },
} as const;

function toChannel(c: {
  id: string;
  name: string;
  topic: string | null;
  type: string;
  position: number;
  serverId: string | null;
}): Channel {
  return {
    id: c.id,
    name: c.name,
    topic: c.topic,
    type: c.type as Channel['type'],
    position: c.position,
    serverId: c.serverId,
  };
}

export async function channelRoutes(app: FastifyInstance) {
  // Protect every route registered in this plugin.
  app.addHook('preHandler', authenticate);

  // Channels of servers the requester belongs to (platform owner sees all).
  app.get('/channels', async (request) => {
    const me = request.user!.sub;
    const { serverId } = request.query as { serverId?: string };
    const viewer = await prisma.user.findUnique({ where: { id: me }, select: { isOwner: true } });
    const membershipFilter = viewer?.isOwner
      ? {}
      : { server: { members: { some: { userId: me } } } };
    const channels = await prisma.channel.findMany({
      where: { ...(serverId ? { serverId } : {}), ...membershipFilter },
      orderBy: { position: 'asc' },
    });
    return channels.map(toChannel);
  });

  app.post('/channels', async (request, reply) => {
    const parsed = createChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }

    // Default to the home (oldest) server when none specified.
    let serverId = parsed.data.serverId ?? null;
    if (!serverId) {
      const home = await prisma.server.findFirst({ orderBy: { createdAt: 'asc' } });
      serverId = home?.id ?? null;
    }
    if (!(await canManageServerChannels(request.user!.sub, serverId))) {
      return reply.code(403).send({ error: 'you do not have permission to manage channels' });
    }

    const count = await prisma.channel.count({ where: { serverId } });
    const channel = await prisma.channel.create({
      data: { name: parsed.data.name, type: parsed.data.type, position: count, serverId },
    });
    broadcastChannelsChanged();
    return reply.code(201).send(toChannel(channel));
  });

  // Rename a channel and/or set its topic.
  app.patch('/channels/:id', async (request, reply) => {
    const { id: channelId } = request.params as { id: string };
    const target = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!target) return reply.code(404).send({ error: 'channel not found' });
    if (!(await canManageServerChannels(request.user!.sub, target.serverId))) {
      return reply.code(403).send({ error: 'you do not have permission to manage channels' });
    }
    const parsed = updateChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const data: { name?: string; topic?: string | null } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.topic !== undefined) data.topic = parsed.data.topic || null;
    const channel = await prisma.channel.update({ where: { id: channelId }, data });
    broadcastChannelsChanged();
    return toChannel(channel);
  });

  app.delete('/channels/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const target = await prisma.channel.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: 'channel not found' });
    if (!(await canManageServerChannels(request.user!.sub, target.serverId))) {
      return reply.code(403).send({ error: 'you do not have permission to manage channels' });
    }
    await prisma.channel.delete({ where: { id } });
    broadcastChannelsChanged();
    return reply.code(204).send();
  });

  // Channel message history (newest last). With ?around=<messageId> the window
  // is centred on that message instead — used to jump to search results/pins.
  app.get('/channels/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string; around?: string };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 100);

    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) return reply.code(404).send({ error: 'channel not found' });

    if (query.around) {
      const target = await prisma.message.findFirst({
        where: { id: query.around, channelId: id },
      });
      if (!target) return reply.code(404).send({ error: 'message not found' });
      const half = Math.floor(limit / 2);
      const before = await prisma.message.findMany({
        where: { channelId: id, createdAt: { lt: target.createdAt } },
        orderBy: { createdAt: 'desc' },
        take: half,
        include: messageInclude,
      });
      const after = await prisma.message.findMany({
        where: { channelId: id, createdAt: { gt: target.createdAt } },
        orderBy: { createdAt: 'asc' },
        take: half,
        include: messageInclude,
      });
      const center = await prisma.message.findUnique({
        where: { id: target.id },
        include: messageInclude,
      });
      return [...before.reverse(), center!, ...after].map(toMessage);
    }

    const messages = await prisma.message.findMany({
      where: { channelId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: messageInclude,
    });

    // Return in chronological order with public author info.
    return messages.reverse().map(toMessage);
  });

  // Pinned messages of a channel, newest pin first.
  app.get('/channels/:id/pins', async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) return reply.code(404).send({ error: 'channel not found' });
    const pins = await prisma.message.findMany({
      where: { channelId: id, pinned: true },
      orderBy: { pinnedAt: 'desc' },
      take: 50,
      include: messageInclude,
    });
    return pins.map(toMessage);
  });

  // Search messages by content — within one channel (?channelId=) or globally.
  app.get('/search/messages', async (request, reply) => {
    const query = request.query as { q?: string; channelId?: string };
    const q = query.q?.trim();
    if (!q || q.length < 2) return reply.code(400).send({ error: 'query too short' });
    const messages = await prisma.message.findMany({
      where: {
        content: { contains: q },
        ...(query.channelId ? { channelId: query.channelId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: messageInclude,
    });
    return messages.map(toMessage);
  });
}
