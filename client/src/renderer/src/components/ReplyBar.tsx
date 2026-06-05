// "Replying to X" strip shown above the composer when a reply is queued.
import type { ReplyTarget } from '../store/ui';

export function ReplyBar({ reply, onCancel }: { reply: ReplyTarget; onCancel: () => void }) {
  return (
    <div
      className="mb-2 flex items-center gap-2 rounded-glass px-3 py-1.5 text-xs"
      style={{ background: 'rgba(125,111,196,0.1)', border: '1px solid rgba(180,160,240,0.14)' }}
    >
      <span className="shrink-0 text-accent-violet">↩ replying to</span>
      <span className="shrink-0 font-semibold text-text-heading">{reply.authorName}</span>
      <span className="truncate text-text-muted">{reply.content}</span>
      <button
        onClick={onCancel}
        className="ml-auto shrink-0 text-text-muted transition hover:text-accent-pink"
        title="cancel reply"
      >
        ✕
      </button>
    </div>
  );
}
