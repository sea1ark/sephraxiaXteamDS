// WebRTC engine for both channel voice (N-way mesh) and 1:1 DM calls. One
// RTCPeerConnection per remote participant. Each connection can carry the mic
// (audio), a webcam (video) and a shared screen (video) — tracks are added and
// removed live, with **perfect negotiation** (the polite/impolite pattern) so
// simultaneous renegotiations never deadlock (glare-free).
//
// Signaling is relayed through Socket.io (`voice:signal`, server just forwards
// by target user). The same relay carries a small out-of-band `media` note so
// the receiver can label which incoming MediaStream is a screen vs a webcam.
//
// Also handles: UI sounds, voice-activity detection, and mic/speaker selection.
import type { VoiceSignal } from '@sephraxia/shared';
import { getSocket } from './socket';
import { sounds } from './sounds';
import { useVoiceStore } from '../store/voice';
import { useAuthStore } from '../store/auth';

// STUN finds your public address; TURN relays media when a direct peer-to-peer
// link can't be made (strict / symmetric NAT). TURN creds are fetched at runtime
// from VITE_TURN_API (e.g. Metered) so they stay fresh; we fall back to STUN.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
let dynamicIce: RTCIceServer[] = [];

async function refreshTurn(): Promise<void> {
  const api = env?.VITE_TURN_API;
  if (!api) return;
  try {
    const res = await fetch(api);
    const servers = await res.json();
    if (Array.isArray(servers) && servers.length) dynamicIce = servers as RTCIceServer[];
  } catch {
    /* keep STUN-only */
  }
}

function iceServers(): RTCIceServer[] {
  return [...ICE_SERVERS, ...dynamicIce];
}

// --- Session + media state (lives outside React) ---

type SessionKind = 'channel' | 'call';
// id = channelId for a channel session, the peer's userId for a 1:1 call.
let session: { kind: SessionKind; id: string } | null = null;

let micStream: MediaStream | null = null;
let camStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;

// Auto-give-up timer for an unanswered outgoing call.
let outgoingTimer: ReturnType<typeof setTimeout> | null = null;
const RING_TIMEOUT = 40_000;
function clearOutgoingTimer(): void {
  if (outgoingTimer) {
    clearTimeout(outgoingTimer);
    outgoingTimer = null;
  }
}
/** Called by Layout when the server resolves an outgoing call (declined/busy/etc). */
export function abortOutgoing(): void {
  clearOutgoingTimer();
}

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean; // perfect-negotiation role (deterministic from user ids)
  makingOffer: boolean;
  ignoreOffer: boolean;
}
const peers = new Map<string, Peer>();
const pendingIce = new Map<string, RTCIceCandidateInit[]>();
const remoteAudio = new Map<string, HTMLAudioElement>();

// Remote video, indexed by user then by the stream's id. We learn which stream
// is a webcam vs a screen from the peer's `media` signal (stable stream ids).
const remoteStreams = new Map<string, Map<string, MediaStream>>();
const remoteLabels = new Map<string, { camStreamId: string | null; screenStreamId: string | null }>();

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

// Deterministic, opposite-on-each-side politeness so glare resolves cleanly.
function isPolite(remoteId: string): boolean {
  return myId() < remoteId;
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

/** Capture the mic, prime TURN, start VAD. Returns false if mic is unavailable. */
async function startMic(): Promise<boolean> {
  store().setConnecting(true);
  try {
    micStream = await getMic();
  } catch {
    store().setConnecting(false);
    alert('could not access your microphone — check the OS / app permission.');
    return false;
  }
  applyMicEnabled(!store().muted);
  await refreshTurn();
  addAnalyser(myId(), micStream);
  startVad();
  return true;
}

// --- Signaling helpers ---

function sendSignal(toUserId: string, data: VoiceSignal): void {
  const socket = getSocket();
  if (!socket || !session) return;
  // channelId is opaque to the server (it relays purely by target user); for a
  // call we tag it so logs are readable.
  const channelId = session.kind === 'channel' ? session.id : `call:${session.id}`;
  socket.emit('voice:signal', { channelId, toUserId, data });
}

function mediaNote(): Extract<VoiceSignal, { kind: 'media' }> {
  return {
    kind: 'media',
    camStreamId: camStream?.id ?? null,
    screenStreamId: screenStream?.id ?? null,
    muted: store().muted,
  };
}
function announceMediaTo(userId: string): void {
  sendSignal(userId, mediaNote());
}
function announceMediaAll(): void {
  for (const id of peers.keys()) sendSignal(id, mediaNote());
}

function sendDescription(toUserId: string, pc: RTCPeerConnection): void {
  const d = pc.localDescription;
  if (d && (d.type === 'offer' || d.type === 'answer')) sendSignal(toUserId, { kind: d.type, sdp: d.sdp });
}

// --- Peer connections ---

function addLocalTracksTo(pc: RTCPeerConnection): void {
  micStream?.getAudioTracks().forEach((t) => pc.addTrack(t, micStream!));
  camStream?.getVideoTracks().forEach((t) => pc.addTrack(t, camStream!));
  screenStream?.getTracks().forEach((t) => pc.addTrack(t, screenStream!));
}

function addStreamToPeers(stream: MediaStream): void {
  for (const { pc } of peers.values()) {
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
  }
}

function removeStreamFromPeers(stream: MediaStream): void {
  const tracks = new Set(stream.getTracks());
  for (const { pc } of peers.values()) {
    for (const sender of pc.getSenders()) {
      if (sender.track && tracks.has(sender.track)) pc.removeTrack(sender);
    }
  }
}

function createPeer(remoteUserId: string): Peer {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const peer: Peer = { pc, polite: isPolite(remoteUserId), makingOffer: false, ignoreOffer: false };
  peers.set(remoteUserId, peer);

  addLocalTracksTo(pc);

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(remoteUserId, { kind: 'ice', candidate: e.candidate.toJSON() });
  };

  pc.ontrack = (e) => {
    const stream = e.streams[0];
    if (!stream) return;
    if (e.track.kind === 'audio') {
      attachRemoteAudio(remoteUserId, stream);
      addAnalyser(remoteUserId, stream);
    } else {
      let byStream = remoteStreams.get(remoteUserId);
      if (!byStream) {
        byStream = new Map();
        remoteStreams.set(remoteUserId, byStream);
      }
      byStream.set(stream.id, stream);
      e.track.addEventListener('ended', () => {
        remoteStreams.get(remoteUserId)?.delete(stream.id);
        store().bumpMedia();
      });
    }
    store().bumpMedia();
  };

  // Perfect negotiation: any track change fires this; we always (re)offer and
  // let the polite/impolite rule sort out collisions on the receiving side.
  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      sendDescription(remoteUserId, pc);
    } catch {
      /* ignore */
    } finally {
      peer.makingOffer = false;
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      try {
        pc.restartIce();
      } catch {
        /* older impls */
      }
    } else if (pc.connectionState === 'closed') {
      closePeer(remoteUserId);
    }
  };

  // Tell the new peer what video we're already sending so it can label tiles.
  announceMediaTo(remoteUserId);
  return peer;
}

function closePeer(remoteUserId: string): void {
  const peer = peers.get(remoteUserId);
  if (peer) {
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peers.delete(remoteUserId);
  }
  const el = remoteAudio.get(remoteUserId);
  if (el) {
    el.srcObject = null;
    el.remove();
    remoteAudio.delete(remoteUserId);
  }
  remoteStreams.delete(remoteUserId);
  remoteLabels.delete(remoteUserId);
  pendingIce.delete(remoteUserId);
  removeAnalyser(remoteUserId);
  store().clearRemoteMediaFor(remoteUserId);
  store().bumpMedia();
}

function attachRemoteAudio(userId: string, stream: MediaStream): void {
  let el = remoteAudio.get(userId);
  if (!el) {
    el = document.createElement('audio');
    el.autoplay = true;
    el.dataset.voicePeer = userId;
    el.muted = store().deafened;
    document.body.appendChild(el);
    remoteAudio.set(userId, el);
    applySink(el);
  }
  el.srcObject = stream;
}

// --- Inbound signaling (wired up in Layout) ---

/** Channel session: the participants already present that we should dial. */
export function onPeers(participants: { userId: string }[]): void {
  for (const p of participants) if (!peers.has(p.userId)) createPeer(p.userId);
}

async function flushIce(userId: string, pc: RTCPeerConnection): Promise<void> {
  const queued = pendingIce.get(userId);
  if (!queued) return;
  pendingIce.delete(userId);
  for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
}

export async function onSignal(fromUserId: string, data: VoiceSignal): Promise<void> {
  // Media labels can arrive before we have a peer; just remember them.
  if (data.kind === 'media') {
    remoteLabels.set(fromUserId, { camStreamId: data.camStreamId, screenStreamId: data.screenStreamId });
    store().setRemoteMedia(fromUserId, {
      camStreamId: data.camStreamId,
      screenStreamId: data.screenStreamId,
      muted: data.muted,
    });
    store().bumpMedia();
    return;
  }

  if (!session) return;
  const peer = peers.get(fromUserId) ?? createPeer(fromUserId);
  const { pc } = peer;
  try {
    if (data.kind === 'offer' || data.kind === 'answer') {
      const description: RTCSessionDescriptionInit = { type: data.kind, sdp: data.sdp };
      const offerCollision =
        data.kind === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;
      // Polite peer relies on implicit rollback when setting a remote offer
      // while it has a local offer pending (supported by modern Chromium).
      await pc.setRemoteDescription(description);
      await flushIce(fromUserId, pc);
      if (data.kind === 'offer') {
        await pc.setLocalDescription();
        sendDescription(fromUserId, pc);
      }
    } else if (data.kind === 'ice') {
      const candidate = data.candidate as RTCIceCandidateInit;
      if (pc.remoteDescription) {
        await pc.addIceCandidate(candidate).catch(() => {});
      } else {
        pendingIce.set(fromUserId, [...(pendingIce.get(fromUserId) ?? []), candidate]);
      }
    }
  } catch {
    /* ignore malformed / late signaling */
  }
}

export function onPeerLeft(userId: string): void {
  closePeer(userId);
}

// --- Channel voice ---

/** Join (or switch to) a voice channel. Captures the mic and announces us. */
export async function joinVoice(channelId: string): Promise<void> {
  const socket = getSocket();
  if (!socket) return;
  if (session?.kind === 'channel' && session.id === channelId) return;
  if (session) leaveVoice();

  if (!(await startMic())) return;
  session = { kind: 'channel', id: channelId };
  store().setConnected(channelId);
  sounds.join();
  socket.emit('voice:join', { channelId });
}

/** Leave the current voice channel and tear everything down. */
export function leaveVoice(): void {
  const socket = getSocket();
  const wasConnected = !!session;
  if (session?.kind === 'channel' && socket) socket.emit('voice:leave', { channelId: session.id });
  teardown();
  store().setConnected(null);
  if (wasConnected) sounds.leave();
}

// --- 1:1 DM calls ---

/** Caller: ring a user. Media starts once the callee accepts (call:accepted). */
export function startCall(peerUserId: string): void {
  const socket = getSocket();
  if (!socket) return;
  if (session) leaveVoice(); // can't be in channel voice and a call at once
  clearOutgoingTimer();
  store().startOutgoing(peerUserId);
  socket.emit('call:invite', { toUserId: peerUserId });
  // Give up if the callee never answers, so we don't ring forever.
  outgoingTimer = setTimeout(() => {
    if (store().call.status === 'outgoing') endCall();
  }, RING_TIMEOUT);
}

/** Callee: accept an incoming ring. Media starts on the call:accepted echo. */
export function acceptCall(peerUserId: string): void {
  getSocket()?.emit('call:accept', { peerUserId });
}

/** Callee: reject an incoming ring. */
export function declineCall(peerUserId: string): void {
  getSocket()?.emit('call:decline', { peerUserId });
  store().endCallState();
}

/** Both sides handle this once the call connects: capture mic and open the peer. */
export async function onCallAccepted(peerUserId: string): Promise<void> {
  const socket = getSocket();
  if (!socket) return;
  clearOutgoingTimer();
  if (session?.kind === 'call' && session.id === peerUserId) return; // duplicate echo
  if (session) leaveVoice();

  if (!(await startMic())) {
    socket.emit('call:end', { peerUserId });
    store().endCallState();
    return;
  }
  session = { kind: 'call', id: peerUserId };
  store().setCallActive(peerUserId);
  sounds.join();
  // Both sides create the peer; perfect negotiation makes the dual-offer safe.
  if (!peers.has(peerUserId)) createPeer(peerUserId);
}

/** Hang up an active call, or cancel one we're still placing. */
export function endCall(): void {
  clearOutgoingTimer();
  const socket = getSocket();
  const { status, peerUserId } = store().call;
  if (socket && peerUserId) {
    if (status === 'outgoing') socket.emit('call:cancel', { toUserId: peerUserId });
    else socket.emit('call:end', { peerUserId });
  }
  const had = session?.kind === 'call';
  teardown();
  store().endCallState();
  store().setConnected(null);
  if (had) sounds.leave();
}

/** The remote party ended/cancelled the call, or went offline. */
export function handleRemoteCallEnd(): void {
  clearOutgoingTimer();
  if (session?.kind === 'call') teardown();
  store().endCallState();
  store().setConnected(null);
  sounds.leave();
}

// --- Screen sharing & camera (work in both channel voice and calls) ---

/** Screen-share quality. Capped by the source's real resolution. */
export interface ScreenQuality {
  height: number; // 720 | 1080 | 1440
  fps: number; // 30 | 60
}
export const DEFAULT_SCREEN_QUALITY: ScreenQuality = { height: 1440, fps: 60 };

/**
 * Start sharing a screen / window. `sourceId` comes from the screen-share
 * picker (Electron desktopCapturer). Uses the classic getUserMedia desktop
 * path, which is reliable on Windows. Defaults to 1440p 60fps.
 */
export async function startScreenShare(
  sourceId: string,
  quality: ScreenQuality = DEFAULT_SCREEN_QUALITY,
): Promise<void> {
  if (!session) return;
  if (screenStream) stopScreenShare();
  const maxHeight = quality.height;
  const maxWidth = Math.round((maxHeight * 16) / 9);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth,
          maxHeight,
          maxFrameRate: quality.fps,
        },
      },
    } as unknown as MediaStreamConstraints);
  } catch {
    alert('could not start screen sharing.');
    return;
  }
  screenStream = stream;
  // If the user stops the share from the OS overlay, clean up our side too.
  stream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShare());
  addStreamToPeers(stream);
  store().setSharingScreen(true);
  store().bumpMedia();
  announceMediaAll();
  sounds.screenOn();
}

export function stopScreenShare(): void {
  if (!screenStream) return;
  removeStreamFromPeers(screenStream);
  screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null;
  store().setSharingScreen(false);
  store().bumpMedia();
  announceMediaAll();
  sounds.screenOff();
}

function camConstraint(): MediaTrackConstraints | boolean {
  const id = store().cameraDeviceId;
  return id ? { deviceId: { exact: id } } : true;
}

async function getCam(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: camConstraint(), audio: false });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

export async function startCamera(): Promise<void> {
  if (!session || camStream) return;
  let stream: MediaStream;
  try {
    stream = await getCam();
  } catch {
    alert('could not access your camera.');
    return;
  }
  camStream = stream;
  stream.getVideoTracks()[0]?.addEventListener('ended', () => stopCamera());
  addStreamToPeers(stream);
  store().setCameraOn(true);
  store().bumpMedia();
  announceMediaAll();
}

export function stopCamera(): void {
  if (!camStream) return;
  removeStreamFromPeers(camStream);
  camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
  store().setCameraOn(false);
  store().bumpMedia();
  announceMediaAll();
}

// --- Exposed media accessors for the React video tiles ---

export interface RemoteMedia {
  camera: MediaStream | null;
  screen: MediaStream | null;
}

export function getRemoteMedia(userId: string): RemoteMedia {
  const labels = remoteLabels.get(userId);
  const streams = remoteStreams.get(userId);
  if (!streams) return { camera: null, screen: null };
  return {
    camera: labels?.camStreamId ? streams.get(labels.camStreamId) ?? null : null,
    screen: labels?.screenStreamId ? streams.get(labels.screenStreamId) ?? null : null,
  };
}

export function getLocalCamera(): MediaStream | null {
  return camStream;
}
export function getLocalScreen(): MediaStream | null {
  return screenStream;
}

// --- Teardown ---

function teardown(): void {
  for (const id of [...peers.keys()]) closePeer(id);
  pendingIce.clear();
  remoteStreams.clear();
  remoteLabels.clear();
  for (const s of [micStream, camStream, screenStream]) s?.getTracks().forEach((t) => t.stop());
  micStream = camStream = screenStream = null;
  stopVad();
  session = null;
  const st = store();
  st.clearSpeaking();
  st.clearRemoteMedia();
  st.setSharingScreen(false);
  st.setCameraOn(false);
}

/** Tear down without emitting (used when the socket itself is going away). */
export function cleanupVoice(): void {
  teardown();
  store().setConnected(null);
  store().endCallState();
}

// --- Local controls ---

function applyMicEnabled(enabled: boolean): void {
  micStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
}

/** Effective mic state given mute, deafen, and push-to-talk. */
function micShouldBeOn(): boolean {
  const s = store();
  if (s.deafened) return false;
  if (s.pttEnabled) return s.pttHeld; // PTT overrides manual mute
  return !s.muted;
}

function setMuted(muted: boolean): void {
  store().setMuted(muted);
  applyMicEnabled(micShouldBeOn());
  if (session?.kind === 'channel') getSocket()?.emit('voice:state', { channelId: session.id, muted });
  announceMediaAll(); // propagate mute to call peers
}

/** Push-to-talk: held → talk, released → silent. No-op unless PTT is enabled. */
export function setPttHeld(held: boolean): void {
  const s = store();
  if (!s.pttEnabled || s.pttHeld === held) return;
  s.setPttHeld(held);
  applyMicEnabled(micShouldBeOn());
  const muted = !held;
  if (session?.kind === 'channel') getSocket()?.emit('voice:state', { channelId: session.id, muted });
  announceMediaAll();
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

export function toggleScreenShare(sourceId?: string): void {
  if (screenStream) stopScreenShare();
  else if (sourceId) void startScreenShare(sourceId);
}

export function toggleCamera(): void {
  if (camStream) stopCamera();
  else void startCamera();
}

// --- Device selection ---

export interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
}

export async function listDevices(): Promise<AudioDevices> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === 'audioinput'),
      outputs: devices.filter((d) => d.kind === 'audiooutput'),
      cameras: devices.filter((d) => d.kind === 'videoinput'),
    };
  } catch {
    return { inputs: [], outputs: [], cameras: [] };
  }
}

export async function setInputDevice(deviceId: string | null): Promise<void> {
  store().setInputDeviceId(deviceId);
  if (!session || !micStream) return;
  let newStream: MediaStream;
  try {
    newStream = await getMic();
  } catch {
    return;
  }
  const newTrack = newStream.getAudioTracks()[0];
  if (!newTrack) return;
  newTrack.enabled = !store().muted;
  for (const { pc } of peers.values()) {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender) await sender.replaceTrack(newTrack).catch(() => {});
  }
  micStream.getTracks().forEach((t) => t.stop());
  micStream = newStream;
  removeAnalyser(myId());
  addAnalyser(myId(), micStream);
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

/** Switch webcams. Applies live if the camera is already on. */
export async function setCameraDevice(deviceId: string | null): Promise<void> {
  store().setCameraDeviceId(deviceId);
  if (!session || !camStream) return; // applies on next startCamera otherwise
  let newStream: MediaStream;
  try {
    newStream = await getCam();
  } catch {
    return;
  }
  const newTrack = newStream.getVideoTracks()[0];
  if (!newTrack) return;
  const oldTracks = new Set(camStream.getVideoTracks());
  for (const { pc } of peers.values()) {
    const sender = pc.getSenders().find((s) => s.track !== null && oldTracks.has(s.track));
    if (sender) await sender.replaceTrack(newTrack).catch(() => {});
  }
  camStream.getTracks().forEach((t) => t.stop());
  camStream = newStream;
  newStream.getVideoTracks()[0]?.addEventListener('ended', () => stopCamera());
  store().bumpMedia();
}

// --- VAD plumbing ---

function ensureVadCtx(): AudioContext {
  if (!vadCtx) vadCtx = new AudioContext();
  if (vadCtx.state === 'suspended') vadCtx.resume().catch(() => {});
  return vadCtx;
}

function addAnalyser(userId: string, stream: MediaStream): void {
  if (!stream.getAudioTracks().length) return;
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
