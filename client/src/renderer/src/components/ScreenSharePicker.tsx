// Modal that lists capturable screens and windows (with thumbnails) so the user
// can choose what to share. The chosen source id is handed to lib/voice, which
// captures it via getUserMedia and adds it to every peer connection.
import { useEffect, useState } from 'react';
import { useUiStore } from '../store/ui';
import * as voice from '../lib/voice';

type DesktopSource = Awaited<ReturnType<typeof window.sephraxia.desktop.getSources>>[number];

export function ScreenSharePicker() {
  const open = useUiStore((s) => s.screenPickerOpen);
  const close = useUiStore((s) => s.closeScreenPicker);
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSources([]);
    window.sephraxia.desktop
      .getSources()
      .then(setSources)
      .catch(() => setSources([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  function pick(id: string) {
    void voice.startScreenShare(id);
    close();
  }

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => !s.id.startsWith('screen:'));

  const Tile = ({ s }: { s: DesktopSource }) => (
    <button
      key={s.id}
      onClick={() => pick(s.id)}
      className="group flex flex-col overflow-hidden rounded-glass text-left transition hover:scale-[1.02]"
      style={{ background: 'rgba(125,111,196,0.1)', border: '1px solid rgba(180,160,240,0.16)' }}
    >
      <div className="aspect-video w-full overflow-hidden bg-black">
        <img src={s.thumbnail} alt={s.name} className="h-full w-full object-contain" />
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {s.appIcon && <img src={s.appIcon} alt="" className="h-4 w-4 shrink-0" />}
        <span className="truncate text-xs text-text-primary group-hover:text-accent-violet">{s.name}</span>
      </div>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: 'rgba(5,4,9,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={close}
    >
      <div
        className="glass flex max-h-[80vh] w-full max-w-3xl flex-col rounded-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
          <span className="heading-glow text-sm font-semibold tracking-[0.12em]">share your screen</span>
          <button onClick={close} className="text-text-muted transition hover:text-accent-pink">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="text-sm text-text-muted">finding screens & windows…</p>}
          {!loading && sources.length === 0 && (
            <p className="text-sm text-text-muted">nothing to share was found.</p>
          )}
          {screens.length > 0 && (
            <>
              <p className="section-label mb-2">screens</p>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {screens.map((s) => (
                  <Tile key={s.id} s={s} />
                ))}
              </div>
            </>
          )}
          {windows.length > 0 && (
            <>
              <p className="section-label mb-2">windows</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {windows.map((s) => (
                  <Tile key={s.id} s={s} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
