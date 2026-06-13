// Profile "dossier" v5 — circular avatar with configurable ring, admin badge
// prefix, custom accent, cheat-project showcase, external links, show/hide
// cells, role chips and a moderation strip. Customised per-user via settings.
import { useEffect, useState } from 'react';
import type { PublicUser, ProfileConfig } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { resolveAssetUrl } from '../lib/config';
import { Avatar } from './Avatar';
import { displayName, profileAccent } from '../lib/roles';
import { copyText } from '../lib/clipboard';
import { ProjectChip } from './ProjectIcon';
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
const monoStyle = { fontFamily: "'Cascadia Code','JetBrains Mono',Consolas,monospace", textTransform: 'none' as const };

function show(cfg: ProfileConfig | null | undefined, key: keyof NonNullable<ProfileConfig['show']>): boolean {
  return cfg?.show?.[key] !== false; // default: shown
}

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
  const statusVal = u?.status ?? 'offline';
  const accent = profileAccent(u);
  const name = displayName(u);
  const cfg = u?.profileCfg ?? null;
  const ring = cfg?.ring ?? 'glow';
  const bannerOpacity = (cfg?.bannerOpacity ?? 80) / 100;
  const banner = resolveAssetUrl(u?.bannerUrl);
  const userRoleIds = new Set((u?.roles ?? []).map((r) => r.id));
  const sortedRoles = [...allRoles].sort((a, b) => b.position - a.position);
  const mutedUntil = u?.mutedUntil ? new Date(u.mutedUntil) : null;
  const isMuted = !!mutedUntil && mutedUntil.getTime() > Date.now();
  const canModerate = !isMe && !u?.isOwner;
  const showModeration =
    canModerate && (perms?.canTimeout || perms?.canKick || perms?.canBan || u?.banned);

  const cheats = (u?.cheats ?? []).filter(Boolean);
  const links = (u?.links ?? []).filter((l) => l.url && /^https?:\/\//i.test(l.url));

  // Ring styling around the avatar (configurable; never a hard square).
  const ringStyle: React.CSSProperties =
    ring === 'none'
      ? {}
      : ring === 'solid'
        ? { boxShadow: `0 0 0 3px ${accent}` }
        : ring === 'gradient'
          ? { background: `conic-gradient(from 0deg, ${accent}, #8c2f55, #3a4a8c, ${accent})`, padding: 3 }
          : { boxShadow: `0 0 0 2px ${accent}, 0 0 24px ${accent}88` }; // glow

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

  // Which data cells to show.
  const cells = [
    show(cfg, 'uid') && { k: 'uid', v: u?.uid != null ? `#${u.uid}` : '—', mono: true },
    show(cfg, 'status') && { k: 'статус', v: STATUS_LABEL[statusVal], mono: false },
    show(cfg, 'joined') && { k: 'с нами', v: joined, mono: true },
  ].filter(Boolean) as { k: string; v: string; mono: boolean }[];

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
        {/* banner */}
        <div className="relative h-24 overflow-hidden">
          {banner ? (
            <img src={banner} alt="" className="h-full w-full object-cover" style={{ opacity: bannerOpacity }} />
          ) : (
            <div
              className="h-full w-full"
              style={{ background: `linear-gradient(110deg, ${accent}, #2a1830 75%)`, opacity: 0.9 }}
            />
          )}
          <div
            className="pointer-events-none absolute -inset-1/4 opacity-40"
            style={{ background: `radial-gradient(40% 50% at 50% 50%, ${accent}55, transparent 70%)`, animation: 'sx-sheen 10s ease-in-out infinite', willChange: 'transform' }}
          />
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

        {/* identity */}
        <div className="flex gap-4 px-5 pb-4">
          <div className="relative -mt-10 shrink-0">
            <div className="overflow-hidden rounded-full" style={ringStyle}>
              <Avatar username={name} avatarUrl={u?.avatarUrl} size={84} color={accent} />
            </div>
            <span
              className={`status-dot ${STATUS_CLASS[statusVal]} absolute bottom-0.5 right-0.5 !h-4 !w-4 ring-2`}
              style={{ ['--tw-ring-color' as string]: '#0b0812' }}
              title={STATUS_LABEL[statusVal]}
            />
          </div>

          <div className="min-w-0 flex-1 pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {u?.badge && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    color: u.badgeColor ?? '#fff',
                    background: `${u.badgeColor ?? '#7d6fc4'}22`,
                    border: `1px solid ${u.badgeColor ?? '#7d6fc4'}88`,
                    textTransform: 'uppercase',
                  }}
                >
                  {u.badge}
                </span>
              )}
              <h2 className="truncate text-xl font-bold leading-tight" style={{ color: accent }}>
                {name}
              </h2>
              {u?.isOwner && <span className="text-xs font-bold" style={{ color: '#ff6d85' }}>♛</span>}
            </div>
            <button
              onClick={() => u && copyText(`@${u.username}`, `@${u.username} скопирован`)}
              className="mt-0.5 block max-w-full truncate text-left text-xs text-text-muted hover:text-text-primary"
              style={monoStyle}
              title="скопировать @username"
            >
              @{u?.username ?? 'unknown'}
            </button>
            <div className="mt-2 h-[2px] w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
          </div>
        </div>

        {/* data strip */}
        {cells.length > 0 && (
          <div
            className="mx-5 mb-4 grid gap-px overflow-hidden rounded-[10px]"
            style={{ background: 'rgba(180,160,240,0.1)', gridTemplateColumns: `repeat(${cells.length},1fr)` }}
          >
            {cells.map((f) => (
              <div key={f.k} className="px-3 py-2" style={{ background: '#0d0a16' }}>
                <p className="text-[9px] uppercase tracking-widest text-text-muted">{f.k}</p>
                <p className="truncate text-xs text-text-primary" style={f.mono ? monoStyle : undefined}>{f.v}</p>
              </div>
            ))}
          </div>
        )}

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

          {/* cheats showcase */}
          {show(cfg, 'cheats') && cheats.length > 0 && (
            <div>
              <p className="section-label mb-1.5">читы</p>
              <div className="flex flex-wrap gap-1.5">
                {cheats.map((c) => (
                  <ProjectChip key={c} project={c} />
                ))}
              </div>
            </div>
          )}

          {/* links */}
          {show(cfg, 'links') && links.length > 0 && (
            <div>
              <p className="section-label mb-1.5">ссылки</p>
              <div className="flex flex-wrap gap-1.5">
                {links.map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-full px-2.5 py-1 text-xs text-text-primary transition hover:text-accent-violet"
                    style={{ background: 'rgba(125,111,196,0.12)', border: '1px solid rgba(180,160,240,0.2)' }}
                  >
                    ↗ {l.label || l.url.replace(/^https?:\/\//, '').slice(0, 28)}
                  </a>
                ))}
              </div>
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
