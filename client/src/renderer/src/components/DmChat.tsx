// Main column in DM view: one-on-one conversation with the same features as a
// channel (reply / edit / delete / attachments / media viewer).
import { useEffect, useRef, useState } from 'react';
import type { PublicUser } from '@sephraxia/shared';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { useVoiceStore } from '../store/voice';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import * as voice from '../lib/voice';
import { useAttachments } from '../lib/useAttachments';
import { useVoiceRecorder } from '../lib/useVoiceRecorder';
import { Avatar } from './Avatar';
import { personalColor, displayName } from '../lib/roles';
import { DmMessageItem } from './DmMessageItem';
import { AttachmentTray } from './AttachmentTray';
import { ReplyBar } from './ReplyBar';
import { VoiceRecordBar } from './VoiceRecordBar';
import { EmojiPicker } from './EmojiPicker';
import { useMentions, MentionPopup } from './Mentions';
import { PhoneIcon, PlusIcon, MicIcon, SmileIcon } from './icons';

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
  const callStatus = useVoiceStore((s) => s.call.status);
  const inVoiceChannel = useVoiceStore((s) => s.channelId);

  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const [emojiAt, setEmojiAt] = useState<{ x: number; y: number } | null>(null);
  const { pending, uploadFiles, removePending, clearPending, uploading, ready } = useAttachments();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // DM mentions only make sense for the two participants.
  const mentionCandidates = [partner, me].filter(Boolean) as PublicUser[];
  const mentions = useMentions(draft, setDraft, mentionCandidates, inputRef);
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

  async function sendVoice(file: File) {
    const socket = getSocket();
    if (!socket || !activeDmUserId || muted) return;
    try {
      const attachment = await api.uploadFile(file);
      socket.emit('dm:send', { toId: activeDmUserId, content: '', attachments: [attachment], replyToId: null });
      stick.current = true;
    } catch {
      alert('не удалось отправить голосовое сообщение.');
    }
  }
  const recorder = useVoiceRecorder(sendVoice);

  if (!activeDmUserId || !partner) {
    return (
      <div className="glass flex flex-1 items-center justify-center rounded-glass text-text-muted">
        select a conversation
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
      <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
        <button onClick={() => openProfile(partner.id)} className="flex min-w-0 items-center gap-2">
          <Avatar username={displayName(partner)} avatarUrl={partner.avatarUrl} size={26} />
          <span className="heading-glow truncate text-sm font-semibold" style={{ color: personalColor(partner) }}>
            {displayName(partner)}
          </span>
          <span className="truncate text-[11px] text-text-muted">@{partner.username}</span>
        </button>
        <button
          onClick={() => voice.startCall(partner.id)}
          disabled={callStatus !== 'idle' || !!inVoiceChannel}
          className="grid h-9 w-9 place-items-center rounded-glass text-[#3edb86] transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'rgba(35,165,89,0.12)', border: '1px solid rgba(35,165,89,0.28)' }}
          title={inVoiceChannel ? 'leave voice channel first' : callStatus !== 'idle' ? 'already in a call' : `call ${partner.username}`}
        >
          <PhoneIcon size={18} />
        </button>
      </div>

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
                <div className="relative min-w-0 flex-1">
                  <MentionPopup matches={mentions.matches} index={mentions.index} onPick={mentions.choose} />
                  <textarea
                    ref={inputRef}
                    value={draft}
                    rows={1}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      autoGrow();
                    }}
                    onKeyDown={(e) => {
                      if (mentions.handleKeyDown(e)) return;
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
                    placeholder={`написать @${partner.username}`}
                    className="glass-input max-h-40 w-full resize-none pr-10"
                  />
                  <button
                    type="button"
                    title="эмодзи"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setEmojiAt({ x: rect.left + rect.width / 2, y: rect.top });
                    }}
                    className="absolute bottom-2.5 right-2.5 text-text-muted transition hover:text-accent-violet"
                  >
                    <SmileIcon size={18} />
                  </button>
                </div>
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

      {emojiAt && (
        <EmojiPicker
          x={emojiAt.x}
          y={emojiAt.y}
          up
          onClose={() => setEmojiAt(null)}
          onPick={(emoji) => {
            setDraft((d) => d + emoji);
            setEmojiAt(null);
            inputRef.current?.focus();
          }}
        />
      )}

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
