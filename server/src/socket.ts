// Socket.io realtime layer: authenticated connections, presence, messaging,
// direct messages, typing indicators, and moderation enforcement.
import type { Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import type {
  Attachment,
  ClientToServerEvents,
  ServerToClientEvents,
  JwtPayload,
  PublicUser,
  VoiceParticipant,
} from '@sephraxia/shared';
import { env } from './env';
import { prisma } from './prisma';
import { verifyAccessToken } from './auth/jwt';
import { toMessage, toDm, toPublicUser } from './lib/serialize';
import { getPermissions, getModerationState, isSendBlocked } from './lib/permissions';

// Direct messages are delivered to a per-user room so both participants (and
// all their open windows) receive them.
const userRoom = (userId: string) => `user:${userId}`;

const authorInclude = {
  author: { include: { roles: true } },
  replyTo: { select: { id: true, content: true, authorId: true, author: { select: { username: true } } } },
} as const;

const dmInclude = {
  from: { include: { roles: true } },
  replyTo: { select: { id: true, content: true, fromId: true, from: { select: { username: true } } } },
} as const;

// Accept only attachments uploaded to our own server, with sane shapes/limits.
// Prevents clients from embedding arbitrary remote URLs into messages.
function sanitizeAttachments(attachments: Attachment[] | undefined): Attachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter(
      (a) =>
        a &&
        typeof a.url === 'string' &&
        // Only our own uploads, stored as relative "/uploads/<file>" paths.
        a.url.startsWith('/uploads/') &&
        !a.url.includes('..') &&
        typeof a.name === 'string' &&
        typeof a.type === 'string' &&
        typeof a.size === 'number',
    )
    .slice(0, 10)
    .map((a) => ({
      url: a.url,
      name: a.name.slice(0, 200),
      type: a.type.slice(0, 100),
      size: a.size,
    }));
}

// Per-socket data we attach after authentication.
interface SocketData {
  user: JwtPayload;
}

type SephraxiaServer = IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// Tracks how many live sockets each user has open (a user may have several
// windows). Presence flips only on the first connect / last disconnect.
const onlineCounts = new Map<string, number>();

// Voice membership: channelId -> (userId -> muted). A user holds at most one
// active voice session, owned by a specific socket so multi-window is safe.
const voiceMembers = new Map<string, Map<string, boolean>>();
const voiceSocketByUser = new Map<string, string>();

function voiceSnapshot(): Record<string, VoiceParticipant[]> {
  const out: Record<string, VoiceParticipant[]> = {};
  for (const [channelId, m] of voiceMembers) {
    out[channelId] = [...m.entries()].map(([userId, muted]) => ({ userId, muted }));
  }
  return out;
}

// Remove a user from every voice channel; returns the channels they left.
function removeFromAllVoice(userId: string): string[] {
  const left: string[] = [];
  for (const [channelId, m] of voiceMembers) {
    if (m.delete(userId)) {
      left.push(channelId);
      if (m.size === 0) voiceMembers.delete(channelId);
    }
  }
  return left;
}

// Module-level reference so REST routes can broadcast (e.g. profile edits).
let ioRef: SephraxiaServer | null = null;

export function setupSocket(httpServer: HttpServer): SephraxiaServer {
  const io: SephraxiaServer = new IOServer(httpServer, {
    cors: { origin: env.clientOrigins, credentials: true },
  });

  // Authenticate every connection from the handshake auth payload and reject
  // banned users outright.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      const u = await prisma.user.findUnique({ where: { id: payload.sub }, select: { bannedAt: true } });
      if (u?.bannedAt) return next(new Error('banned'));
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  ioRef = io;

  io.on('connection', async (socket) => {
    const { sub: userId } = socket.data.user;

    // Join this user's personal room for direct messages.
    socket.join(userRoom(userId));

    // Register event handlers BEFORE any await, otherwise events emitted in the
    // brief window right after connecting (before async presence work resolves)
    // would be silently dropped.

    // Wrap async handlers so a thrown error (bad payload, db hiccup) is logged
    // and contained instead of crashing the whole server process.
    const guard =
      <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
      (...args: A): void => {
        fn(...args).catch((err) => console.error('socket handler error:', err));
      };

    socket.on(
      'message:send',
      guard(async ({ channelId, content, attachments, replyToId }) => {
        const trimmed = content?.trim() ?? '';
        if (!channelId) return;
        if (isSendBlocked(await getModerationState(userId))) return; // banned / timed out
        const safe = sanitizeAttachments(attachments);
        if (!trimmed && safe.length === 0) return; // need text or a file

        // Validate the reply target exists in this channel.
        let validReplyId: string | null = null;
        if (replyToId) {
          const target = await prisma.message.findFirst({
            where: { id: replyToId, channelId },
            select: { id: true },
          });
          if (target) validReplyId = replyToId;
        }

        const message = await prisma.message.create({
          data: {
            content: trimmed.slice(0, 4000),
            attachments: safe.length ? JSON.stringify(safe) : null,
            authorId: userId,
            channelId,
            replyToId: validReplyId,
          },
          include: authorInclude,
        });
        io.emit('message:new', toMessage(message));
      }),
    );

    // Edit your own message.
    socket.on(
      'message:edit',
      guard(async ({ messageId, content }) => {
        const trimmed = content?.trim();
        if (!trimmed || !messageId) return;
        const existing = await prisma.message.findUnique({ where: { id: messageId } });
        if (!existing || existing.authorId !== userId) return; // only the author may edit
        const message = await prisma.message.update({
          where: { id: messageId },
          data: { content: trimmed.slice(0, 4000), editedAt: new Date() },
          include: authorInclude,
        });
        io.emit('message:update', toMessage(message));
      }),
    );

    // Delete a message: author always; others need canDeleteMessages.
    socket.on(
      'message:delete',
      guard(async ({ messageId }) => {
        if (!messageId) return;
        const existing = await prisma.message.findUnique({ where: { id: messageId } });
        if (!existing) return;
        if (existing.authorId !== userId) {
          const perms = await getPermissions(userId);
          if (!perms.canDeleteMessages) return;
        }
        await prisma.message.delete({ where: { id: messageId } });
        io.emit('message:delete', { messageId, channelId: existing.channelId });
      }),
    );

    // Direct message: persist and deliver to both participants' rooms.
    socket.on(
      'dm:send',
      guard(async ({ toId, content, attachments, replyToId }) => {
        const trimmed = content?.trim() ?? '';
        if (!toId || toId === userId) return;
        if (isSendBlocked(await getModerationState(userId))) return;
        const safe = sanitizeAttachments(attachments);
        if (!trimmed && safe.length === 0) return;
        const recipient = await prisma.user.findUnique({ where: { id: toId } });
        if (!recipient) return;

        // Validate the reply target belongs to this conversation.
        let validReplyId: string | null = null;
        if (replyToId) {
          const target = await prisma.directMessage.findFirst({
            where: {
              id: replyToId,
              OR: [
                { fromId: userId, toId },
                { fromId: toId, toId: userId },
              ],
            },
            select: { id: true },
          });
          if (target) validReplyId = replyToId;
        }

        const dm = await prisma.directMessage.create({
          data: {
            content: trimmed.slice(0, 4000),
            attachments: safe.length ? JSON.stringify(safe) : null,
            fromId: userId,
            toId,
            replyToId: validReplyId,
          },
          include: dmInclude,
        });
        io.to(userRoom(toId)).to(userRoom(userId)).emit('dm:new', toDm(dm));
      }),
    );

    // Edit your own direct message.
    socket.on(
      'dm:edit',
      guard(async ({ dmId, content }) => {
        const trimmed = content?.trim();
        if (!trimmed || !dmId) return;
        const existing = await prisma.directMessage.findUnique({ where: { id: dmId } });
        if (!existing || existing.fromId !== userId) return; // sender only
        const dm = await prisma.directMessage.update({
          where: { id: dmId },
          data: { content: trimmed.slice(0, 4000), editedAt: new Date() },
          include: dmInclude,
        });
        io.to(userRoom(dm.toId)).to(userRoom(dm.fromId)).emit('dm:update', toDm(dm));
      }),
    );

    // Delete your own direct message.
    socket.on(
      'dm:delete',
      guard(async ({ dmId }) => {
        if (!dmId) return;
        const existing = await prisma.directMessage.findUnique({ where: { id: dmId } });
        if (!existing || existing.fromId !== userId) return; // sender only
        await prisma.directMessage.delete({ where: { id: dmId } });
        io.to(userRoom(existing.toId)).to(userRoom(existing.fromId)).emit('dm:delete', {
          id: existing.id,
          fromId: existing.fromId,
          toId: existing.toId,
        });
      }),
    );

    socket.on('typing:start', ({ channelId }) => {
      socket.broadcast.emit('typing:start', { channelId, userId });
    });
    socket.on('typing:stop', ({ channelId }) => {
      socket.broadcast.emit('typing:stop', { channelId, userId });
    });

    // --- Voice (WebRTC mesh signaling) ---
    socket.on('voice:join', ({ channelId }) => {
      if (!channelId) return;
      // A user holds one active voice session — leave any previous channel.
      for (const prevCid of removeFromAllVoice(userId)) {
        if (prevCid !== channelId) io.emit('voice:left', { channelId: prevCid, userId });
      }
      const members = voiceMembers.get(channelId) ?? new Map<string, boolean>();
      voiceMembers.set(channelId, members);
      // Existing participants (excluding self) are who the joiner should dial.
      const existing = [...members.entries()]
        .filter(([uid]) => uid !== userId)
        .map(([uid, muted]) => ({ userId: uid, muted }));
      members.set(userId, false);
      voiceSocketByUser.set(userId, socket.id);
      socket.emit('voice:peers', { channelId, participants: existing });
      io.emit('voice:joined', { channelId, userId });
    });

    socket.on('voice:leave', ({ channelId }) => {
      const members = voiceMembers.get(channelId);
      if (members?.delete(userId)) {
        if (members.size === 0) voiceMembers.delete(channelId);
        if (voiceSocketByUser.get(userId) === socket.id) voiceSocketByUser.delete(userId);
        io.emit('voice:left', { channelId, userId });
      }
    });

    socket.on('voice:signal', ({ channelId, toUserId, data }) => {
      if (!toUserId || !data) return;
      io.to(userRoom(toUserId)).emit('voice:signal', { channelId, fromUserId: userId, data });
    });

    socket.on('voice:state', ({ channelId, muted }) => {
      const members = voiceMembers.get(channelId);
      if (members?.has(userId)) {
        members.set(userId, !!muted);
        io.emit('voice:state', { channelId, userId, muted: !!muted });
      }
    });

    // Send the joiner the current voice membership of every channel.
    socket.emit('voice:snapshot', { channels: voiceSnapshot() });

    // Presence: mark online on first socket. We preserve a custom status
    // (idle/dnd) the user chose earlier — only a previously-offline user is
    // promoted to plain "online". Offline is derived from presence (the live
    // socket count), so we never persist "offline" to the DB on disconnect.
    const prev = onlineCounts.get(userId) ?? 0;
    onlineCounts.set(userId, prev + 1);
    if (prev === 0) {
      const dbUser = await prisma.user.findUnique({ where: { id: userId } });
      let status = (dbUser?.status ?? 'online') as PublicUser['status'];
      if (status === 'offline') {
        status = 'online';
        await prisma.user.update({ where: { id: userId }, data: { status } }).catch(() => {});
      }
      socket.broadcast.emit('user:online', { userId, status });
    }

    socket.on('disconnect', async () => {
      // If this socket owned the user's voice session, drop them from voice.
      if (voiceSocketByUser.get(userId) === socket.id) {
        voiceSocketByUser.delete(userId);
        for (const cid of removeFromAllVoice(userId)) io.emit('voice:left', { channelId: cid, userId });
      }

      const count = (onlineCounts.get(userId) ?? 1) - 1;
      if (count <= 0) {
        // Last socket closed. Keep the stored status (online/idle/dnd) intact;
        // presence overlay in the REST routes will report them as offline.
        onlineCounts.delete(userId);
        socket.broadcast.emit('user:offline', { userId });
      } else {
        onlineCounts.set(userId, count);
      }
    });
  });

  return io;
}

/** Snapshot of currently-online user ids (used by the REST presence endpoint). */
export function getOnlineUserIds(): string[] {
  return [...onlineCounts.keys()];
}

/** Broadcast a profile/status change to every connected client. */
export function broadcastUserUpdate(user: PublicUser): void {
  ioRef?.emit('user:update', user);
}

/** Tell every client to refetch the role list / member roles. */
export function broadcastRolesChanged(): void {
  ioRef?.emit('roles:changed');
}

/** Tell every client to refetch the channel list. */
export function broadcastChannelsChanged(): void {
  ioRef?.emit('channels:changed');
}

/** Tell the given users to refetch their friends data. */
export function broadcastFriendsChanged(userIds: string[]): void {
  for (const id of userIds) ioRef?.to(userRoom(id)).emit('friends:changed');
}

/** Notify a user they were kicked/banned and force-disconnect their sockets. */
export function enforceModeration(userId: string, action: 'kick' | 'ban', reason?: string): void {
  if (!ioRef) return;
  ioRef.to(userRoom(userId)).emit('moderation:enforced', { action, reason });
  // Give the event a moment to flush, then drop every socket for this user.
  setTimeout(() => {
    for (const s of ioRef!.sockets.sockets.values()) {
      if (s.data.user?.sub === userId) s.disconnect(true);
    }
  }, 250);
}
