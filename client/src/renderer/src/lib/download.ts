// Force-download a file (works inside Electron's renderer): fetch as a blob and
// trigger a temporary anchor with the desired filename. Falls back to a direct
// link if the fetch fails (e.g. CORS).
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchor(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    triggerAnchor(url, filename);
  }
}

function triggerAnchor(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
