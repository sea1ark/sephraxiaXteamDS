// Message text renderer with fenced code-block support:
//   ```lua  (optional language tag)
//   local x = 1
//   ```
// Code renders in a monospace card with a copy button — built for sharing
// lua scripts and cfg dumps without mangling whitespace.
import { Fragment, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';

/** Render a text run, turning @username into a highlighted mention pill. */
function renderText(text: string): React.ReactNode {
  const users = useChatStore.getState().users;
  const myName = useAuthStore.getState().user?.username?.toLowerCase();
  const parts = text.split(/(@[a-zA-Z0-9_.-]+)/g);
  return parts.map((part, i) => {
    if (part[0] === '@') {
      const handle = part.slice(1).toLowerCase();
      const user = users.find((u) => u.username.toLowerCase() === handle);
      if (user) {
        const isMe = myName === handle;
        return (
          <span
            key={i}
            className="rounded px-1 font-medium"
            style={{
              color: isMe ? '#ffd9e4' : '#b9aef0',
              background: isMe ? 'rgba(212,83,126,0.28)' : 'rgba(125,111,196,0.22)',
            }}
          >
            @{user.username}
          </span>
        );
      }
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface Segment {
  kind: 'text' | 'code';
  body: string;
  lang?: string;
}

function parse(content: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([a-zA-Z0-9+#-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    if (m.index > last) segments.push({ kind: 'text', body: content.slice(last, m.index) });
    segments.push({ kind: 'code', lang: m[1] || undefined, body: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < content.length) segments.push({ kind: 'text', body: content.slice(last) });
  return segments;
}

export function CodeBlock({ code, lang, name }: { code: string; lang?: string; name?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    copyText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="group/code my-1 max-w-[640px] overflow-hidden rounded-[10px]"
      style={{ background: 'rgba(5,4,9,0.85)', border: '1px solid rgba(180,160,240,0.18)' }}
    >
      <div
        className="flex items-center justify-between gap-2 px-3 py-1.5"
        style={{ background: 'rgba(125,111,196,0.08)', borderBottom: '1px solid rgba(180,160,240,0.12)' }}
      >
        <span className="truncate text-[10px] font-semibold tracking-widest text-text-muted">
          {name ?? lang ?? 'code'}
        </span>
        <button
          onClick={copy}
          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold transition"
          style={{
            color: copied ? '#3edb86' : '#b9aef0',
            background: copied ? 'rgba(62,219,134,0.12)' : 'rgba(125,111,196,0.15)',
            border: `1px solid ${copied ? 'rgba(62,219,134,0.4)' : 'rgba(125,111,196,0.35)'}`,
            textTransform: 'none',
          }}
        >
          {copied ? 'скопировано ✓' : 'копировать'}
        </button>
      </div>
      <pre
        className="max-h-[360px] overflow-auto px-3 py-2 text-[12.5px] leading-relaxed text-[#cfc8e8]"
        style={{ fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace", textTransform: 'none' }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MessageContent({ content }: { content: string }) {
  const segments = parse(content);
  return (
    <div className="text-sm leading-relaxed text-text-primary">
      {segments.map((s, i) =>
        s.kind === 'code' ? (
          <CodeBlock key={i} code={s.body} lang={s.lang} />
        ) : (
          s.body.trim() && (
            <p key={i} className="whitespace-pre-wrap break-words">
              {renderText(s.body.replace(/^\n+|\n+$/g, ''))}
            </p>
          )
        ),
      )}
    </div>
  );
}
