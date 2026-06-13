// @username mention autocomplete for the composers. Detects an @token being
// typed (at the caret / end of the draft), offers matching members, and inserts
// "@username " on select. Keyboard-navigable; the host composer routes keys to
// handleKeyDown first and only sends on Enter when the popup is closed.
import { useMemo, useState } from 'react';
import type { PublicUser } from '@sephraxia/shared';
import { displayName, personalColor } from '../lib/roles';
import { Avatar } from './Avatar';

const TOKEN = /(^|\s)@([a-zA-Z0-9_.-]*)$/;

export function useMentions(
  draft: string,
  setDraft: (v: string) => void,
  candidates: PublicUser[],
  inputRef: React.RefObject<HTMLTextAreaElement>,
) {
  const [index, setIndex] = useState(0);

  // Active @token = the @word immediately before the caret (or end of draft).
  const caret = inputRef.current?.selectionStart ?? draft.length;
  const head = draft.slice(0, caret);
  const m = TOKEN.exec(head);
  const query = m ? m[2].toLowerCase() : null;

  const matches = useMemo(() => {
    if (query === null) return [];
    return candidates
      .filter(
        (u) =>
          u.username.toLowerCase().includes(query) ||
          (u.displayName ?? '').toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [query, candidates]);

  const open = query !== null && matches.length > 0;

  function choose(u: PublicUser) {
    const before = head.replace(TOKEN, `$1@${u.username} `);
    const after = draft.slice(caret);
    const next = before + after;
    setDraft(next);
    // Restore caret right after the inserted mention.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        const pos = before.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
    setIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent): boolean {
    if (!open) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (i + 1) % matches.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (i - 1 + matches.length) % matches.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      choose(matches[Math.min(index, matches.length - 1)]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      return true;
    }
    return false;
  }

  return { open, matches, index, setIndex, choose, handleKeyDown };
}

export function MentionPopup({
  matches,
  index,
  onPick,
}: {
  matches: PublicUser[];
  index: number;
  onPick: (u: PublicUser) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div
      className="sx-menu absolute bottom-full left-0 z-40 mb-2 w-72 overflow-hidden rounded-[12px]"
      style={{
        background: 'linear-gradient(180deg, rgba(24,19,36,0.99), rgba(10,8,16,0.99))',
        border: '1px solid rgba(180,160,240,0.22)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
      }}
    >
      <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-widest text-text-muted">участники</p>
      <div className="pb-1.5">
        {matches.map((u, i) => (
          <button
            key={u.id}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(u);
            }}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
            style={i === index ? { background: 'rgba(125,111,196,0.18)' } : undefined}
          >
            <Avatar username={displayName(u)} avatarUrl={u.avatarUrl} size={22} color={personalColor(u)} />
            <span className="truncate text-sm text-text-primary">{displayName(u)}</span>
            <span className="ml-auto truncate text-[11px] text-text-muted">@{u.username}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
