import { contextBridge, ipcRenderer } from 'electron';
import type { UpdaterStatus } from '@sephraxia/shared';

/** A capturable screen or window, as returned by the main process. */
export interface DesktopSource {
  id: string; // pass as chromeMediaSourceId to getUserMedia
  name: string;
  thumbnail: string; // data URL preview
  appIcon: string | null; // data URL, windows only
}

// Minimal, explicit surface exposed to the renderer.
const api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  desktop: {
    // List screens/windows the user can share (for the screen-share picker).
    getSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke('desktop:getSources'),
  },
  updater: {
    // Current status (for components mounting after early events fired).
    current: (): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:current'),
    // Subscribe to live status pushes; returns an unsubscribe function.
    onStatus: (cb: (status: UpdaterStatus) => void): (() => void) => {
      const handler = (_e: unknown, status: UpdaterStatus) => cb(status);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
    },
    // Quit and install the downloaded update, then relaunch.
    restart: () => ipcRenderer.send('updater:restart'),
    // Force-apply the update now (installs once ready, even if force-killed).
    install: () => ipcRenderer.send('updater:install'),
    // Manually re-check for updates.
    check: () => ipcRenderer.send('updater:check'),
  },
};

contextBridge.exposeInMainWorld('sephraxia', api);

export type SephraxiaApi = typeof api;
