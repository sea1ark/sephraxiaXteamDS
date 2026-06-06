// Banned-users management: list everyone currently banned and unban them.
// Visible to moderators with the ban permission. Banned users are hidden from
// the member list, so this is the way back in.
import { useEffect, useState } from 'react';
import type { PublicUser } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { Avatar } from './Avatar';
import { nameColor, displayName } from '../lib/roles';

type BannedUser = PublicUser & { bannedReason?: string | null };

export function BansModal() {
  const open = useUiStore((s) => s.bansOpen);
  const close = useUiStore((s) => s.closeBans);
  const upsertUser = useChatStore((s) => s.upsertUser);

  const [bans, setBans] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api
      .getBans()
      .then(setBans)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'could not load bans'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  async function unban(u: BannedUser) {
    setBusy(u.id);
    setError(null);
    try {
      const updated = await api.unbanUser(u.id);
      upsertUser(updated);
      setBans((prev) => prev.filter((b) => b.id !== u.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'could not unban');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" onClick={close}>
      <div
        className="glass flex max-h-[80vh] w-[440px] flex-col rounded-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
          <span className="heading-glow text-sm font-semibold tracking-[0.12em]">banned users</span>
          <button onClick={close} className="text-text-muted transition hover:text-accent-pink">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-3">
          {loading && <p className="px-2 py-6 text-center text-xs text-text-muted">loading…</p>}
          {!loading && bans.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-text-muted">no one is banned. 🎈</p>
          )}
          {bans.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-glass px-3 py-2"
              style={{ background: 'rgba(125,111,196,0.06)' }}
            >
              <Avatar username={displayName(u)} avatarUrl={u.avatarUrl} size={36} color={nameColor(u)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" style={{ color: nameColor(u) }}>
                  {displayName(u)}
                  {u.uid ? <span className="ml-1.5 text-[11px] text-text-muted">#{u.uid}</span> : null}
                </div>
                <div className="truncate text-[11px] text-text-muted">
                  @{u.username}
                  {u.bannedReason ? ` · ${u.bannedReason}` : ''}
                </div>
              </div>
              <button
                onClick={() => unban(u)}
                disabled={busy === u.id}
                className="shrink-0 rounded-glass px-3 py-1.5 text-xs font-semibold text-[#bff0c9] transition hover:brightness-110 disabled:opacity-50"
                style={{ background: 'rgba(35,165,89,0.18)', border: '1px solid rgba(35,165,89,0.4)' }}
              >
                {busy === u.id ? '…' : 'unban'}
              </button>
            </div>
          ))}
          {error && <p className="px-2 pt-2 text-xs text-accent-pink">{error}</p>}
        </div>
      </div>
    </div>
  );
}
