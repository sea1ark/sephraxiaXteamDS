// Floating panels under the chat header: pinned messages and message search.
// Both render message previews; clicking one jumps to it in the channel.
import { useEffect, useRef, useState } from 'react';
import type { Message } from '@sephraxia/shared';
import { api } from '../lib/api';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { displayName } from '../lib/roles';
import { Avatar } from './Avatar';
import { SearchIcon, CloseIcon, PinIcon } from './icons';

function ResultRow({ message, onJump }: { message: Message; onJump: () => void }) {
  const author = message.author;
  return (
    <button
      onClick={onJump}
      className="flex w-full items-start gap-2.5 rounded-[10px] px-3 py-2 text-left transition hover:bg-white/5"
    >
      <Avatar username={displayName(author)} avatarUrl={author?.avatarUrl} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold text-text-heading">
            {displayName(author)}
          </span>
          <span className="shrink-0 text-[10px] text-text-muted">
            {new Date(message.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}{' '}
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="line-clamp-2 break-words text-xs text-text-primary">
          {message.content || '(вложение)'}
        </p>
      </div>
    </button>
  );
}

export function PinsPanel() {
  const activeId = useChatStore((s) => s.activeChannelId);
  const closePanel = useUiStore((s) => s.closeChatPanel);
  const requestJump = useUiStore((s) => s.requestJump);
  const messages = useChatStore((s) => (activeId ? s.messagesByChannel[activeId] : undefined));
  const [pins, setPins] = useState<Message[] | null>(null);

  // Refetch when opened and whenever the channel's messages change (a pin /
  // unpin arrives as message:update, so this stays live).
  useEffect(() => {
    if (!activeId) return;
    api.getPins(activeId).then(setPins).catch(() => setPins([]));
  }, [activeId, messages]);

  if (!activeId) return null;
  return (
    <div className="chat-panel sx-menu">
      <div className="flex items-center justify-between border-b border-glass-border px-4 py-2.5">
        <span className="section-label flex items-center gap-1.5">
          <PinIcon size={12} /> закреплённые
        </span>
        <button onClick={closePanel} className="icon-btn !h-6 !w-6" aria-label="закрыть">
          <CloseIcon size={13} />
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {pins === null && <p className="px-3 py-4 text-xs text-text-muted">загрузка…</p>}
        {pins?.length === 0 && (
          <p className="px-3 py-4 text-xs text-text-muted">
            пока пусто. наведи на сообщение и нажми иконку булавки.
          </p>
        )}
        {pins?.map((m) => (
          <ResultRow
            key={m.id}
            message={m}
            onJump={() => requestJump({ channelId: m.channelId, messageId: m.id })}
          />
        ))}
      </div>
    </div>
  );
}

export function SearchPanel() {
  const activeId = useChatStore((s) => s.activeChannelId);
  const closePanel = useUiStore((s) => s.closeChatPanel);
  const requestJump = useUiStore((s) => s.requestJump);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const channels = useChatStore((s) => s.channels);

  const [query, setQuery] = useState('');
  const [scopeAll, setScopeAll] = useState(false);
  const [results, setResults] = useState<Message[] | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search-as-you-type.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    debounce.current = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await api.searchMessages(q, scopeAll ? undefined : activeId ?? undefined));
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, scopeAll, activeId]);

  function jump(m: Message) {
    if (m.channelId !== activeId) setActiveChannel(m.channelId);
    requestJump({ channelId: m.channelId, messageId: m.id });
  }

  function channelName(id: string) {
    return channels.find((c) => c.id === id)?.name ?? '?';
  }

  return (
    <div className="chat-panel sx-menu">
      <div className="border-b border-glass-border p-2.5">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon size={14} />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && closePanel()}
            placeholder="поиск сообщений…"
            className="glass-input !py-1.5 pl-9 pr-8 text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              aria-label="очистить"
            >
              <CloseIcon size={13} />
            </button>
          )}
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-1.5 px-1 text-[11px] text-text-muted">
          <input
            type="checkbox"
            checked={scopeAll}
            onChange={(e) => setScopeAll(e.target.checked)}
          />
          искать во всех каналах
        </label>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {busy && <p className="px-3 py-3 text-xs text-text-muted">ищу…</p>}
        {!busy && results === null && (
          <p className="px-3 py-4 text-xs text-text-muted">введи минимум 2 символа.</p>
        )}
        {!busy && results?.length === 0 && (
          <p className="px-3 py-4 text-xs text-text-muted">ничего не нашлось.</p>
        )}
        {!busy &&
          results?.map((m) => (
            <div key={m.id}>
              {scopeAll && (
                <p className="px-3 pt-1 text-[10px] text-accent-violet"># {channelName(m.channelId)}</p>
              )}
              <ResultRow message={m} onJump={() => jump(m)} />
            </div>
          ))}
      </div>
    </div>
  );
}
