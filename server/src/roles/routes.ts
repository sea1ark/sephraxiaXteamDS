// Role CRUD and assignment. Reading is open to any authed user; mutations need
// the canManageRoles permission (the owner always has it).
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
  canManageChannels: z.boolean().optional(),
  canDeleteMessages: z.boolean().optional(),
  canManageRoles: z.boolean().optional(),
  canKick: z.boolean().optional(),
  canBan: z.boolean().optional(),
  canTimeout: z.boolean().optional(),
});

export async function roleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Guard mutating routes behind canManageRoles.
  async function requireManageRoles(userId: string): Promise<boolean> {
    return (await getPermissions(userId)).canManageRoles;
  }

  app.get('/roles', async () => {
    const roles = await prisma.role.findMany({ orderBy: { position: 'desc' } });
    return roles.map(toRole);
  });

  app.post('/roles', async (request, reply) => {
    if (!(await requireManageRoles(request.user!.sub))) {
      return reply.code(403).send({ error: 'you cannot manage roles' });
    }
    const parsed = roleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const count = await prisma.role.count();
    const role = await prisma.role.create({
      data: {
        name: parsed.data.name,
        color: parsed.data.color,
        symbol: parsed.data.symbol,
        position: count,
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
    if (!(await requireManageRoles(request.user!.sub))) {
      return reply.code(403).send({ error: 'you cannot manage roles' });
    }
    const { id } = request.params as { id: string };
    const parsed = roleSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    try {
      const role = await prisma.role.update({ where: { id }, data: parsed.data });
      broadcastRolesChanged();
      return toRole(role);
    } catch {
      return reply.code(404).send({ error: 'role not found' });
    }
  });

  app.delete('/roles/:id', async (request, reply) => {
    if (!(await requireManageRoles(request.user!.sub))) {
      return reply.code(403).send({ error: 'you cannot manage roles' });
    }
    const { id } = request.params as { id: string };
    try {
      await prisma.role.delete({ where: { id } });
      broadcastRolesChanged();
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: 'role not found' });
    }
  });

  // Replace a user's full role set, then broadcast their updated profile.
  app.put('/users/:id/roles', async (request, reply) => {
    if (!(await requireManageRoles(request.user!.sub))) {
      return reply.code(403).send({ error: 'you cannot manage roles' });
    }
    const { id } = request.params as { id: string };
    const body = z.object({ roleIds: z.array(z.string()) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'roleIds[] required' });

    try {
      const user = await prisma.user.update({
        where: { id },
        data: { roles: { set: body.data.roleIds.map((roleId) => ({ id: roleId })) } },
        include: { roles: true },
      });
      const pub = toPublicUser(user);
      broadcastUserUpdate(pub);
      return pub;
    } catch {
      return reply.code(404).send({ error: 'user not found' });
    }
  });
}
