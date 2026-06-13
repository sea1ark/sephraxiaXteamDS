// Role CRUD and assignment — roles are SERVER-SCOPED. Mutations require
// canManageRoles ON THAT SERVER (platform owner & server owner always pass).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { getPermissions } from '../lib/permissions';
import { toRole, toPublicUser } from '../lib/serialize';
import { broadcastRolesChanged, broadcastUserUpdate } from '../socket';

const roleSchema = z.object({
  name: z.string().min(1).max(32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a hex like #7d6fc4'),
  symbol: z.string().max(4).default(''),
  position: z.number().int().min(0).max(9999).optional(),
  serverId: z.string().optional(),
  canManageChannels: z.boolean().optional(),
  canDeleteMessages: z.boolean().optional(),
  canManageRoles: z.boolean().optional(),
  canKick: z.boolean().optional(),
  canBan: z.boolean().optional(),
  canTimeout: z.boolean().optional(),
});

async function homeId(): Promise<string | null> {
  const home = await prisma.server.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  return home?.id ?? null;
}

export async function roleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  async function canManage(userId: string, serverId: string | null): Promise<boolean> {
    return (await getPermissions(userId, serverId)).canManageRoles;
  }

  // Roles of one server (defaults to home). Only that server's roles.
  app.get('/roles', async (request) => {
    const { serverId } = request.query as { serverId?: string };
    const sid = serverId ?? (await homeId());
    const roles = await prisma.role.findMany({
      where: { serverId: sid },
      orderBy: { position: 'desc' },
    });
    return roles.map(toRole);
  });

  app.post('/roles', async (request, reply) => {
    const parsed = roleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const serverId = parsed.data.serverId ?? (await homeId());
    if (!(await canManage(request.user!.sub, serverId))) {
      return reply.code(403).send({ error: 'you cannot manage roles on this server' });
    }
    const count = await prisma.role.count({ where: { serverId } });
    const role = await prisma.role.create({
      data: {
        name: parsed.data.name,
        color: parsed.data.color,
        symbol: parsed.data.symbol,
        position: parsed.data.position ?? count,
        serverId,
        canManageChannels: parsed.data.canManageChannels ?? false,
        canDeleteMessages: parsed.data.canDeleteMessages ?? false,
        canManageRoles: parsed.data.canManageRoles ?? false,
        canKick: parsed.data.canKick ?? false,
        canBan: parsed.data.canBan ?? false,
        canTimeout: parsed.data.canTimeout ?? false,
      },
    });
    broadcastRolesChanged();
    return reply.code(201).send(toRole(role));
  });

  app.patch('/roles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'role not found' });
    if (!(await canManage(request.user!.sub, existing.serverId))) {
      return reply.code(403).send({ error: 'you cannot manage roles on this server' });
    }
    const parsed = roleSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { serverId: _ignore, ...data } = parsed.data; // can't move a role between servers
    const role = await prisma.role.update({ where: { id }, data });
    broadcastRolesChanged();
    return toRole(role);
  });

  app.delete('/roles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'role not found' });
    if (!(await canManage(request.user!.sub, existing.serverId))) {
      return reply.code(403).send({ error: 'you cannot manage roles on this server' });
    }
    await prisma.role.delete({ where: { id } });
    broadcastRolesChanged();
    return reply.code(204).send();
  });

  // Replace a user's roles FOR ONE SERVER (keeps roles from other servers).
  app.put('/users/:id/roles', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({ roleIds: z.array(z.string()), serverId: z.string().optional() })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'roleIds[] required' });

    // The roles being assigned must all belong to one server; derive it.
    const assigned = await prisma.role.findMany({ where: { id: { in: body.data.roleIds } } });
    const serverId =
      body.data.serverId ?? assigned[0]?.serverId ?? (await homeId());
    if (!(await canManage(request.user!.sub, serverId))) {
      return reply.code(403).send({ error: 'you cannot manage roles on this server' });
    }
    // Reject roles from a different server than the scope.
    if (assigned.some((r) => r.serverId !== serverId)) {
      return reply.code(400).send({ error: 'roles belong to a different server' });
    }

    const target = await prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!target) return reply.code(404).send({ error: 'user not found' });

    // Keep this user's roles from OTHER servers; replace only this server's set.
    const keep = target.roles.filter((r) => r.serverId !== serverId).map((r) => r.id);
    const nextIds = [...new Set([...keep, ...body.data.roleIds])];

    const user = await prisma.user.update({
      where: { id },
      data: { roles: { set: nextIds.map((roleId) => ({ id: roleId })) } },
      include: { roles: true },
    });
    const pub = toPublicUser(user);
    broadcastUserUpdate(pub);
    return pub;
  });
}
