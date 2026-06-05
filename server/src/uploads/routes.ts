// Generic file upload for message attachments. Files are stored in the same
// uploads directory served statically at /uploads/ and returned as RELATIVE
// URLs (clients resolve them against the current server address).
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Attachment } from '@sephraxia/shared';
import { authenticate } from '../auth/middleware';
import { UPLOAD_DIR } from '../users/routes';

// Allow common, safe extensions only. Everything else is rejected.
const ALLOWED_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif', // images
  '.pdf', '.txt', '.md', '.csv', '.json', '.log', // docs
  '.zip', '.rar', '.7z', '.tar', '.gz', // archives
  '.mp3', '.wav', '.ogg', '.mp4', '.webm', '.mov', // media
]);

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post('/uploads', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'no file uploaded' });

    // Drain the stream first (multipart needs the part consumed even on reject).
    const buffer = await file.toBuffer();

    const ext = extname(file.filename || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return reply.code(400).send({ error: `file type ${ext || '(none)'} is not allowed` });
    }

    const filename = `${randomUUID()}${ext}`;
    await writeFile(join(UPLOAD_DIR, filename), buffer);

    const attachment: Attachment = {
      url: `/uploads/${filename}`,
      name: (file.filename || filename).slice(0, 200),
      type: file.mimetype || 'application/octet-stream',
      size: buffer.length,
    };
    return reply.code(201).send(attachment);
  });
}
