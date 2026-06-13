// Robust copy helper. Prefers Electron's native clipboard (exposed via preload)
// because navigator.clipboard frequently fails in a frameless/unfocused window;
// falls back to the web API and then execCommand.
import { toast } from '../store/toasts';

export function copyText(text: string, okMessage?: string): void {
  let done = false;
  try {
    const native = (window as unknown as { sephraxia?: { clipboard?: { writeText?: (t: string) => void } } })
      .sephraxia?.clipboard;
    if (native?.writeText) {
      native.writeText(text);
      done = true;
    }
  } catch {
    /* fall through */
  }

  if (!done && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    done = true;
  }
  if (!done) done = legacyCopy(text);

  if (done && okMessage) toast(okMessage, 'success');
  if (!done && okMessage) toast('не удалось скопировать', 'error');
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
