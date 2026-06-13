// Config / lua library: browse, filter by project (neverlose / skeet / …),
// search, preview, download, and post. Built for sharing cheat configs.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConfigPost } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { resolveAssetUrl } from '../lib/config';
import { displayName, nameColor } from '../lib/roles';
import { downloadFile } from '../lib/download';
import { copyText } from '../lib/clipboard';
import { toast } from '../store/toasts';
import { useUiStore } from '../store/ui';
import { Avatar } from './Avatar';
import { CodeBlock } from './MessageContent';
import { SearchIcon, PlusIcon, TrashIcon, CloseIcon, ChevronDownIcon } from './icons';

// Known projects get a colour; others fall back to violet.
const PROJECT_META: Record<string, { color: string; glow: string }> = {
  neverlose: { color: '#3e7bdb', glow: 'rgba(62,123,219,0.22)' },
  skeet: { color: '#d4a13e', glow: 'rgba(212,161,62,0.22)' },
  gamesense: { color: '#d4537e', glow: 'rgba(212,83,126,0.22)' },
};
const DEFAULT_META = { color: '#7d6fc4', glow: 'rgba(125,111,196,0.22)' };
const meta = (p: string) => PROJECT_META[p.toLowerCase()] ?? DEFAULT_META;

const CATEGORIES = [
  { id: 'all', label: 'всё' },
  { id: 'config', label: 'конфиги' },
  { id: 'lua', label: 'lua' },
  { id: 'other', label: 'прочее' },
];

function fmtSize(b: number) {
  if (b < 1024) return `${b} b`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} kb`;
  return `${(b / (1024 * 1024)).toFixed(1)} mb`;
}

export function ConfigsView() {
  const me = useAuthStore((s) => s.user);
  const canDelete = !!useAuthStore((s) => s.permissions?.canDeleteMessages);

  const [posts, setPosts] = useState<ConfigPost[]>([]);
  const [projects, setProjects] = useState<{ project: string; count: number }[]>([]);
  const [project, setProject] = useState('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [p, projs] = await Promise.all([
        api.getConfigs({
          project: project === 'all' ? undefined : project,
          category: category === 'all' ? undefined : category,
          q: query.trim() || undefined,
        }),
        api.getConfigProjects(),
      ]);
      setPosts(p);
      setProjects(projs);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  // Debounced refetch on filter change + live refresh on the socket event.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(refresh, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, category, query]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('sx:configs-refresh', handler);
    return () => window.removeEventListener('sx:configs-refresh', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Project tabs: always offer the two flagship projects + any discovered ones.
  const tabs = useMemo(() => {
    const names = new Set(['neverlose', 'skeet', ...projects.map((p) => p.project)]);
    const counts = Object.fromEntries(projects.map((p) => [p.project, p.count]));
    const total = projects.reduce((a, b) => a + b.count, 0);
    return [
      { id: 'all', label: 'все', count: total },
      ...[...names].map((n) => ({ id: n, label: n, count: counts[n] ?? 0 })),
    ];
  }, [projects]);

  async function remove(post: ConfigPost) {
    try {
      await api.deleteConfig(post.id);
      setPosts((ps) => ps.filter((p) => p.id !== post.id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'не удалить', 'error');
    }
  }

  return (
    <div className="sx-fade glass relative flex min-w-0 flex-1 flex-col rounded-glass">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-glass-border px-5 py-3">
        <span className="heading-glow text-sm font-semibold tracking-[0.15em]">библиотека ✦</span>
        <span className="text-xs text-text-muted">конфиги · луашки · кфг</span>
        <div className="relative ml-auto">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon size={14} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="поиск по названию, тегам…"
            className="glass-input !py-1.5 w-64 pl-9 text-sm"
          />
        </div>
        <button onClick={() => setPosting(true)} className="btn-accent flex items-center gap-1.5 !px-4 !py-2 text-sm">
          <PlusIcon size={15} /> залить
        </button>
      </div>

      {/* project tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-glass-border px-5 py-2.5">
        {tabs.map((t) => {
          const m = meta(t.id);
          const active = project === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setProject(t.id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition"
              style={
                active
                  ? { background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}88`, boxShadow: `0 0 14px ${m.glow}` }
                  : { background: 'rgba(125,111,196,0.06)', color: '#8a8398', border: '1px solid transparent' }
              }
            >
              {t.id !== 'all' && <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />}
              {t.label}
              {t.count > 0 && <span className="opacity-60">{t.count}</span>}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-glass-border" />
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className="rounded-full px-2.5 py-1 text-[11px] transition"
            style={
              category === c.id
                ? { background: 'rgba(125,111,196,0.2)', color: '#e2d8fa' }
                : { color: '#6d6680' }
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading && posts.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">загрузка…</p>
        ) : posts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
            <span className="text-4xl">✦</span>
            <p className="text-sm">пусто. залей первый конфиг — кнопка «залить» сверху.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {posts.map((post) => (
              <ConfigCard
                key={post.id}
                post={post}
                canDelete={canDelete || post.author.id === me?.id}
                onDelete={() => remove(post)}
              />
            ))}
          </div>
        )}
      </div>

      {posting && (
        <PostConfigModal onClose={() => setPosting(false)} onPosted={() => { setPosting(false); refresh(); }} />
      )}
    </div>
  );
}

function ConfigCard({
  post,
  canDelete,
  onDelete,
}: {
  post: ConfigPost;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const openProfile = useUiStore((s) => s.openProfile);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [downloads, setDownloads] = useState(post.downloads);
  const m = meta(post.project);
  const src = resolveAssetUrl(post.fileUrl) ?? post.fileUrl;

  async function preview() {
    const next = !open;
    setOpen(next);
    if (next && text === null) {
      try {
        const res = await fetch(src);
        setText((await res.text()).slice(0, 256 * 1024));
      } catch {
        setText('// не удалось загрузить превью');
      }
    }
  }

  async function download() {
    downloadFile(src, post.fileName);
    try {
      const { downloads: d } = await api.bumpConfigDownload(post.id);
      setDownloads(d);
    } catch {
      setDownloads((d) => d + 1);
    }
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[14px] transition"
      style={{ background: 'rgba(8,6,14,0.7)', border: `1px solid ${m.color}33`, boxShadow: `0 0 0 1px ${m.color}11` }}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[10px] font-bold"
          style={{ background: `${m.color}1f`, color: m.color, border: `1px solid ${m.color}55`, textTransform: 'none' }}
        >
          {post.category === 'lua' ? '.lua' : post.project.slice(0, 4)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-heading" title={post.title}>
            {post.title}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${m.color}22`, color: m.color }}>
              {post.project}
            </span>
            <span className="text-[10px] text-text-muted">{fmtSize(post.fileSize)}</span>
            <span className="text-[10px] text-text-muted">· ↓ {downloads}</span>
          </div>
        </div>
        {canDelete && (
          <button onClick={onDelete} className="icon-btn !h-7 !w-7 hover:!text-accent-pink" title="удалить">
            <TrashIcon size={14} />
          </button>
        )}
      </div>

      {post.description && (
        <p className="px-4 pb-2 text-xs leading-relaxed text-text-primary line-clamp-3">{post.description}</p>
      )}

      {post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {post.tags.slice(0, 6).map((t) => (
            <span key={t} className="rounded-full px-2 py-0.5 text-[10px] text-text-muted" style={{ background: 'rgba(125,111,196,0.1)' }}>
              #{t}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="px-2 pb-2">
          {text === null ? (
            <p className="px-2 py-2 text-xs text-text-muted">загрузка…</p>
          ) : (
            <CodeBlock code={text} name={post.fileName} />
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-glass-border px-4 py-2.5">
        <button onClick={() => openProfile(post.author.id)} className="flex min-w-0 items-center gap-1.5" title={`@${post.author.username}`}>
          <Avatar username={displayName(post.author)} avatarUrl={post.author.avatarUrl} size={20} color={nameColor(post.author)} />
          <span className="truncate text-[11px] text-text-muted">{displayName(post.author)}</span>
        </button>
        <span className="ml-auto" />
        <button onClick={() => copyText(post.fileName, 'имя скопировано')} className="icon-btn !h-7 !w-7" title="скопировать имя файла">
          ⧉
        </button>
        <button onClick={preview} className={`icon-btn !h-7 !w-7 ${open ? 'active' : ''}`} title="превью">
          <span className="grid transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
            <ChevronDownIcon size={14} />
          </span>
        </button>
        <button
          onClick={download}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-heading transition hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${m.color}, #8c2f55)`, textTransform: 'none' }}
        >
          ↓ скачать
        </button>
      </div>
    </div>
  );
}

function PostConfigModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('neverlose');
  const [category, setCategory] = useState<'config' | 'lua' | 'other'>('config');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!title.trim() || !file) {
      setError('нужны название и файл');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const attachment = await api.uploadFile(file);
      await api.createConfig({
        title: title.trim(),
        project: project.trim().toLowerCase(),
        category,
        description: description.trim() || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12),
        fileUrl: attachment.url,
        fileName: attachment.name,
        fileSize: attachment.size,
      });
      toast('конфиг залит ✦', 'success');
      onPosted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'не удалось залить');
    } finally {
      setBusy(false);
    }
  }

  const input = { background: 'rgba(5,4,9,0.7)', border: '1px solid rgba(180,160,240,0.18)' };

  return (
    <div
      className="sx-overlay fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="sx-pop w-[480px] max-w-[94vw] overflow-hidden rounded-[18px]"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'linear-gradient(180deg,#15101f,#0a0812)', border: '1px solid rgba(180,160,240,0.18)' }}
      >
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
          <span className="heading-glow text-sm font-semibold tracking-[0.12em]">залить конфиг</span>
          <button onClick={onClose} className="icon-btn !h-7 !w-7"><CloseIcon size={15} /></button>
        </div>

        <div className="space-y-4 p-5">
          <button
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-glass px-4 py-3 text-left transition hover:brightness-110"
            style={{ background: file ? 'rgba(62,219,134,0.08)' : 'rgba(125,111,196,0.1)', border: `1px dashed ${file ? 'rgba(62,219,134,0.5)' : 'rgba(180,160,240,0.35)'}` }}
          >
            <PlusIcon size={20} />
            <span className="min-w-0">
              <span className="block truncate text-sm text-text-primary" style={{ textTransform: 'none' }}>
                {file ? file.name : 'выбрать файл (.lua / .cfg / .ini / .json …)'}
              </span>
              {file && <span className="block text-[10px] text-text-muted">{fmtSize(file.size)}</span>}
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".lua,.cfg,.ini,.json,.txt,.dat"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
                if (f.name.toLowerCase().endsWith('.lua')) setCategory('lua');
              }
            }}
          />

          <div>
            <label className="section-label mb-1.5 block">название</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="glass-input" style={input} placeholder="напр. hvh legit aa" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="section-label mb-1.5 block">проект</label>
              <div className="flex gap-1.5">
                {['neverlose', 'skeet'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setProject(p)}
                    className="flex-1 rounded-glass px-2 py-2 text-xs font-semibold transition"
                    style={project === p ? { background: `${meta(p).color}22`, color: meta(p).color, border: `1px solid ${meta(p).color}77` } : { ...input, color: '#6d6680' }}
                  >
                    {p}
                  </button>
                ))}
                <input
                  value={['neverlose', 'skeet'].includes(project) ? '' : project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="…"
                  className="glass-input w-20 text-center text-xs"
                  style={input}
                />
              </div>
            </div>
            <div>
              <label className="section-label mb-1.5 block">тип</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as 'config' | 'lua' | 'other')} className="glass-input text-sm" style={input}>
                <option value="config">конфиг</option>
                <option value="lua">lua</option>
                <option value="other">прочее</option>
              </select>
            </div>
          </div>

          <div>
            <label className="section-label mb-1.5 block">описание</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} rows={3} className="glass-input w-full resize-none" style={input} placeholder="что за конфиг, под что заточен…" />
          </div>

          <div>
            <label className="section-label mb-1.5 block">теги <span className="text-text-muted">(через запятую)</span></label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="glass-input" style={input} placeholder="hvh, aa, legit, fakelag" />
          </div>

          {error && <p className="text-sm text-accent-pink">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-glass px-4 py-2 text-sm text-text-muted hover:text-text-primary">отмена</button>
            <button onClick={submit} disabled={busy} className="btn-accent px-6">{busy ? '…' : 'опубликовать'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
