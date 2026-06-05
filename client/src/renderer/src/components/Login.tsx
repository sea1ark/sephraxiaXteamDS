import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { SERVER_URL, setServerUrl } from '../lib/config';

export function Login() {
  const setSession = useAuthStore((s) => s.setSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(SERVER_URL);
  const [serverSaved, setServerSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === 'login'
          ? await api.login(username, password)
          : await api.register(username, password);
      setSession(res.user, { accessToken: res.accessToken, refreshToken: res.refreshToken });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative z-10 flex h-full items-center justify-center">
      <form
        onSubmit={submit}
        className="glass w-[360px] rounded-glass p-8"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <h1 className="heading-glow mb-1 text-2xl font-semibold tracking-[0.2em]">sephraxia</h1>
        <p className="mb-6 text-sm text-text-muted">
          {mode === 'login' ? 'welcome back' : 'create your account'}
        </p>

        <label className="section-label mb-1 block">username</label>
        <input
          className="glass-input mb-4"
          value={username}
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="section-label mb-1 block">password</label>
        <input
          type="password"
          className="glass-input mb-5"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="mb-4 text-sm text-accent-pink">{error}</p>}

        <button type="submit" disabled={busy} className="btn-accent w-full">
          {busy ? '…' : mode === 'login' ? 'log in' : 'register'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs text-text-muted hover:text-accent-violet"
        >
          {mode === 'login' ? "don't have an account? register" : 'already have an account? log in'}
        </button>

        {/* server address (for connecting to a hosted / tunneled server) */}
        <button
          type="button"
          onClick={() => setShowServer((v) => !v)}
          className="mt-3 w-full text-center text-[11px] text-text-muted hover:text-accent-violet"
        >
          {showServer ? 'hide server settings' : 'server settings'}
        </button>
        {showServer && (
          <div className="mt-2">
            <label className="section-label mb-1 block">server address</label>
            <div className="flex gap-2">
              <input
                className="glass-input text-sm"
                value={server}
                placeholder="https://your-tunnel.example.com"
                onChange={(e) => {
                  setServer(e.target.value);
                  setServerSaved(false);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setServerUrl(server);
                  setServer(SERVER_URL);
                  setServerSaved(true);
                }}
                className="shrink-0 rounded-glass px-3 text-xs text-text-primary hover:text-accent-violet"
                style={{ background: 'rgba(125,111,196,0.12)', border: '1px solid rgba(180,160,240,0.14)' }}
              >
                save
              </button>
            </div>
            <p className="mt-1 text-[10px] text-text-muted">
              {serverSaved ? `saved → ${SERVER_URL}` : 'where the sephraxia server is running'}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
