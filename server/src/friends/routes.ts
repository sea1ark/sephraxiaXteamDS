// Friends: user search, friend requests, and friend list (Discord-style).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { FriendsData, FriendRequest } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { toPublicUser } from '../lib/serialize';
import { broadcastFriendsChanged } from '../socket';

const withRoles = { roles: true } as const;

export async function friendRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Search users by username (for adding friends). Excludes me and banned.
  app.get('/users/search', async (request) => {
    const me = request.user!.sub;
    const { q } = request.query as { q?: string };
    const query = (q ?? '').trim();
    if (query.length < 1) return [];
    const users = await prisma.user.findMany({
      where: {
        username: { contains: query },
        id: { not: me },
        bannedAt: null,
      },
      include: withRoles,
      take: 20,
      orderBy: { username: 'asc' },
    });
    return users.map(toPublicUser);
  });

  // My friends + pending requests in both directions.
  app.get('/friends', async (request): Promise<FriendsData> => {
    const me = request.user!.sub;
    const rows = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: me }, { addresseeId: me }] },
      include: {
        requester: { include: withRoles },
        addressee: { include: withRoles },
      },
      orderBy: { createdAt: 'desc' },
    });

    const friends = [];
    const incoming: FriendRequest[] = [];
    const outgoing: FriendRequest[] = [];
    for (const r of rows) {
      const other = r.requesterId === me ? r.addressee : r.requester;
      if (r.status === 'accepted') {
        friends.push(toPublicUser(other));
      } else if (r.addresseeId === me) {
        incoming.push({ id: r.id, user: toPublicUser(r.requester), createdAt: r.createdAt.toISOString() });
      } else {
        outgoing.push({ id: r.id, user: toPublicUser(r.addressee), createdAt: r.createdAt.toISOString() });
      }
    }
    return { friends, incoming, outgoing };
  });

  // Send a friend request (by userId or username). Auto-accepts a reverse request.
  app.post('/friends/request', async (request, reply) => {
    const me = request.user!.sub;
    const body = z
      .object({ userId: z.string().optional(), username: z.string().optional() })
      .safeParse(request.body);
    if (!body.success || (!body.data.userId && !body.data.username)) {
      return reply.code(400).send({ error: 'userId or username required' });
    }

    const target = body.data.userId
      ? await prisma.user.findUnique({ where: { id: body.data.userId } })
      : await prisma.user.findUnique({ where: { username: body.data.username! } });
    if (!target) return reply.code(404).send({ error: 'user not found' });
    if (target.id === me) return reply.code(400).send({ error: "you can't friend yourself" });
    if (target.bannedAt) return reply.code(404).send({ error: 'user not found' });

    // Look for any existing friendship in either direction.
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: me, addresseeId: target.id },
          { requesterId: target.id, addresseeId: me },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'accepted') {
        return reply.code(409).send({ error: 'you are already friends' });
      }
      if (existing.addresseeId === me) {
        // They already requested me — accept it.
        await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'accepted' } });
        broadcastFriendsChanged([me, target.id]);
        return reply.send({ ok: true, status: 'accepted' });
      }
      return reply.code(409).send({ error: 'request already pending' });
    }

    await prisma.friendship.create({
      data: { requesterId: me, addresseeId: target.id, status: 'pending' },
    });
    broadcastFriendsChanged([me, target.id]);
    return reply.code(201).send({ ok: true, status: 'pending' });
  });

  // Accept an incoming request.
  app.post('/friends/:id/accept', async (request, reply) => {
    const me = request.user!.sub;
    const { id } = request.params as { id: string };
    const fr = await prisma.friendship.findUnique({ where: { id } });
    if (!fr || fr.addresseeId !== me || fr.status !== 'pending') {
      return reply.code(404).send({ error: 'request not found' });
    }
    await prisma.friendship.update({ where: { id }, data: { status: 'accepted' } });
    broadcastFriendsChanged([fr.requesterId, fr.addresseeId]);
    return { ok: true };
  });

  // Decline an incoming request, or cancel one I sent.
  app.post('/friends/:id/decline', async (request, reply) => {
    const me = request.user!.sub;
    const { id } = request.params as { id: string };
    const fr = await prisma.friendship.findUnique({ where: { id } });
    if (!fr || (fr.addresseeId !== me && fr.requesterId !== me) || fr.status !== 'pending') {
      return reply.code(404).send({ error: 'request not found' });
    }
    await prisma.friendship.delete({ where: { id } });
    broadcastFriendsChanged([fr.requesterId, fr.addresseeId]);
    return { ok: true };
  });

  // Remove an existing friend (by their user id).
  app.delete('/friends/:userId', async (request, reply) => {
    const me = request.user!.sub;
    const { userId } = request.params as { userId: string };
    const fr = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: me, addresseeId: userId },
          { requesterId: userId, addresseeId: me },
        ],
      },
    });
    if (!fr) return reply.code(404).send({ error: 'not friends' });
    await prisma.friendship.delete({ where: { id: fr.id } });
    broadcastFriendsChanged([me, userId]);
    return { ok: true };
  });
}
