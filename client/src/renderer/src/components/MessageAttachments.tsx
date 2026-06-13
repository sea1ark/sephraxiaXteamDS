// Renders a message's attachments: images open the in-app lightbox, audio and
// video play inline (with native volume controls), and anything else is a
// download chip. Nothing here navigates to an external browser.
import type { Attachment } from '@sephraxia/shared';
import { useUiStore, type MediaKind } from '../store/ui';
import { resolveAssetUrl } from '../lib/config';
import { SnippetCard, isSnippet } from './SnippetCard';

function mediaKind(type: string): MediaKind | null {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

export function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const openMedia = useUiStore((s) => s.openMedia);
  if (!attachments.length) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {attachments.map((a) => {
        const kind = mediaKind(a.type);
        const src = resolveAssetUrl(a.url) ?? a.url;

        if (kind === 'image') {
          return (
            <button
              key={a.url}
              onClick={() => openMedia({ kind: 'image', url: src, name: a.name })}
              className="block overflow-hidden rounded-glass"
              style={{ border: '1px solid rgba(180,160,240,0.14)' }}
              title={a.name}
            >
              <img
                src={src}
                alt={a.name}
                className="max-h-72 max-w-[min(100%,420px)] object-contain transition hover:opacity-90"
              />
            </button>
          );
        }

        if (kind === 'video') {
          return (
            <div
              key={a.url}
              className="relative overflow-hidden rounded-glass"
              style={{ border: '1px solid rgba(180,160,240,0.14)' }}
            >
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={src}
                controls
                preload="metadata"
                className="max-h-72 max-w-[min(100%,420px)]"
              />
              <button
                onClick={() => openMedia({ kind: 'video', url: src, name: a.name })}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md text-text-heading"
                style={{ background: 'rgba(0,0,0,0.55)' }}
                title="expand"
              >
                ⛶
              </button>
            </div>
          );
        }

        if (kind === 'audio') {
          return (
            <div
              key={a.url}
              className="w-[300px] max-w-full rounded-glass p-2"
              style={{ background: 'rgba(10,8,16,0.6)', border: '1px solid rgba(180,160,240,0.14)' }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span>🎵</span>
                <span className="truncate text-xs text-text-primary">{a.name}</span>
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={src} controls preload="metadata" className="w-full" />
            </div>
          );
        }

        // Shareable code/config files render as an expandable snippet card.
        if (isSnippet(a)) {
          return <SnippetCard key={a.url} attachment={a} src={src} />;
        }

        // Non-media: a download chip (opens in the browser / downloads).
        return (
          <a
            key={a.url}
            href={src}
            target="_blank"
            rel="noreferrer noopener"
            download={a.name}
            className="flex items-center gap-2 rounded-glass px-3 py-2 text-sm text-text-primary transition hover:text-accent-violet"
            style={{ background: 'rgba(10,8,16,0.6)', border: '1px solid rgba(180,160,240,0.14)' }}
          >
            <span className="text-lg">📄</span>
            <span className="min-w-0">
              <span className="block max-w-[220px] truncate">{a.name}</span>
              <span className="block text-[10px] text-text-muted">{formatSize(a.size)}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}
