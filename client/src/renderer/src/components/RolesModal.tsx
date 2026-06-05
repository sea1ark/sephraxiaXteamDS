import { useState } from 'react';
import type { Role, RolePermissions } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';

const PERMS: { key: keyof RolePermissions; label: string }[] = [
  { key: 'canManageChannels', label: 'manage channels' },
  { key: 'canDeleteMessages', label: 'delete any message' },
  { key: 'canManageRoles', label: 'manage roles' },
  { key: 'canKick', label: 'kick members' },
  { key: 'canBan', label: 'ban members' },
  { key: 'canTimeout', label: 'timeout members' },
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

  const [name, setName] = useState('');
  const [color, setColor] = useState('#7d6fc4');
  const [symbol, setSymbol] = useState('✦');
  const [perms, setPerms] = useState<RolePermissions>({ ...EMPTY_PERMS });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function refresh() {
    setRoles(await api.getRoles());
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createRole({ name: name.trim(), color, symbol: symbol.trim(), ...perms });
      await refresh();
      setName('');
      setSymbol('✦');
      setPerms({ ...EMPTY_PERMS });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not create role');
    } finally {
      setBusy(false);
    }
  }

  async function togglePerm(role: Role, key: (typeof PERMS)[number]['key'], value: boolean) {
    await api.updateRole(role.id, { [key]: value });
    await refresh();
  }

  async function remove(role: Role) {
    await api.deleteRole(role.id);
    await refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50"
      onClick={close}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="glass max-h-[80vh] w-[460px] overflow-y-auto rounded-glass p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="heading-glow mb-5 text-lg font-semibold tracking-[0.15em]">manage roles</h2>

        {/* existing roles */}
        <div className="mb-6 space-y-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-glass p-3" style={{ background: 'rgba(125,111,196,0.06)' }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold" style={{ color: r.color }}>
                  {r.symbol} {r.name}
                </span>
                <button
                  onClick={() => remove(r)}
                  className="text-[11px] text-text-muted hover:text-accent-pink"
                >
                  delete
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                {PERMS.map((p) => (
                  <label key={p.key} className="flex items-center gap-1.5 text-xs text-text-primary">
                    <input
                      type="checkbox"
                      checked={r[p.key]}
                      onChange={(e) => togglePerm(r, p.key, e.target.checked)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {roles.length === 0 && <p className="text-sm text-text-muted">no roles yet — create one below.</p>}
        </div>

        {/* create role */}
        <form onSubmit={create} className="border-t border-glass-border pt-4">
          <p className="section-label mb-3">new role</p>
          <div className="mb-3 flex gap-2">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="✦"
              className="glass-input w-14 text-center"
              maxLength={4}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="role name"
              className="glass-input flex-1"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-12 cursor-pointer rounded-glass border border-glass-border bg-transparent"
              title="role color"
            />
          </div>
          <div className="mb-3 flex flex-wrap gap-3">
            {PERMS.map((p) => (
              <label key={p.key} className="flex items-center gap-1.5 text-xs text-text-primary">
                <input
                  type="checkbox"
                  checked={perms[p.key]}
                  onChange={(e) => setPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                />
                {p.label}
              </label>
            ))}
          </div>
          {error && <p className="mb-3 text-sm text-accent-pink">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-glass px-4 py-2 text-text-muted hover:text-text-primary">
              close
            </button>
            <button type="submit" disabled={busy || !name.trim()} className="btn-accent">
              {busy ? '…' : 'create role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
