// Loads a user (with roles) and resolves their effective permissions.
// Permissions are SERVER-SCOPED: only roles belonging to `serverId` count, the
// server's owner is a full admin of their own server, and the platform owner
// (isOwner) is a full admin everywhere (shadow root access).
import type { EffectivePermissions } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { effectivePermissions } from './serialize';

const ALL_TRUE: EffectivePermissions = {
  isOwner: true,
  canManageChannels: true,
  canDeleteMessages: true,
  canManageRoles: true,
  canKick: true,
  canBan: true,
  canTimeout: true,
};
const ALL_FALSE: EffectivePermissions = {
  isOwner: false,
  canManageChannels: false,
  canDeleteMessages: false,
  canManageRoles: false,
  canKick: false,
  canBan: false,
  canTimeout: false,
};

export async function getPermissions(
  userId: string,
  serverId?: string | null,
): Promise<EffectivePermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true },
  });
  if (!user) return { ...ALL_FALSE };

  // Platform owner — root everywhere.
  if (user.isOwner) return { ...ALL_TRUE };

  // Resolve the server context. Default to the home (oldest) server.
  const server = serverId
    ? await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } })
    : await prisma.server.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, ownerId: true } });

  // Server owner — full admin of their own server (but not platform owner).
  if (server && server.ownerId === userId) return { ...ALL_TRUE, isOwner: false };

  // Otherwise: union of the user's roles that belong to THIS server.
  const sid = serverId ?? (await homeServerId());
  const scopedRoles = user.roles.filter((r) => r.serverId === sid);
  return effectivePermissions({ ...user, roles: scopedRoles });
}

let cachedHomeId: string | null = null;
async function homeServerId(): Promise<string | null> {
  if (cachedHomeId) return cachedHomeId;
  const home = await prisma.server.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  cachedHomeId = home?.id ?? null;
  return cachedHomeId;
}

export interface ModerationState {
  banned: boolean;
  mutedUntil: Date | null;
}

/** Current ban/timeout state for a user. */
export async function getModerationState(userId: string): Promise<ModerationState> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, mutedUntil: true },
  });
  return { banned: !!u?.bannedAt, mutedUntil: u?.mutedUntil ?? null };
}

/** True if the user may not send messages right now (banned or timed out). */
export function isSendBlocked(state: ModerationState): boolean {
  if (state.banned) return true;
  return !!state.mutedUntil && state.mutedUntil.getTime() > Date.now();
}
