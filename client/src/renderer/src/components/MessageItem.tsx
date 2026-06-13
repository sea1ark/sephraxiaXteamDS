import { useEffect, useState } from 'react';
import type { Message, PublicUser } from '@sephraxia/shared';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { getSocket } from '../lib/socket';
import { nameColor, roleSymbol, displayName } from '../lib/roles';
import { Avatar } from './Avatar';
import { MessageAttachments } from './MessageAttachments';
import { ReplyPreviewLine } from './ReplyPreviewLine';
import { MessageContent } from './MessageContent';
import { EmojiPicker } from './EmojiPicker';
import { SmileIcon, ReplyIcon, EditIcon, TrashIcon, PinIcon } from './icons';

interface Props {
  message: Message;
  author?: PublicUser;
  /** Compact continuation row: same author, small time gap — no avatar/header. */
  grouped?: boolean;
  /** Briefly flash this row (jumped to from search / pins). */
  highlight?: boolean;
}

export function MessageItem({ message, author, grouped, highlight }: Props) {
  const me = useAuthStore((s) => s.user);
  const canDeleteOthers = !!useAuthStore((s) => s.permissions?.canDeleteMessages);
  const openProfile = useUiStore((s) => s.openProfile);
  const openMemberMenu = useUiStore((s) => s.openMemberMenu);
  const setReplyTo = useUiStore((s) => s.setReplyTo);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [picker, setPicker] = useState<{ x: number; y: number; up: boolean } | null>(null);

  const isMine = me?.id === message.authorId;

  // Composer pressed ↑ to edit the last own message → enter edit mode here.
  const editRequestId = useUiStore((s) => s.editRequestId);
  const consumeEdit = useUiStore((s) => s.consumeEdit);
  useEffect(() => {
    if (editRequestId && editRequestId === message.id && isMine) {
      setDraft(message.content);
      setEditing(true);
      consumeEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequestId]);

  const canDelete = isMine || canDeleteOthers;
  const canPin = isMine || canDeleteOthers;
  const color = nameColor(author);
  const symbol = roleSymbol(author);

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

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

  function togglePin() {
    getSocket()?.emit('message:pin', { messageId: message.id, pinned: !message.pinned });
  }

  function toggleReaction(emoji: string) {
    getSocket()?.emit('reaction:toggle', { messageId: message.id, emoji });
  }

  function openPicker(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPicker({ x: rect.left, y: rect.top, up: rect.top > window.innerHeight / 2 });
  }

  function onAuthorContext(e: React.MouseEvent) {
    if (!author) return;
    e.preventDefault();
    openMemberMenu({ userId: author.id, x: e.clientX, y: e.clientY });
  }

  return (
    <div
      data-mid={message.id}
      className={`msg-row group ${grouped ? '' : 'mt-3'} ${highlight ? 'sx-jump-flash' : ''}`}
    >
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
        {canPin && (
          <button
            onClick={togglePin}
            className={`icon-btn !h-7 !w-7 ${message.pinned ? 'active' : ''}`}
            title={message.pinned ? 'открепить' : 'закрепить'}
          >
            <PinIcon size={15} />
          </button>
        )}
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
        {canDelete && (
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
        {grouped ? (
          /* time gutter shown on hover instead of the avatar */
          <span className="w-9 shrink-0 select-none pt-1 text-right text-[10px] leading-4 text-text-muted opacity-0 group-hover:opacity-100">
            {time}
          </span>
        ) : (
          <button
            onClick={() => author && openProfile(author.id)}
            onContextMenu={onAuthorContext}
            className="self-start"
            title={author ? `@${author.username}` : undefined}
          >
            <Avatar username={displayName(author)} avatarUrl={author?.avatarUrl} color={color} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          {message.replyTo && <ReplyPreviewLine reply={message.replyTo} />}

          {!grouped && (
            <div className="flex items-baseline gap-2">
              <span
                onClick={() => author && openProfile(author.id)}
                onContextMenu={onAuthorContext}
                className="cursor-pointer text-sm font-semibold hover:underline"
                style={{ color }}
              >
                {symbol && <span className="mr-1">{symbol}</span>}
                {displayName(author)}
              </span>
              <span className="text-[11px] text-text-muted">{time}</span>
              {message.pinned && (
                <span className="flex items-center gap-1 text-[10px] text-accent-violet" title="закреплено">
                  <PinIcon size={10} />
                </span>
              )}
              {message.editedAt && <span className="text-[10px] text-text-muted">(изменено)</span>}
            </div>
          )}

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
              {grouped && message.editedAt && (
                <span className="text-[10px] text-text-muted">(изменено)</span>
              )}
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
                  title={r.userIds.length > 3 ? `${r.count} реакций` : undefined}
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
