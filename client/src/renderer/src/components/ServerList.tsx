// Far-left rail: direct messages, friends, one icon per server (guild), and an
// add-server button. Right-click a server for invite / leave / delete.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ServerInfo } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { toast } from '../store/toasts';
import { ChatIcon, UsersIcon, PlusIcon } from './icons';
import { ServerModal, refreshServers } from './ServerModal';

interface ServerMenuState {
  server: ServerInfo;
  x: number;
  y: number;
}

/** Fallback rail glyph when a server has no emoji icon: initials of the name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

export function ServerList() {
  const view = useUiStore((s) => s.view);
  const showServer = useUiStore((s) => s.showServer);
  const showFriends = useUiStore((s) => s.showFriends);
  const openDm = useUiStore((s) => s.openDm);
  const activeDmUserId = useUiStore((s) => s.activeDmUserId);
  const servers = useChatStore((s) => s.servers);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const setActiveServer = useChatStore((s) => s.setActiveServer);
  const hasUnreadDms = useChatStore((s) => Object.values(s.dmUnread).some(Boolean));
  const incoming = useChatStore((s) => s.friends?.incoming.length ?? 0);
  const myId = useAuthStore((s) => s.user?.id);
  const isOwner = useAuthStore((s) => !!s.user?.isOwner);

  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<ServerMenuState | null>(null);

  const railBtn = 'relative grid h-12 w-12 place-items-center rounded-glass text-lg transition';

  function openServer(id: string) {
    setActiveServer(id);
    showServer();
  }

  return (
    <div className="relative flex w-[68px] flex-col items-center gap-3 py-3">
      <button
        onClick={() => openDm(activeDmUserId ?? '')}
        className={`${railBtn} ${
          view === 'dm' ? 'text-text-heading shadow-glow-violet' : 'text-text-muted hover:text-accent-violet'
        }`}
        style={{ background: 'rgba(125,111,196,0.12)' }}
        title="direct messages"
      >
        <ChatIcon size={22} />
        {hasUnreadDms && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent-pink ring-2 ring-base" />
        )}
      </button>

      <button
        onClick={showFriends}
        className={`${railBtn} ${
          view === 'friends'
            ? 'text-text-heading shadow-glow-violet'
            : 'text-text-muted hover:text-accent-violet'
        }`}
        style={{ background: 'rgba(125,111,196,0.12)' }}
        title="friends"
      >
        <UsersIcon size={22} />
        {incoming > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-pink px-[5px] text-[10px] font-semibold leading-none text-text-heading ring-2 ring-base">
            {incoming}
          </span>
        )}
      </button>

      <div className="h-px w-8 bg-glass-border" />

      <div className="flex w-full flex-1 flex-col items-center gap-3 overflow-y-auto pb-1">
        {servers.map((s) => {
          const active = view === 'server' && s.id === activeServerId;
          return (
            <button
              key={s.id}
              onClick={() => openServer(s.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ server: s, x: e.clientX, y: e.clientY });
              }}
              className={`${railBtn} shrink-0 ${
                active ? 'text-text-heading shadow-glow-violet' : 'opacity-70 hover:opacity-100'
              }`}
              style={
                active
                  ? { background: 'linear-gradient(135deg,#7d6fc4,#d4537e)' }
                  : { background: 'rgba(125,111,196,0.12)' }
              }
              title={s.name}
            >
              {s.icon ? (
                <span>{s.icon}</span>
              ) : (
                <span className="text-[13px] font-semibold">{initials(s.name)}</span>
              )}
            </button>
          );
        })}

        <button
          onClick={() => setAdding(true)}
          className={`${railBtn} shrink-0 text-text-muted hover:text-accent-violet`}
          style={{ background: 'rgba(125,111,196,0.1)' }}
          title="add a server"
        >
          <PlusIcon size={22} />
        </button>
      </div>

      {adding && <ServerModal onClose={() => setAdding(false)} />}
      {menu && (
        <ServerContextMenu
          menu={menu}
          myId={myId}
          isPlatformOwner={isOwner}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function ServerContextMenu({
  menu,
  myId,
  isPlatformOwner,
  onClose,
}: {
  menu: ServerMenuState;
  myId: string | undefined;
  isPlatformOwner: boolean;
  onClose: () => void;
}) {
  const { server, x, y } = menu;
  const ownsIt = server.ownerId === myId;
  const isHome = useChatStore.getState().servers[0]?.id === server.id;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(fn: () => Promise<unknown>, okMessage?: string) {
    try {
      await fn();
      await refreshServers();
      if (okMessage) toast(okMessage, 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'не получилось', 'error');
    }
    onClose();
  }

  const Item = ({
    label,
    danger,
    onClick,
  }: {
    label: string;
    danger?: boolean;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`block w-full rounded-[8px] px-3 py-1.5 text-left text-xs transition ${
        danger ? 'text-accent-pink hover:bg-[rgba(212,83,126,0.15)]' : 'text-text-primary hover:bg-[rgba(125,111,196,0.15)]'
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="sx-menu fixed z-[61] w-52 rounded-[12px] p-1.5"
        style={{
          left: Math.min(x, window.innerWidth - 220),
          top: Math.min(y, window.innerHeight - 180),
          background: 'linear-gradient(180deg, rgba(24,19,36,0.99), rgba(10,8,16,0.99))',
          border: '1px solid rgba(180,160,240,0.22)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}
      >
        <p className="truncate px-3 pb-1 pt-1.5 text-[10px] font-semibold tracking-widest text-text-muted">
          {server.name}
        </p>
        {server.inviteCode && (
          <Item
            label="copy invite"
            onClick={() => {
              navigator.clipboard?.writeText(server.inviteCode!).catch(() => {});
              toast('инвайт-код скопирован', 'success');
              onClose();
            }}
          />
        )}
        {!ownsIt && !isHome && (
          <Item
            label="покинуть сервер"
            danger
            onClick={() => {
              if (confirm(`покинуть «${server.name}»?`)) {
                void run(() => api.leaveServer(server.id), 'ты покинул сервер');
              } else onClose();
            }}
          />
        )}
        {(ownsIt || isPlatformOwner) && !isHome && (
          <Item
            label="удалить сервер"
            danger
            onClick={() => {
              if (confirm(`удалить «${server.name}» безвозвратно — со всеми каналами и сообщениями?`)) {
                void run(() => api.deleteServer(server.id), 'сервер удалён');
              } else onClose();
            }}
          />
        )}
      </div>
    </>,
    document.body,
  );
}
