import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { useAttachments } from '../lib/useAttachments';
import { useVoiceRecorder } from '../lib/useVoiceRecorder';
import { MessageItem } from './MessageItem';
import { AttachmentTray } from './AttachmentTray';
import { ReplyBar } from './ReplyBar';
import { VoiceRecordBar } from './VoiceRecordBar';
import { PlusIcon, MicIcon } from './icons';

export function Chat() {
  const activeId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const messages = useChatStore((s) => (activeId ? s.messagesByChannel[activeId] : undefined));
  const users = useChatStore((s) => s.users);
  const typing = useChatStore((s) => (activeId ? s.typing[activeId] : undefined));
  const me = useAuthStore((s) => s.user);
  const replyTo = useUiStore((s) => (s.replyTo?.scope === 'channel' ? s.replyTo : null));
  const setReplyTo = useUiStore((s) => s.setReplyTo);

  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const { pending, uploadFiles, removePending, clearPending, uploading, ready } = useAttachments();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);
  const stick = useRef(true);

  const channel = channels.find((c) => c.id === activeId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  function autoGrow() {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  function emitTyping() {
    const socket = getSocket();
    if (!socket || !activeId) return;
    if (!isTyping.current) {
      isTyping.current = true;
      socket.emit('typing:start', { channelId: activeId });
    }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      isTyping.current = false;
      socket.emit('typing:stop', { channelId: activeId });
    }, 1500);
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const socket = getSocket();
    const content = draft.trim();
    if (!socket || !activeId || uploading || muted) return;
    if (!content && ready.length === 0) return;

    socket.emit('message:send', {
      channelId: activeId,
      content,
      attachments: ready.length ? ready : undefined,
      replyToId: replyTo?.id ?? null,
    });
    socket.emit('typing:stop', { channelId: activeId });
    isTyping.current = false;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    stick.current = true;
    setDraft('');
    clearPending();
    setReplyTo(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }

  async function sendVoice(file: File) {
    const socket = getSocket();
    if (!socket || !activeId) return;
    try {
      const attachment = await api.uploadFile(file);
      socket.emit('message:send', { channelId: activeId, content: '', attachments: [attachment], replyToId: null });
      stick.current = true;
    } catch {
      alert('не удалось отправить голосовое сообщение.');
    }
  }
  const recorder = useVoiceRecorder(sendVoice);

  const typingNames = (typing ?? [])
    .filter((id) => id !== me?.id)
    .map((id) => users.find((u) => u.id === id)?.username)
    .filter(Boolean) as string[];

  if (!channel) {
    return (
      <div className="glass flex flex-1 items-center justify-center rounded-glass text-text-muted">
        select or create a channel
      </div>
    );
  }

  return (
    <div
      className="sx-fade glass relative flex min-w-0 flex-1 flex-col rounded-glass"
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
      <div className="flex items-center gap-2 border-b border-glass-border px-5 py-3">
        <span className="text-text-muted">#</span>
        <span className="heading-glow text-sm font-semibold">{channel.name}</span>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {(messages ?? []).map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            author={m.author ?? users.find((u) => u.id === m.authorId)}
          />
        ))}
        {messages && messages.length === 0 && (
          <p className="text-sm text-text-muted">no messages yet. say hello ✦</p>
        )}
      </div>

      <div className="h-5 px-5 pb-2 text-xs text-accent-violet">
        {typingNames.length > 0 &&
          `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing…`}
      </div>

      <div className="px-5 pb-4">
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
            you are timed out until {mutedUntil!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' — '}you can&apos;t send messages right now.
          </div>
        ) : (
          <>
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
          {recorder.recording ? (
            <VoiceRecordBar ms={recorder.ms} onCancel={recorder.cancel} onSend={recorder.stop} />
          ) : (
            <form onSubmit={send} className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                title="attach a file"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-glass text-text-muted transition hover:text-accent-violet"
                style={{ background: 'rgba(125,111,196,0.12)', border: '1px solid rgba(180,160,240,0.14)' }}
              >
                <PlusIcon size={20} />
              </button>
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
                onChange={(e) => {
                  setDraft(e.target.value);
                  autoGrow();
                  emitTyping();
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
                placeholder={`message #${channel.name}`}
                className="glass-input max-h-40 resize-none"
              />
              <button
                type="button"
                onClick={recorder.start}
                title="record a voice message"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-glass text-text-muted transition hover:text-accent-violet"
                style={{ background: 'rgba(125,111,196,0.12)', border: '1px solid rgba(180,160,240,0.14)' }}
              >
                <MicIcon size={19} />
              </button>
            </form>
          )}
          </>
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
