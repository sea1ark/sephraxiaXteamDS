// Compact curated emoji picker used for reactions and the composer.
// Anchored popover; closes on outside click / Esc.
import { useEffect, useRef } from 'react';

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'часто',
    emojis: ['👍', '❤️', '😂', '💀', '🔥', '😭', '✨', '👀', '😈', '🥀', '🖤', '⛓️'],
  },
  {
    label: 'лица',
    emojis: [
      '😀', '😄', '😅', '🤣', '🙂', '😉', '😊', '😍', '😘', '😋', '😜', '🤪',
      '🤔', '🤨', '😐', '😴', '🥱', '😏', '😒', '🙄', '😬', '😳', '🥺', '😢',
      '😡', '🤬', '🤯', '😱', '😨', '😎', '🤓', '🤡', '👻', '☠️', '👽', '🤖',
    ],
  },
  {
    label: 'жесты',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤘', '🤙', '👏', '🙌', '🙏', '💪', '🖕'],
  },
  {
    label: 'вайб',
    emojis: ['🖤', '💜', '🩸', '🥀', '🌙', '⭐', '✨', '⚡', '🔮', '🕯️', '⛓️', '🗡️', '🩻', '🫀', '🕸️', '🦇'],
  },
  {
    label: 'разное',
    emojis: ['🎉', '🎊', '🎵', '🎮', '💤', '💢', '💯', '🚀', '🍕', '☕', '🍷', '🚬'],
  },
];

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '💀', '🔥', '😭'];

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Position the popover (fixed coords). */
  x: number;
  y: number;
  /** Open upward from (x, y) instead of downward. */
  up?: boolean;
}

export function EmojiPicker({ onPick, onClose, x, y, up }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp so the popover never leaves the window.
  const width = 296;
  const height = 320;
  const left = Math.min(Math.max(8, x - (up ? width : 0)), window.innerWidth - width - 8);
  const top = up
    ? Math.max(8, y - height - 8)
    : Math.min(y + 8, window.innerHeight - height - 8);

  return (
    <div
      ref={ref}
      className="sx-menu fixed z-[80] flex flex-col overflow-hidden rounded-[14px]"
      style={{
        left,
        top,
        width,
        height,
        background: 'linear-gradient(180deg, rgba(24,19,36,0.99), rgba(10,8,16,0.99))',
        border: '1px solid rgba(180,160,240,0.2)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.6), 0 0 30px rgba(125,111,196,0.15)',
      }}
    >
      <div className="flex gap-1.5 border-b border-glass-border px-3 py-2">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className="grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:bg-white/10"
          >
            {e}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="section-label mb-1">{cat.label}</p>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.emojis.map((e) => (
                <button
                  key={e}
                  onClick={() => onPick(e)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:bg-white/10"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
