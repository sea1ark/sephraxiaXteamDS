// Bottom-right card surfacing auto-update status. While downloading it shows a
// live progress bar; once ready (or anytime there's an update) clicking the
// card force-applies it — installs + relaunches immediately, without relying on
// the install-on-quit hook (which is skipped if the app is force-killed).
import { useState } from 'react';
import { useUpdater } from '../lib/useUpdater';

const fmtMB = (n: number): string => `${(n / 1048576).toFixed(1)} МБ`;

export function UpdateBanner() {
  const { status, version, downloaded, downloading, percent, hasUpdate, install } = useUpdater();
  const [dismissed, setDismissed] = useState(false);

  const error = status.state === 'error';
  if (!hasUpdate && !error) return null;
  if (dismissed && !downloaded) return null; // a ready update keeps nagging

  const title = error
    ? 'Ошибка обновления'
    : downloaded
      ? 'Обновление готово'
      : 'Загрузка обновления';

  const subtitle = error
    ? status.message || 'Не удалось загрузить обновление'
    : downloaded
      ? `v${version} · нажмите, чтобы установить`
      : status.state === 'progress'
        ? `v${version} · ${fmtMB(status.transferred)} / ${fmtMB(status.total)}`
        : `v${version ?? ''}`;

  return (
    <div className="sx-slide-up fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-glass border border-accent-violet/40 bg-[#0c0a16]/95 shadow-glow-violet backdrop-blur-glass">
      <button
        onClick={error ? () => window.sephraxia.updater.check() : install}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-accent-violet/10"
        title={downloaded ? 'установить и перезапустить' : 'обновить'}
      >
        <span className="text-xl">{error ? '⚠️' : downloaded ? '✅' : '🔄'}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-heading">{title}</span>
          <span className="block truncate text-xs text-text-muted">{subtitle}</span>
        </span>
        {(downloaded || error) && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            role="button"
            aria-label="закрыть"
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-text-muted hover:bg-white/5 hover:text-text-primary"
          >
            ✕
          </span>
        )}
      </button>

      {downloading && (
        <div className="h-1.5 w-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-accent-violet to-accent-pink transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {downloaded && (
        <div className="px-4 pb-3">
          <button
            onClick={install}
            className="w-full rounded-md bg-accent-violet/25 py-1.5 text-xs font-semibold text-text-heading transition hover:bg-accent-violet/40 hover:shadow-glow-violet"
          >
            Обновить и перезапустить
          </button>
        </div>
      )}
    </div>
  );
}
