// Inline composer strip shown while recording a voice message: a pulsing dot,
// the elapsed time, and cancel / send actions.
import { fmtDuration } from '../lib/useVoiceRecorder';
import { TrashIcon, SendIcon } from './icons';

export function VoiceRecordBar({
  ms,
  onCancel,
  onSend,
}: {
  ms: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-glass px-4 py-2.5"
      style={{ background: 'rgba(242,63,67,0.1)', border: '1px solid rgba(242,63,67,0.3)' }}
    >
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#f23f43]" />
      <span className="tabular-nums text-sm font-semibold text-text-heading">{fmtDuration(ms)}</span>
      <span className="flex-1 text-xs text-text-muted">recording voice message…</span>
      <button
        type="button"
        onClick={onCancel}
        title="cancel"
        className="grid h-9 w-9 place-items-center rounded-glass text-text-muted transition hover:bg-white/5 hover:text-accent-pink"
      >
        <TrashIcon size={18} />
      </button>
      <button
        type="button"
        onClick={onSend}
        title="send"
        className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:brightness-110"
        style={{ background: '#23a559' }}
      >
        <SendIcon size={18} />
      </button>
    </div>
  );
}
