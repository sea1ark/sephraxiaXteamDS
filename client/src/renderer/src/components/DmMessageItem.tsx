// A single direct message — same affordances as a channel message (react,
// reply, edit, delete, attachments, reply preview), Discord-style layout.
import { useState } from 'react';
import type { DirectMessage, PublicUser } from '@sephraxia/shared';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import { getSocket } from '../lib/socket';
import { personalColor, displayName } from '../lib/roles';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { MessageAttachments } from './MessageAttachments';
import { ReplyPreviewLine } from './ReplyPreviewLine';
import { MessageContent } from './MessageContent';
import { EmojiPicker } from './EmojiPicker';
import { SmileIcon, ReplyIcon, EditIcon, TrashIcon } from './icons';

export function DmMessageItem({ message }: { message: DirectMessage }) {
  const me = useAuthStore((s) => s.user);
  const fallback = useChatStore((s) => s.users.find((u) => u.id === message.fromId));
  const openProfile = useUiStore((s) => s.openProfile);
  const setReplyTo = useUiStore((s) => s.setReplyTo);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [picker, setPicker] = useState<{ x: number; y: number; up: boolean } | null>(null);

  const from: PublicUser | undefined = message.from ?? fallback;
  const isMine = message.fromId === me?.id;
  const color = personalColor(from);

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

  function toggleReaction(emoji: string) {
    getSocket()?.emit('dm:reaction:toggle', { dmId: message.id, emoji });
  }

  function openPicker(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPicker({ x: rect.left, y: rect.top, up: rect.top > window.innerHeight / 2 });
  }

  return (
    <div className="msg-row group relative">
      {/* floating hover toolbar */}
      <div
        className="absolute -top-3.5 right-4 z-10 hidden items-center gap-0.5 rounded-[10px] p-0.5 group-hover:flex"
        style={{
          background: 'linear-gradient(180deg, rgba(26,21,38,0.98), rgba(13,10,20,0.98))',
          border: '1px solid rgba(180,160,240,0.2)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}
      >
        <button onClick={openPicker} className="icon-btn !h-7 !w-7" title="добавить реакцию">
          <SmileIcon size={15} />
        </button>
        <button onClick={reply} className="icon-btn !h-7 !w-7" title="ответить">
          <ReplyIcon size={15} />
        </button>
        {isMine && (
          <button
            onClick={() => {
              setDraft(message.content);
              setEditing(true);
            }}
            className="icon-btn !h-7 !w-7"
            title="редактировать"
          >
            <EditIcon size={14} />
          </button>
        )}
        {isMine && (
          <button
            onClick={remove}
            className="icon-btn !h-7 !w-7 hover:!bg-accent-pink/20 hover:!text-accent-pink"
            title="удалить"
          >
            <TrashIcon size={15} />
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => from && openProfile(from.id)}
          className="self-start"
          title={from ? `@${from.username}` : undefined}
        >
          <Avatar username={displayName(from)} avatarUrl={from?.avatarUrl} color={color} size={32} />
        </button>

        <div className="min-w-0 flex-1">
          {message.replyTo && <ReplyPreviewLine reply={message.replyTo} />}

          <div className="flex items-baseline gap-2">
            <Badge user={from} />
            <span
              onClick={() => from && openProfile(from.id)}
              className="cursor-pointer text-sm font-semibold hover:underline"
              style={{ color }}
            >
              {displayName(from)}
            </span>
            <span className="text-[11px] text-text-muted">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {message.editedAt && <span className="text-[10px] text-text-muted">(изменено)</span>}
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
              <div className="mt-1 text-[11px] text-text-muted">enter — сохранить · esc — отмена</div>
            </div>
          ) : (
            <>
              {message.content && <MessageContent content={message.content} />}
              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachments attachments={message.attachments} />
              )}
            </>
          )}

          {/* reactions */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {message.reactions.map((r) => (
                <button
                  key={r.emoji}
                  onClick={() => toggleReaction(r.emoji)}
                  className={`reaction-chip ${me && r.userIds.includes(me.id) ? 'mine' : ''}`}
                >
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span className="font-semibold">{r.count}</span>
                </button>
              ))}
              <button
                onClick={openPicker}
                className="reaction-chip !px-1.5 opacity-0 transition group-hover:opacity-100"
                title="добавить реакцию"
              >
                <SmileIcon size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {picker && (
        <EmojiPicker
          x={picker.x}
          y={picker.y}
          up={picker.up}
          onClose={() => setPicker(null)}
          onPick={(emoji) => {
            toggleReaction(emoji);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
