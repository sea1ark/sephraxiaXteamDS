// Add-server modal: create your own server or join one by invite code.
// Opened from the + button on the far-left rail.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../lib/api';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { toast } from '../store/toasts';

type Tab = 'create' | 'join';

/** Refetch servers + channels (used after create/join/leave/delete). */
export async function refreshServers(): Promise<void> {
  const [servers, channels] = await Promise.all([api.getServers(), api.getChannels()]);
  const store = useChatStore.getState();
  store.setServers(servers);
  store.setChannels(channels);
}

export function ServerModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const server =
        tab === 'create'
          ? await api.createServer(name.trim(), icon.trim() || undefined)
          : await api.joinServer(code.trim());
      await refreshServers();
      const chat = useChatStore.getState();
      chat.setActiveServer(server.id);
      useUiStore.getState().showServer();
      toast(tab === 'create' ? 'сервер создан ✦' : `добро пожаловать на ${server.name}`, 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'что-то пошло не так');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = tab === 'create' ? name.trim().length > 0 : code.trim().length >= 4;

  return createPortal(
    <div className="sx-overlay fixed inset-0 z-50 grid place-items-center bg-black/60" onClick={onClose}>
      <div
        className="sx-pop glass flex w-[400px] flex-col rounded-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
          <span className="heading-glow text-sm font-semibold tracking-[0.12em]">add a server</span>
          <button onClick={onClose} className="text-text-muted transition hover:text-accent-pink">
            ✕
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 px-4 pt-3">
          {(['create', 'join'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className="flex-1 rounded-glass px-3 py-1.5 text-xs font-semibold transition"
              style={
                tab === t
                  ? { background: 'rgba(125,111,196,0.25)', color: '#e2d8fa' }
                  : { color: 'rgba(190,180,220,0.55)' }
              }
            >
              {t === 'create' ? 'создать свой' : 'войти по инвайту'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3 p-4">
          {tab === 'create' ? (
            <>
              <div>
                <p className="section-label mb-1.5">название сервера</p>
                <input
                  autoFocus
                  value={name}
                  maxLength={48}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="мой сервер"
                  className="glass-input text-sm"
                />
              </div>
              <div>
                <p className="section-label mb-1.5">иконка (эмодзи, необязательно)</p>
                <input
                  value={icon}
                  maxLength={4}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="✦"
                  className="glass-input text-sm"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-text-muted">
                ты станешь владельцем — свои каналы, свой инвайт-код, свои участники.
              </p>
            </>
          ) : (
            <>
              <div>
                <p className="section-label mb-1.5">инвайт-код</p>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="вставь код приглашения"
                  className="glass-input text-sm"
                  style={{ textTransform: 'none' }}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-text-muted">
                код можно получить у владельца сервера (пкм по серверу → copy invite).
              </p>
            </>
          )}

          {error && <p className="text-xs text-accent-pink">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="w-full rounded-glass px-4 py-2 text-sm font-semibold text-text-heading transition hover:brightness-110 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#7d6fc4,#d4537e)' }}
          >
            {busy ? '…' : tab === 'create' ? 'создать сервер' : 'присоединиться'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
