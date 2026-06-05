import { useEffect, useState } from 'react';
import type { PublicUser } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { Avatar } from './Avatar';
import { nameColor } from '../lib/roles';

const STATUS_LABEL: Record<string, string> = {
  online: 'online',
  idle: 'idle',
  dnd: 'do not disturb',
  offline: 'offline',
};
const STATUS_CLASS: Record<string, string> = {
  online: 'status-online',
  idle: 'status-idle',
  dnd: 'status-dnd',
  offline: 'status-offline',
};

export function ProfileModal() {
  const userId = useUiStore((s) => s.profileUserId);
  const close = useUiStore((s) => s.closeProfile);
  const openSettings = useUiStore((s) => s.openSettings);
  const openDm = useUiStore((s) => s.openDm);
  const cached = useChatStore((s) => s.users.find((u) => u.id === userId));
  const allRoles = useChatStore((s) => s.roles);
  const upsertUser = useChatStore((s) => s.upsertUser);
  const me = useAuthStore((s) => s.user);
  const perms = useAuthStore((s) => s.permissions);
  const canManageRoles = !!perms?.canManageRoles;

  const [user, setUser] = useState<PublicUser | null>(cached ?? null);
  const [editingRoles, setEditingRoles] = useState(false);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState(false);

  useEffect(() => {
    setUser(cached ?? null);
    setEditingRoles(false);
    setError(null);
    setConfirmBan(false);
    if (!userId) return;
    api.getUser(userId).then(setUser).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!userId) return null;
  const u = user ?? cached;
  const isMe = me?.id === userId;
  const status = u?.status ?? 'offline';
  const accent = nameColor(u);
  const userRoleIds = new Set((u?.roles ?? []).map((r) => r.id));
  const sortedRoles = [...allRoles].sort((a, b) => b.position - a.position);
  const showRoles = canManageRoles || (u?.roles?.length ?? 0) > 0;
  const mutedUntil = u?.mutedUntil ? new Date(u.mutedUntil) : null;
  const isMuted = !!mutedUntil && mutedUntil.getTime() > Date.now();
  const canModerate = !isMe && !u?.isOwner;
  const showModeration = canModerate && (perms?.canTimeout || perms?.canKick || perms?.canBan);

  async function toggleRole(roleId: string, on: boolean) {
    if (!u) return;
    const next = new Set(userRoleIds);
    if (on) next.add(roleId);
    else next.delete(roleId);
    setSavingRole(roleId);
    setError(null);
    try {
      const updated = await api.setUserRoles(u.id, [...next]);
      setUser(updated);
      upsertUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not update roles');
    } finally {
      setSavingRole(null);
    }
  }

  async function moderate(fn: () => Promise<unknown>) {
    if (!u) return;
    setError(null);
    try {
      const updated = (await fn()) as PublicUser | undefined;
      if (updated && updated.id) {
        setUser(updated);
        upsertUser(updated);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'action failed');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md"
      onClick={close}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="w-[400px] overflow-hidden rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, rgba(20,16,30,0.96), rgba(8,6,14,0.98))',
          border: '1px solid rgba(180,160,240,0.16)',
          boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px ${accent}22, 0 0 50px ${accent}22`,
        }}
      >
        {/* banner */}
        <div
          className="relative h-28"
          style={{
            background: `radial-gradient(120% 160% at 20% 0%, ${accent}cc, ${accent}55 40%, transparent 75%), linear-gradient(120deg, ${accent}, #8c2f55)`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, transparent 40%, rgba(8,6,14,0.55))' }}
          />
        </div>

        <div className="relative z-10 px-6 pb-6">
          {/* avatar overlapping the banner */}
          <div className="-mt-14 mb-3 flex items-end justify-between">
            <div
              className="rounded-full p-1.5"
              style={{ background: '#0a0810', boxShadow: `0 0 0 2px ${accent}, 0 0 24px ${accent}66` }}
            >
              <Avatar username={u?.username ?? '?'} avatarUrl={u?.avatarUrl} size={92} color={accent} />
            </div>
            {u?.isOwner && (
              <span
                className="mb-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  background: 'linear-gradient(135deg, rgba(212,83,126,0.25), rgba(125,111,196,0.2))',
                  color: '#f3c6d6',
                  border: '1px solid rgba(212,83,126,0.5)',
                }}
              >
                ♛ owner
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold leading-tight" style={{ color: accent }}>
              {u?.username ?? 'unknown'}
            </h2>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className={`status-dot ${STATUS_CLASS[status]}`} />
              {STATUS_LABEL[status]}
            </span>
            {isMuted && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: 'rgba(212,83,126,0.15)', color: '#f0a3bf', border: '1px solid rgba(212,83,126,0.4)' }}
              >
                ⏳ timed out until {mutedUntil!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* body card */}
          <div
            className="mt-4 space-y-4 rounded-glass p-4"
            style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(180,160,240,0.1)' }}
          >
            {showRoles && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="section-label">roles</p>
                  {canManageRoles && (
                    <button
                      onClick={() => { setEditingRoles((v) => !v); setError(null); }}
                      className="rounded-full px-2.5 py-0.5 text-[11px] text-text-muted transition hover:text-accent-violet"
                      style={{ background: 'rgba(125,111,196,0.12)' }}
                    >
                      {editingRoles ? 'done' : 'manage'}
                    </button>
                  )}
                </div>

                {editingRoles ? (
                  <div className="flex flex-wrap gap-1.5">
                    {sortedRoles.map((r) => {
                      const on = userRoleIds.has(r.id);
                      const saving = savingRole === r.id;
                      return (
                        <button
                          key={r.id}
                          disabled={saving}
                          onClick={() => toggleRole(r.id, !on)}
                          className="rounded-full px-2.5 py-1 text-xs transition disabled:opacity-50"
                          style={{
                            color: on ? '#0a0810' : r.color,
                            background: on ? r.color : `${r.color}1a`,
                            border: `1px solid ${r.color}${on ? '' : '55'}`,
                            fontWeight: on ? 600 : 400,
                          }}
                          title={on ? 'click to remove' : 'click to assign'}
                        >
                          {saving ? '…' : `${r.symbol} ${r.name}`}
                        </button>
                      );
                    })}
                    {sortedRoles.length === 0 && (
                      <p className="text-xs text-text-muted">no roles exist yet — create some first.</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(u?.roles ?? []).map((r) => (
                      <span
                        key={r.id}
                        className="rounded-full px-2.5 py-1 text-xs"
                        style={{ color: r.color, background: `${r.color}1f`, border: `1px solid ${r.color}55` }}
                      >
                        {r.symbol} {r.name}
                      </span>
                    ))}
                    {(u?.roles ?? []).length === 0 && (
                      <span className="text-xs text-text-muted">no roles assigned</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {u?.createdAt && (
              <div className={showRoles ? 'border-t border-glass-border pt-3' : ''}>
                <p className="section-label mb-1">member since</p>
                <p className="text-sm text-text-primary">
                  {new Date(u.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            )}

            {showModeration && (
              <div className="border-t border-glass-border pt-3">
                <p className="section-label mb-2">moderation</p>
                <div className="flex flex-wrap gap-1.5">
                  {perms?.canTimeout && (
                    <button
                      onClick={() => moderate(() => api.timeoutUser(u!.id, isMuted ? 0 : 10))}
                      className="rounded-glass px-3 py-1.5 text-xs text-text-primary transition hover:text-accent-violet"
                      style={{ background: 'rgba(125,111,196,0.12)' }}
                    >
                      {isMuted ? 'remove timeout' : 'timeout 10m'}
                    </button>
                  )}
                  {perms?.canKick && (
                    <button
                      onClick={() => moderate(() => api.kickUser(u!.id).then(() => undefined))}
                      className="rounded-glass px-3 py-1.5 text-xs text-text-muted transition hover:text-accent-pink"
                      style={{ background: 'rgba(125,111,196,0.12)' }}
                    >
                      kick
                    </button>
                  )}
                  {perms?.canBan &&
                    (confirmBan ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={() => { moderate(() => api.banUser(u!.id)); close(); }}
                          className="rounded-glass bg-accent-pink/80 px-3 py-1.5 text-xs text-text-heading hover:bg-accent-pink"
                        >
                          confirm ban
                        </button>
                        <button
                          onClick={() => setConfirmBan(false)}
                          className="rounded-glass px-2 py-1.5 text-xs text-text-muted"
                          style={{ background: 'rgba(125,111,196,0.1)' }}
                        >
                          no
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmBan(true)}
                        className="rounded-glass px-3 py-1.5 text-xs text-text-muted transition hover:text-accent-pink"
                        style={{ background: 'rgba(125,111,196,0.12)' }}
                      >
                        ban
                      </button>
                    ))}
                </div>
              </div>
            )}

            {error && <p className="text-xs text-accent-pink">{error}</p>}
          </div>

          {isMe ? (
            <button
              className="btn-accent mt-5 w-full"
              onClick={() => { close(); openSettings(); }}
            >
              edit profile
            </button>
          ) : (
            <button className="btn-accent mt-5 w-full" onClick={() => openDm(userId)}>
              send message
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
