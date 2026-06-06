import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';
import { app, BrowserWindow, ipcMain, shell, session, protocol, net, desktopCapturer } from 'electron';
import type { UpdaterStatus } from '@sephraxia/shared';

const isDev = !!process.env.ELECTRON_RENDERER_URL;

// Register a privileged custom scheme so the PACKAGED renderer runs in a SECURE
// CONTEXT. (A file:// page is not a secure context, so getUserMedia / WebRTC
// voice would be blocked.) Must be called before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#050409',
    webPreferences: {
      // electron-vite emits the preload as .mjs (package is "type": "module").
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // Open external links in the user's browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL!);
  } else {
    win.loadURL('app://bundle/index.html');
  }
}

// Window-control IPC (frameless window has no native buttons).
ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('window:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

// --- Screen sharing ---
// Enumerate capturable screens and windows (with thumbnails) so the renderer can
// show its own source picker. The chosen source id is then handed to
// getUserMedia({ video: { mandatory: { chromeMediaSourceId } } }) in the
// renderer — the classic Electron desktop-capture path, which works on Windows
// without the (flaky) system picker.
ipcMain.handle('desktop:getSources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: true,
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});

// --- Auto-update IPC ---
// The renderer renders the download UI; the main process feeds it status and
// performs the restart. Registered up-front (not inside the async updater setup)
// so `updater:current` is always available when the renderer mounts.
let autoUpdaterRef: typeof import('electron-updater').autoUpdater | null = null;
let lastUpdaterStatus: UpdaterStatus = { state: 'idle' };

function broadcastUpdaterStatus(status: UpdaterStatus): void {
  lastUpdaterStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:status', status);
  }
}

// Renderer asks for the current state on mount (it may have missed early events).
ipcMain.handle('updater:current', () => lastUpdaterStatus);
// Renderer's "Restart" button. quitAndInstall: isSilent, isForceRunAfter.
ipcMain.on('updater:restart', () => autoUpdaterRef?.quitAndInstall(true, true));

// Force-apply an update. If it's already downloaded, install + relaunch right
// now (does NOT rely on the install-on-quit hook, which is skipped when the app
// is force-killed). If it's still downloading, remember the intent and install
// as soon as the download finishes.
let pendingInstall = false;
ipcMain.on('updater:install', () => {
  if (!autoUpdaterRef) return;
  if (lastUpdaterStatus.state === 'downloaded') {
    autoUpdaterRef.quitAndInstall(true, true);
  } else {
    pendingInstall = true;
    autoUpdaterRef.checkForUpdates().catch(() => {});
  }
});
// Manual re-check trigger.
ipcMain.on('updater:check', () => autoUpdaterRef?.checkForUpdates().catch(() => {}));

app.whenReady().then(async () => {
  // Grant microphone access for WebRTC voice chat (deny everything else).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  // Serve the bundled renderer over the secure app:// scheme in production.
  if (!isDev) {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
      return net.fetch(pathToFileURL(join(__dirname, '../renderer', rel)).toString());
    });
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Auto-update from GitHub Releases in the packaged app (no-op in dev).
  if (!isDev) setupAutoUpdate();
});

// Make updates visible and deterministic instead of relying on the silent
// download + install-on-quit dance: friends were closing the app before the
// first (full, ~82 MB) download finished, so nothing ever installed. We download
// in the background, push live progress to the renderer (which shows a progress
// bar + "Restart" button), and write a diagnostic log. install-on-quit stays on
// as a silent fallback if the user never clicks Restart.
async function setupAutoUpdate(): Promise<void> {
  try {
    const { autoUpdater } = await import('electron-updater');
    autoUpdaterRef = autoUpdater;

    // Append-only log so we can diagnose update issues on a friend's machine:
    // %APPDATA%\Sephraxia\updater.log
    const logPath = join(app.getPath('userData'), 'updater.log');
    const ulog = (...parts: unknown[]): void => {
      const line = `[${new Date().toISOString()}] ${parts.map(String).join(' ')}\n`;
      try {
        appendFileSync(logPath, line);
      } catch {
        // logging must never crash the updater
      }
      console.log('[updater]', ...parts);
    };

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: ulog, warn: ulog, error: ulog, debug: () => {} } as never;

    // The download-progress event carries no version, so remember it here.
    let pendingVersion = '';

    autoUpdater.on('error', (err: Error) => {
      ulog('error:', err?.message ?? err);
      broadcastUpdaterStatus({ state: 'error', message: err?.message ?? String(err) });
    });
    autoUpdater.on('checking-for-update', () => {
      ulog('checking, current version', app.getVersion());
      broadcastUpdaterStatus({ state: 'checking' });
    });
    autoUpdater.on('update-available', (i) => {
      pendingVersion = i.version;
      ulog('update available:', i.version, '— downloading');
      broadcastUpdaterStatus({ state: 'available', version: i.version });
    });
    autoUpdater.on('update-not-available', () => {
      ulog('already up to date:', app.getVersion());
      broadcastUpdaterStatus({ state: 'none' });
    });
    autoUpdater.on('download-progress', (p) => {
      ulog('downloading', `${Math.round(p.percent)}%`);
      broadcastUpdaterStatus({
        state: 'progress',
        version: pendingVersion,
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
        bytesPerSecond: p.bytesPerSecond,
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      ulog('update downloaded:', info.version);
      broadcastUpdaterStatus({ state: 'downloaded', version: info.version });
      // If the user asked to update while it was still downloading, apply now.
      if (pendingInstall) {
        ulog('pending install → quitAndInstall');
        autoUpdater.quitAndInstall(true, true);
      }
    });

    await autoUpdater.checkForUpdates();
    // Re-check periodically so long-running sessions still pick up releases.
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 15 * 60 * 1000);
  } catch (err) {
    console.error('auto-update unavailable:', err);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
