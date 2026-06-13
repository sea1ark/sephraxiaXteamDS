// Config / lua library: shareable cheat configs tagged by project (neverlose,
// skeet, …). Files are uploaded via /uploads first, then posted here with
// metadata. Anyone can post; authors & moderators can delete.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ConfigPost } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { authenticate } from '../auth/middleware';
import { getPermissions } from '../lib/permissions';
import { toPublicUser } from '../lib/serialize';
import { broadcastConfigsChanged } from '../socket';

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  project: z.string().trim().min(1).max(24), // neverlose | skeet | other…
  category: z.enum(['config', 'lua', 'other']).default('config'),
  description: z.string().trim().max(600).nullish(),
  tags: z.array(z.string().trim().max(24)).max(12).default([]),
  fileUrl: z.string().regex(/^\/uploads\//, 'file must be an uploaded path'),
  fileName: z.string().min(1).max(200),
  fileSize: z.number().int().min(0).max(50 * 1024 * 1024),
});

interface DbPost {
  id: string;
  title: string;
  project: string;
  category: string;
  description: string | null;
  tags: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  downloads: number;
  createdAt: Date;
  author: Parameters<typeof toPublicUser>[0];
}

function toConfigPost(p: DbPost): ConfigPost {
  return {
    id: p.id,
    title: p.title,
    project: p.project,
    category: p.category as ConfigPost['category'],
    description: p.description,
    tags: p.tags ? p.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    fileUrl: p.fileUrl,
    fileName: p.fileName,
    fileSize: p.fileSize,
    downloads: p.downloads,
    createdAt: p.createdAt.toISOString(),
    author: toPublicUser(p.author),
  };
}

const withAuthor = { author: { include: { roles: true } } } as const;

export async function configRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Browse: filter by project / category / free-text search; newest first.
  app.get('/configs', async (request) => {
    const q = request.query as { project?: string; category?: string; q?: string };
    const search = q.q?.trim();
    const posts = await prisma.configPost.findMany({
      where: {
        ...(q.project && q.project !== 'all' ? { project: q.project } : {}),
        ...(q.category && q.category !== 'all' ? { category: q.category } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { description: { contains: search } },
                { tags: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: withAuthor,
    });
    return posts.map(toConfigPost);
  });

  // Distinct project names (for tabs) with counts.
  app.get('/configs/projects', async () => {
    const groups = await prisma.configPost.groupBy({ by: ['project'], _count: { project: true } });
    return groups
      .map((g) => ({ project: g.project, count: g._count.project }))
      .sort((a, b) => b.count - a.count);
  });

  app.post('/configs', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const d = parsed.data;
    const post = await prisma.configPost.create({
      data: {
        title: d.title,
        project: d.project.toLowerCase(),
        category: d.category,
        description: d.description || null,
        tags: d.tags.join(','),
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        fileSize: d.fileSize,
        authorId: request.user!.sub,
      },
      include: withAuthor,
    });
    broadcastConfigsChanged();
    return reply.code(201).send(toConfigPost(post));
  });

  // Bump the download counter (best-effort; returns the fresh count).
  app.post('/configs/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const post = await prisma.configPost.update({
        where: { id },
        data: { downloads: { increment: 1 } },
        select: { downloads: true },
      });
      return { downloads: post.downloads };
    } catch {
      return reply.code(404).send({ error: 'not found' });
    }
  });

  // Delete: the author, or anyone who can delete messages (moderator).
  app.delete('/configs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await prisma.configPost.findUnique({ where: { id } });
    if (!post) return reply.code(404).send({ error: 'not found' });
    if (post.authorId !== request.user!.sub) {
      const perms = await getPermissions(request.user!.sub);
      if (!perms.canDeleteMessages) return reply.code(403).send({ error: 'нельзя удалить' });
    }
    await prisma.configPost.delete({ where: { id } });
    broadcastConfigsChanged();
    return reply.code(204).send();
  });
}
