// Friends hub: friends list, pending requests (incoming/outgoing), and a search
// box to find and add people — the main column when the friends view is active.
import { useState } from 'react';
import type { PublicUser } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { Avatar } from './Avatar';
import { nameColor } from '../lib/roles';

const STATUS_CLASS: Record<string, string> = {
  online: 'status-online',
  idle: 'status-idle',
  dnd: 'status-dnd',
  offline: 'status-offline',
};

type Tab = 'all' | 'pending' | 'add';

export function FriendsView() {
  const friends = useChatStore((s) => s.friends);
  const setFriends = useChatStore((s) => s.setFriends);
  const openDm = useUiStore((s) => s.openDm);
  const openProfile = useUiStore((s) => s.openProfile);
  const openMemberMenu = useUiStore((s) => s.openMemberMenu);

  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const incomingCount = friends?.incoming.length ?? 0;

  async function refresh() {
    try {
      setFriends(await api.getFriends());
    } catch {
      /* ignore */
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNotice(null);
    try {
      setResults(await api.searchUsers(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setNotice(null);
    try {
      await fn();
      await refresh();
      if (ok) setNotice(ok);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'something went wrong');
    }
  }

  function relationship(userId: string): 'friend' | 'incoming' | 'outgoing' | 'none' {
    if (!friends) return 'none';
    if (friends.friends.some((f) => f.id === userId)) return 'friend';
    if (friends.incoming.some((r) => r.user.id === userId)) return 'incoming';
    if (friends.outgoing.some((r) => r.user.id === userId)) return 'outgoing';
    return 'none';
  }

  const TabButton = ({ id, label, badge }: { id: Tab; label: string; badge?: number }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 rounded-glass px-3 py-1.5 text-sm transition ${
        tab === id ? 'text-text-heading' : 'text-text-muted hover:text-text-primary'
      }`}
      style={tab === id ? { background: 'rgba(125,111,196,0.22)' } : undefined}
    >
      {label}
      {badge ? (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent-pink px-1 text-[10px] text-text-heading">
          {badge}
        </span>
      ) : null}
    </button>
  );

  function Row({ user, children }: { user: PublicUser; children?: React.ReactNode }) {
    return (
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          openMemberMenu({ userId: user.id, x: e.clientX, y: e.clientY });
        }}
        className="flex items-center gap-3 rounded-glass px-3 py-2 transition hover:bg-[rgba(125,111,196,0.08)]"
      >
        <button onClick={() => openProfile(user.id)} className="relative">
          <Avatar username={user.username} avatarUrl={user.avatarUrl} size={36} color={nameColor(user)} />
          <span
            className={`status-dot ${STATUS_CLASS[user.status] ?? 'status-offline'} absolute -bottom-0.5 -right-0.5 ring-2 ring-base`}
          />
        </button>
        <button onClick={() => openProfile(user.id)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium" style={{ color: nameColor(user) }}>
            {user.username}
          </div>
          <div className="text-[11px] text-text-muted">{user.status}</div>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">{children}</div>
      </div>
    );
  }

  const pill =
    'rounded-glass px-3 py-1 text-xs transition';

  return (
    <div className="glass flex min-w-0 flex-1 flex-col rounded-glass">
      <div className="flex items-center gap-2 border-b border-glass-border px-5 py-3">
        <span className="text-lg">✦</span>
        <span className="heading-glow text-sm font-semibold tracking-[0.12em]">friends</span>
        <div className="ml-3 flex gap-1">
          <TabButton id="all" label="all" />
          <TabButton id="pending" label="pending" badge={incomingCount} />
          <TabButton id="add" label="add friend" />
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {tab === 'all' &&
          (friends?.friends.length ? (
            friends.friends.map((u) => (
              <Row key={u.id} user={u}>
                <button
                  onClick={() => openDm(u.id)}
                  className={pill}
                  style={{ background: 'rgba(125,111,196,0.15)', color: '#e2d8fa' }}
                >
                  message
                </button>
                <button
                  onClick={() => act(() => api.removeFriend(u.id))}
                  className={`${pill} text-text-muted hover:text-accent-pink`}
                  style={{ background: 'rgba(125,111,196,0.08)' }}
                >
                  remove
                </button>
              </Row>
            ))
          ) : (
            <Empty text="no friends yet — add some from the “add friend” tab." />
          ))}

        {tab === 'pending' && (
          <>
            <p className="section-label px-3 pb-1 pt-1">incoming — {incomingCount}</p>
            {friends?.incoming.length ? (
              friends.incoming.map((r) => (
                <Row key={r.id} user={r.user}>
                  <button
                    onClick={() => act(() => api.acceptFriend(r.id))}
                    className={pill}
                    style={{ background: 'rgba(108,212,126,0.18)', color: '#bff0c9' }}
                  >
                    accept
                  </button>
                  <button
                    onClick={() => act(() => api.declineFriend(r.id))}
                    className={`${pill} text-text-muted hover:text-accent-pink`}
                    style={{ background: 'rgba(125,111,196,0.08)' }}
                  >
                    decline
                  </button>
                </Row>
              ))
            ) : (
              <Empty text="no incoming requests." />
            )}
            <p className="section-label px-3 pb-1 pt-3">outgoing — {friends?.outgoing.length ?? 0}</p>
            {friends?.outgoing.length ? (
              friends.outgoing.map((r) => (
                <Row key={r.id} user={r.user}>
                  <button
                    onClick={() => act(() => api.declineFriend(r.id))}
                    className={`${pill} text-text-muted hover:text-accent-pink`}
                    style={{ background: 'rgba(125,111,196,0.08)' }}
                  >
                    cancel
                  </button>
                </Row>
              ))
            ) : (
              <Empty text="no outgoing requests." />
            )}
          </>
        )}

        {tab === 'add' && (
          <div>
            <form onSubmit={search} className="mb-3 flex gap-2 px-1">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search by username"
                className="glass-input"
              />
              <button type="submit" className="btn-accent shrink-0" disabled={searching}>
                {searching ? '…' : 'search'}
              </button>
            </form>
            {notice && <p className="px-3 pb-2 text-xs text-accent-violet">{notice}</p>}
            {results.map((u) => {
              const rel = relationship(u.id);
              return (
                <Row key={u.id} user={u}>
                  {rel === 'friend' && <span className="text-xs text-text-muted">friends</span>}
                  {rel === 'outgoing' && <span className="text-xs text-text-muted">requested</span>}
                  {rel === 'incoming' && (
                    <button
                      onClick={() => act(() => api.sendFriendRequest({ userId: u.id }), 'friend added')}
                      className={pill}
                      style={{ background: 'rgba(108,212,126,0.18)', color: '#bff0c9' }}
                    >
                      accept
                    </button>
                  )}
                  {rel === 'none' && (
                    <button
                      onClick={() => act(() => api.sendFriendRequest({ userId: u.id }), 'request sent')}
                      className={pill}
                      style={{ background: 'rgba(125,111,196,0.15)', color: '#e2d8fa' }}
                    >
                      add friend
                    </button>
                  )}
                </Row>
              );
            })}
            {!searching && query && results.length === 0 && (
              <Empty text="no users found." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-6 text-center text-xs text-text-muted">{text}</p>;
}
