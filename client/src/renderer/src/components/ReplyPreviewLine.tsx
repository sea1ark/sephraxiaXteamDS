// The small "↩ replying to X: …" line rendered above a message that is a reply.
import type { ReplyPreview } from '@sephraxia/shared';

export function ReplyPreviewLine({ reply }: { reply: ReplyPreview }) {
  return (
    <div className="mb-0.5 flex items-center gap-1.5 truncate text-[11px] text-text-muted">
      <span className="text-accent-violet">↩</span>
      <span className="font-semibold text-text-primary">{reply.authorName}</span>
      <span className="truncate opacity-80">{reply.content || '(attachment)'}</span>
    </div>
  );
}
