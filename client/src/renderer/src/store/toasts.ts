// Lightweight in-app toast notifications. Call toast() from anywhere.
import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error' | 'message';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Optional click action (e.g. open the DM the toast is about). */
  onClick?: () => void;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    // Auto-dismiss after 4.5s (errors stay a little longer).
    const ttl = t.kind === 'error' ? 6500 : 4500;
    setTimeout(() => {
      useToastStore.getState().dismiss(id);
    }, ttl);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Convenience helper: toast('saved', 'success') or toast({...}). */
export function toast(title: string, kind: ToastKind = 'info', body?: string, onClick?: () => void) {
  useToastStore.getState().push({ title, kind, body, onClick });
}
