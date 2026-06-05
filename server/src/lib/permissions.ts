// Loads a user (with roles) and resolves their effective permissions.
import type { EffectivePermissions } from '@sephraxia/shared';
import { prisma } from '../prisma';
import { effectivePermissions } from './serialize';

export async function getPermissions(userId: string): Promise<EffectivePermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true },
  });
  if (!user) {
    return {
      isOwner: false,
      canManageChannels: false,
      canDeleteMessages: false,
      canManageRoles: false,
      canKick: false,
      canBan: false,
      canTimeout: false,
    };
  }
  return effectivePermissions(user);
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
