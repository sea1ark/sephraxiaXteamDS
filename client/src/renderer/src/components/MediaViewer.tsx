// Fullscreen in-app lightbox for images, video, and audio. Opened from any
// attachment so media never kicks the user out to the browser.
import { useEffect } from 'react';
import { useUiStore } from '../store/ui';

export function MediaViewer() {
  const media = useUiStore((s) => s.media);
  const close = useUiStore((s) => s.closeMedia);

  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [media, close]);

  if (!media) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/80 backdrop-blur-sm"
      onClick={close}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="relative max-h-[90vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        {media.kind === 'image' && (
          <img
            src={media.url}
            alt={media.name}
            className="max-h-[90vh] max-w-[92vw] rounded-glass object-contain"
            style={{ boxShadow: '0 0 60px rgba(125,111,196,0.35)' }}
          />
        )}

        {media.kind === 'video' && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={media.url}
            controls
            autoPlay
            className="max-h-[90vh] max-w-[92vw] rounded-glass"
            style={{ boxShadow: '0 0 60px rgba(125,111,196,0.35)' }}
          />
        )}

        {media.kind === 'audio' && (
          <div
            className="glass w-[420px] max-w-[92vw] rounded-glass p-6"
            style={{ boxShadow: '0 0 60px rgba(125,111,196,0.35)' }}
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="text-3xl">🎵</span>
              <span className="truncate text-sm text-text-primary">{media.name}</span>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={media.url} controls autoPlay className="w-full" />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="truncate text-xs text-text-muted">{media.name}</span>
          <div className="flex items-center gap-2">
            <a
              href={media.url}
              download={media.name}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-glass px-3 py-1 text-xs text-text-muted transition hover:text-accent-violet"
              style={{ background: 'rgba(125,111,196,0.12)' }}
              onClick={(e) => e.stopPropagation()}
            >
              download
            </a>
            <button
              onClick={close}
              className="rounded-glass px-3 py-1 text-xs text-text-muted transition hover:text-accent-pink"
              style={{ background: 'rgba(125,111,196,0.12)' }}
            >
              close (esc)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
