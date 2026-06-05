// Channel CRUD. All routes require a valid access token.
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
});

const updateChannelSchema = z.object({
  name: z.string().min(1).max(64),
});

function toChannel(c: { id: string; name: string; type: string; position: number }): Channel {
  return { id: c.id, name: c.name, type: c.type as Channel['type'], position: c.position };
}

export async function channelRoutes(app: FastifyInstance) {
  // Protect every route registered in this plugin.
  app.addHook('preHandler', authenticate);

  app.get('/channels', async () => {
    const channels = await prisma.channel.findMany({ orderBy: { position: 'asc' } });
    return channels.map(toChannel);
  });

  app.post('/channels', async (request, reply) => {
    const perms = await getPermissions(request.user!.sub);
    if (!perms.canManageChannels) {
      return reply.code(403).send({ error: 'you do not have permission to manage channels' });
    }

    const parsed = createChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }

    const count = await prisma.channel.count();
    const channel = await prisma.channel.create({
      data: { name: parsed.data.name, type: parsed.data.type, position: count },
    });
    broadcastChannelsChanged();
    return reply.code(201).send(toChannel(channel));
  });

  // Rename a channel.
  app.patch('/channels/:id', async (request, reply) => {
    const perms = await getPermissions(request.user!.sub);
    if (!perms.canManageChannels) {
      return reply.code(403).send({ error: 'you do not have permission to manage channels' });
    }
    const parsed = updateChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { id } = request.params as { id: string };
    try {
      const channel = await prisma.channel.update({ where: { id }, data: { name: parsed.data.name } });
      broadcastChannelsChanged();
      return toChannel(channel);
    } catch {
      return reply.code(404).send({ error: 'channel not found' });
    }
  });

  app.delete('/channels/:id', async (request, reply) => {
    const perms = await getPermissions(request.user!.sub);
    if (!perms.canManageChannels) {
      return reply.code(403).send({ error: 'you do not have permission to manage channels' });
    }
    const { id } = request.params as { id: string };
    try {
      await prisma.channel.delete({ where: { id } });
      broadcastChannelsChanged();
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: 'channel not found' });
    }
  });

  // Channel message history (newest last).
  app.get('/channels/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit ?? 50) || 50, 100);

    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) return reply.code(404).send({ error: 'channel not found' });

    const messages = await prisma.message.findMany({
      where: { channelId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: { include: { roles: true } },
        replyTo: {
          select: { id: true, content: true, authorId: true, author: { select: { username: true } } },
        },
      },
    });

    // Return in chronological order with public author info.
    return messages.reverse().map(toMessage);
  });
}
