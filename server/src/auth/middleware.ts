// Fastify preHandler that validates the Bearer access token and attaches the
// decoded payload to `request.user`.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { JwtPayload } from '@sephraxia/shared';
import { verifyAccessToken } from './jwt';

// Augment Fastify's request type with our authenticated user.
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice('Bearer '.length);
  try {
    request.user = verifyAccessToken(token);
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired access token' });
  }
}
