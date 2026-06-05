import { useState } from 'react';
import type { Message, PublicUser } from '@sephraxia/shared';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { getSocket } from '../lib/socket';
import { nameColor, roleSymbol } from '../lib/roles';
import { Avatar } from './Avatar';
import { MessageAttachments } from './MessageAttachments';
import { ReplyPreviewLine } from './ReplyPreviewLine';

export function MessageItem({ message, author }: { message: Message; author?: PublicUser }) {
  const me = useAuthStore((s) => s.user);
  const canDeleteOthers = !!useAuthStore((s) => s.permissions?.canDeleteMessages);
  const openProfile = useUiStore((s) => s.openProfile);
  const openMemberMenu = useUiStore((s) => s.openMemberMenu);
  const setReplyTo = useUiStore((s) => s.setReplyTo);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const isMine = me?.id === message.authorId;
  const canDelete = isMine || canDeleteOthers;
  const color = nameColor(author);
  const symbol = roleSymbol(author);

  function saveEdit() {
    const content = draft.trim();
    const socket = getSocket();
    if (socket && content && content !== message.content) {
      socket.emit('message:edit', { messageId: message.id, content });
    }
    setEditing(false);
  }

  function remove() {
    getSocket()?.emit('message:delete', { messageId: message.id });
  }

  function reply() {
    setReplyTo({
      scope: 'channel',
      id: message.id,
      content: message.content || '(attachment)',
      authorName: author?.username ?? 'unknown',
    });
  }

  function onAuthorContext(e: React.MouseEvent) {
    if (!author) return;
    e.preventDefault();
    openMemberMenu({ userId: author.id, x: e.clientX, y: e.clientY });
  }

  return (
    <div className="group flex gap-3">
      <button
        onClick={() => author && openProfile(author.id)}
        onContextMenu={onAuthorContext}
        title={author?.username}
      >
        <Avatar username={author?.username ?? '?'} avatarUrl={author?.avatarUrl} color={color} />
      </button>

      <div className="min-w-0 flex-1">
        {message.replyTo && <ReplyPreviewLine reply={message.replyTo} />}

        <div className="flex items-baseline gap-2">
          <span
            onClick={() => author && openProfile(author.id)}
            onContextMenu={onAuthorContext}
            className="cursor-pointer text-sm font-semibold hover:underline"
            style={{ color }}
          >
            {symbol && <span className="mr-1">{symbol}</span>}
            {author?.username ?? 'unknown'}
          </span>
          <span className="text-[11px] text-text-muted">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {message.editedAt && <span className="text-[10px] text-text-muted">(edited)</span>}

          {/* hover actions */}
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
            {canDelete && (
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
