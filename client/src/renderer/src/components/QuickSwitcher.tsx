// Ctrl+K quick switcher: fuzzy-jump to a text channel or a person (DM).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { useAuthStore } from '../store/auth';
import { displayName, nameColor } from '../lib/roles';
import { Avatar } from './Avatar';
import { HashIcon, SearchIcon } from './icons';

interface Item {
  key: string;
  kind: 'channel' | 'user';
  label: string;
  sub?: string;
  color?: string;
  avatarUrl?: string | null;
  action: () => void;
}

export function QuickSwitcher() {
  const open = useUiStore((s) => s.quickSwitcherOpen);
  const setOpen = useUiStore((s) => s.setQuickSwitcher);
  const showServer = useUiStore((s) => s.showServer);
  const openDm = useUiStore((s) => s.openDm);
  const channels = useChatStore((s) => s.channels);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const users = useChatStore((s) => s.users);
  const myId = useAuthStore((s) => s.user?.id);

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const chans: Item[] = channels
      .filter((c) => c.type === 'text')
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({
        key: `c:${c.id}`,
        kind: 'channel' as const,
        label: c.name,
        sub: c.topic ?? undefined,
        action: () => {
          showServer();
          setActiveChannel(c.id);
        },
      }));
    const people: Item[] = users
      .filter((u) => u.id !== myId)
      .filter(
        (u) =>
          !q ||
          u.username.toLowerCase().includes(q) ||
          (u.displayName ?? '').toLowerCase().includes(q),
      )
      .map((u) => ({
        key: `u:${u.id}`,
        kind: 'user' as const,
        label: displayName(u),
        sub: `@${u.username}`,
        color: nameColor(u),
        avatarUrl: u.avatarUrl,
        action: () => openDm(u.id),
      }));
    return [...chans, ...people].slice(0, 12);
  }, [open, query, channels, users, myId, showServer, setActiveChannel, openDm]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  function pick(item: Item | undefined) {
    if (!item) return;
    item.action();
    setOpen(false);
  }

  return (
    <div
      className="sx-overlay fixed inset-0 z-[70] flex justify-center bg-black/60 pt-[18vh]"
      onClick={() => setOpen(false)}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="sx-pop h-fit w-[460px] overflow-hidden rounded-[16px]"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, rgba(24,19,36,0.99), rgba(10,8,16,0.99))',
          border: '1px solid rgba(180,160,240,0.22)',
          boxShadow: '0 28px 70px rgba(0,0,0,0.65), 0 0 50px rgba(125,111,196,0.18)',
        }}
      >
        <div className="relative border-b border-glass-border">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon size={16} />
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter') pick(items[index]);
            }}
            placeholder="куда перейти? канал или человек…"
            className="w-full bg-transparent px-11 py-3.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>

        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-4 py-5 text-center text-xs text-text-muted">ничего не нашлось.</p>
          )}
          {items.map((item, i) => (
            <button
              key={item.key}
              onClick={() => pick(item)}
              onMouseEnter={() => setIndex(i)}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left"
              style={i === index ? { background: 'rgba(125,111,196,0.18)' } : undefined}
            >
              {item.kind === 'channel' ? (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-text-muted">
                  <HashIcon size={14} />
                </span>
              ) : (
                <Avatar username={item.label} avatarUrl={item.avatarUrl} size={28} color={item.color} />
              )}
              <span
                className="truncate text-sm"
                style={{ color: item.color ?? '#e2d8fa' }}
              >
                {item.label}
              </span>
              {item.sub && (
                <span className="ml-auto max-w-[40%] truncate text-[11px] text-text-muted">
                  {item.sub}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-glass-border px-4 py-2 text-[10px] text-text-muted">
          <span><span className="kbd">↑↓</span> навигация</span>
          <span><span className="kbd">enter</span> перейти</span>
          <span><span className="kbd">esc</span> закрыть</span>
        </div>
      </div>
    </div>
  );
}
