// Auth routes: register, login, refresh.
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AuthResponse, PublicUser } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { toPublicUser } from '../lib/serialize';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './jwt';

const credentialsSchema = z.object({
  username: z
    .string()
    .min(3, 'username must be at least 3 characters')
    .max(32)
    .regex(/^[a-z0-9_.-]+$/i, 'username may only contain letters, numbers, _ . -'),
  password: z.string().min(6, 'password must be at least 6 characters').max(128),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { username, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return reply.code(409).send({ error: 'username already taken' });
    }

    // The very first registered user becomes the owner (bypasses permissions).
    const isFirstUser = (await prisma.user.count()) === 0;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, passwordHash, status: 'online', isOwner: isFirstUser },
    });

    return reply.code(201).send(buildAuthResponse(toPublicUser(user)));
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid credentials' });
    }
    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }
    if (user.bannedAt) {
      return reply.code(403).send({ error: 'this account has been banned' });
    }

    return reply.send(buildAuthResponse(toPublicUser(user)));
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string } | undefined;
    if (!body?.refreshToken) {
      return reply.code(400).send({ error: 'refreshToken required' });
    }
    try {
      const payload = verifyRefreshToken(body.refreshToken);
      const accessToken = signAccessToken({ sub: payload.sub, username: payload.username });
      const refreshToken = signRefreshToken({ sub: payload.sub, username: payload.username });
      return reply.send({ accessToken, refreshToken });
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }
  });
}

function buildAuthResponse(user: PublicUser): AuthResponse {
  const payload = { sub: user.id, username: user.username };
  return {
    user,
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}
