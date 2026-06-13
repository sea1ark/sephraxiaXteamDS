import { useEffect, useRef, useState } from 'react';
import type { Message } from '@sephraxia/shared';
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
import { EmojiPicker } from './EmojiPicker';
import { PinsPanel, SearchPanel } from './ChatPanels';
import {
  PlusIcon,
  MicIcon,
  SmileIcon,
  SearchIcon,
  PinIcon,
  HashIcon,
  ChevronDownIcon,
} from './icons';

const SEVEN_MIN = 7 * 60_000;

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'сегодня';
  if (sameDay(d, yesterday)) return 'вчера';
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

/** Continuation of the previous message: same author, short gap, same day. */
function isGrouped(m: Message, prev: Message | undefined): boolean {
  if (!prev || prev.authorId !== m.authorId || m.replyTo) return false;
  const a = new Date(prev.createdAt);
  const b = new Date(m.createdAt);
  return sameDay(a, b) && b.getTime() - a.getTime() < SEVEN_MIN;
}

export function Chat() {
  const activeId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const messages = useChatStore((s) => (activeId ? s.messagesByChannel[activeId] : undefined));
  const users = useChatStore((s) => s.users);
  const typing = useChatStore((s) => (activeId ? s.typing[activeId] : undefined));
  const me = useAuthStore((s) => s.user);
  const canManageChannels = !!useAuthStore((s) => s.permissions?.canManageChannels);
  const replyTo = useUiStore((s) => (s.replyTo?.scope === 'channel' ? s.replyTo : null));
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const chatPanel = useUiStore((s) => s.chatPanel);
  const toggleChatPanel = useUiStore((s) => s.toggleChatPanel);
  const closeChatPanel = useUiStore((s) => s.closeChatPanel);
  const pendingJump = useUiStore((s) => s.pendingJump);
  const clearJump = useUiStore((s) => s.clearJump);

  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [emojiAt, setEmojiAt] = useState<{ x: number; y: number } | null>(null);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');

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
    const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = isBottom;
    setAtBottom(isBottom);
  }

  useEffect(() => {
    if (stick.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    stick.current = true;
    setAtBottom(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current?.scrollHeight ?? 0 });
    setDraft('');
    clearPending();
    setReplyTo(null);
    closeChatPanel();
    setEditingTopic(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Jump to a message from search / pins: load a window around it, scroll
  // there, and flash the row.
  useEffect(() => {
    if (!pendingJump || pendingJump.channelId !== activeId) return;
    let cancelled = false;
    (async () => {
      try {
        const around = await api.getMessagesAround(pendingJump.channelId, pendingJump.messageId);
        if (cancelled) return;
        stick.current = false;
        setAtBottom(false);
        useChatStore.getState().setMessages(pendingJump.channelId, around);
        requestAnimationFrame(() => {
          const el = scrollRef.current?.querySelector(`[data-mid="${pendingJump.messageId}"]`);
          el?.scrollIntoView({ block: 'center' });
          setHighlightId(pendingJump.messageId);
          setTimeout(() => setHighlightId(null), 1800);
        });
      } catch {
        /* message may have been deleted */
      } finally {
        if (!cancelled) clearJump();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJump, activeId]);

  async function backToLatest() {
    if (!activeId) return;
    try {
      const latest = await api.getMessages(activeId);
      stick.current = true;
      useChatStore.getState().setMessages(activeId, latest);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
      );
    } catch {
      /* keep current window */
    }
  }

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

  async function saveTopic() {
    if (!channel) return;
    const next = topicDraft.trim();
    setEditingTopic(false);
    if (next === (channel.topic ?? '')) return;
    try {
      await api.updateChannel(channel.id, { topic: next || null });
    } catch {
      /* channels:changed will keep us consistent */
    }
  }

  const typingNames = (typing ?? [])
    .filter((id) => id !== me?.id)
    .map((id) => users.find((u) => u.id === id)?.username)
    .filter(Boolean) as string[];

  if (!channel) {
    return (
      <div className="glass flex flex-1 items-center justify-center rounded-glass text-text-muted">
        выбери или создай канал
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
      {/* ── header: name · topic · search / pins ───────────────────────── */}
      <div className="flex items-center gap-2 border-b border-glass-border px-5 py-3">
        <span className="text-text-muted">
          <HashIcon size={16} />
        </span>
        <span className="heading-glow shrink-0 text-sm font-semibold">{channel.name}</span>

        <span className="mx-1 h-4 w-px shrink-0 bg-glass-border" />

        {editingTopic ? (
          <input
            autoFocus
            value={topicDraft}
            onChange={(e) => setTopicDraft(e.target.value)}
            onBlur={saveTopic}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTopic();
              if (e.key === 'Escape') setEditingTopic(false);
            }}
            placeholder="тема канала…"
            maxLength={256}
            className="glass-input !py-1 min-w-0 flex-1 text-xs"
          />
        ) : (
          <button
            onClick={() => {
              if (!canManageChannels) return;
              setTopicDraft(channel.topic ?? '');
              setEditingTopic(true);
            }}
            className={`min-w-0 flex-1 truncate text-left text-xs text-text-muted ${
              canManageChannels ? 'hover:text-text-primary' : 'cursor-default'
            }`}
            title={channel.topic ?? (canManageChannels ? 'задать тему канала' : undefined)}
          >
            {channel.topic ?? (canManageChannels ? 'добавить тему…' : '')}
          </button>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => toggleChatPanel('pins')}
            className={`icon-btn ${chatPanel === 'pins' ? 'active' : ''}`}
            title="закреплённые сообщения"
          >
            <PinIcon size={16} />
          </button>
          <button
            onClick={() => toggleChatPanel('search')}
            className={`icon-btn ${chatPanel === 'search' ? 'active' : ''}`}
            title="поиск (ctrl+f)"
          >
            <SearchIcon size={16} />
          </button>
        </div>
      </div>

      {chatPanel === 'pins' && <PinsPanel />}
      {chatPanel === 'search' && <SearchPanel />}

      {/* ── messages ────────────────────────────────────────────────────── */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4">
        {(messages ?? []).map((m, i, arr) => {
          const prev = arr[i - 1];
          const newDay = !prev || !sameDay(new Date(prev.createdAt), new Date(m.createdAt));
          return (
            <div key={m.id}>
              {newDay && (
                <div className="date-divider">
                  <span className="text-[11px] font-semibold tracking-widest text-text-muted">
                    {dayLabel(m.createdAt)}
                  </span>
                </div>
              )}
              <MessageItem
                message={m}
                author={m.author ?? users.find((u) => u.id === m.authorId)}
                grouped={!newDay && isGrouped(m, prev)}
                highlight={highlightId === m.id}
              />
            </div>
          );
        })}
        {messages && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
            <span className="text-3xl">✦</span>
            <p className="text-sm">здесь пока тихо. напиши первым.</p>
          </div>
        )}
      </div>

      {/* back to latest */}
      {!atBottom && (
        <button
          onClick={backToLatest}
          className="sx-pop absolute bottom-28 right-6 z-20 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-text-heading"
          style={{
            background: 'linear-gradient(135deg, rgba(125,111,196,0.95), rgba(212,83,126,0.85))',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 0 18px rgba(125,111,196,0.4)',
          }}
        >
          <ChevronDownIcon size={14} /> к последним
        </button>
      )}

      <div className="h-5 px-5 pb-2 text-xs text-accent-violet">
        {typingNames.length > 0 &&
          `${typingNames.join(', ')} ${typingNames.length === 1 ? 'печатает' : 'печатают'}…`}
      </div>

      {/* ── composer ───────────────────────────────────────────────────── */}
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
            тайм-аут до {mutedUntil!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' — '}писать пока нельзя.
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
                  title="прикрепить файл"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-glass text-text-muted transition hover:text-accent-violet"
                  style={{ background: 'rgba(125,111,196,0.12)', border: '1px solid rgba(180,160,240,0.14)' }}
                >
                  <PlusIcon size={20} />
                </button>
                <div className="relative min-w-0 flex-1">
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
                      // ↑ on an empty composer → edit my last message in this channel.
                      if (e.key === 'ArrowUp' && draft === '') {
                        const mine = [...(messages ?? [])].reverse().find((m) => m.authorId === me?.id);
                        if (mine) {
                          e.preventDefault();
                          useUiStore.getState().requestEdit(mine.id);
                        }
                      }
                    }}
                    onPaste={(e) => {
                      const files = Array.from(e.clipboardData.files);
                      if (files.length > 0) {
                        e.preventDefault();
                        uploadFiles(files);
                      }
                    }}
                    placeholder={`написать в #${channel.name}`}
                    className="glass-input max-h-40 w-full resize-none pr-10"
                  />
                  <button
                    type="button"
                    title="эмодзи"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      // x is the picker's right edge when opening upward — anchor
                      // it to the button so it doesn't pin to the window edge.
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
                  title="голосовое сообщение"
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
          <span className="heading-glow text-sm font-semibold">отпусти, чтобы прикрепить ✦</span>
        </div>
      )}
    </div>
  );
}
