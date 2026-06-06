// Derive a user's display color/symbol from their highest-positioned role.
import type { PublicUser, Role } from '@sephraxia/shared';

const DEFAULT_COLOR = '#b8b0cc';

export function topRole(user: Pick<PublicUser, 'roles'> | undefined): Role | null {
  const roles = user?.roles;
  if (!roles || roles.length === 0) return null;
  return [...roles].sort((a, b) => b.position - a.position)[0];
}

export function nameColor(user: Pick<PublicUser, 'roles'> | undefined): string {
  return topRole(user)?.color ?? DEFAULT_COLOR;
}

/** e.g. "✦" — the symbol of the highest role, or empty string. */
export function roleSymbol(user: Pick<PublicUser, 'roles'> | undefined): string {
  return topRole(user)?.symbol ?? '';
}

/** The name to show: chosen display name, falling back to the @username. */
export function displayName(
  user: Pick<PublicUser, 'displayName' | 'username'> | undefined,
): string {
  return user?.displayName?.trim() || user?.username || 'unknown';
}
