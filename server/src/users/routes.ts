// User listing for the member panel, profile editing, and per-user permissions.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { getOnlineUserIds, broadcastUserUpdate } from '../socket';
import { toPublicUser } from '../lib/serialize';
import { getPermissions } from '../lib/permissions';

export const UPLOAD_DIR = join(process.cwd(), 'uploads');
const ALLOWED_IMAGE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const updateProfileSchema = z.object({
  // empty string clears the avatar; otherwise must be an http(s) or data URL
  avatarUrl: z
    .string()
    .max(2048)
    .refine((v) => v === '' || /^(https?:|data:image\/)/.test(v), 'avatar must be an image url')
    .nullish(),
  status: z.enum(['online', 'idle', 'dnd']).optional(),
});

const withRoles = { roles: true } as const;

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Current authenticated user.
  app.get('/users/me', async (request) => {
    const me = await prisma.user.findUnique({
      where: { id: request.user!.sub },
      include: withRoles,
    });
    return me ? toPublicUser(me) : null;
  });

  // Current user's effective permissions (owner OR union of role permissions).
  app.get('/users/me/permissions', async (request) => getPermissions(request.user!.sub));

  // Update your own profile (avatar + status), then broadcast to everyone.
  app.patch('/users/me', async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const data: { avatarUrl?: string | null; status?: string } = {};
    if (parsed.data.avatarUrl !== undefined) {
      data.avatarUrl = parsed.data.avatarUrl ? parsed.data.avatarUrl : null;
    }
    if (parsed.data.status !== undefined) data.status = parsed.data.status;

    const updated = await prisma.user.update({
      where: { id: request.user!.sub },
      data,
      include: withRoles,
    });
    const pub = toPublicUser(updated);
    broadcastUserUpdate(pub);
    return pub;
  });

  // Upload an avatar image file. Saved to /uploads/<userId>.<ext> and exposed
  // as an absolute URL; a cache-busting query param forces clients to refetch.
  app.post('/users/me/avatar', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'no file uploaded' });

    // Drain the stream first — @fastify/multipart needs the part consumed even
    // when we end up rejecting it, or the connection is left half-open.
    const buffer = await file.toBuffer();

    const ext = ALLOWED_IMAGE[file.mimetype];
    if (!ext) return reply.code(400).send({ error: 'unsupported image type' });

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `${request.user!.sub}.${ext}`;
    await writeFile(join(UPLOAD_DIR, filename), buffer);

    // Store a relative path; clients resolve it against the current server URL,
    // so avatars work no matter how the server is reached (tunnel, LAN, etc.).
    const avatarUrl = `/uploads/${filename}?v=${Date.now()}`;
    const updated = await prisma.user.update({
      where: { id: request.user!.sub },
      data: { avatarUrl },
      include: withRoles,
    });
    const pub = toPublicUser(updated);
    broadcastUserUpdate(pub);
    return pub;
  });

  // A single user's public profile.
  app.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id }, include: withRoles });
    if (!user) return reply.code(404).send({ error: 'user not found' });
    const pub = toPublicUser(user);
    const online = new Set(getOnlineUserIds());
    return { ...pub, status: online.has(user.id) ? pub.status : 'offline' };
  });

  // All users, with live presence overlaid on the stored status.
  app.get('/users', async () => {
    const online = new Set(getOnlineUserIds());
    const users = await prisma.user.findMany({
      where: { bannedAt: null }, // banned users are hidden from the member list
      orderBy: { username: 'asc' },
      include: withRoles,
    });
    return users.map((u) => {
      const pub = toPublicUser(u);
      return { ...pub, status: online.has(u.id) ? pub.status : 'offline' };
    });
  });
}
