// Profile "dossier" v4 — asymmetric ID-card look: avatar + identity on the
// left, a monospace data column on the right, signature accent bar, role chips
// and an inline moderation strip. Deliberately not a centered banner card.
import { useEffect, useState } from 'react';
import type { PublicUser } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { resolveAssetUrl } from '../lib/config';
import { Avatar } from './Avatar';
import { nameColor, displayName } from '../lib/roles';
import { copyText } from '../lib/clipboard';
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
const mono = { fontFamily: "'Cascadia Code','JetBrains Mono',Consolas,monospace", textTransform: 'none' as const };

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

  useEffect(() => {
    if (!userId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userId, close]);

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

  async function toggleRole(roleId: string, on: boolean) {
    if (!u) return;
    const next = new Set(userRoleIds);
    if (on) next.add(roleId);
    else next.delete(roleId);
    setSavingRole(roleId);
    setError(null);
    try {
      const sid = useChatStore.getState().activeServerId ?? undefined;
      const updated = await api.setUserRoles(u.id, [...next], sid);
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

  const joined = u?.createdAt
    ? new Date(u.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  return (
    <div
      className="sx-overlay fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-md"
      onClick={close}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="sx-pop w-[460px] max-w-[94vw] overflow-hidden rounded-[16px]"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0b0812',
          border: `1px solid ${accent}33`,
          boxShadow: `0 36px 90px rgba(0,0,0,0.7), 0 0 50px ${accent}1f`,
        }}
      >
        {/* slim banner strip */}
        <div
          className="relative h-20"
          style={banner ? undefined : { background: `linear-gradient(110deg, ${accent}, #2a1830 70%)` }}
        >
          {banner && <img src={banner} alt="" className="h-full w-full object-cover opacity-80" />}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent, #0b0812)' }} />
          <button
            onClick={close}
            className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-md text-text-heading transition hover:scale-105"
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}
            aria-label="закрыть"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* identity row */}
        <div className="flex gap-4 px-5 pb-4">
          <div className="relative -mt-10 shrink-0">
            <div className="rounded-[14px] p-[3px]" style={{ background: '#0b0812', boxShadow: `0 0 0 1.5px ${accent}` }}>
              <div className="overflow-hidden rounded-[12px]">
                <Avatar username={name} avatarUrl={u?.avatarUrl} size={80} color={accent} />
              </div>
            </div>
            <span
              className={`status-dot ${STATUS_CLASS[status]} absolute -bottom-1 -right-1 !h-4 !w-4 ring-2`}
              style={{ ['--tw-ring-color' as string]: '#0b0812' }}
              title={STATUS_LABEL[status]}
            />
          </div>

          <div className="min-w-0 flex-1 pt-2">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-bold leading-tight" style={{ color: accent }}>
                {name}
              </h2>
              {u?.isOwner && <span className="text-xs font-bold" style={{ color: '#ff6d85' }}>♛</span>}
            </div>
            <button
              onClick={() => u && copyText(`@${u.username}`, `@${u.username} скопирован`)}
              className="mt-0.5 block max-w-full truncate text-left text-xs text-text-muted hover:text-text-primary"
              style={mono}
              title="скопировать @username"
            >
              @{u?.username ?? 'unknown'}
            </button>
            {/* signature accent bar */}
            <div className="mt-2 h-[2px] w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
          </div>
        </div>

        {/* monospace data strip */}
        <div className="mx-5 mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-[10px]" style={{ background: 'rgba(180,160,240,0.1)' }}>
          {[
            { k: 'uid', v: u?.uid != null ? `#${u.uid}` : '—' },
            { k: 'статус', v: STATUS_LABEL[status] },
            { k: 'с нами', v: joined },
          ].map((f) => (
            <div key={f.k} className="px-3 py-2" style={{ background: '#0d0a16' }}>
              <p className="text-[9px] uppercase tracking-widest text-text-muted">{f.k}</p>
              <p className="truncate text-xs text-text-primary" style={f.k === 'uid' || f.k === 'с нами' ? mono : undefined}>
                {f.v}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-3 px-5 pb-5">
          {u?.banned && (
            <div className="rounded-[10px] px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(242,63,67,0.12)', color: '#ff8a8d', border: '1px solid rgba(242,63,67,0.4)' }}>
              ⓘ аккаунт забанен
            </div>
          )}
          {isMuted && (
            <div className="rounded-[10px] px-3 py-2 text-xs" style={{ background: 'rgba(212,83,126,0.1)', color: '#f0a3bf', border: '1px solid rgba(212,83,126,0.35)' }}>
              тайм-аут до {mutedUntil!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {/* bio */}
          {(u?.bio || isMe) && (
            <div>
              <p className="section-label mb-1.5">обо мне</p>
              {u?.bio ? (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">{u.bio}</p>
              ) : (
                <button onClick={() => { close(); openSettings(); }} className="text-xs text-text-muted hover:text-accent-violet">
                  добавить описание в настройках…
                </button>
              )}
            </div>
          )}

          {/* roles */}
          {(canManageRoles || (u?.roles?.length ?? 0) > 0) && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="section-label">роли</p>
                {canManageRoles && (
                  <button
                    onClick={() => { setEditingRoles((v) => !v); setError(null); }}
                    className="rounded-full px-2 py-0.5 text-[10px] text-text-muted transition hover:text-accent-violet"
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
                      style={{ color: on ? '#0a0810' : r.color, background: on ? r.color : `${r.color}1a`, border: `1px solid ${r.color}${on ? '' : '55'}`, fontWeight: on ? 600 : 400 }}
                    >
                      {saving ? '…' : `${r.symbol} ${r.name}`}
                    </button>
                  ) : (
                    <span key={r.id} className="rounded-full px-2.5 py-1 text-xs" style={{ color: r.color, background: `${r.color}1f`, border: `1px solid ${r.color}55` }}>
                      {r.symbol} {r.name}
                    </span>
                  );
                })}
                {!editingRoles && (u?.roles ?? []).length === 0 && <span className="text-xs text-text-muted">ролей нет</span>}
                {editingRoles && sortedRoles.length === 0 && <span className="text-xs text-text-muted">создай роли через ◈ в списке каналов</span>}
              </div>
            </div>
          )}

          {/* moderation */}
          {showModeration && (
            <div className="rounded-[10px] px-3 py-2.5" style={{ background: 'rgba(255,77,109,0.05)', border: '1px solid rgba(255,77,109,0.18)' }}>
              <p className="section-label mb-2" style={{ color: '#ff8a9c' }}>модерация</p>
              <div className="flex flex-wrap gap-1.5">
                {perms?.canTimeout && !u?.banned && (
                  <button onClick={() => moderate(() => api.timeoutUser(u!.id, isMuted ? 0 : 10))} className="rounded-md px-2.5 py-1 text-xs text-text-primary transition hover:text-accent-violet" style={{ background: 'rgba(125,111,196,0.12)' }}>
                    {isMuted ? 'снять тайм-аут' : 'тайм-аут 10м'}
                  </button>
                )}
                {perms?.canKick && !u?.banned && (
                  <button onClick={() => moderate(() => api.kickUser(u!.id).then(() => undefined))} className="rounded-md px-2.5 py-1 text-xs text-text-muted transition hover:text-accent-pink" style={{ background: 'rgba(125,111,196,0.12)' }}>
                    кикнуть
                  </button>
                )}
                {perms?.canBan && u?.banned && (
                  <button onClick={() => moderate(() => api.unbanUser(u!.id))} className="rounded-md px-2.5 py-1 text-xs font-semibold text-[#bff0c9]" style={{ background: 'rgba(35,165,89,0.18)', border: '1px solid rgba(35,165,89,0.4)' }}>
                    разбанить
                  </button>
                )}
                {perms?.canBan && !u?.banned && (confirmBan ? (
                  <span className="flex items-center gap-1.5">
                    <button onClick={() => { moderate(() => api.banUser(u!.id)); close(); }} className="rounded-md bg-accent-pink/80 px-2.5 py-1 text-xs text-text-heading hover:bg-accent-pink">точно?</button>
                    <button onClick={() => setConfirmBan(false)} className="rounded-md px-2 py-1 text-xs text-text-muted" style={{ background: 'rgba(125,111,196,0.1)' }}>нет</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmBan(true)} className="rounded-md px-2.5 py-1 text-xs text-text-muted transition hover:text-accent-pink" style={{ background: 'rgba(125,111,196,0.12)' }}>забанить</button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-accent-pink">{error}</p>}

          {/* primary action */}
          {isMe ? (
            <button onClick={() => { close(); openSettings(); }} className="btn-accent flex w-full items-center justify-center gap-2 text-sm">
              <EditIcon size={14} /> редактировать профиль
            </button>
          ) : (
            <button onClick={() => openDm(userId)} className="btn-accent flex w-full items-center justify-center gap-2 text-sm">
              <ChatIcon size={15} /> написать сообщение
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
