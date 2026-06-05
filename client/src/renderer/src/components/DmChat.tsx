// Main column in DM view: one-on-one conversation with the same features as a
// channel (reply / edit / delete / attachments / media viewer).
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { getSocket } from '../lib/socket';
import { useAttachments } from '../lib/useAttachments';
import { Avatar } from './Avatar';
import { nameColor } from '../lib/roles';
import { DmMessageItem } from './DmMessageItem';
import { AttachmentTray } from './AttachmentTray';
import { ReplyBar } from './ReplyBar';

export function DmChat() {
  const activeDmUserId = useUiStore((s) => s.activeDmUserId);
  const openProfile = useUiStore((s) => s.openProfile);
  const replyTo = useUiStore((s) => (s.replyTo?.scope === 'dm' ? s.replyTo : null));
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const messages = useChatStore((s) =>
    activeDmUserId ? s.dmMessagesByUser[activeDmUserId] : undefined,
  );
  const partner = useChatStore((s) => s.users.find((u) => u.id === activeDmUserId));
  const markDmRead = useChatStore((s) => s.markDmRead);
  const me = useAuthStore((s) => s.user);

  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const { pending, uploadFiles, removePending, clearPending, uploading, ready } = useAttachments();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stick = useRef(true);

  const mutedUntil = me?.mutedUntil ? new Date(me.mutedUntil) : null;
  const muted = !!mutedUntil && mutedUntil.getTime() > Date.now();

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  useEffect(() => {
    if (stick.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    stick.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current?.scrollHeight ?? 0 });
    setDraft('');
    clearPending();
    setReplyTo(null);
    if (activeDmUserId) markDmRead(activeDmUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDmUserId, messages]);

  function autoGrow() {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = draft.trim();
    const socket = getSocket();
    if (!socket || !activeDmUserId || uploading || muted) return;
    if (!content && ready.length === 0) return;
    socket.emit('dm:send', {
      toId: activeDmUserId,
      content,
      attachments: ready.length ? ready : undefined,
      replyToId: replyTo?.id ?? null,
    });
    stick.current = true;
    setDraft('');
    clearPending();
    setReplyTo(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }

  if (!activeDmUserId || !partner) {
    return (
      <div className="glass flex flex-1 items-center justify-center rounded-glass text-text-muted">
        select a conversation
      </div>
    );
  }

  return (
    <div
      className="glass relative flex min-w-0 flex-1 flex-col rounded-glass"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        uploadFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <button
        onClick={() => openProfile(partner.id)}
        className="flex items-center gap-2 border-b border-glass-border px-5 py-3"
      >
        <Avatar username={partner.username} avatarUrl={partner.avatarUrl} size={26} />
        <span className="heading-glow text-sm font-semibold" style={{ color: nameColor(partner) }}>
          {partner.username}
        </span>
      </button>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {(messages ?? []).map((m) => (
          <DmMessageItem key={m.id} message={m} />
        ))}
        {messages && messages.length === 0 && (
          <p className="text-sm text-text-muted">no messages yet — say hi ✦</p>
        )}
      </div>

      <div className="px-5 pb-4 pt-2">
        {replyTo && <ReplyBar reply={replyTo} onCancel={() => setReplyTo(null)} />}
        {pending.length > 0 && (
          <div className="mb-2">
            <AttachmentTray items={pending} onRemove={removePending} />
          </div>
        )}

        {muted ? (
          <div
            className="rounded-glass px-4 py-3 text-sm text-text-muted"
            style={{ background: 'rgba(212,83,126,0.08)', border: '1px solid rgba(212,83,126,0.3)' }}
          >
            you are timed out until {mutedUntil!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
          </div>
        ) : (
          <form onSubmit={send} className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              title="attach a file"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-glass text-lg text-text-muted transition hover:text-accent-violet"
              style={{ background: 'rgba(125,111,196,0.12)', border: '1px solid rgba(180,160,240,0.14)' }}
            >
              ＋
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                uploadFiles(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                autoGrow();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length > 0) {
                  e.preventDefault();
                  uploadFiles(files);
                }
              }}
              placeholder={`message @${partner.username}`}
              className="glass-input max-h-40 resize-none"
            />
          </form>
        )}
      </div>

      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-20 m-1 grid place-items-center rounded-glass"
          style={{
            background: 'rgba(125,111,196,0.18)',
            border: '2px dashed rgba(180,160,240,0.6)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <span className="heading-glow text-sm font-semibold">drop files to attach ✦</span>
        </div>
      )}
    </div>
  );
}
