// Profile card v3 — wide banner layout, copyable @username, bio, badge row,
// info grid, role chips with inline assignment, and a moderation drawer.
import { useEffect, useState } from 'react';
import type { PublicUser } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { resolveAssetUrl } from '../lib/config';
import { Avatar } from './Avatar';
import { nameColor, displayName } from '../lib/roles';
import { toast } from '../store/toasts';
import { ChatIcon, EditIcon, CloseIcon } from './icons';

const STATUS_LABEL: Record<string, string> = {
  online: 'в сети',
  idle: 'отошёл',
  dnd: 'не беспокоить',
  offline: 'не в сети',
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
  const [editingUid, setEditingUid] = useState(false);
  const [uidDraft, setUidDraft] = useState('');

  useEffect(() => {
    setUser(cached ?? null);
    setEditingRoles(false);
    setError(null);
    setConfirmBan(false);
    setEditingUid(false);
    if (!userId) return;
    api.getUser(userId).then(setUser).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!userId) return null;
  const u = user ?? cached;
  const isMe = me?.id === userId;
  const status = u?.status ?? 'offline';
  const accent = nameColor(u);
  const name = displayName(u);
  const banner = resolveAssetUrl(u?.bannerUrl);
  const userRoleIds = new Set((u?.roles ?? []).map((r) => r.id));
  const sortedRoles = [...allRoles].sort((a, b) => b.position - a.position);
  const mutedUntil = u?.mutedUntil ? new Date(u.mutedUntil) : null;
  const isMuted = !!mutedUntil && mutedUntil.getTime() > Date.now();
  const canModerate = !isMe && !u?.isOwner;
  const showModeration =
    canModerate && (perms?.canTimeout || perms?.canKick || perms?.canBan || u?.banned);

  function copyUsername() {
    if (!u) return;
    navigator.clipboard
      ?.writeText(`@${u.username}`)
      .then(() => toast(`@${u.username} скопирован`, 'success'))
      .catch(() => {});
  }

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
      setError(err instanceof ApiError ? err.message : 'не получилось обновить роли');
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
      setError(err instanceof ApiError ? err.message : 'действие не удалось');
    }
  }

  async function saveUid() {
    if (!u) return;
    const n = parseInt(uidDraft, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError('uid — положительное число');
      return;
    }
    setError(null);
    try {
      const updated = await api.setUserUid(u.id, n);
      setUser(updated);
      upsertUser(updated);
      setEditingUid(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'не получилось сменить uid');
    }
  }

  return (
    <div
      className="sx-overlay fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-md"
      onClick={close}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="sx-pop max-h-[90vh] w-[540px] max-w-[94vw] overflow-y-auto rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #15101f 0%, #0a0812 100%)',
          border: '1px solid rgba(180,160,240,0.18)',
          boxShadow: `0 36px 90px rgba(0,0,0,0.7), 0 0 0 1px ${accent}1f, 0 0 70px ${accent}24`,
        }}
      >
        {/* ── banner ─────────────────────────────────────────────────── */}
        <div
          className="relative h-44 overflow-hidden"
          style={
            banner
              ? undefined
              : {
                  background: `radial-gradient(120% 160% at 20% 0%, ${accent}cc, ${accent}44 45%, transparent 80%), linear-gradient(120deg, ${accent}, #8c2f55)`,
                }
          }
        >
          {banner && <img src={banner} alt="" className="h-full w-full object-cover" />}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(10,8,18,0.92))' }}
          />
          <button
            onClick={close}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-text-heading transition hover:scale-105"
            style={{ background: 'rgba(5,4,9,0.55)', border: '1px solid rgba(255,255,255,0.15)' }}
            aria-label="закрыть"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        {/* ── header row: avatar + actions ───────────────────────────── */}
        <div className="relative px-7">
          <div className="-mt-14 flex items-end justify-between">
            <div className="relative shrink-0">
              <div
                className="rounded-full p-[5px]"
                style={{ background: '#0c0915', boxShadow: `0 0 0 2.5px ${accent}, 0 0 30px ${accent}66` }}
              >
                <Avatar username={name} avatarUrl={u?.avatarUrl} size={96} color={accent} />
              </div>
              <span className="absolute bottom-1 right-1 h-7 w-7 rounded-full" style={{ background: '#0c0915' }}>
                <span
                  className={`status-dot ${STATUS_CLASS[status]} absolute left-1/2 top-1/2 !h-4 !w-4 -translate-x-1/2 -translate-y-1/2`}
                  title={STATUS_LABEL[status]}
                />
              </span>
            </div>

            <div className="mb-1 flex gap-2">
              {isMe ? (
                <button
                  onClick={() => {
                    close();
                    openSettings();
                  }}
                  className="btn-accent flex items-center gap-2 !px-4 !py-2 text-sm"
                >
                  <EditIcon size={14} /> редактировать
                </button>
              ) : (
                <button
                  onClick={() => openDm(userId)}
                  className="btn-accent flex items-center gap-2 !px-4 !py-2 text-sm"
                >
                  <ChatIcon size={15} /> написать
                </button>
              )}
            </div>
          </div>

          {/* ── identity ───────────────────────────────────────────────── */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-[26px] font-bold leading-tight" style={{ color: accent }}>
              {name}
            </h2>
            {u?.isOwner && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  background: 'linear-gradient(135deg, rgba(212,83,126,0.3), rgba(125,111,196,0.25))',
                  color: '#f3c6d6',
                  border: '1px solid rgba(212,83,126,0.55)',
                }}
              >
                ♛ owner
              </span>
            )}
            {u?.banned && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ background: 'rgba(242,63,67,0.18)', color: '#ff8a8d', border: '1px solid rgba(242,63,67,0.5)' }}
              >
                banned
              </span>
            )}
            {isMuted && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest"
                style={{ background: 'rgba(212,83,126,0.15)', color: '#f0a3bf', border: '1px solid rgba(212,83,126,0.4)' }}
                title={`до ${mutedUntil!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              >
                timeout
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              onClick={copyUsername}
              className="group/uname flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-text-primary transition hover:text-text-heading"
              style={{ background: 'rgba(125,111,196,0.1)', border: '1px solid rgba(180,160,240,0.18)' }}
              title="скопировать @username"
            >
              @{u?.username ?? 'unknown'}
              <span className="text-[10px] text-text-muted opacity-0 transition group-hover/uname:opacity-100">
                копировать
              </span>
            </button>

            {editingUid ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={uidDraft}
                  onChange={(e) => setUidDraft(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveUid();
                    if (e.key === 'Escape') setEditingUid(false);
                  }}
                  className="glass-input !w-16 !py-0.5 text-xs"
                  placeholder="uid"
                />
                <button onClick={saveUid} className="text-[11px] text-accent-violet">ок</button>
                <button onClick={() => setEditingUid(false)} className="text-[11px] text-text-muted">отмена</button>
              </span>
            ) : (
              <button
                onClick={
                  perms?.isOwner
                    ? () => {
                        setUidDraft(u?.uid ? String(u.uid) : '');
                        setEditingUid(true);
                      }
                    : undefined
                }
                disabled={!perms?.isOwner}
                title={perms?.isOwner ? 'сменить uid (владелец)' : 'публичный uid — знак старшинства'}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${perms?.isOwner ? 'cursor-pointer hover:brightness-125' : 'cursor-default'}`}
                style={{ background: 'rgba(125,111,196,0.16)', color: '#cfc6f5', border: '1px solid rgba(180,160,240,0.28)' }}
              >
                uid #{u?.uid ?? '—'}
              </button>
            )}
          </div>

          {/* ── bio ───────────────────────────────────────────────────── */}
          {(u?.bio || isMe) && (
            <div
              className="mt-4 rounded-[14px] px-4 py-3"
              style={{ background: 'rgba(5,4,9,0.5)', border: '1px solid rgba(180,160,240,0.1)' }}
            >
              <p className="section-label mb-1">обо мне</p>
              {u?.bio ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
                  {u.bio}
                </p>
              ) : (
                <button
                  onClick={() => {
                    close();
                    openSettings();
                  }}
                  className="text-xs text-text-muted hover:text-accent-violet"
                >
                  расскажи о себе в настройках…
                </button>
              )}
            </div>
          )}

          {/* ── info grid ─────────────────────────────────────────────── */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div
              className="rounded-[14px] px-4 py-3"
              style={{ background: 'rgba(5,4,9,0.5)', border: '1px solid rgba(180,160,240,0.1)' }}
            >
              <p className="section-label mb-1">статус</p>
              <p className="flex items-center gap-2 text-sm text-text-primary">
                <span className={`status-dot ${STATUS_CLASS[status]}`} />
                {STATUS_LABEL[status]}
              </p>
            </div>
            <div
              className="rounded-[14px] px-4 py-3"
              style={{ background: 'rgba(5,4,9,0.5)', border: '1px solid rgba(180,160,240,0.1)' }}
            >
              <p className="section-label mb-1">в sephraxia с</p>
              <p className="text-sm text-text-primary">
                {u?.createdAt
                  ? new Date(u.createdAt).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—'}
              </p>
            </div>
          </div>

          {/* ── roles ─────────────────────────────────────────────────── */}
          {(canManageRoles || (u?.roles?.length ?? 0) > 0) && (
            <div
              className="mt-3 rounded-[14px] px-4 py-3"
              style={{ background: 'rgba(5,4,9,0.5)', border: '1px solid rgba(180,160,240,0.1)' }}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="section-label">роли</p>
                {canManageRoles && (
                  <button
                    onClick={() => {
                      setEditingRoles((v) => !v);
                      setError(null);
                    }}
                    className="rounded-full px-2.5 py-0.5 text-[11px] text-text-muted transition hover:text-accent-violet"
                    style={{ background: 'rgba(125,111,196,0.12)' }}
                  >
                    {editingRoles ? 'готово' : 'управлять'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(editingRoles ? sortedRoles : u?.roles ?? []).map((r) => {
                  const on = userRoleIds.has(r.id);
                  const saving = savingRole === r.id;
                  return editingRoles ? (
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
                      title={on ? 'снять роль' : 'выдать роль'}
                    >
                      {saving ? '…' : `${r.symbol} ${r.name}`}
                    </button>
                  ) : (
                    <span
                      key={r.id}
                      className="rounded-full px-2.5 py-1 text-xs"
                      style={{ color: r.color, background: `${r.color}1f`, border: `1px solid ${r.color}55` }}
                    >
                      {r.symbol} {r.name}
                    </span>
                  );
                })}
                {!editingRoles && (u?.roles ?? []).length === 0 && (
                  <span className="text-xs text-text-muted">ролей нет</span>
                )}
                {editingRoles && sortedRoles.length === 0 && (
                  <span className="text-xs text-text-muted">сначала создай роли (◈ в списке каналов)</span>
                )}
              </div>
            </div>
          )}

          {/* ── moderation ────────────────────────────────────────────── */}
          {showModeration && (
            <div
              className="mt-3 rounded-[14px] px-4 py-3"
              style={{ background: 'rgba(212,83,126,0.05)', border: '1px solid rgba(212,83,126,0.18)' }}
            >
              <p className="section-label mb-2">модерация</p>
              <div className="flex flex-wrap gap-1.5">
                {perms?.canTimeout && !u?.banned && (
                  <button
                    onClick={() => moderate(() => api.timeoutUser(u!.id, isMuted ? 0 : 10))}
                    className="rounded-glass px-3 py-1.5 text-xs text-text-primary transition hover:text-accent-violet"
                    style={{ background: 'rgba(125,111,196,0.12)' }}
                  >
                    {isMuted ? 'снять тайм-аут' : 'тайм-аут 10м'}
                  </button>
                )}
                {perms?.canKick && !u?.banned && (
                  <button
                    onClick={() => moderate(() => api.kickUser(u!.id).then(() => undefined))}
                    className="rounded-glass px-3 py-1.5 text-xs text-text-muted transition hover:text-accent-pink"
                    style={{ background: 'rgba(125,111,196,0.12)' }}
                  >
                    кикнуть
                  </button>
                )}
                {perms?.canBan && u?.banned && (
                  <button
                    onClick={() => moderate(() => api.unbanUser(u!.id))}
                    className="rounded-glass px-3 py-1.5 text-xs font-semibold text-[#bff0c9] transition hover:brightness-110"
                    style={{ background: 'rgba(35,165,89,0.18)', border: '1px solid rgba(35,165,89,0.4)' }}
                  >
                    разбанить
                  </button>
                )}
                {perms?.canBan &&
                  !u?.banned &&
                  (confirmBan ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          moderate(() => api.banUser(u!.id));
                          close();
                        }}
                        className="rounded-glass bg-accent-pink/80 px-3 py-1.5 text-xs text-text-heading hover:bg-accent-pink"
                      >
                        точно забанить
                      </button>
                      <button
                        onClick={() => setConfirmBan(false)}
                        className="rounded-glass px-2 py-1.5 text-xs text-text-muted"
                        style={{ background: 'rgba(125,111,196,0.1)' }}
                      >
                        нет
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmBan(true)}
                      className="rounded-glass px-3 py-1.5 text-xs text-text-muted transition hover:text-accent-pink"
                      style={{ background: 'rgba(125,111,196,0.12)' }}
                    >
                      забанить
                    </button>
                  ))}
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-accent-pink">{error}</p>}
          <div className="pb-6" />
        </div>
      </div>
    </div>
  );
}
