// Subscribes to auto-update status pushed from the main process and exposes a
// force-apply action. Used by both the login screen and the in-app banner.
import { useEffect, useState } from 'react';
import type { UpdaterStatus } from '@sephraxia/shared';

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>({ state: 'idle' });

  useEffect(() => {
    const u = window.sephraxia.updater;
    u.current().then(setStatus).catch(() => {});
    return u.onStatus(setStatus);
  }, []);

  const version = 'version' in status ? status.version : undefined;
  const downloaded = status.state === 'downloaded';
  const downloading = status.state === 'available' || status.state === 'progress';
  const percent = status.state === 'progress' ? Math.round(status.percent) : downloaded ? 100 : 0;

  return {
    status,
    version,
    downloaded,
    downloading,
    percent,
    /** Show any update affordance (available / downloading / ready). */
    hasUpdate: downloaded || downloading,
    /** Force-apply: installs now if ready, otherwise once the download finishes. */
    install: () => window.sephraxia.updater.install(),
    check: () => window.sephraxia.updater.check(),
  };
}
