// Full-screen settings, Discord-style: sidebar navigation on the left, content
// pages on the right, solid (non-transparent) surfaces. Esc closes.
import { useEffect, useRef, useState } from 'react';
import type { UserStatus, ProfileLink, ProfileConfig } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useVoiceStore } from '../store/voice';
import * as voice from '../lib/voice';
import { resolveAssetUrl, getServerUrl } from '../lib/config';
import { Avatar } from './Avatar';
import { toast } from '../store/toasts';
import { ProjectIcon, KNOWN_PROJECTS, PROJECT_LABEL } from './ProjectIcon';
import { CloseIcon, MicIcon, SettingsIcon, UsersIcon, PlusIcon, TrashIcon } from './icons';

const STATUSES: { value: Exclude<UserStatus, 'offline'>; label: string; dot: string }[] = [
  { value: 'online', label: 'в сети', dot: 'status-online' },
  { value: 'idle', label: 'отошёл', dot: 'status-idle' },
  { value: 'dnd', label: 'не беспокоить', dot: 'status-dnd' },
];

type Tab = 'profile' | 'voice' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'мой профиль' },
  { id: 'voice', label: 'голос и видео' },
  { id: 'about', label: 'о приложении' },
];

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.closeSettings);
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const upsertUser = useChatStore((s) => s.upsertUser);

  const [tab, setTab] = useState<Tab>('profile');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState<Exclude<UserStatus, 'offline'>>('online');
  // cosmetics
  const [accentColor, setAccentColor] = useState('#7d6fc4');
  const [accentOn, setAccentOn] = useState(false);
  const [cheats, setCheats] = useState<string[]>([]);
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [ring, setRing] = useState<NonNullable<ProfileConfig['ring']>>('glow');
  const [showCells, setShowCells] = useState<Record<string, boolean>>({
    uid: true,
    status: true,
    joined: true,
    cheats: true,
    links: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [version, setVersion] = useState('');
  const [devices, setDevices] = useState<{
    inputs: MediaDeviceInfo[];
    outputs: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
  }>({ inputs: [], outputs: [], cameras: [] });
  const fileInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const cameraDeviceId = useVoiceStore((s) => s.cameraDeviceId);

  // Seed the form from the current user whenever the modal opens.
  useEffect(() => {
    if (!open || !user) return;
    setTab('profile');
    setDisplayName(user.displayName ?? '');
    setBio(user.bio ?? '');
    setStatus(user.status === 'offline' ? 'online' : user.status);
    setAccentOn(!!user.accentColor);
    setAccentColor(user.accentColor ?? '#7d6fc4');
    setCheats(user.cheats ?? []);
    setLinks(user.links ?? []);
    setRing(user.profileCfg?.ring ?? 'glow');
    setShowCells({
      uid: user.profileCfg?.show?.uid !== false,
      status: user.profileCfg?.show?.status !== false,
      joined: user.profileCfg?.show?.joined !== false,
      cheats: user.profileCfg?.show?.cheats !== false,
      links: user.profileCfg?.show?.links !== false,
    });
    setError(null);
    voice.listDevices().then(setDevices).catch(() => {});
    window.sephraxia?.app?.version?.().then(setVersion).catch(() => {});
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open || !user) return null;

  const banner = resolveAssetUrl(user.bannerUrl);

  async function uploadAvatarFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const updated = await api.uploadAvatar(file);
      patchUser(updated);
      upsertUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'не удалось загрузить аватар');
    } finally {
      setUploading(false);
    }
  }

  async function uploadBannerFile(file: File) {
    setBannerUploading(true);
    setError(null);
    try {
      const updated = await api.uploadBanner(file);
      patchUser(updated);
      upsertUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'не удалось загрузить баннер');
    } finally {
      setBannerUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        status,
        accentColor: accentOn ? accentColor : null,
        cheats,
        links: links.filter((l) => l.label.trim() && l.url.trim()),
        profileCfg: {
          ring,
          show: {
            uid: showCells.uid,
            status: showCells.status,
            joined: showCells.joined,
            cheats: showCells.cheats,
            links: showCells.links,
          },
        },
      });
      patchUser(updated);
      upsertUser(updated);
      toast('профиль сохранён', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    background: 'rgba(5,4,9,0.7)',
    border: '1px solid rgba(180,160,240,0.18)',
  };

  return (
    <div
      className="sx-overlay fixed inset-0 z-50 flex"
      style={
        {
          WebkitAppRegion: 'no-drag',
          background: 'linear-gradient(135deg, #0d0a18 0%, #070611 55%, #050409 100%)',
        } as React.CSSProperties
      }
    >
      {/* ── sidebar nav ──────────────────────────────────────────────── */}
      <div
        className="flex w-[230px] shrink-0 flex-col gap-0.5 px-3 py-10 pl-8"
        style={{ background: 'rgba(10,8,16,0.6)', borderRight: '1px solid rgba(180,160,240,0.1)' }}
      >
        <p className="section-label mb-2 px-3">настройки</p>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm transition"
            style={
              tab === t.id
                ? { background: 'rgba(125,111,196,0.2)', color: '#e2d8fa' }
                : { color: '#6d6680' }
            }
          >
            {t.id === 'profile' && <UsersIcon size={16} />}
            {t.id === 'voice' && <MicIcon size={16} />}
            {t.id === 'about' && <SettingsIcon size={16} />}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── content ──────────────────────────────────────────────────── */}
      <div className="relative min-w-0 flex-1 overflow-y-auto px-10 py-10">
        <button
          onClick={close}
          className="absolute right-8 top-8 grid h-9 w-9 place-items-center rounded-full text-text-muted transition hover:text-text-primary"
          style={{ border: '1px solid rgba(180,160,240,0.25)' }}
          aria-label="закрыть (esc)"
          title="закрыть (esc)"
        >
          <CloseIcon size={16} />
        </button>

        <div className="max-w-[640px]">
          {tab === 'profile' && (
            <>
              <h2 className="heading-glow mb-6 text-xl font-semibold tracking-[0.12em]">
                мой профиль
              </h2>

              {/* live profile preview card */}
              <div
                className="mb-7 overflow-hidden rounded-[18px]"
                style={{ border: '1px solid rgba(180,160,240,0.16)' }}
              >
                <button
                  onClick={() => bannerInput.current?.click()}
                  disabled={bannerUploading}
                  className="group/banner relative block h-28 w-full overflow-hidden"
                  style={
                    banner
                      ? undefined
                      : { background: 'linear-gradient(120deg,#5d3a8c,#8c2f55)' }
                  }
                  title="сменить баннер"
                >
                  {banner && <img src={banner} alt="" className="h-full w-full object-cover" />}
                  <span
                    className="absolute inset-0 grid place-items-center text-xs font-semibold text-text-heading opacity-0 transition group-hover/banner:opacity-100"
                    style={{ background: 'rgba(5,4,9,0.55)' }}
                  >
                    {bannerUploading ? 'загрузка…' : 'сменить баннер'}
                  </span>
                </button>
                <div className="flex items-end gap-4 px-5 pb-4" style={{ background: 'rgba(10,8,16,0.8)' }}>
                  <button
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                    className="group/ava relative -mt-9"
                    title="сменить аватар"
                  >
                    <div
                      className="rounded-full p-1"
                      style={{ background: '#0a0810', boxShadow: '0 0 0 2px rgba(125,111,196,0.7)' }}
                    >
                      <Avatar username={displayName || user.username} avatarUrl={user.avatarUrl} size={72} />
                    </div>
                    <span
                      className="absolute inset-1 grid place-items-center rounded-full text-[10px] font-semibold text-text-heading opacity-0 transition group-hover/ava:opacity-100"
                      style={{ background: 'rgba(5,4,9,0.6)' }}
                    >
                      {uploading ? '…' : 'сменить'}
                    </span>
                  </button>
                  <div className="min-w-0 py-3">
                    <p className="truncate text-lg font-semibold text-text-heading">
                      {displayName.trim() || user.username}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      @{user.username}
                      {user.uid != null && <span className="ml-2">uid {user.uid}</span>}
                    </p>
                  </div>
                </div>
              </div>

              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatarFile(f);
                  e.target.value = '';
                }}
              />
              <input
                ref={bannerInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadBannerFile(f);
                  e.target.value = '';
                }}
              />

              <label className="section-label mb-1.5 block">отображаемое имя</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={user.username}
                maxLength={32}
                className="glass-input mb-5"
                style={inputStyle}
              />

              <label className="section-label mb-1.5 block">обо мне</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="пара слов о себе… (видно в профиле)"
                maxLength={300}
                rows={3}
                className="glass-input mb-1 w-full resize-none"
                style={inputStyle}
              />
              <p className="mb-5 text-right text-[10px] text-text-muted">{bio.length}/300</p>

              <label className="section-label mb-2 block">статус</label>
              <div className="mb-7 flex gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStatus(s.value)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-[10px] px-2 py-2.5 text-sm transition"
                    style={
                      status === s.value
                        ? {
                            background: 'rgba(125,111,196,0.22)',
                            color: '#e2d8fa',
                            border: '1px solid rgba(125,111,196,0.55)',
                          }
                        : {
                            background: 'rgba(5,4,9,0.5)',
                            color: '#6d6680',
                            border: '1px solid rgba(180,160,240,0.12)',
                          }
                    }
                  >
                    <span className={`status-dot ${s.dot}`} />
                    {s.label}
                  </button>
                ))}
              </div>

              {/* ── кастомизация ──────────────────────────────────────── */}
              <div className="mb-7 border-t border-glass-border pt-6">
                <h3 className="heading-glow mb-4 text-sm font-semibold tracking-[0.15em]">кастомизация ✦</h3>

                {/* accent */}
                <div className="mb-5 flex items-center justify-between rounded-[12px] px-4 py-3" style={inputStyle}>
                  <div>
                    <p className="text-sm text-text-primary">свой акцент</p>
                    <p className="text-[10px] text-text-muted">цвет имени и обводки в профиле (вместо роли)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {accentOn && (
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-8 w-10 cursor-pointer rounded border border-glass-border bg-transparent"
                      />
                    )}
                    <button
                      onClick={() => setAccentOn((v) => !v)}
                      className="relative h-5 w-9 shrink-0 rounded-full transition"
                      style={{ background: accentOn ? 'rgba(125,111,196,0.85)' : 'rgba(109,102,128,0.35)' }}
                      role="switch"
                      aria-checked={accentOn}
                    >
                      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: accentOn ? '18px' : '2px' }} />
                    </button>
                  </div>
                </div>

                {/* outline / ring */}
                <label className="section-label mb-2 block">обводка профиля</label>
                <div className="mb-5 flex gap-2">
                  {(['glow', 'solid', 'gradient', 'none'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRing(r)}
                      className="flex-1 rounded-[10px] px-2 py-2 text-xs transition"
                      style={ring === r ? { background: 'rgba(125,111,196,0.22)', color: '#e2d8fa', border: '1px solid rgba(125,111,196,0.55)' } : { ...inputStyle, color: '#6d6680' }}
                    >
                      {r === 'glow' ? 'свечение' : r === 'solid' ? 'контур' : r === 'gradient' ? 'градиент' : 'без'}
                    </button>
                  ))}
                </div>

                {/* cheats showcase */}
                <label className="section-label mb-2 block">мои читы</label>
                <div className="mb-5 flex flex-wrap gap-2">
                  {KNOWN_PROJECTS.map((p) => {
                    const on = cheats.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => setCheats((cs) => (on ? cs.filter((c) => c !== p) : [...cs, p]))}
                        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition"
                        style={on ? { background: 'rgba(125,111,196,0.22)', color: '#e2d8fa', border: '1px solid rgba(125,111,196,0.55)' } : { ...inputStyle, color: '#8a8398' }}
                      >
                        <ProjectIcon project={p} size={15} />
                        {PROJECT_LABEL[p]}
                      </button>
                    );
                  })}
                </div>

                {/* links */}
                <label className="section-label mb-2 block">ссылки (hvh-профили и т.п.)</label>
                <div className="mb-2 space-y-2">
                  {links.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={l.label}
                        onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        placeholder="название"
                        className="glass-input !py-1.5 w-32 text-sm"
                        style={inputStyle}
                      />
                      <input
                        value={l.url}
                        onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                        placeholder="https://…"
                        className="glass-input !py-1.5 min-w-0 flex-1 text-sm"
                        style={{ ...inputStyle, textTransform: 'none' }}
                      />
                      <button onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} className="icon-btn !h-9 !w-9 hover:!text-accent-pink">
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                {links.length < 8 && (
                  <button
                    onClick={() => setLinks((ls) => [...ls, { label: '', url: '' }])}
                    className="mb-5 flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-violet"
                  >
                    <PlusIcon size={14} /> добавить ссылку
                  </button>
                )}

                {/* show/hide cells */}
                <label className="section-label mb-2 block">что показывать в профиле</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { k: 'uid', label: 'uid' },
                    { k: 'status', label: 'статус' },
                    { k: 'joined', label: 'дата' },
                    { k: 'cheats', label: 'читы' },
                    { k: 'links', label: 'ссылки' },
                  ].map((c) => (
                    <button
                      key={c.k}
                      onClick={() => setShowCells((s) => ({ ...s, [c.k]: !s[c.k] }))}
                      className="rounded-full px-3 py-1 text-xs transition"
                      style={showCells[c.k] ? { background: 'rgba(125,111,196,0.2)', color: '#e2d8fa' } : { ...inputStyle, color: '#6d6680' }}
                    >
                      {showCells[c.k] ? '✓ ' : ''}{c.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="mb-4 text-sm text-accent-pink">{error}</p>}

              <button onClick={save} disabled={busy} className="btn-accent px-8">
                {busy ? '…' : 'сохранить'}
              </button>
            </>
          )}

          {tab === 'voice' && (
            <>
              <h2 className="heading-glow mb-6 text-xl font-semibold tracking-[0.12em]">
                голос и видео
              </h2>
              {(
                [
                  { label: 'микрофон', list: devices.inputs, value: inputDeviceId, set: voice.setInputDevice },
                  { label: 'динамики', list: devices.outputs, value: outputDeviceId, set: voice.setOutputDevice },
                  { label: 'камера', list: devices.cameras, value: cameraDeviceId, set: voice.setCameraDevice },
                ] as const
              ).map((d) => (
                <div key={d.label} className="mb-5">
                  <label className="section-label mb-1.5 block">{d.label}</label>
                  <select
                    value={d.value ?? ''}
                    onChange={(e) => d.set(e.target.value || null)}
                    className="glass-input w-full"
                    style={inputStyle}
                  >
                    <option value="">по умолчанию</option>
                    {d.list.map((dev, i) => (
                      <option key={dev.deviceId} value={dev.deviceId}>
                        {dev.label || `${d.label} ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              {/* push-to-talk */}
              <div
                className="mt-2 rounded-[14px] p-4"
                style={{ background: 'rgba(5,4,9,0.5)', border: '1px solid rgba(180,160,240,0.12)' }}
              >
                <PttSettings />
              </div>

              <p className="mt-3 text-xs text-text-muted">
                изменения применяются сразу — даже посреди звонка.
              </p>
            </>
          )}

          {tab === 'about' && (
            <>
              <h2 className="heading-glow mb-6 text-xl font-semibold tracking-[0.12em]">
                о приложении
              </h2>
              <div
                className="space-y-3 rounded-[14px] p-5"
                style={{ background: 'rgba(10,8,16,0.7)', border: '1px solid rgba(180,160,240,0.14)' }}
              >
                <Row k="версия" v={version ? `v${version}` : '…'} />
                <Row k="сервер" v={getServerUrl()} mono />
                <Row k="аккаунт" v={`@${user.username}${user.uid != null ? ` · uid ${user.uid}` : ''}`} />
              </div>
              <p className="mt-4 text-xs text-text-muted">
                sephraxia — self-hosted мессенджер для своих. обновления прилетают сами с github
                releases.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Pretty-print a KeyboardEvent.code like "KeyV" → "V", "Space" → "Space".
function keyLabel(code: string | null): string {
  if (!code) return 'не задано';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}

function PttSettings() {
  const enabled = useVoiceStore((s) => s.pttEnabled);
  const key = useVoiceStore((s) => s.pttKey);
  const setEnabled = useVoiceStore((s) => s.setPttEnabled);
  const setKey = useVoiceStore((s) => s.setPttKey);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== 'Escape') setKey(e.code);
      setListening(false);
    };
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [listening, setKey]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-primary">режим рации (push-to-talk)</p>
          <p className="text-[10px] text-text-muted">микрофон открыт только пока зажата клавиша</p>
        </div>
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          className="relative h-5 w-9 shrink-0 rounded-full transition"
          style={{ background: enabled ? 'rgba(125,111,196,0.85)' : 'rgba(109,102,128,0.35)' }}
          role="switch"
          aria-checked={enabled}
        >
          <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: enabled ? '18px' : '2px' }} />
        </button>
      </div>
      {enabled && (
        <div className="mt-3 flex items-center gap-3">
          <span className="section-label">клавиша</span>
          <button
            type="button"
            onClick={() => setListening(true)}
            className="rounded-lg px-4 py-1.5 text-sm font-semibold transition"
            style={{
              background: listening ? 'rgba(212,83,126,0.18)' : 'rgba(125,111,196,0.16)',
              color: listening ? '#f0a3bf' : '#cfc6f5',
              border: `1px solid ${listening ? 'rgba(212,83,126,0.5)' : 'rgba(180,160,240,0.3)'}`,
              textTransform: 'none',
            }}
          >
            {listening ? 'нажми любую клавишу…' : keyLabel(key)}
          </button>
          {key && !listening && (
            <button onClick={() => setKey(null)} className="text-[11px] text-text-muted hover:text-accent-pink">
              сбросить
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="section-label shrink-0">{k}</span>
      <span
        className="truncate text-sm text-text-primary"
        style={mono ? { fontFamily: 'Consolas, monospace', textTransform: 'none' } : undefined}
      >
        {v}
      </span>
    </div>
  );
}
