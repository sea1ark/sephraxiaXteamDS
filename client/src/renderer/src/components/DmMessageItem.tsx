// A single direct message — same affordances as a channel message (reply,
// edit, delete, attachments, reply preview), laid out Discord-style (left
// aligned with avatar) so hover actions have somewhere to live.
import { useState } from 'react';
import type { DirectMessage, PublicUser } from '@sephraxia/shared';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { getSocket } from '../lib/socket';
import { nameColor } from '../lib/roles';
import { Avatar } from './Avatar';
import { MessageAttachments } from './MessageAttachments';
import { ReplyPreviewLine } from './ReplyPreviewLine';

export function DmMessageItem({ message }: { message: DirectMessage }) {
  const me = useAuthStore((s) => s.user);
  const fallback = useChatStore((s) => s.users.find((u) => u.id === message.fromId));
  const openProfile = useUiStore((s) => s.openProfile);
  const setReplyTo = useUiStore((s) => s.setReplyTo);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const from: PublicUser | undefined = message.from ?? fallback;
  const isMine = message.fromId === me?.id;
  const color = nameColor(from);

  function saveEdit() {
    const content = draft.trim();
    const socket = getSocket();
    if (socket && content && content !== message.content) {
      socket.emit('dm:edit', { dmId: message.id, content });
    }
    setEditing(false);
  }

  function remove() {
    getSocket()?.emit('dm:delete', { dmId: message.id });
  }

  function reply() {
    setReplyTo({
      scope: 'dm',
      id: message.id,
      content: message.content || '(attachment)',
      authorName: from?.username ?? 'unknown',
    });
  }

  return (
    <div className="group flex gap-3">
      <button onClick={() => from && openProfile(from.id)} title={from?.username}>
        <Avatar username={from?.username ?? '?'} avatarUrl={from?.avatarUrl} color={color} size={32} />
      </button>

      <div className="min-w-0 flex-1">
        {message.replyTo && <ReplyPreviewLine reply={message.replyTo} />}

        <div className="flex items-baseline gap-2">
          <span
            onClick={() => from && openProfile(from.id)}
            className="cursor-pointer text-sm font-semibold hover:underline"
            style={{ color }}
          >
            {from?.username ?? 'unknown'}
          </span>
          <span className="text-[11px] text-text-muted">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {message.editedAt && <span className="text-[10px] text-text-muted">(edited)</span>}

          <span className="ml-auto hidden gap-2 group-hover:flex">
            <button
              onClick={reply}
              className="text-[11px] text-text-muted hover:text-accent-violet"
              title="reply"
            >
              reply
            </button>
            {isMine && (
              <button
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
                className="text-[11px] text-text-muted hover:text-accent-violet"
                title="edit"
              >
                edit
              </button>
            )}
            {isMine && (
              <button
                onClick={remove}
                className="text-[11px] text-text-muted hover:text-accent-pink"
                title="delete"
              >
                delete
              </button>
            )}
          </span>
        </div>

        {editing ? (
          <div className="mt-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="glass-input text-sm"
            />
            <div className="mt-1 text-[11px] text-text-muted">enter to save · esc to cancel</div>
          </div>
        ) : (
          <>
            {message.content && (
              <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
                {message.content}
              </p>
            )}
            {message.attachments && message.attachments.length > 0 && (
              <MessageAttachments attachments={message.attachments} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
