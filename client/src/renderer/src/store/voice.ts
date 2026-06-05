// Voice-chat UI state: which voice channel we're connected to, our mute/deafen
// state, who is currently speaking, selected audio devices, and the live
// participant map for every voice channel. WebRTC plumbing lives in lib/voice.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VoiceParticipant } from '@sephraxia/shared';

interface VoiceState {
  channelId: string | null; // the voice channel WE are connected to
  connecting: boolean;
  muted: boolean;
  deafened: boolean;
  participants: Record<string, VoiceParticipant[]>; // channelId -> members
  speaking: Record<string, boolean>; // userId -> currently talking
  inputDeviceId: string | null; // selected microphone (persisted)
  outputDeviceId: string | null; // selected speakers (persisted)

  setConnected: (channelId: string | null) => void;
  setConnecting: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setDeafened: (v: boolean) => void;
  setSnapshot: (channels: Record<string, VoiceParticipant[]>) => void;
  addParticipant: (channelId: string, userId: string) => void;
  removeParticipant: (channelId: string, userId: string) => void;
  setParticipantMuted: (channelId: string, userId: string, muted: boolean) => void;
  setSpeaking: (userId: string, speaking: boolean) => void;
  clearSpeaking: () => void;
  setInputDeviceId: (id: string | null) => void;
  setOutputDeviceId: (id: string | null) => void;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set) => ({
      channelId: null,
      connecting: false,
      muted: false,
      deafened: false,
      participants: {},
      speaking: {},
      inputDeviceId: null,
      outputDeviceId: null,

      setConnected: (channelId) =>
        set({ channelId, connecting: false, speaking: channelId ? {} : {} }),
      setConnecting: (connecting) => set({ connecting }),
      setMuted: (muted) => set({ muted }),
      setDeafened: (deafened) => set({ deafened }),
      setSnapshot: (channels) => set({ participants: channels }),
      addParticipant: (channelId, userId) =>
        set((s) => {
          const list = s.participants[channelId] ?? [];
          if (list.some((p) => p.userId === userId)) return s;
          return { participants: { ...s.participants, [channelId]: [...list, { userId, muted: false }] } };
        }),
      removeParticipant: (channelId, userId) =>
        set((s) => {
          const list = s.participants[channelId];
          if (!list) return s;
          const next = list.filter((p) => p.userId !== userId);
          const participants = { ...s.participants };
          if (next.length) participants[channelId] = next;
          else delete participants[channelId];
          const speaking = { ...s.speaking };
          delete speaking[userId];
          return { participants, speaking };
        }),
      setParticipantMuted: (channelId, userId, muted) =>
        set((s) => {
          const list = s.participants[channelId];
          if (!list) return s;
          return {
            participants: {
              ...s.participants,
              [channelId]: list.map((p) => (p.userId === userId ? { ...p, muted } : p)),
            },
          };
        }),
      setSpeaking: (userId, speaking) =>
        set((s) => {
          if (!!s.speaking[userId] === speaking) return s;
          const next = { ...s.speaking };
          if (speaking) next[userId] = true;
          else delete next[userId];
          return { speaking: next };
        }),
      clearSpeaking: () => set({ speaking: {} }),
      setInputDeviceId: (inputDeviceId) => set({ inputDeviceId }),
      setOutputDeviceId: (outputDeviceId) => set({ outputDeviceId }),
    }),
    {
      name: 'sephraxia-voice',
      // Only the device choices persist across restarts.
      partialize: (s) => ({ inputDeviceId: s.inputDeviceId, outputDeviceId: s.outputDeviceId }),
    },
  ),
);
