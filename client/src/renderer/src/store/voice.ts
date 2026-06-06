// Voice/call UI state: which voice channel we're connected to, our mute/deafen
// state, who is speaking, selected audio devices, the live participant map for
// every voice channel, and 1:1 call + screen/camera state. The WebRTC plumbing
// itself lives in lib/voice (MediaStreams are kept there, outside React).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CallStatus, VoiceParticipant } from '@sephraxia/shared';

/** What media a remote peer is currently sending (so we can label tiles). */
export interface RemoteMediaInfo {
  camStreamId: string | null;
  screenStreamId: string | null;
  muted: boolean;
}

interface CallInfo {
  status: CallStatus; // idle | outgoing | incoming | active
  peerUserId: string | null;
}

interface VoiceState {
  channelId: string | null; // the voice channel WE are connected to
  connecting: boolean;
  muted: boolean;
  deafened: boolean;
  participants: Record<string, VoiceParticipant[]>; // channelId -> members
  speaking: Record<string, boolean>; // userId -> currently talking
  inputDeviceId: string | null; // selected microphone (persisted)
  outputDeviceId: string | null; // selected speakers (persisted)
  cameraDeviceId: string | null; // selected webcam (persisted)

  // 1:1 calls + live media
  call: CallInfo;
  sharingScreen: boolean; // WE are sharing our screen
  cameraOn: boolean; // OUR camera is on
  remoteMedia: Record<string, RemoteMediaInfo>; // userId -> their media
  mediaVersion: number; // bumped to force tiles to re-read streams

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
  setCameraDeviceId: (id: string | null) => void;

  // media + call actions
  setSharingScreen: (v: boolean) => void;
  setCameraOn: (v: boolean) => void;
  bumpMedia: () => void;
  setRemoteMedia: (userId: string, info: RemoteMediaInfo) => void;
  clearRemoteMediaFor: (userId: string) => void;
  clearRemoteMedia: () => void;
  startOutgoing: (peerUserId: string) => void;
  setIncoming: (peerUserId: string) => void;
  setCallActive: (peerUserId: string) => void;
  endCallState: () => void;
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
      cameraDeviceId: null,

      call: { status: 'idle', peerUserId: null },
      sharingScreen: false,
      cameraOn: false,
      remoteMedia: {},
      mediaVersion: 0,

      setConnected: (channelId) => set({ channelId, connecting: false, speaking: {} }),
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
      setCameraDeviceId: (cameraDeviceId) => set({ cameraDeviceId }),

      setSharingScreen: (sharingScreen) => set({ sharingScreen }),
      setCameraOn: (cameraOn) => set({ cameraOn }),
      bumpMedia: () => set((s) => ({ mediaVersion: s.mediaVersion + 1 })),
      setRemoteMedia: (userId, info) =>
        set((s) => ({ remoteMedia: { ...s.remoteMedia, [userId]: info } })),
      clearRemoteMediaFor: (userId) =>
        set((s) => {
          if (!s.remoteMedia[userId]) return s;
          const remoteMedia = { ...s.remoteMedia };
          delete remoteMedia[userId];
          return { remoteMedia };
        }),
      clearRemoteMedia: () => set({ remoteMedia: {} }),
      startOutgoing: (peerUserId) => set({ call: { status: 'outgoing', peerUserId } }),
      setIncoming: (peerUserId) => set({ call: { status: 'incoming', peerUserId } }),
      setCallActive: (peerUserId) => set({ call: { status: 'active', peerUserId }, connecting: false }),
      endCallState: () =>
        set({ call: { status: 'idle', peerUserId: null }, sharingScreen: false, cameraOn: false }),
    }),
    {
      name: 'sephraxia-voice',
      // Only the device choices persist across restarts.
      partialize: (s) => ({
        inputDeviceId: s.inputDeviceId,
        outputDeviceId: s.outputDeviceId,
        cameraDeviceId: s.cameraDeviceId,
      }),
    },
  ),
);
