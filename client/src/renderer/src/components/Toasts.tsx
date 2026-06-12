// Toast stack in the bottom-right corner. aria-live so screen readers hear it;
// clicks never steal focus from the composer.
import { useToastStore, type Toast } from '../store/toasts';
import { CheckIcon, CloseIcon, ChatIcon } from './icons';

const KIND_STYLE: Record<Toast['kind'], { border: string; glow: string; color: string }> = {
  info: { border: 'rgba(125,111,196,0.45)', glow: 'rgba(125,111,196,0.25)', color: '#b9aef0' },
  success: { border: 'rgba(62,219,134,0.45)', glow: 'rgba(62,219,134,0.18)', color: '#3edb86' },
  error: { border: 'rgba(212,83,126,0.55)', glow: 'rgba(212,83,126,0.22)', color: '#e887a9' },
  message: { border: 'rgba(125,111,196,0.45)', glow: 'rgba(125,111,196,0.25)', color: '#b9aef0' },
};

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[90] flex w-[320px] flex-col gap-2"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {toasts.map((t) => {
        const st = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            onClick={() => {
              if (t.onClick) {
                t.onClick();
                dismiss(t.id);
              }
            }}
            className={`sx-slide-up flex items-start gap-3 rounded-glass px-4 py-3 ${t.onClick ? 'cursor-pointer' : ''}`}
            style={{
              background: 'linear-gradient(180deg, rgba(22,17,33,0.97), rgba(10,8,16,0.97))',
              border: `1px solid ${st.border}`,
              boxShadow: `0 12px 38px rgba(0,0,0,0.55), 0 0 24px ${st.glow}`,
              backdropFilter: 'blur(20px)',
            }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: st.color }}>
              {t.kind === 'success' ? (
                <CheckIcon size={16} />
              ) : t.kind === 'message' ? (
                <ChatIcon size={16} />
              ) : t.kind === 'error' ? (
                <CloseIcon size={16} />
              ) : (
                <span className="grid h-4 w-4 place-items-center text-xs">✦</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-heading">{t.title}</p>
              {t.body && <p className="mt-0.5 line-clamp-2 text-xs text-text-primary">{t.body}</p>}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.id);
              }}
              className="shrink-0 text-text-muted hover:text-text-primary"
              aria-label="dismiss"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
