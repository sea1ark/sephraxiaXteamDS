// Admin-granted prefix badge (e.g. "root" / "dev"), shown before a user's name.
import type { PublicUser } from '@sephraxia/shared';

export function Badge({ user, size = 'sm' }: { user: Pick<PublicUser, 'badge' | 'badgeColor'> | undefined; size?: 'sm' | 'xs' }) {
  if (!user?.badge) return null;
  const c = user.badgeColor ?? '#7d6fc4';
  return (
    <span
      className={`shrink-0 rounded ${size === 'xs' ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[9px]'} font-bold leading-none`}
      style={{ color: c, background: `${c}22`, border: `1px solid ${c}66`, textTransform: 'uppercase' }}
    >
      {user.badge}
    </span>
  );
}
