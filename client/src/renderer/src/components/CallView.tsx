// Floating surface for a 1:1 call. Uses the same Discord-style tiles as the
// voice-channel stage (avatar-on-color or camera, plus screen tiles) with a
// status header and the in-call control bar. Shown while placing (outgoing) or
// connected (active); mounted globally so it survives view switches.
import type { ReactNode } from 'react';
import { useVoiceStore } from '../store/voice';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import * as voice from '../lib/voice';
import { nameColor, displayName } from '../lib/roles';
import { ParticipantTile } from './ParticipantTile';
import { ScreenTile } from './ScreenTile';
import {
  MicIcon,
  MicOffIcon,
  HeadsetIcon,
  HeadsetOffIcon,
  VideoIcon,
  VideoOffIcon,
  ScreenShareIcon,
  HangupIcon,
} from './icons';

export function CallView() {
  const call = useVoiceStore((s) => s.call);
  const mediaVersion = useVoiceStore((s) => s.mediaVersion); // re-read non-React streams
  const muted = useVoiceStore((s) => s.muted);
  const deafened = useVoiceStore((s) => s.deafened);
  const sharingScreen = useVoiceStore((s) => s.sharingScreen);
  const cameraOn = useVoiceStore((s) => s.cameraOn);
  const speaking = useVoiceStore((s) => s.speaking);
  const remoteInfo = useVoiceStore((s) => (call.peerUserId ? s.remoteMedia[call.peerUserId] : undefined));
  const peer = useChatStore((s) => s.users.find((u) => u.id === call.peerUserId));
  const me = useAuthStore((s) => s.user);
  const openPicker = useUiStore((s) => s.openScreenPicker);
  const openScreenView = useUiStore((s) => s.openScreenView);
  void mediaVersion;

  if (call.status !== 'active' && call.status !== 'outgoing') return null;
  const peerId = call.peerUserId!;
  const name = displayName(peer);
  const outgoing = call.status === 'outgoing';

  const remote = voice.getRemoteMedia(peerId);
  const localCam = voice.getLocalCamera();
  const localScreen = voice.getLocalScreen();

  const tiles: ReactNode[] = [
    <Cell key="peer">
      <ParticipantTile
        user={peer}
        fallbackName={name}
        muted={remoteInfo?.muted}
        speaking={!!speaking[peerId]}
        stream={remote.camera}
        label={name}
      />
    </Cell>,
  ];
  if (remote.screen)
    tiles.push(
      <Cell key="peer-screen">
        <ScreenTile stream={remote.screen} label={`${name} · screen`} onClick={() => openScreenView(peerId)} />
      </Cell>,
    );
  if (!outgoing)
    tiles.push(
      <Cell key="me">
        <ParticipantTile
          user={me ?? undefined}
          fallbackName={displayName(me ?? undefined)}
          muted={muted}
          speaking={!!speaking[me?.id ?? '']}
          stream={localCam}
          mirror
          label={`${displayName(me ?? undefined)} (you)`}
        />
      </Cell>,
    );
  if (localScreen)
    tiles.push(
      <Cell key="my-screen">
        <ScreenTile stream={localScreen} label="you · screen" onClick={() => me && openScreenView(me.id)} />
      </Cell>,
    );

  return (
    <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center p-4">
      <div
        className="glass pointer-events-auto flex flex-col rounded-glass"
        style={{ width: 'min(940px, 94vw)', height: 'min(660px, 90vh)', border: '1px solid rgba(108,212,126,0.25)' }}
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-glass-border px-5 py-3">
          <span
            className="status-dot"
            style={{ background: outgoing ? '#d4b25a' : '#23a559', boxShadow: '0 0 8px currentColor' }}
          />
          <span className="heading-glow text-sm font-semibold" style={{ color: nameColor(peer) }}>
            {name}
          </span>
          <span className="text-xs text-text-muted">{outgoing ? 'calling…' : 'in call'}</span>
        </div>

        {/* stage */}
        <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-3 overflow-y-auto p-4">
          {tiles}
        </div>

        {/* controls */}
        <div className="flex items-center justify-center gap-2.5 pb-5 pt-2">
          <CircleBtn active={muted} on={() => voice.toggleMute()} title={muted ? 'unmute' : 'mute'}>
            {muted ? <MicOffIcon /> : <MicIcon />}
          </CircleBtn>
          <CircleBtn active={deafened} on={() => voice.toggleDeafen()} title={deafened ? 'undeafen' : 'deafen'}>
            {deafened ? <HeadsetOffIcon /> : <HeadsetIcon />}
          </CircleBtn>
          <CircleBtn active={cameraOn} on={() => voice.toggleCamera()} title={cameraOn ? 'stop camera' : 'start camera'}>
            {cameraOn ? <VideoIcon /> : <VideoOffIcon />}
          </CircleBtn>
          <CircleBtn
            active={sharingScreen}
            on={() => (sharingScreen ? voice.stopScreenShare() : openPicker())}
            title={sharingScreen ? 'stop sharing' : 'share screen'}
          >
            <ScreenShareIcon />
          </CircleBtn>
          <CircleBtn danger on={() => voice.endCall()} title="hang up">
            <HangupIcon />
          </CircleBtn>
        </div>
      </div>
    </div>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <div style={{ flex: '1 1 320px', maxWidth: 520, aspectRatio: '16 / 9' }}>{children}</div>;
}

function CircleBtn({
  children,
  on,
  active,
  danger,
  title,
}: {
  children: ReactNode;
  on: () => void;
  active?: boolean;
  danger?: boolean;
  title: string;
}) {
  const bg = danger ? '#f23f43' : active ? 'rgba(242,63,67,0.18)' : 'rgba(255,255,255,0.08)';
  const color = danger ? '#fff' : active ? '#f23f43' : '#e7e3f3';
  return (
    <button
      onClick={on}
      title={title}
      className="grid h-12 w-12 place-items-center rounded-full text-lg transition hover:brightness-125"
      style={{ background: bg, color }}
    >
      {children}
    </button>
  );
}
