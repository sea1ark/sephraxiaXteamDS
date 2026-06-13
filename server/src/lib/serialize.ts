// Shared serializers so every route exposes users/messages identically.
import type {
  Attachment,
  DirectMessage,
  EffectivePermissions,
  Message,
  PublicUser,
  ReactionGroup,
  ReplyPreview,
  Role,
} from '@sephraxia/shared';

/** Group raw reaction rows into per-emoji buckets, ordered by first reaction. */
function groupReactions(
  rows: { emoji: string; userId: string }[] | undefined,
): ReactionGroup[] | undefined {
  if (!rows || rows.length === 0) return undefined;
  const order: string[] = [];
  const byEmoji = new Map<string, string[]>();
  for (const r of rows) {
    if (!byEmoji.has(r.emoji)) {
      byEmoji.set(r.emoji, []);
      order.push(r.emoji);
    }
    byEmoji.get(r.emoji)!.push(r.userId);
  }
  return order.map((emoji) => {
    const userIds = byEmoji.get(emoji)!;
    return { emoji, count: userIds.length, userIds };
  });
}

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
  serverId?: string | null;
  canManageChannels: boolean;
  canDeleteMessages: boolean;
  canManageRoles: boolean;
  canKick: boolean;
  canBan: boolean;
  canTimeout: boolean;
}

interface DbUser {
  id: string;
  uid?: number | null;
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  status: string;
  isOwner: boolean;
  createdAt: Date;
  mutedUntil?: Date | null;
  bannedAt?: Date | null;
  roles?: DbRole[];
}

export function toRole(r: DbRole): Role {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    symbol: r.symbol,
    position: r.position,
    serverId: r.serverId ?? null,
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
    uid: u.uid ?? null,
    username: u.username,
    displayName: u.displayName ?? null,
    avatarUrl: u.avatarUrl,
    bannerUrl: u.bannerUrl ?? null,
    bio: u.bio ?? null,
    status: u.status as PublicUser['status'],
    isOwner: u.isOwner,
    createdAt: u.createdAt.toISOString(),
    mutedUntil: muted,
    banned: u.bannedAt != null ? true : undefined,
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
  pinned?: boolean;
  pinnedAt?: Date | null;
  replyToId?: string | null;
  replyTo?: DbReplyTarget | null;
  reactions?: { emoji: string; userId: string }[];
  author?: DbUser;
}): Message {
  return {
    id: m.id,
    content: m.content,
    authorId: m.authorId,
    channelId: m.channelId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    pinned: m.pinned || undefined,
    pinnedAt: m.pinnedAt ? m.pinnedAt.toISOString() : undefined,
    reactions: groupReactions(m.reactions),
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
  reactions?: { emoji: string; userId: string }[];
  from?: DbUser;
}): DirectMessage {
  return {
    id: m.id,
    content: m.content,
    fromId: m.fromId,
    toId: m.toId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    reactions: groupReactions(m.reactions),
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
