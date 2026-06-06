// Bottom strip of the second column: your avatar/status + settings + logout.
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { Avatar } from './Avatar';
import { SettingsIcon, LogoutIcon } from './icons';

const STATUS_CLASS: Record<string, string> = {
  online: 'status-online',
  idle: 'status-idle',
  dnd: 'status-dnd',
  offline: 'status-offline',
};

export function UserFooter() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const openProfile = useUiStore((s) => s.openProfile);
  const openSettings = useUiStore((s) => s.openSettings);

  return (
    <div className="flex items-center justify-between gap-2 border-t border-glass-border px-3 py-2">
      <button
        onClick={() => user && openProfile(user.id)}
        className="flex min-w-0 items-center gap-2"
        title="view your profile"
      >
        <div className="relative">
          <Avatar username={user?.username ?? '?'} avatarUrl={user?.avatarUrl} size={30} />
          <span
            className={`status-dot ${STATUS_CLASS[user?.status ?? 'online']} absolute -bottom-0.5 -right-0.5 ring-2 ring-base`}
          />
        </div>
        <span className="truncate text-sm text-text-primary">{user?.username}</span>
      </button>
      <div className="flex items-center gap-1">
        <button
          onClick={openSettings}
          className="grid h-7 w-7 place-items-center rounded-md text-text-muted transition hover:bg-white/5 hover:text-accent-violet"
          title="settings"
        >
          <SettingsIcon size={17} />
        </button>
        <button
          onClick={logout}
          className="grid h-7 w-7 place-items-center rounded-md text-text-muted transition hover:bg-accent-pink/20 hover:text-accent-pink"
          title="log out"
        >
          <LogoutIcon size={17} />
        </button>
      </div>
    </div>
  );
}
