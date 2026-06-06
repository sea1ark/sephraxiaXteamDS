import { useEffect, useRef, useState } from 'react';
import type { UserStatus } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useVoiceStore } from '../store/voice';
import * as voice from '../lib/voice';
import { resolveAssetUrl } from '../lib/config';
import { Avatar } from './Avatar';

const STATUSES: { value: Exclude<UserStatus, 'offline'>; label: string; dot: string }[] = [
  { value: 'online', label: 'online', dot: 'status-online' },
  { value: 'idle', label: 'idle', dot: 'status-idle' },
  { value: 'dnd', label: 'do not disturb', dot: 'status-dnd' },
];

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.closeSettings);
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const upsertUser = useChatStore((s) => s.upsertUser);

  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<Exclude<UserStatus, 'offline'>>('online');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
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
    setAvatarUrl(user.avatarUrl ?? '');
    setBannerUrl(user.bannerUrl ?? '');
    setDisplayName(user.displayName ?? '');
    setStatus(user.status === 'offline' ? 'online' : user.status);
    setError(null);
    voice.listDevices().then(setDevices).catch(() => {});
  }, [open, user]);

  if (!open || !user) return null;

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const updated = await api.uploadAvatar(file);
      patchUser(updated);
      upsertUser(updated);
      setAvatarUrl(updated.avatarUrl ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'upload failed');
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
      setBannerUrl(updated.bannerUrl ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'banner upload failed');
    } finally {
      setBannerUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateProfile({
        avatarUrl: avatarUrl.trim(),
        bannerUrl: bannerUrl.trim(),
        displayName: displayName.trim(),
        status,
      });
      patchUser(updated);
      upsertUser(updated);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="sx-overlay fixed inset-0 z-50 grid place-items-center bg-black/50"
      onClick={close}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div
        className="sx-pop glass max-h-[88vh] w-[440px] overflow-y-auto rounded-glass p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="heading-glow mb-4 text-lg font-semibold tracking-[0.15em]">my profile</h2>

        {/* banner preview */}
        <div
          className="relative mb-4 h-24 overflow-hidden rounded-glass"
          style={
            resolveAssetUrl(bannerUrl)
              ? undefined
              : { background: 'linear-gradient(120deg, rgba(125,111,196,0.5), rgba(212,83,126,0.5))' }
          }
        >
          {resolveAssetUrl(bannerUrl) && (
            <img src={resolveAssetUrl(bannerUrl)!} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => bannerInput.current?.click()}
              disabled={bannerUploading}
              className="rounded-glass px-2.5 py-1 text-[11px] text-white backdrop-blur-sm transition hover:brightness-125"
              style={{ background: 'rgba(0,0,0,0.45)' }}
            >
              {bannerUploading ? 'uploading…' : 'change banner'}
            </button>
            {bannerUrl && (
              <button
                type="button"
                onClick={() => setBannerUrl('')}
                className="rounded-glass px-2.5 py-1 text-[11px] text-white backdrop-blur-sm transition hover:text-accent-pink"
                style={{ background: 'rgba(0,0,0,0.45)' }}
              >
                remove
              </button>
            )}
          </div>
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
        </div>

        {/* avatar + uploads */}
        <div className="mb-4 flex items-center gap-4">
          <Avatar username={user.username} avatarUrl={avatarUrl || null} size={64} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="rounded-glass px-3 py-1.5 text-xs text-text-primary transition hover:text-accent-violet"
                style={{ background: 'rgba(125,111,196,0.12)', border: '1px solid rgba(180,160,240,0.14)' }}
              >
                {uploading ? 'uploading…' : 'upload avatar'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl('')}
                  className="text-xs text-text-muted transition hover:text-accent-pink"
                >
                  remove
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* display name */}
        <label className="section-label mb-1 block">display name</label>
        <input
          className="glass-input mb-1"
          value={displayName}
          maxLength={32}
          placeholder={user.username}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <p className="mb-4 text-[11px] text-text-muted">
          shown to others · @{user.username}
          {user.uid ? ` · UID #${user.uid}` : ''}
        </p>

        <label className="section-label mb-2 block">status</label>
        <div className="mb-5 flex gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-glass px-2 py-2 text-sm transition ${
                status === s.value
                  ? 'text-text-heading'
                  : 'text-text-muted hover:text-text-primary'
              }`}
              style={
                status === s.value
                  ? { background: 'rgba(125,111,196,0.22)', boxShadow: 'inset 0 0 14px rgba(125,111,196,0.18)' }
                  : { background: 'rgba(125,111,196,0.06)' }
              }
            >
              <span className={`status-dot ${s.dot}`} />
              {s.label}
            </button>
          ))}
        </div>

        <p className="section-label mb-2">voice &amp; video</p>
        <div className="mb-5 space-y-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-text-muted">microphone</span>
            <select
              className="glass-input"
              value={inputDeviceId ?? ''}
              onChange={(e) => voice.setInputDevice(e.target.value || null)}
            >
              <option value="">default microphone</option>
              {devices.inputs.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-text-muted">speakers</span>
            <select
              className="glass-input"
              value={outputDeviceId ?? ''}
              onChange={(e) => voice.setOutputDevice(e.target.value || null)}
            >
              <option value="">default speakers</option>
              {devices.outputs.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `speakers ${i + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] text-text-muted">camera</span>
            <select
              className="glass-input"
              value={cameraDeviceId ?? ''}
              onChange={(e) => voice.setCameraDevice(e.target.value || null)}
            >
              <option value="">default camera</option>
              {devices.cameras.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="mb-3 text-sm text-accent-pink">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={close} className="rounded-glass px-4 py-2 text-text-muted hover:text-text-primary">
            cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-accent">
            {busy ? '…' : 'save'}
          </button>
        </div>
      </div>
    </div>
  );
}
