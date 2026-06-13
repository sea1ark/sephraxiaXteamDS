// Right-click menu for a channel: rename (inline), delete, copy id. Rename and
// delete are gated by canManageChannels; the live channels:changed broadcast
// refreshes every client.
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { useUiStore } from '../store/ui';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { SpeakerIcon } from './icons';

export function ChannelContextMenu() {
  const menu = useUiStore((s) => s.channelMenu);
  const close = useUiStore((s) => s.closeChannelMenu);
  const channel = useChatStore((s) => s.channels.find((c) => c.id === menu?.channelId));
  const activeId = useChatStore((s) => s.activeChannelId);
  const setActive = useChatStore((s) => s.setActiveChannel);
  const setChannels = useChatStore((s) => s.setChannels);
  const canManage = !!useAuthStore((s) => s.permissions?.canManageChannels);

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRenaming(false);
    setConfirmDelete(false);
    setError(null);
    setName(channel?.name ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.channelId]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, close]);

  if (!menu || !channel) return null;

  const width = 220;
  const left = Math.min(menu.x, window.innerWidth - width - 8);
  const top = Math.min(menu.y, window.innerHeight - 220);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !channel) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateChannel(channel.id, { name: trimmed });
      setChannels(await api.getChannels());
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not rename');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!channel) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteChannel(channel.id);
      const next = await api.getChannels();
      setChannels(next);
      if (activeId === channel.id) setActive(next.find((c) => c.type !== 'voice')?.id ?? null);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not delete');
    } finally {
      setBusy(false);
    }
  }

  const Item = ({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) => (
    <button
      disabled={busy}
      onClick={onClick}
      className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition disabled:opacity-40 ${
        danger ? 'text-accent-pink hover:bg-accent-pink/15' : 'text-text-primary hover:bg-[rgba(125,111,196,0.15)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-[55]" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div
        className="sx-menu glass fixed z-[56] w-[220px] rounded-glass p-1.5"
        style={{ left, top, boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 border-b border-glass-border px-3 py-1.5 text-xs font-semibold text-text-heading">
          {channel.type === 'voice' ? <SpeakerIcon size={14} /> : <span>#</span>}
          <span className="truncate">{channel.name}</span>
        </div>

        {renaming ? (
          <form onSubmit={rename} className="p-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="glass-input text-sm"
              placeholder="channel name"
            />
            <div className="mt-1 text-[11px] text-text-muted">enter to save · esc to cancel</div>
          </form>
        ) : confirmDelete ? (
          <div className="p-2">
            <p className="mb-2 px-1 text-sm text-text-primary">
              delete <span className="font-semibold">{channel.name}</span>?
            </p>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={remove}
                className="flex-1 rounded-md bg-accent-pink/80 px-3 py-1.5 text-sm text-text-heading hover:bg-accent-pink disabled:opacity-50"
              >
                {busy ? '…' : 'delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-md px-3 py-1.5 text-sm text-text-muted"
                style={{ background: 'rgba(125,111,196,0.1)' }}
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 space-y-0.5">
            {canManage && <Item label="rename" onClick={() => setRenaming(true)} />}
            <Item
              label="copy channel id"
              onClick={() => {
                copyText(channel.id, "id скопирован");
                close();
              }}
            />
            {canManage && <Item label="delete channel" danger onClick={() => setConfirmDelete(true)} />}
          </div>
        )}

        {error && <p className="px-3 py-1.5 text-xs text-accent-pink">{error}</p>}
      </div>
    </>
  );
}
