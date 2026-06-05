import type { PublicUser } from '@sephraxia/shared';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { Avatar } from './Avatar';
import { nameColor, roleSymbol } from '../lib/roles';

const STATUS_CLASS: Record<string, string> = {
  online: 'status-online',
  idle: 'status-idle',
  dnd: 'status-dnd',
  offline: 'status-offline',
};

export function UserList() {
  const users = useChatStore((s) => s.users);
  const online = users.filter((u) => u.status !== 'offline');
  const offline = users.filter((u) => u.status === 'offline');

  return (
    <div className="glass flex w-56 flex-col rounded-glass">
      <div className="space-y-4 overflow-y-auto px-3 py-4">
        <Section label={`online — ${online.length}`} users={online} />
        {offline.length > 0 && <Section label={`offline — ${offline.length}`} users={offline} dim />}
      </div>
    </div>
  );
}

function Section({ label, users, dim }: { label: string; users: PublicUser[]; dim?: boolean }) {
  const openProfile = useUiStore((s) => s.openProfile);
  const openMemberMenu = useUiStore((s) => s.openMemberMenu);
  return (
    <div>
      <p className="section-label mb-2 px-2">{label}</p>
      <div className="space-y-1">
        {users.map((u) => (
          <div
            key={u.id}
            onClick={() => openProfile(u.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              openMemberMenu({ userId: u.id, x: e.clientX, y: e.clientY });
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-glass px-2 py-1.5 transition hover:bg-[rgba(125,111,196,0.1)] ${dim ? 'opacity-50' : ''}`}
          >
            <div className="relative">
              <Avatar username={u.username} avatarUrl={u.avatarUrl} size={30} color={nameColor(u)} />
              <span
                className={`status-dot ${STATUS_CLASS[u.status] ?? 'status-offline'} absolute -bottom-0.5 -right-0.5 ring-2 ring-base`}
              />
            </div>
            <span className="truncate text-sm" style={{ color: nameColor(u) }}>
              {roleSymbol(u) && <span className="mr-1">{roleSymbol(u)}</span>}
              {u.username}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
