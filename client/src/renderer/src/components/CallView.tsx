// Floating surface for a 1:1 call: video tiles (remote/own camera + screen),
// call status, and the in-call controls. Shown while a call is being placed
// (outgoing) or is connected (active). Mounted globally so it persists across
// view switches.
import { useVoiceStore } from '../store/voice';
import { useChatStore } from '../store/chat';
import { useUiStore } from '../store/ui';
import * as voice from '../lib/voice';
import { Avatar } from './Avatar';
import { nameColor } from '../lib/roles';
import { VideoTile } from './VideoTile';

interface Tile {
  key: string;
  stream: MediaStream;
  label: string;
  mirror?: boolean;
  isScreen?: boolean;
  ownerId?: string; // for opening a fullscreen screen view
}

export function CallView() {
  const call = useVoiceStore((s) => s.call);
  // Subscribing to mediaVersion forces a re-read of the (non-React) streams.
  const mediaVersion = useVoiceStore((s) => s.mediaVersion);
  const muted = useVoiceStore((s) => s.muted);
  const deafened = useVoiceStore((s) => s.deafened);
  const sharingScreen = useVoiceStore((s) => s.sharingScreen);
  const cameraOn = useVoiceStore((s) => s.cameraOn);
  const speaking = useVoiceStore((s) => s.speaking);
  const peer = useChatStore((s) => s.users.find((u) => u.id === call.peerUserId));
  const openPicker = useUiStore((s) => s.openScreenPicker);
  const openScreenView = useUiStore((s) => s.openScreenView);
  void mediaVersion;

  if (call.status !== 'active' && call.status !== 'outgoing') return null;
  const peerId = call.peerUserId!;
  const name = peer?.username ?? 'user';
  const outgoing = call.status === 'outgoing';

  const remote = voice.getRemoteMedia(peerId);
  const localCam = voice.getLocalCamera();
  const localScreen = voice.getLocalScreen();

  const tiles: Tile[] = [];
  if (remote.screen)
    tiles.push({ key: 'rs', stream: remote.screen, label: `${name} · screen`, isScreen: true, ownerId: peerId });
  if (remote.camera) tiles.push({ key: 'rc', stream: remote.camera, label: name });
  if (localScreen) tiles.push({ key: 'ls', stream: localScreen, label: 'you · screen', isScreen: true });
  if (localCam) tiles.push({ key: 'lc', stream: localCam, label: 'you', mirror: true });

  const ctrl = (active: boolean, danger = false) =>
    `grid h-11 w-11 place-items-center rounded-full text-lg transition hover:scale-105 ${
      danger
        ? 'text-white'
        : active
          ? 'text-accent-pink'
          : 'text-text-primary hover:text-accent-violet'
    }`;
  const ctrlBg = (active: boolean) =>
    active
      ? { background: 'rgba(212,83,126,0.2)', border: '1px solid rgba(212,83,126,0.4)' }
      : { background: 'rgba(125,111,196,0.14)', border: '1px solid rgba(180,160,240,0.18)' };

  return (
    <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center p-4">
      <div
        className="glass pointer-events-auto flex flex-col rounded-glass"
        style={{ width: 'min(940px, 94vw)', height: 'min(640px, 88vh)', border: '1px solid rgba(108,212,126,0.25)' }}
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-glass-border px-5 py-3">
          <span
            className="status-dot"
            style={{ background: outgoing ? '#d4b25a' : '#6cd47e', boxShadow: '0 0 8px currentColor' }}
          />
          <span className="heading-glow text-sm font-semibold" style={{ color: nameColor(peer) }}>
            {name}
          </span>
          <span className="text-xs text-text-muted">{outgoing ? 'calling…' : 'in call'}</span>
        </div>

        {/* stage */}
        <div className="relative flex-1 overflow-hidden p-3">
          {tiles.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div
                className="grid place-items-center rounded-full transition-shadow"
                style={{ boxShadow: speaking[peerId] ? '0 0 0 3px #6cd47e, 0 0 18px #6cd47e' : 'none', borderRadius: '9999px' }}
              >
                <Avatar username={name} avatarUrl={peer?.avatarUrl} size={96} color={nameColor(peer)} />
              </div>
              <p className="text-sm text-text-muted">
                {outgoing ? `ringing ${name}…` : 'connected — no video'}
              </p>
            </div>
          ) : (
            <div
              className="grid h-full gap-3"
              style={{ gridTemplateColumns: tiles.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}
            >
              {tiles.map((t) => (
                <div
                  key={t.key}
                  onClick={() => t.isScreen && t.ownerId && openScreenView(t.ownerId)}
                  className={`relative overflow-hidden rounded-glass ${t.isScreen && t.ownerId ? 'cursor-zoom-in' : ''}`}
                  style={{ border: '1px solid rgba(180,160,240,0.16)', minHeight: 0 }}
                >
                  <VideoTile stream={t.stream} mirror={t.mirror} objectFit={t.isScreen ? 'contain' : 'cover'} />
                  <span
                    className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[11px] text-white"
                    style={{ background: 'rgba(5,4,9,0.6)' }}
                  >
                    {t.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* controls */}
        <div className="flex items-center justify-center gap-3 border-t border-glass-border px-5 py-3">
          <button onClick={() => voice.toggleMute()} className={ctrl(muted)} style={ctrlBg(muted)} title={muted ? 'unmute' : 'mute'}>
            {muted ? '🔇' : '🎙'}
          </button>
          <button onClick={() => voice.toggleDeafen()} className={ctrl(deafened)} style={ctrlBg(deafened)} title={deafened ? 'undeafen' : 'deafen'}>
            {deafened ? '🔈' : '🎧'}
          </button>
          <button onClick={() => voice.toggleCamera()} className={ctrl(cameraOn)} style={ctrlBg(cameraOn)} title={cameraOn ? 'turn camera off' : 'turn camera on'}>
            {cameraOn ? '📹' : '📷'}
          </button>
          <button
            onClick={() => (sharingScreen ? voice.stopScreenShare() : openPicker())}
            className={ctrl(sharingScreen)}
            style={ctrlBg(sharingScreen)}
            title={sharingScreen ? 'stop sharing' : 'share screen'}
          >
            🖥
          </button>
          <button
            onClick={() => voice.endCall()}
            className={ctrl(false, true)}
            style={{ background: 'rgba(212,83,126,0.9)', boxShadow: '0 0 14px rgba(212,83,126,0.5)' }}
            title="hang up"
          >
            ⏏
          </button>
        </div>
      </div>
    </div>
  );
}
