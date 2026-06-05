// Far-left rail: home (channels), direct messages, friends, and a create-server
// button. Multi-server is the next milestone; the + explains that for now.
import { useState } from 'react';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';

export function ServerList() {
  const view = useUiStore((s) => s.view);
  const showServer = useUiStore((s) => s.showServer);
  const showFriends = useUiStore((s) => s.showFriends);
  const openDm = useUiStore((s) => s.openDm);
  const activeDmUserId = useUiStore((s) => s.activeDmUserId);
  const hasUnreadDms = useChatStore((s) => Object.values(s.dmUnread).some(Boolean));
  const incoming = useChatStore((s) => s.friends?.incoming.length ?? 0);

  const [serverInfo, setServerInfo] = useState(false);

  const railBtn = 'relative grid h-12 w-12 place-items-center rounded-glass text-lg transition';

  return (
    <div className="relative flex w-[68px] flex-col items-center gap-3 py-3">
      <button
        onClick={showServer}
        className={`${railBtn} text-text-heading ${
          view === 'server' ? 'shadow-glow-violet' : 'opacity-70 hover:opacity-100'
        }`}
        style={{ background: 'linear-gradient(135deg,#7d6fc4,#d4537e)' }}
        title="home"
      >
        ✦
      </button>

      <button
        onClick={() => openDm(activeDmUserId ?? '')}
        className={`${railBtn} ${
          view === 'dm' ? 'text-text-heading shadow-glow-violet' : 'text-text-muted hover:text-accent-violet'
        }`}
        style={{ background: 'rgba(125,111,196,0.12)' }}
        title="direct messages"
      >
        ✉
        {hasUnreadDms && (
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent-pink shadow-glow-violet" />
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
        ☺
        {incoming > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-pink px-1 text-[10px] text-text-heading">
            {incoming}
          </span>
        )}
      </button>

      <div className="h-px w-8 bg-glass-border" />

      <button
        onClick={() => setServerInfo((v) => !v)}
        className={`${railBtn} text-xl text-text-muted hover:text-accent-violet`}
        style={{ background: 'rgba(125,111,196,0.1)' }}
        title="add a server"
      >
        +
      </button>

      {serverInfo && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setServerInfo(false)} />
          <div
            className="glass absolute left-[72px] top-[150px] z-50 w-56 rounded-glass p-3 text-xs text-text-primary"
            style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
          >
            <p className="mb-1 font-semibold text-text-heading">multiple servers</p>
            <p className="text-text-muted">
              coming in the next update ✦ — right now everything lives in one home server with its
              own channels, roles, and members.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
