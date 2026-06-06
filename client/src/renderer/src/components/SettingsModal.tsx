import { useEffect, useRef, useState } from 'react';
import type { UserStatus } from '@sephraxia/shared';
import { api, ApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useVoiceStore } from '../store/voice';
import * as voice from '../lib/voice';
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
  const [status, setStatus] = useState<Exclude<UserStatus, 'offline'>>('online');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [devices, setDevices] = useState<{
    inputs: MediaDeviceInfo[];
    outputs: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
  }>({ inputs: [], outputs: [], cameras: [] });
  const fileInput = useRef<HTMLInputElement>(null);

  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const cameraDeviceId = useVoiceStore((s) => s.cameraDeviceId);

  // Seed the form from the current user whenever the modal opens.
  useEffect(() => {
    if (!open || !user) return;
    setAvatarUrl(user.avatarUrl ?? '');
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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateProfile({ avatarUrl: avatarUrl.trim(), status });
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
      className="fixed inset-0 z-50 grid place-items-center bg-black/50"
      onClick={close}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <div className="glass w-[400px] rounded-glass p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="heading-glow mb-5 text-lg font-semibold tracking-[0.15em]">my profile</h2>

        <div className="mb-5 flex items-center gap-4">
          <Avatar username={user.username} avatarUrl={avatarUrl || null} size={64} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-text-heading">{user.username}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="rounded-glass px-3 py-1.5 text-xs text-text-primary transition hover:text-accent-violet"
                style={{ background: 'rgba(125,111,196,0.12)', border: '1px solid rgba(180,160,240,0.14)' }}
              >
                {uploading ? 'uploading…' : 'upload image'}
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
