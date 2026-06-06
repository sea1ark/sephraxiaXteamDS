import { useEffect, useRef, useState } from 'react';
import type { UpdaterStatus } from '@sephraxia/shared';

const fmtMB = (n: number): string => `${(n / 1048576).toFixed(1)} МБ`;
const fmtSpeed = (n: number): string => `${(n / 1048576).toFixed(1)} МБ/с`;

// Bottom-right glass card that surfaces auto-update progress: a live progress
// bar while downloading and a "Restart" button once the update is ready. Driven
// entirely by status the main process pushes over IPC.
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus>({ state: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const lastState = useRef<UpdaterStatus['state']>('idle');

  useEffect(() => {
    const updater = window.sephraxia.updater;
    updater
      .current()
      .then((s) => {
        lastState.current = s.state;
        setStatus(s);
      })
      .catch(() => {});
    return updater.onStatus((s) => {
      // Re-surface the card if it was dismissed and an update just finished.
      if (s.state === 'downloaded' && lastState.current !== 'downloaded') setDismissed(false);
      lastState.current = s.state;
      setStatus(s);
    });
  }, []);

  if (dismissed) return null;
  // Stay out of the way while idle / checking / already up to date.
  if (status.state === 'idle' || status.state === 'none' || status.state === 'checking') return null;

  const downloaded = status.state === 'downloaded';
  const error = status.state === 'error';
  const percent =
    status.state === 'progress' ? Math.round(status.percent) : downloaded ? 100 : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-glass border border-glass-border bg-[#0c0a16]/90 p-4 shadow-glow-violet backdrop-blur-glass">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-text-heading">
            {error ? 'Ошибка обновления' : downloaded ? 'Обновление готово' : 'Загрузка обновления'}
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            {error
              ? status.message || 'Не удалось загрузить обновление'
              : status.state === 'available'
                ? `Версия ${status.version}`
                : status.state === 'progress'
                  ? `Версия ${status.version} · ${fmtMB(status.transferred)} / ${fmtMB(status.total)} · ${fmtSpeed(status.bytesPerSecond)}`
                  : downloaded
                    ? `Версия ${status.version} установится после перезапуска`
                    : ''}
          </div>
        </div>
        {(error || downloaded) && (
          <button
            onClick={() => setDismissed(true)}
            aria-label="закрыть"
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-text-muted hover:bg-white/5 hover:text-text-primary"
          >
            ✕
          </button>
        )}
      </div>

      {!error && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-violet to-accent-pink transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs tabular-nums text-text-muted">{error ? '' : `${percent}%`}</span>
        {downloaded && (
          <button
            onClick={() => window.sephraxia.updater.restart()}
            className="rounded-md bg-accent-violet/20 px-3 py-1 text-xs font-medium text-text-heading hover:bg-accent-violet/30 hover:shadow-glow-violet"
          >
            Перезапустить
          </button>
        )}
      </div>
    </div>
  );
}
