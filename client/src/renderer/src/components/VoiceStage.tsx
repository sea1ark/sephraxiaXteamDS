// Discord-style voice "stage" shown in the main column when a voice channel is
// open: a centered auto-grid of participant tiles (avatar-on-color or camera),
// extra tiles for anyone sharing their screen, an invite tile, and a floating
// control bar at the bottom (mic / deafen / camera / screen / disconnect).
import type { ReactNode } from 'react';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import { useVoiceStore } from '../store/voice';
import * as voice from '../lib/voice';
import { displayName } from '../lib/roles';
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
  ChatIcon,
  SpeakerIcon,
  UsersIcon,
} from './icons';

const EMPTY: { userId: string; muted: boolean }[] = [];

export function VoiceStage({ channelId }: { channelId: string }) {
  const channel = useChatStore((s) => s.channels.find((c) => c.id === channelId));
  const users = useChatStore((s) => s.users);
  const me = useAuthStore((s) => s.user);
  const participants = useVoiceStore((s) => s.participants[channelId]) ?? EMPTY;
  const speaking = useVoiceStore((s) => s.speaking);
  const mediaVersion = useVoiceStore((s) => s.mediaVersion);
  const connectedChannel = useVoiceStore((s) => s.channelId);
  const muted = useVoiceStore((s) => s.muted);
  const deafened = useVoiceStore((s) => s.deafened);
  const sharingScreen = useVoiceStore((s) => s.sharingScreen);
  const cameraOn = useVoiceStore((s) => s.cameraOn);
  const openScreenView = useUiStore((s) => s.openScreenView);
  const openPicker = useUiStore((s) => s.openScreenPicker);
  const showFriends = useUiStore((s) => s.showFriends);
  const clearVoiceStage = useUiStore((s) => s.clearVoiceStage);
  void mediaVersion; // re-read non-React media streams when it bumps

  const connectedHere = connectedChannel === channelId;

  const tiles: ReactNode[] = [];
  for (const p of participants) {
    const u = users.find((x) => x.id === p.userId);
    const isMe = p.userId === me?.id;
    const cam = isMe ? voice.getLocalCamera() : voice.getRemoteMedia(p.userId).camera;
    const scr = isMe ? voice.getLocalScreen() : voice.getRemoteMedia(p.userId).screen;
    tiles.push(
      <Cell key={p.userId}>
        <ParticipantTile
          user={u}
          fallbackName={isMe ? displayName(me ?? undefined) : undefined}
          muted={p.muted}
          speaking={!!speaking[p.userId]}
          stream={cam}
          mirror={isMe}
          label={isMe ? `${displayName(u ?? me ?? undefined)} (you)` : displayName(u)}
        />
      </Cell>,
    );
    if (scr) {
      tiles.push(
        <Cell key={`${p.userId}:screen`}>
          <ScreenTile
            stream={scr}
            label={`${isMe ? 'you' : displayName(u)} · screen`}
            onClick={() => openScreenView(p.userId)}
          />
        </Cell>,
      );
    }
  }
  tiles.push(
    <Cell key="invite">
      <InviteTile onInvite={showFriends} />
    </Cell>,
  );

  return (
    <div className="glass relative flex min-w-0 flex-1 flex-col rounded-glass">
      {/* header */}
      <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">
            <SpeakerIcon size={17} />
          </span>
          <span className="heading-glow text-sm font-semibold">{channel?.name ?? 'voice'}</span>
        </div>
        <button
          onClick={clearVoiceStage}
          className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition hover:text-accent-violet"
          title="show chat"
        >
          <ChatIcon size={18} />
        </button>
      </div>

      {/* stage */}
      <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-3 overflow-y-auto p-4">
        {tiles}
      </div>

      {/* control bar */}
      <div className="flex items-center justify-center gap-2.5 pb-5 pt-2">
        {connectedHere ? (
          <>
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
            <CircleBtn danger on={() => voice.leaveVoice()} title="disconnect">
              <HangupIcon />
            </CircleBtn>
          </>
        ) : (
          <button
            onClick={() => voice.joinVoice(channelId)}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            style={{ background: '#23a559' }}
          >
            join voice
          </button>
        )}
      </div>
    </div>
  );
}

/** Fixed-aspect cell that lets the grid grow/shrink tiles like Discord does. */
function Cell({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: '1 1 340px', maxWidth: 560, aspectRatio: '16 / 9' }}>{children}</div>
  );
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

function InviteTile({ onInvite }: { onInvite: () => void }) {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl"
      style={{ background: 'radial-gradient(circle at 50% 30%, #3a2456, #1d1330)' }}
    >
      <div className="text-text-muted opacity-70">
        <UsersIcon size={40} />
      </div>
      <p className="px-4 text-center text-xs text-text-muted">it's just you here right now</p>
      <button
        onClick={onInvite}
        className="rounded-full px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        style={{ background: 'rgba(125,111,196,0.9)' }}
      >
        invite people
      </button>
    </div>
  );
}
