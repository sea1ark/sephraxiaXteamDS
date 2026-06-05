// Custom titlebar for the frameless window. The bar is draggable; the buttons
// opt out of the drag region so they stay clickable.
export function Titlebar() {
  const win = window.sephraxia.window;
  return (
    <div
      className="flex h-9 items-center justify-between px-3 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="text-xs tracking-[0.3em] text-text-muted">sephraxia</span>
      <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={win.minimize}
          className="grid h-6 w-6 place-items-center rounded-md text-text-muted hover:bg-white/5 hover:text-text-primary"
          aria-label="minimize"
        >
          ─
        </button>
        <button
          onClick={win.maximize}
          className="grid h-6 w-6 place-items-center rounded-md text-text-muted hover:bg-white/5 hover:text-text-primary"
          aria-label="maximize"
        >
          ☐
        </button>
        <button
          onClick={win.close}
          className="grid h-6 w-6 place-items-center rounded-md text-text-muted hover:bg-accent-pink/30 hover:text-text-heading"
          aria-label="close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
