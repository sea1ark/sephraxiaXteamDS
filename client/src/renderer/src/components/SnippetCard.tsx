// Attachment card for shareable code files (.lua / .cfg / .ini / .txt …):
// download is the primary action; an expandable monospace preview with
// copy-all sits underneath. Built for neverlose / skeet luas & cfg dumps.
import { useEffect, useState } from 'react';
import type { Attachment } from '@sephraxia/shared';
import { CodeBlock } from './MessageContent';
import { copyText } from '../lib/clipboard';
import { downloadFile } from '../lib/download';
import { ChevronDownIcon } from './icons';

export const SNIPPET_EXTENSIONS = ['.lua', '.cfg', '.ini', '.txt', '.log', '.json', '.md'];
const MAX_PREVIEW_BYTES = 256 * 1024;

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
  const [error, setError] = useState(false);

  const ext = attachment.name.toLowerCase().split('.').pop() ?? '';

  async function load(): Promise<string | null> {
    if (text !== null) return text;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error();
      const body = (await res.text()).slice(0, MAX_PREVIEW_BYTES);
      setText(body);
      return body;
    } catch {
      setError(true);
      return null;
    }
  }

  async function copyAll(e: React.MouseEvent) {
    e.stopPropagation();
    const body = await load();
    if (body !== null) copyText(body, 'код скопирован');
  }

  useEffect(() => {
    if (open && text === null && !error) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div
      className="w-[460px] max-w-full overflow-hidden rounded-[12px]"
      style={{ background: 'rgba(10,8,16,0.7)', border: '1px solid rgba(180,160,240,0.18)' }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[10px] font-bold"
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

        {/* primary: download */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            downloadFile(src, attachment.name);
          }}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-text-heading transition hover:brightness-110"
          style={{
            background: 'linear-gradient(135deg, rgba(125,111,196,0.9), rgba(212,83,126,0.8))',
            textTransform: 'none',
          }}
          title="скачать файл"
        >
          ↓ скачать
        </button>

        {/* secondary: copy-all */}
        <button
          onClick={copyAll}
          className="icon-btn !h-8 !w-8 shrink-0"
          title="скопировать содержимое"
        >
          ⧉
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          className={`icon-btn !h-8 !w-8 shrink-0 ${open ? 'active' : ''}`}
          title={open ? 'свернуть превью' : 'показать код'}
        >
          <span
            className="grid transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : undefined }}
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
