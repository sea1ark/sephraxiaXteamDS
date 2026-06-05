// Right-click context menu for a member: profile, DM, role assignment, and
// moderation (timeout / kick / ban) gated by the actor's permissions.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';

const TIMEOUTS: { label: string; minutes: number }[] = [
  { label: '60 seconds', minutes: 1 },
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 60 * 24 },
  { label: '1 week', minutes: 60 * 24 * 7 },
];

export function MemberContextMenu() {
  const menu = useUiStore((s) => s.memberMenu);
  const close = useUiStore((s) => s.closeMemberMenu);
  const openProfile = useUiStore((s) => s.openProfile);
  const openDm = useUiStore((s) => s.openDm);
  const target = useChatStore((s) => s.users.find((u) => u.id === menu?.userId));
  const allRoles = useChatStore((s) => s.roles);
  const upsertUser = useChatStore((s) => s.upsertUser);
  const me = useAuthStore((s) => s.user);
  const perms = useAuthStore((s) => s.permissions);

  const [sub, setSub] = useState<'roles' | 'timeout' | null>(null);
  const [confirm, setConfirm] = useState<'kick' | 'ban' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSub(null);
    setConfirm(null);
    setError(null);
  }, [menu?.userId]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, close]);

  if (!menu || !target) return null;

  const isSelf = me?.id === target.id;
  const canModerate = !isSelf && !target.isOwner;
  const roleIds = new Set((target.roles ?? []).map((r) => r.id));
  const sortedRoles = [...allRoles].sort((a, b) => b.position - a.position);

  // Clamp the menu inside the viewport.
  const width = 232;
  const left = Math.min(menu.x, window.innerWidth - width - 8);
  const top = Math.min(menu.y, window.innerHeight - 400);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'action failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(roleId: string) {
    if (!target) return;
    const next = new Set(roleIds);
    next.has(roleId) ? next.delete(roleId) : next.add(roleId);
    setBusy(true);
    setError(null);
    try {
      const updated = await api.setUserRoles(target.id, [...next]);
      upsertUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not update roles');
    } finally {
      setBusy(false);
    }
  }

  const Item = ({
    label,
    onClick,
    danger,
    disabled,
    arrow,
  }: {
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    arrow?: boolean;
  }) => (
    <button
      disabled={disabled || busy}
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition disabled:opacity-40 ${
        danger
          ? 'text-accent-pink hover:bg-accent-pink/15'
          : 'text-text-primary hover:bg-[rgba(125,111,196,0.15)]'
      }`}
    >
      <span>{label}</span>
      {arrow && <span className="text-text-muted">›</span>}
    </button>
  );

  return (
    <>
      {/* click-away backdrop */}
      <div className="fixed inset-0 z-[55]" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div
        className="glass fixed z-[56] w-[232px] rounded-glass p-1.5"
        style={{ left, top, boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-glass-border px-3 py-1.5 text-xs font-semibold text-text-heading">
          {target.username}
        </div>

        {sub === null && confirm === null && (
          <div className="mt-1 space-y-0.5">
            <Item label="view profile" onClick={() => { openProfile(target.id); }} />
            {!isSelf && <Item label="message" onClick={() => openDm(target.id)} />}
            <Item
              label="copy user id"
              onClick={() => {
                navigator.clipboard?.writeText(target.id).catch(() => {});
                close();
              }}
            />

            {perms?.canManageRoles && (
              <Item label="assign roles" arrow onClick={() => setSub('roles')} />
            )}

            {canModerate && (perms?.canTimeout || perms?.canKick || perms?.canBan) && (
              <div className="my-1 border-t border-glass-border" />
            )}
            {canModerate && perms?.canTimeout && (
              <Item label="timeout" arrow onClick={() => setSub('timeout')} />
            )}
            {canModerate && perms?.canKick && (
              <Item label="kick" danger onClick={() => setConfirm('kick')} />
            )}
            {canModerate && perms?.canBan && (
              <Item label="ban" danger onClick={() => setConfirm('ban')} />
            )}
          </div>
        )}

        {sub === 'roles' && (
          <div className="mt-1">
            <button
              onClick={() => setSub(null)}
              className="mb-1 px-3 py-1 text-xs text-text-muted hover:text-accent-violet"
            >
              ‹ back
            </button>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {sortedRoles.map((r) => {
                const on = roleIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    disabled={busy}
                    onClick={() => toggleRole(r.id)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition hover:bg-[rgba(125,111,196,0.15)] disabled:opacity-40"
                  >
                    <span style={{ color: r.color }}>
                      {r.symbol} {r.name}
                    </span>
                    <span className="text-accent-violet">{on ? '✓' : ''}</span>
                  </button>
                );
              })}
              {sortedRoles.length === 0 && (
                <p className="px-3 py-2 text-xs text-text-muted">no roles yet — create some.</p>
              )}
            </div>
          </div>
        )}

        {sub === 'timeout' && (
          <div className="mt-1">
            <button
              onClick={() => setSub(null)}
              className="mb-1 px-3 py-1 text-xs text-text-muted hover:text-accent-violet"
            >
              ‹ back
            </button>
            <div className="space-y-0.5">
              {TIMEOUTS.map((t) => (
                <Item key={t.minutes} label={t.label} onClick={() => run(() => api.timeoutUser(target.id, t.minutes))} />
              ))}
              {target.mutedUntil && (
                <Item label="remove timeout" onClick={() => run(() => api.timeoutUser(target.id, 0))} />
              )}
            </div>
          </div>
        )}

        {confirm && (
          <div className="mt-1 px-3 py-2">
            <p className="mb-2 text-sm text-text-primary">
              {confirm === 'kick' ? 'kick' : 'ban'} <span className="font-semibold">{target.username}</span>?
            </p>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() =>
                  run(() => (confirm === 'kick' ? api.kickUser(target.id) : api.banUser(target.id)))
                }
                className="flex-1 rounded-md bg-accent-pink/80 px-3 py-1.5 text-sm text-text-heading transition hover:bg-accent-pink disabled:opacity-50"
              >
                {busy ? '…' : confirm}
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
                style={{ background: 'rgba(125,111,196,0.1)' }}
              >
                cancel
              </button>
            </div>
          </div>
        )}

        {error && <p className="px-3 py-1.5 text-xs text-accent-pink">{error}</p>}
      </div>
    </>
  );
}
