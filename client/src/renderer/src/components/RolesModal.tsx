// Role management, Discord-style: hierarchy list on the left (higher = more
// senior, reorder with ↑/↓), full editor for the selected role on the right.
import { useEffect, useState } from 'react';
import type { Role, RolePermissions } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { toast } from '../store/toasts';
import { CloseIcon, PlusIcon, TrashIcon } from './icons';

const PERM_GROUPS: { label: string; perms: { key: keyof RolePermissions; label: string; hint: string }[] }[] = [
  {
    label: 'управление',
    perms: [
      { key: 'canManageChannels', label: 'управлять каналами', hint: 'создавать, переименовывать и удалять каналы' },
      { key: 'canManageRoles', label: 'управлять ролями', hint: 'создавать роли и выдавать их участникам' },
    ],
  },
  {
    label: 'модерация',
    perms: [
      { key: 'canDeleteMessages', label: 'удалять любые сообщения', hint: 'и закреплять чужие' },
      { key: 'canTimeout', label: 'выдавать тайм-аут', hint: 'временно запрещать писать' },
      { key: 'canKick', label: 'кикать участников', hint: 'выгнать — человек может вернуться' },
      { key: 'canBan', label: 'банить участников', hint: 'забанить — вход будет закрыт' },
    ],
  },
];

const EMPTY_PERMS: RolePermissions = {
  canManageChannels: false,
  canDeleteMessages: false,
  canManageRoles: false,
  canKick: false,
  canBan: false,
  canTimeout: false,
};

export function RolesModal() {
  const open = useUiStore((s) => s.rolesOpen);
  const close = useUiStore((s) => s.closeRoles);
  const roles = useChatStore((s) => s.roles);
  const setRoles = useChatStore((s) => s.setRoles);

  const sorted = [...roles].sort((a, b) => b.position - a.position);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; color: string; symbol: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = sorted.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (open) {
      setSelectedId((id) => id ?? sorted[0]?.id ?? null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-seed the editable fields when switching roles.
  useEffect(() => {
    if (selected) setDraft({ name: selected.name, color: selected.color, symbol: selected.symbol });
    else setDraft(null);
  }, [selectedId, selected?.name, selected?.color, selected?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  async function refresh() {
    setRoles(await api.getRoles());
  }

  async function run(fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      if (okMsg) toast(okMsg, 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'не получилось');
    } finally {
      setBusy(false);
    }
  }

  async function createRole() {
    setBusy(true);
    setError(null);
    try {
      // New roles land at the BOTTOM of the hierarchy (position 0); existing
      // roles keep their slots.
      const minPos = sorted.length ? Math.min(...sorted.map((r) => r.position)) : 0;
      const created = await api.createRole({
        name: 'новая роль',
        color: '#7d6fc4',
        symbol: '✦',
        position: Math.max(0, minPos - 1),
        ...EMPTY_PERMS,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'не получилось создать роль');
    } finally {
      setBusy(false);
    }
  }

  /** Swap hierarchy slots with the neighbour above/below. */
  async function move(role: Role, dir: -1 | 1) {
    const idx = sorted.findIndex((r) => r.id === role.id);
    const neighbour = sorted[idx + dir];
    if (!neighbour) return;
    await run(async () => {
      // Ensure distinct positions even if legacy roles share one.
      let a = role.position;
      let b = neighbour.position;
      if (a === b) (dir === -1 ? (a += 1) : (b += 1));
      await api.updateRole(role.id, { position: b });
      await api.updateRole(neighbour.id, { position: a });
    });
  }

  async function saveDraft() {
    if (!selected || !draft) return;
    await run(
      () =>
        api.updateRole(selected.id, {
          name: draft.name.trim() || selected.name,
          color: draft.color,
          symbol: draft.symbol.trim(),
        }),
      'роль сохранена',
    );
  }

  return (
    <div
      className="sx-overlay fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
      onClick={close}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="sx-pop flex h-[620px] max-h-[88vh] w-[820px] max-w-[94vw] overflow-hidden rounded-[18px]"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #14101f, #0a0812)',
          border: '1px solid rgba(180,160,240,0.18)',
          boxShadow: '0 36px 90px rgba(0,0,0,0.65), 0 0 60px rgba(125,111,196,0.15)',
        }}
      >
        {/* ── hierarchy list ─────────────────────────────────────────── */}
        <div
          className="flex w-[260px] shrink-0 flex-col"
          style={{ background: 'rgba(5,4,9,0.45)', borderRight: '1px solid rgba(180,160,240,0.1)' }}
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <span className="section-label">иерархия ролей</span>
            <button onClick={createRole} disabled={busy} className="icon-btn !h-7 !w-7" title="создать роль">
              <PlusIcon size={15} />
            </button>
          </div>
          <p className="px-4 pb-2 text-[10px] leading-4 text-text-muted">
            выше — старше. цвет и символ участника берутся из его высшей роли.
          </p>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {sorted.map((r, i) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="group flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 transition"
                style={
                  r.id === selectedId
                    ? { background: 'rgba(125,111,196,0.18)' }
                    : undefined
                }
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs"
                  style={{ background: `${r.color}22`, color: r.color, border: `1px solid ${r.color}66` }}
                >
                  {r.symbol || '•'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm" style={{ color: r.color }}>
                  {r.name}
                </span>
                <span className="hidden shrink-0 gap-0.5 group-hover:flex">
                  <button
                    disabled={busy || i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(r, -1);
                    }}
                    className="icon-btn !h-6 !w-6 disabled:opacity-20"
                    title="поднять"
                  >
                    ↑
                  </button>
                  <button
                    disabled={busy || i === sorted.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(r, 1);
                    }}
                    className="icon-btn !h-6 !w-6 disabled:opacity-20"
                    title="опустить"
                  >
                    ↓
                  </button>
                </span>
              </div>
            ))}
            {sorted.length === 0 && (
              <p className="px-3 py-4 text-xs text-text-muted">ролей пока нет — создай первую ↑</p>
            )}
          </div>
        </div>

        {/* ── editor ─────────────────────────────────────────────────── */}
        <div className="relative min-w-0 flex-1 overflow-y-auto p-6">
          <button
            onClick={close}
            className="absolute right-5 top-5 icon-btn"
            aria-label="закрыть"
            title="закрыть (esc)"
          >
            <CloseIcon size={16} />
          </button>

          {!selected || !draft ? (
            <div className="grid h-full place-items-center text-sm text-text-muted">
              выбери роль слева или создай новую
            </div>
          ) : (
            <>
              <h2 className="mb-5 text-lg font-semibold" style={{ color: draft.color }}>
                {draft.symbol} {draft.name || 'без названия'}
              </h2>

              <div className="mb-5 flex gap-2">
                <div className="w-20">
                  <label className="section-label mb-1.5 block">символ</label>
                  <input
                    value={draft.symbol}
                    onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
                    maxLength={4}
                    className="glass-input text-center"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="section-label mb-1.5 block">название</label>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    maxLength={32}
                    className="glass-input"
                  />
                </div>
                <div>
                  <label className="section-label mb-1.5 block">цвет</label>
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    className="h-10 w-14 cursor-pointer rounded-glass border border-glass-border bg-transparent"
                  />
                </div>
              </div>

              {PERM_GROUPS.map((g) => (
                <div key={g.label} className="mb-5">
                  <p className="section-label mb-2">{g.label}</p>
                  <div
                    className="divide-y divide-[rgba(180,160,240,0.08)] rounded-[12px]"
                    style={{ background: 'rgba(5,4,9,0.5)', border: '1px solid rgba(180,160,240,0.12)' }}
                  >
                    {g.perms.map((p) => (
                      <label
                        key={p.key}
                        className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm text-text-primary">{p.label}</span>
                          <span className="block text-[10px] text-text-muted">{p.hint}</span>
                        </span>
                        {/* toggle switch */}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(() => api.updateRole(selected.id, { [p.key]: !selected[p.key] }))
                          }
                          className="relative h-5 w-9 shrink-0 rounded-full transition"
                          style={{
                            background: selected[p.key] ? 'rgba(125,111,196,0.85)' : 'rgba(109,102,128,0.35)',
                          }}
                          role="switch"
                          aria-checked={selected[p.key]}
                        >
                          <span
                            className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                            style={{ left: selected[p.key] ? '18px' : '2px' }}
                          />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {error && <p className="mb-3 text-sm text-accent-pink">{error}</p>}

              <div className="flex items-center justify-between">
                <button
                  onClick={() =>
                    run(() => api.deleteRole(selected.id), 'роль удалена').then(() =>
                      setSelectedId(null),
                    )
                  }
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-glass px-3 py-2 text-sm text-accent-pink transition hover:bg-accent-pink/15"
                >
                  <TrashIcon size={14} /> удалить роль
                </button>
                <button onClick={saveDraft} disabled={busy} className="btn-accent px-7">
                  {busy ? '…' : 'сохранить'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
