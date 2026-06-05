// Server endpoint resolution. Priority:
//   1. a value the user saved in-app (localStorage)   ← friends paste your URL
//   2. a value baked at build time (VITE_SERVER_URL)  ← e.g. a stable tunnel
//   3. local dev default
// Exported as a live binding so api/socket pick up changes after setServerUrl().
const STORAGE_KEY = 'sephraxia-server-url';

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function resolveInitial(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalize(saved);
  } catch {
    /* storage unavailable */
  }
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_SERVER_URL;
  if (env) return normalize(env);
  return 'http://localhost:4000';
}

export let SERVER_URL = resolveInitial();

/** Persist and switch the server address (takes effect on next connect). */
export function setServerUrl(url: string): void {
  SERVER_URL = normalize(url);
  try {
    localStorage.setItem(STORAGE_KEY, SERVER_URL);
  } catch {
    /* ignore */
  }
}

export function getServerUrl(): string {
  return SERVER_URL;
}

/**
 * Resolve an uploaded-asset URL (avatar / attachment) against the current
 * server. Uploads are stored as relative paths (e.g. "/uploads/x.png") so they
 * work no matter what address the server is reached at; absolute and data URLs
 * are returned unchanged.
 */
export function resolveAssetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (url.startsWith('/')) return `${SERVER_URL}${url}`;
  return url;
}
