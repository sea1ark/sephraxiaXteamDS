// Direct-message history & conversation list. Sending happens over Socket.io.
import type { FastifyInstance } from 'fastify';
import type { DirectMessage, DmConversation } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { toPublicUser, toDm } from '../lib/serialize';

const dmInclude = {
  from: { include: { roles: true } },
  replyTo: {
    select: { id: true, content: true, fromId: true, from: { select: { username: true } } },
  },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' as const } },
} as const;

export async function dmRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // List the people I've DM'd with, plus the latest message in each thread.
  app.get('/dms', async (request) => {
    const me = request.user!.sub;
    const messages = await prisma.directMessage.findMany({
      where: { OR: [{ fromId: me }, { toId: me }] },
      orderBy: { createdAt: 'desc' },
      include: dmInclude,
    });

    const latestByPartner = new Map<string, DirectMessage>();
    for (const m of messages) {
      const partnerId = m.fromId === me ? m.toId : m.fromId;
      if (!latestByPartner.has(partnerId)) latestByPartner.set(partnerId, toDm(m));
    }

    const partners = await prisma.user.findMany({
      where: { id: { in: [...latestByPartner.keys()] } },
      include: { roles: true },
    });

    const conversations: DmConversation[] = partners.map((u) => ({
      user: toPublicUser(u),
      lastMessage: latestByPartner.get(u.id) ?? null,
    }));
    // Most recently active first.
    conversations.sort(
      (a, b) =>
        new Date(b.lastMessage?.createdAt ?? 0).getTime() -
        new Date(a.lastMessage?.createdAt ?? 0).getTime(),
    );
    return conversations;
  });

  // Full history of my conversation with :userId (chronological).
  app.get('/dms/:userId', async (request) => {
    const me = request.user!.sub;
    const { userId } = request.params as { userId: string };
    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { fromId: me, toId: userId },
          { fromId: userId, toId: me },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: dmInclude,
    });
    return messages.map(toDm);
  });
}
