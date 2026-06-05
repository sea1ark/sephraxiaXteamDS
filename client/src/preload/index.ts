import { contextBridge, ipcRenderer } from 'electron';

// Minimal, explicit surface exposed to the renderer.
const api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
};

contextBridge.exposeInMainWorld('sephraxia', api);

export type SephraxiaApi = typeof api;
