import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { SERVER_URL, setServerUrl } from '../lib/config';
import { useUpdater } from '../lib/useUpdater';
import { toast } from '../store/toasts';

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
  const update = useUpdater();

  // After a manual check, announce the outcome so the button never feels dead.
  const checkedManually = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  function finishCheck() {
    checkedManually.current = false;
    if (watchdog.current) {
      clearTimeout(watchdog.current);
      watchdog.current = null;
    }
  }
  function startCheck() {
    checkedManually.current = true;
    if (watchdog.current) clearTimeout(watchdog.current);
    // If GitHub never answers (offline / blocked), don't leave the user hanging.
    watchdog.current = setTimeout(() => {
      if (checkedManually.current) {
        toast('обновления недоступны — нет ответа от github', 'error');
        finishCheck();
      }
    }, 12000);
    toast('проверяю обновления…', 'info');
    update.check();
  }
  useEffect(() => {
    if (!checkedManually.current) return;
    if (update.upToDate) {
      toast('у тебя актуальная версия ✦', 'success');
      finishCheck();
    } else if (update.status.state === 'error') {
      toast('не удалось проверить обновления', 'error');
      finishCheck();
    } else if (update.hasUpdate) {
      toast('найдено обновление — качаю…', 'success');
      finishCheck();
    }
  }, [update.upToDate, update.status.state, update.hasUpdate]);

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
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3">
      {update.hasUpdate && (
        <button
          type="button"
          onClick={update.install}
          className="flex w-[360px] items-center gap-3 rounded-glass border border-accent-violet/40 bg-accent-violet/15 px-4 py-2.5 text-left transition hover:bg-accent-violet/25 hover:shadow-glow-violet"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="обновить приложение"
        >
          <span className="text-lg">🔄</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-text-heading">
              {update.downloaded ? 'Обновление готово' : 'Доступно обновление'}
              {update.version ? ` · v${update.version}` : ''}
            </span>
            <span className="block text-[11px] text-text-muted">
              {update.downloaded
                ? 'нажмите, чтобы установить и перезапустить'
                : update.downloading
                  ? `загрузка… ${update.percent}% · нажмите, чтобы обновить по готовности`
                  : 'нажмите, чтобы обновить'}
            </span>
          </span>
        </button>
      )}
      <form
        onSubmit={submit}
        className="sx-pop glass w-[360px] rounded-glass p-8"
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

        {/* version + update */}
        <div className="mt-5 flex items-center justify-between border-t border-glass-border pt-3">
          <span className="text-[11px] text-text-muted">
            Sephraxia{update.appVersion ? ` v${update.appVersion}` : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              if (update.hasUpdate) {
                update.install();
              } else {
                startCheck();
              }
            }}
            disabled={update.checking}
            className="rounded-glass px-3 py-1 text-[11px] font-medium transition disabled:opacity-60"
            style={
              update.hasUpdate
                ? { background: 'rgba(125,111,196,0.25)', color: '#e2d8fa', border: '1px solid rgba(180,160,240,0.4)' }
                : { background: 'rgba(125,111,196,0.1)', color: '#a89fc4', border: '1px solid rgba(180,160,240,0.16)' }
            }
          >
            {update.downloaded
              ? 'обновить и перезапустить'
              : update.downloading
                ? `загрузка ${update.percent}%`
                : update.checking
                  ? 'проверка…'
                  : update.upToDate
                    ? 'актуальная версия · проверить'
                    : 'проверить обновления'}
          </button>
        </div>
      </form>
    </div>
  );
}
