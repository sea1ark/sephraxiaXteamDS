// Member sidebar, Discord-style: online members grouped by their highest role
// (role sections in role colour), then roleless online, then offline.
import type { PublicUser, Role } from '@sephraxia/shared';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { Avatar } from './Avatar';
import { nameColor, roleSymbol, displayName, topRole } from '../lib/roles';

const STATUS_CLASS: Record<string, string> = {
  online: 'status-online',
  idle: 'status-idle',
  dnd: 'status-dnd',
  offline: 'status-offline',
};

export function UserList() {
  const users = useChatStore((s) => s.users);
  const roles = useChatStore((s) => s.roles);
  const servers = useChatStore((s) => s.servers);
  const activeServerId = useChatStore((s) => s.activeServerId);

  // Only members of the active server; before servers load, show everyone.
  const activeServer = servers.find((s) => s.id === activeServerId);
  const members = activeServer
    ? users.filter((u) => activeServer.memberIds.includes(u.id))
    : users;

  const online = members.filter((u) => u.status !== 'offline');
  const offline = members.filter((u) => u.status === 'offline');

  // Bucket online members under their top role; misc bucket for no role.
  const sections: { key: string; label: string; color?: string; members: PublicUser[] }[] = [];
  const sortedRoles = [...roles].sort((a, b) => b.position - a.position);
  const used = new Set<string>();

  for (const role of sortedRoles) {
    const members = online.filter((u) => !used.has(u.id) && topRole(u)?.id === role.id);
    members.forEach((m) => used.add(m.id));
    if (members.length > 0) {
      sections.push({
        key: role.id,
        label: `${role.symbol ? `${role.symbol} ` : ''}${role.name} — ${members.length}`,
        color: role.color,
        members: sortMembers(members),
      });
    }
  }
  const plain = online.filter((u) => !used.has(u.id));
  if (plain.length > 0) {
    sections.push({ key: 'online', label: `в сети — ${plain.length}`, members: sortMembers(plain) });
  }

  return (
    <div className="sx-fade glass flex w-56 flex-col rounded-glass">
      <div className="space-y-4 overflow-y-auto px-3 py-4">
        {sections.map((s) => (
          <Section key={s.key} label={s.label} color={s.color} users={s.members} />
        ))}
        {offline.length > 0 && (
          <Section label={`не в сети — ${offline.length}`} users={sortMembers(offline)} dim />
        )}
        {members.length === 0 && (
          <p className="px-2 text-xs text-text-muted">никого нет…</p>
        )}
      </div>
    </div>
  );
}

function sortMembers(list: PublicUser[]): PublicUser[] {
  return [...list].sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

function Section({
  label,
  color,
  users,
  dim,
}: {
  label: string;
  color?: string;
  users: PublicUser[];
  dim?: boolean;
}) {
  const openProfile = useUiStore((s) => s.openProfile);
  const openMemberMenu = useUiStore((s) => s.openMemberMenu);
  return (
    <div>
      <p className="section-label mb-2 px-2" style={color ? { color } : undefined}>
        {label}
      </p>
      <div className="space-y-0.5">
        {users.map((u) => (
          <div
            key={u.id}
            onClick={() => openProfile(u.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              openMemberMenu({ userId: u.id, x: e.clientX, y: e.clientY });
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-glass px-2 py-1.5 transition hover:bg-[rgba(125,111,196,0.1)] ${dim ? 'opacity-50 hover:opacity-80' : ''}`}
          >
            <div className="relative">
              <Avatar username={displayName(u)} avatarUrl={u.avatarUrl} size={30} color={nameColor(u)} />
              <span
                className={`status-dot ${STATUS_CLASS[u.status] ?? 'status-offline'} absolute -bottom-0.5 -right-0.5 ring-2 ring-base`}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm leading-4" style={{ color: nameColor(u) }}>
                {roleSymbol(u) && <span className="mr-1">{roleSymbol(u)}</span>}
                {displayName(u)}
              </p>
              {u.displayName && (
                <p className="truncate text-[10px] leading-3 text-text-muted">@{u.username}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
