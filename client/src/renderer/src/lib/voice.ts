// WebRTC mesh voice client. One RTCPeerConnection per remote participant,
// audio-only. Signaling is relayed through Socket.io (see Layout). The newcomer
// always initiates offers to existing peers, which avoids glare.
//
// Also handles: UI sounds, voice-activity detection (who is speaking), and
// microphone / speaker device selection.
import type { VoiceSignal } from '@sephraxia/shared';
import { getSocket } from './socket';
import { sounds } from './sounds';
import { useVoiceStore } from '../store/voice';
import { useAuthStore } from '../store/auth';

// STUN finds your public address; TURN relays audio when a direct peer-to-peer
// link can't be made (strict / symmetric NAT — common on home routers). The
// openrelay project is a free public TURN; you can override it at build time
// with VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL (e.g. a free
// Metered account) for reliability.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
if (env?.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: env.VITE_TURN_URL,
    username: env.VITE_TURN_USERNAME,
    credential: env.VITE_TURN_CREDENTIAL,
  });
}

let localStream: MediaStream | null = null;
let currentChannel: string | null = null;
const peers = new Map<string, RTCPeerConnection>();
const remoteAudio = new Map<string, HTMLAudioElement>();
const pendingIce = new Map<string, RTCIceCandidateInit[]>();

// --- Voice-activity detection ---
let vadCtx: AudioContext | null = null;
let vadTimer: ReturnType<typeof setInterval> | null = null;
const analysers = new Map<
  string,
  { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer> }
>();
const lastSpoke = new Map<string, number>();
const VAD_THRESHOLD = 0.045;
const VAD_HANGOVER = 280; // ms a ring stays lit after you stop talking

function store() {
  return useVoiceStore.getState();
}
function myId(): string {
  return useAuthStore.getState().user?.id ?? 'me';
}

function micConstraint(): MediaTrackConstraints | boolean {
  const id = store().inputDeviceId;
  return id ? { deviceId: { exact: id } } : true;
}

async function getMic(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: micConstraint(), video: false });
  } catch {
    // Selected device may be gone — fall back to the default mic.
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

/** Join (or switch to) a voice channel. Captures the mic and announces us. */
export async function joinVoice(channelId: string): Promise<void> {
  const socket = getSocket();
  if (!socket) return;
  if (currentChannel === channelId) return;
  if (currentChannel) leaveVoice();

  store().setConnecting(true);
  try {
    localStream = await getMic();
  } catch {
    store().setConnecting(false);
    alert('could not access your microphone — check the OS / app permission.');
    return;
  }
  applyMicEnabled(!store().muted);

  currentChannel = channelId;
  store().setConnected(channelId);
  addAnalyser(myId(), localStream);
  startVad();
  sounds.join();
  socket.emit('voice:join', { channelId });
}

/** Leave the current voice channel and tear everything down. */
export function leaveVoice(): void {
  const socket = getSocket();
  if (currentChannel && socket) socket.emit('voice:leave', { channelId: currentChannel });
  const wasConnected = !!currentChannel;
  for (const [userId] of peers) closePeer(userId);
  removeAnalyser(myId());
  stopVad();
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  currentChannel = null;
  store().clearSpeaking();
  store().setConnected(null);
  if (wasConnected) sounds.leave();
}

/** Tear down without emitting (used when the socket itself is going away). */
export function cleanupVoice(): void {
  for (const [userId] of peers) closePeer(userId);
  stopVad();
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  currentChannel = null;
}

function createPeer(remoteUserId: string, initiator: boolean): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers.set(remoteUserId, pc);

  localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream!));

  pc.onicecandidate = (e) => {
    if (e.candidate && currentChannel) signal(remoteUserId, { kind: 'ice', candidate: e.candidate.toJSON() });
  };

  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? null;
    let el = remoteAudio.get(remoteUserId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.dataset.voicePeer = remoteUserId;
      el.muted = store().deafened;
      document.body.appendChild(el);
      remoteAudio.set(remoteUserId, el);
      applySink(el);
    }
    el.srcObject = stream;
    if (stream) addAnalyser(remoteUserId, stream);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(remoteUserId);
  };

  if (initiator) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        if (pc.localDescription) signal(remoteUserId, { kind: 'offer', sdp: pc.localDescription.sdp });
      })
      .catch(() => {});
  }
  return pc;
}

function closePeer(remoteUserId: string): void {
  const pc = peers.get(remoteUserId);
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    peers.delete(remoteUserId);
  }
  const el = remoteAudio.get(remoteUserId);
  if (el) {
    el.srcObject = null;
    el.remove();
    remoteAudio.delete(remoteUserId);
  }
  removeAnalyser(remoteUserId);
  pendingIce.delete(remoteUserId);
}

function signal(toUserId: string, data: VoiceSignal): void {
  if (!currentChannel) return;
  getSocket()?.emit('voice:signal', { channelId: currentChannel, toUserId, data });
}

// --- Inbound signaling (wired up in Layout) ---

export function onPeers(participants: { userId: string }[]): void {
  for (const p of participants) createPeer(p.userId, true);
}

async function flushIce(userId: string, pc: RTCPeerConnection): Promise<void> {
  const queued = pendingIce.get(userId);
  if (!queued) return;
  pendingIce.delete(userId);
  for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
}

export async function onSignal(fromUserId: string, data: VoiceSignal): Promise<void> {
  try {
    if (data.kind === 'offer') {
      const pc = peers.get(fromUserId) ?? createPeer(fromUserId, false);
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      await flushIce(fromUserId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (pc.localDescription) signal(fromUserId, { kind: 'answer', sdp: pc.localDescription.sdp });
    } else if (data.kind === 'answer') {
      const pc = peers.get(fromUserId);
      if (pc) {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        await flushIce(fromUserId, pc);
      }
    } else if (data.kind === 'ice') {
      const pc = peers.get(fromUserId);
      const candidate = data.candidate as RTCIceCandidateInit;
      if (pc && pc.remoteDescription) await pc.addIceCandidate(candidate);
      else pendingIce.set(fromUserId, [...(pendingIce.get(fromUserId) ?? []), candidate]);
    }
  } catch {
    /* ignore malformed / late signaling */
  }
}

export function onPeerLeft(userId: string): void {
  closePeer(userId);
}

// --- Local controls ---

function applyMicEnabled(enabled: boolean): void {
  localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
}

function setMuted(muted: boolean): void {
  applyMicEnabled(!muted);
  store().setMuted(muted);
  if (currentChannel) getSocket()?.emit('voice:state', { channelId: currentChannel, muted });
}

export function toggleMute(): void {
  const next = !store().muted;
  setMuted(next);
  if (next) sounds.mute();
  else sounds.unmute();
}

export function toggleDeafen(): void {
  const deafened = !store().deafened;
  store().setDeafened(deafened);
  for (const el of remoteAudio.values()) el.muted = deafened;
  // Deafening also mutes your mic (Discord behaviour).
  setMuted(deafened);
  if (deafened) sounds.deafen();
  else sounds.undeafen();
}

// --- Device selection ---

export interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

export async function listDevices(): Promise<AudioDevices> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === 'audioinput'),
      outputs: devices.filter((d) => d.kind === 'audiooutput'),
    };
  } catch {
    return { inputs: [], outputs: [] };
  }
}

export async function setInputDevice(deviceId: string | null): Promise<void> {
  store().setInputDeviceId(deviceId);
  if (!currentChannel || !localStream) return;
  let newStream: MediaStream;
  try {
    newStream = await getMic();
  } catch {
    return;
  }
  const newTrack = newStream.getAudioTracks()[0];
  if (!newTrack) return;
  newTrack.enabled = !store().muted;
  for (const pc of peers.values()) {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender) await sender.replaceTrack(newTrack).catch(() => {});
  }
  localStream.getTracks().forEach((t) => t.stop());
  localStream = newStream;
  removeAnalyser(myId());
  addAnalyser(myId(), localStream);
}

function applySink(el: HTMLAudioElement): void {
  const id = store().outputDeviceId;
  const sinkable = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (id && typeof sinkable.setSinkId === 'function') sinkable.setSinkId(id).catch(() => {});
}

export function setOutputDevice(deviceId: string | null): void {
  store().setOutputDeviceId(deviceId);
  for (const el of remoteAudio.values()) applySink(el);
}

// --- VAD plumbing ---

function ensureVadCtx(): AudioContext {
  if (!vadCtx) vadCtx = new AudioContext();
  if (vadCtx.state === 'suspended') vadCtx.resume().catch(() => {});
  return vadCtx;
}

function addAnalyser(userId: string, stream: MediaStream): void {
  if (analysers.has(userId)) removeAnalyser(userId);
  try {
    const ac = ensureVadCtx();
    const source = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser); // tap only — not connected to destination
    analysers.set(userId, { analyser, source, data: new Uint8Array(new ArrayBuffer(analyser.fftSize)) });
  } catch {
    /* analysis unavailable */
  }
}

function removeAnalyser(userId: string): void {
  const a = analysers.get(userId);
  if (a) {
    try {
      a.source.disconnect();
    } catch {
      /* ignore */
    }
    analysers.delete(userId);
  }
  lastSpoke.delete(userId);
  store().setSpeaking(userId, false);
}

function startVad(): void {
  if (vadTimer) return;
  vadTimer = setInterval(() => {
    const now = performance.now();
    for (const [userId, a] of analysers) {
      a.analyser.getByteTimeDomainData(a.data);
      let sum = 0;
      for (let i = 0; i < a.data.length; i++) {
        const v = (a.data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / a.data.length);
      // A muted local mic should never light up.
      const muted = userId === myId() && store().muted;
      if (!muted && rms > VAD_THRESHOLD) lastSpoke.set(userId, now);
      store().setSpeaking(userId, now - (lastSpoke.get(userId) ?? 0) < VAD_HANGOVER);
    }
  }, 90);
}

function stopVad(): void {
  if (vadTimer) {
    clearInterval(vadTimer);
    vadTimer = null;
  }
  for (const [userId] of analysers) removeAnalyser(userId);
  analysers.clear();
}
