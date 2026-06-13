// VeilSight — the platform owner's root/spy/troll console. Crimson, terminal-y
// look to set it apart from the rest of the app. Everything here is gated
// server-side behind isOwner; the rail entry only shows for the owner too.
import { useEffect, useMemo, useState } from 'react';
import type { VeilOverview, VeilServer, PublicUser } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { displayName, nameColor } from '../lib/roles';
import { copyText } from '../lib/clipboard';
import { toast } from '../store/toasts';
import { Avatar } from './Avatar';
import { SearchIcon } from './icons';

const RED = '#ff4d6d';

type Tab = 'overview' | 'users' | 'servers' | 'broadcast';

export function VeilSightPanel() {
  const me = useAuthStore((s) => s.user);
  const openProfile = useUiStore((s) => s.openProfile);
  const openDm = useUiStore((s) => s.openDm);

  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<VeilOverview | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      setData(await api.veilOverview());
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'нет доступа', 'error');
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000); // live-ish
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(key: string, fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(key);
    try {
      await fn();
      if (okMsg) toast(okMsg, 'success');
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'сбой', 'error');
    } finally {
      setBusy(null);
    }
  }

  const users = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.users
      .filter((u) => !q || u.username.toLowerCase().includes(q) || (u.displayName ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.uid ?? 9999) - (b.uid ?? 9999));
  }, [data, query]);

  return (
    <div
      className="sx-fade relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-glass"
      style={{
        background: 'linear-gradient(160deg, #160a0f 0%, #0a0608 60%, #080406 100%)',
        border: '1px solid rgba(255,77,109,0.25)',
        boxShadow: 'inset 0 0 60px rgba(255,77,109,0.05)',
      }}
    >
      {/* scanline flourish */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ background: 'repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 3px)' }}
      />

      {/* header */}
      <div className="relative flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'rgba(255,77,109,0.2)' }}>
        <span className="text-lg" style={{ color: RED, textShadow: `0 0 14px ${RED}` }}>◈</span>
        <div>
          <p className="text-sm font-bold tracking-[0.3em]" style={{ color: '#ffd0d8', textTransform: 'uppercase' }}>
            veilsight
          </p>
          <p className="text-[10px] tracking-widest text-text-muted">root console · classified</p>
        </div>
        <span className="ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ background: 'rgba(255,77,109,0.12)', color: RED, border: `1px solid ${RED}55` }}>
          ● root access
        </span>
      </div>

      {/* tabs */}
      <div className="relative flex gap-1 border-b px-5 py-2" style={{ borderColor: 'rgba(255,77,109,0.15)' }}>
        {(['overview', 'users', 'servers', 'broadcast'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition"
            style={tab === t ? { background: 'rgba(255,77,109,0.16)', color: '#ffd0d8' } : { color: '#7a6a6e' }}
          >
            {t === 'overview' ? 'обзор' : t === 'users' ? 'юзеры' : t === 'servers' ? 'серверы' : 'броадкаст'}
          </button>
        ))}
      </div>

      <div className="relative flex-1 overflow-y-auto p-5">
        {!data && <p className="text-sm text-text-muted">подключение к ядру…</p>}

        {data && tab === 'overview' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { k: 'юзеров', v: data.stats.users },
              { k: 'в сети', v: data.stats.online, hot: true },
              { k: 'серверов', v: data.stats.servers },
              { k: 'сообщений', v: data.stats.messages },
              { k: 'личек', v: data.stats.dms },
              { k: 'конфигов', v: data.stats.configs },
            ].map((s) => (
              <div key={s.k} className="rounded-[14px] px-4 py-4" style={{ background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.18)' }}>
                <p className="text-[10px] uppercase tracking-widest text-text-muted">{s.k}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: s.hot ? '#5bd98a' : '#ffd0d8' }}>
                  {s.v}
                </p>
              </div>
            ))}
          </div>
        )}

        {data && tab === 'users' && (
          <>
            <div className="relative mb-3 max-w-sm">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"><SearchIcon size={14} /></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="поиск по юзерам…" className="glass-input !py-1.5 w-full pl-9 text-sm" style={{ background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.2)' }} />
            </div>
            <div className="space-y-1.5">
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  isMe={u.id === me?.id}
                  busy={busy}
                  onProfile={() => openProfile(u.id)}
                  onDm={() => openDm(u.id)}
                  onCopy={() => copyText(`@${u.username}`, 'скопировано')}
                  onOwner={(v) => act(`owner:${u.id}`, () => api.veilSetOwner(u.id, v), v ? 'выдан root' : 'root снят')}
                  onBan={() => act(`ban:${u.id}`, () => (u.banned ? api.unbanUser(u.id) : api.banUser(u.id)), u.banned ? 'разбанен' : 'забанен')}
                  onKick={() => act(`kick:${u.id}`, () => api.kickUser(u.id), 'кикнут')}
                  onYank={() => act(`yank:${u.id}`, () => api.veilYank(u.id), 'отключён')}
                  onPing={() => act(`ping:${u.id}`, () => api.veilBroadcast('тебя видят. ◈', u.id), 'отправлено')}
                />
              ))}
            </div>
          </>
        )}

        {data && tab === 'servers' && (
          <div className="space-y-2">
            {data.servers.map((s) => (
              <ServerRow key={s.id} s={s} ownerName={data.users.find((u) => u.id === s.ownerId)} busy={busy} onCopy={() => copyText(s.inviteCode, 'инвайт скопирован')} onShadow={() => act(`shadow:${s.id}`, () => api.veilShadowJoin(s.id), 'теневой вход выполнен')} />
            ))}
          </div>
        )}

        {data && tab === 'broadcast' && <Broadcast />}
      </div>
    </div>
  );
}

function PowerBtn({ label, onClick, busy, danger, good }: { label: string; onClick: () => void; busy?: boolean; danger?: boolean; good?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40"
      style={{
        color: danger ? RED : good ? '#5bd98a' : '#cdbfc4',
        background: danger ? 'rgba(255,77,109,0.1)' : good ? 'rgba(91,217,138,0.1)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${danger ? 'rgba(255,77,109,0.4)' : good ? 'rgba(91,217,138,0.4)' : 'rgba(255,255,255,0.1)'}`,
        textTransform: 'none',
      }}
    >
      {busy ? '…' : label}
    </button>
  );
}

function UserRow({
  u, isMe, busy, onProfile, onDm, onCopy, onOwner, onBan, onKick, onYank, onPing,
}: {
  u: PublicUser; isMe: boolean; busy: string | null;
  onProfile: () => void; onDm: () => void; onCopy: () => void;
  onOwner: (v: boolean) => void; onBan: () => void; onKick: () => void; onYank: () => void; onPing: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,77,109,0.1)' }}>
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-text-muted">#{u.uid ?? '—'}</span>
      <button onClick={onProfile} className="shrink-0"><Avatar username={displayName(u)} avatarUrl={u.avatarUrl} size={28} color={nameColor(u)} /></button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm" style={{ color: nameColor(u) }}>
          {displayName(u)}
          {u.isOwner && <span className="text-[9px] font-bold" style={{ color: RED }}>♛ ROOT</span>}
          {u.banned && <span className="text-[9px] font-bold text-accent-pink">BANNED</span>}
          <span className={`status-dot ${u.status === 'offline' ? 'status-offline' : 'status-online'} !h-1.5 !w-1.5`} />
        </p>
        <p className="truncate text-[10px] text-text-muted">@{u.username}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <PowerBtn label="@" onClick={onCopy} />
        <PowerBtn label="дм" onClick={onDm} />
        <PowerBtn label="пинг" onClick={onPing} />
        {!isMe && (
          <>
            <PowerBtn label="yank" onClick={onYank} busy={busy === `yank:${u.id}`} />
            <PowerBtn label="kick" onClick={onKick} busy={busy === `kick:${u.id}`} danger />
            <PowerBtn label={u.banned ? 'unban' : 'ban'} onClick={onBan} busy={busy === `ban:${u.id}`} danger={!u.banned} good={u.banned} />
            <PowerBtn label={u.isOwner ? '−root' : '+root'} onClick={() => onOwner(!u.isOwner)} busy={busy === `owner:${u.id}`} good={!u.isOwner} danger={u.isOwner} />
          </>
        )}
      </div>
    </div>
  );
}

function ServerRow({ s, ownerName, busy, onCopy, onShadow }: { s: VeilServer; ownerName?: PublicUser; busy: string | null; onCopy: () => void; onShadow: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,77,109,0.1)' }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base" style={{ background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.25)' }}>
        {s.icon ?? '✦'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-heading">{s.name}</p>
        <p className="truncate text-[10px] text-text-muted">
          owner: {ownerName ? `@${ownerName.username}` : s.ownerId.slice(0, 8)} · {s.memberCount} участ. · {s.channelCount} каналов
        </p>
      </div>
      <code className="hidden shrink-0 rounded px-2 py-1 text-[10px] text-text-muted sm:block" style={{ background: 'rgba(0,0,0,0.4)', textTransform: 'none' }}>
        {s.inviteCode.slice(0, 10)}…
      </code>
      <PowerBtn label="инвайт" onClick={onCopy} />
      <PowerBtn label="теневой вход" onClick={onShadow} busy={busy === `shadow:${s.id}`} good />
    </div>
  );
}

function Broadcast() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.veilBroadcast(text.trim());
      toast('разослано всем ◈', 'success');
      setText('');
    } catch {
      toast('сбой', 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-lg">
      <p className="mb-2 text-sm text-text-primary">системное сообщение всем онлайн (всплывёт тостом «◈ veilsight»).</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={500}
        placeholder="сообщение от лица системы…"
        className="glass-input w-full resize-none"
        style={{ background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.2)' }}
      />
      <button
        onClick={send}
        disabled={busy || !text.trim()}
        className="mt-3 rounded-glass px-5 py-2 text-sm font-semibold transition disabled:opacity-40"
        style={{ background: `linear-gradient(135deg, ${RED}, #8c2f55)`, color: '#fff' }}
      >
        {busy ? '…' : 'разослать ◈'}
      </button>
    </div>
  );
}
