// Moderation: kick, ban/unban, and timeout. All actions require the matching
// permission, never apply to the owner, and never to yourself.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { EffectivePermissions } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { getPermissions } from '../lib/permissions';
import { toPublicUser } from '../lib/serialize';
import { enforceModeration, broadcastUserUpdate, broadcastRolesChanged } from '../socket';

const withRoles = { roles: true } as const;

export async function moderationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Validate actor permission + target, returning the loaded target user.
  async function authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    perm: keyof EffectivePermissions,
  ) {
    const actorId = request.user!.sub;
    const { id } = request.params as { id: string };
    if (id === actorId) {
      reply.code(400).send({ error: "you can't moderate yourself" });
      return null;
    }
    const perms = await getPermissions(actorId);
    if (!perms[perm]) {
      reply.code(403).send({ error: 'you do not have permission for that' });
      return null;
    }
    const target = await prisma.user.findUnique({ where: { id }, include: withRoles });
    if (!target) {
      reply.code(404).send({ error: 'user not found' });
      return null;
    }
    if (target.isOwner) {
      reply.code(403).send({ error: 'the owner cannot be moderated' });
      return null;
    }
    return target;
  }

  // Kick: disconnect now, no persistent state.
  app.post('/users/:id/kick', async (request, reply) => {
    const target = await authorize(request, reply, 'canKick');
    if (!target) return;
    enforceModeration(target.id, 'kick');
    return { ok: true };
  });

  // Ban: mark banned, force-disconnect, hide from member list.
  app.post('/users/:id/ban', async (request, reply) => {
    const target = await authorize(request, reply, 'canBan');
    if (!target) return;
    const body = z.object({ reason: z.string().max(500).optional() }).safeParse(request.body ?? {});
    const reason = body.success ? body.data.reason : undefined;
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: new Date(), bannedReason: reason ?? null },
      include: withRoles,
    });
    enforceModeration(updated.id, 'ban', reason);
    broadcastRolesChanged(); // prompt clients to refetch the (now-filtered) member list
    return toPublicUser(updated);
  });

  // Unban.
  app.post('/users/:id/unban', async (request, reply) => {
    const target = await authorize(request, reply, 'canBan');
    if (!target) return;
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: null, bannedReason: null },
      include: withRoles,
    });
    broadcastRolesChanged();
    return toPublicUser(updated);
  });

  // Timeout: mute for N minutes (0 clears it).
  app.post('/users/:id/timeout', async (request, reply) => {
    const target = await authorize(request, reply, 'canTimeout');
    if (!target) return;
    const body = z
      .object({ minutes: z.number().int().min(0).max(60 * 24 * 28) })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'minutes (0–40320) required' });
    }
    const mutedUntil = body.data.minutes > 0 ? new Date(Date.now() + body.data.minutes * 60_000) : null;
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { mutedUntil },
      include: withRoles,
    });
    broadcastUserUpdate(toPublicUser(updated));
    return toPublicUser(updated);
  });

  // List banned users so a moderator can unban them.
  app.get('/moderation/bans', async (request, reply) => {
    const perms = await getPermissions(request.user!.sub);
    if (!perms.canBan) return reply.code(403).send({ error: 'you do not have permission for that' });
    const banned = await prisma.user.findMany({
      where: { bannedAt: { not: null } },
      include: withRoles,
      orderBy: { bannedAt: 'desc' },
    });
    return banned.map((u) => ({ ...toPublicUser(u), bannedReason: u.bannedReason }));
  });
}
