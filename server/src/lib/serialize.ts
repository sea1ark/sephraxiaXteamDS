// Shared serializers so every route exposes users/messages identically.
import type {
  Attachment,
  DirectMessage,
  EffectivePermissions,
  Message,
  PublicUser,
  ReplyPreview,
  Role,
} from '@sephraxia/shared';

/** Safely parse the JSON-encoded attachments column into a typed array. */
function parseAttachments(raw: string | null | undefined): Attachment[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Attachment[]) : undefined;
  } catch {
    return undefined;
  }
}

interface DbRole {
  id: string;
  name: string;
  color: string;
  symbol: string;
  position: number;
  canManageChannels: boolean;
  canDeleteMessages: boolean;
  canManageRoles: boolean;
  canKick: boolean;
  canBan: boolean;
  canTimeout: boolean;
}

interface DbUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: string;
  isOwner: boolean;
  createdAt: Date;
  mutedUntil?: Date | null;
  roles?: DbRole[];
}

export function toRole(r: DbRole): Role {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    symbol: r.symbol,
    position: r.position,
    canManageChannels: r.canManageChannels,
    canDeleteMessages: r.canDeleteMessages,
    canManageRoles: r.canManageRoles,
    canKick: r.canKick,
    canBan: r.canBan,
    canTimeout: r.canTimeout,
  };
}

export function toPublicUser(u: DbUser): PublicUser {
  // A timeout in the past is no longer in effect.
  const muted = u.mutedUntil && u.mutedUntil.getTime() > Date.now() ? u.mutedUntil.toISOString() : null;
  return {
    id: u.id,
    username: u.username,
    avatarUrl: u.avatarUrl,
    status: u.status as PublicUser['status'],
    isOwner: u.isOwner,
    createdAt: u.createdAt.toISOString(),
    mutedUntil: muted,
    roles: u.roles ? u.roles.map(toRole) : undefined,
  };
}

interface DbReplyTarget {
  id: string;
  content: string;
  authorId?: string;
  fromId?: string;
  author?: { username: string } | null;
  from?: { username: string } | null;
}

function toReplyPreview(r: DbReplyTarget | null | undefined): ReplyPreview | null {
  if (!r) return null;
  return {
    id: r.id,
    content: r.content,
    authorId: r.authorId ?? r.fromId ?? '',
    authorName: r.author?.username ?? r.from?.username ?? 'unknown',
  };
}

export function toMessage(m: {
  id: string;
  content: string;
  attachments?: string | null;
  authorId: string;
  channelId: string;
  createdAt: Date;
  editedAt: Date | null;
  replyToId?: string | null;
  replyTo?: DbReplyTarget | null;
  author?: DbUser;
}): Message {
  return {
    id: m.id,
    content: m.content,
    authorId: m.authorId,
    channelId: m.channelId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    attachments: parseAttachments(m.attachments),
    replyToId: m.replyToId ?? null,
    replyTo: toReplyPreview(m.replyTo),
    author: m.author ? toPublicUser(m.author) : undefined,
  };
}

export function toDm(m: {
  id: string;
  content: string;
  attachments?: string | null;
  fromId: string;
  toId: string;
  createdAt: Date;
  editedAt?: Date | null;
  replyToId?: string | null;
  replyTo?: DbReplyTarget | null;
  from?: DbUser;
}): DirectMessage {
  return {
    id: m.id,
    content: m.content,
    fromId: m.fromId,
    toId: m.toId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    attachments: parseAttachments(m.attachments),
    replyToId: m.replyToId ?? null,
    replyTo: toReplyPreview(m.replyTo),
    from: m.from ? toPublicUser(m.from) : undefined,
  };
}

/** Combine a user's roles into a single set of effective permissions. */
export function effectivePermissions(user: DbUser): EffectivePermissions {
  const base: EffectivePermissions = {
    isOwner: user.isOwner,
    canManageChannels: user.isOwner,
    canDeleteMessages: user.isOwner,
    canManageRoles: user.isOwner,
    canKick: user.isOwner,
    canBan: user.isOwner,
    canTimeout: user.isOwner,
  };
  for (const r of user.roles ?? []) {
    base.canManageChannels ||= r.canManageChannels;
    base.canDeleteMessages ||= r.canDeleteMessages;
    base.canManageRoles ||= r.canManageRoles;
    base.canKick ||= r.canKick;
    base.canBan ||= r.canBan;
    base.canTimeout ||= r.canTimeout;
  }
  return base;
}
