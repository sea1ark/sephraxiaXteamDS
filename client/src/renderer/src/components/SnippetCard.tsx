// Attachment card for shareable code files (.lua / .cfg / .ini / .txt …):
// fetches the file text, shows a collapsible monospace preview, and offers
// one-click "copy whole file" + download. Built for neverlose / gamesense
// luas and cfg dumps.
import { useEffect, useState } from 'react';
import type { Attachment } from '@sephraxia/shared';
import { CodeBlock } from './MessageContent';
import { ChevronDownIcon } from './icons';

export const SNIPPET_EXTENSIONS = ['.lua', '.cfg', '.ini', '.txt', '.log', '.json', '.md'];
const MAX_PREVIEW_BYTES = 256 * 1024; // don't fetch huge dumps

export function isSnippet(a: Attachment): boolean {
  const lower = a.name.toLowerCase();
  return SNIPPET_EXTENSIONS.some((ext) => lower.endsWith(ext)) && a.size <= MAX_PREVIEW_BYTES * 4;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

export function SnippetCard({ attachment, src }: { attachment: Attachment; src: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const ext = attachment.name.toLowerCase().split('.').pop() ?? '';

  // Fetch lazily — only when expanded or when copying.
  async function load(): Promise<string | null> {
    if (text !== null) return text;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error();
      const body = await res.text();
      const clipped = body.slice(0, MAX_PREVIEW_BYTES);
      setText(clipped);
      return clipped;
    } catch {
      setError(true);
      return null;
    }
  }

  async function copyAll(e: React.MouseEvent) {
    e.stopPropagation();
    const body = await load();
    if (body === null) return;
    navigator.clipboard
      ?.writeText(body)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (open && text === null && !error) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div
      className="w-[440px] max-w-full overflow-hidden rounded-[10px]"
      style={{ background: 'rgba(10,8,16,0.7)', border: '1px solid rgba(180,160,240,0.18)' }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* file-type badge */}
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[10px] font-bold uppercase"
          style={{
            background: ext === 'lua' ? 'rgba(62,123,219,0.18)' : 'rgba(125,111,196,0.15)',
            color: ext === 'lua' ? '#7ea7ff' : '#b9aef0',
            border: '1px solid rgba(180,160,240,0.25)',
            textTransform: 'none',
          }}
        >
          .{ext}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text-primary" style={{ textTransform: 'none' }}>
            {attachment.name}
          </p>
          <p className="text-[10px] text-text-muted">{formatSize(attachment.size)}</p>
        </div>
        <button
          onClick={copyAll}
          className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold transition"
          style={{
            color: copied ? '#3edb86' : '#b9aef0',
            background: copied ? 'rgba(62,219,134,0.12)' : 'rgba(125,111,196,0.15)',
            border: `1px solid ${copied ? 'rgba(62,219,134,0.4)' : 'rgba(125,111,196,0.35)'}`,
            textTransform: 'none',
          }}
          title="скопировать весь файл в буфер"
        >
          {copied ? '✓' : 'copy'}
        </button>
        <a
          href={src}
          download={attachment.name}
          className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold text-text-muted transition hover:text-text-primary"
          style={{ background: 'rgba(125,111,196,0.08)', border: '1px solid rgba(180,160,240,0.2)' }}
          title="скачать файл"
        >
          ↓
        </a>
        <button
          onClick={() => setOpen((v) => !v)}
          className="icon-btn !h-7 !w-7 shrink-0"
          title={open ? 'свернуть' : 'показать код'}
        >
          <span
            className="transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : undefined, display: 'grid' }}
          >
            <ChevronDownIcon size={15} />
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-glass-border px-2 pb-2 pt-1">
          {error && <p className="px-2 py-2 text-xs text-accent-pink">не удалось загрузить файл.</p>}
          {!error && text === null && <p className="px-2 py-2 text-xs text-text-muted">загрузка…</p>}
          {text !== null && <CodeBlock code={text} name={attachment.name} />}
        </div>
      )}
    </div>
  );
}
