// Compact "voice connected" panel above the user footer while in a voice
// channel: connection status + channel name, a row of toggles (mic / deafen /
// camera / screen) and a prominent disconnect button.
import { useChatStore } from '../store/chat';
import { useVoiceStore } from '../store/voice';
import { useUiStore } from '../store/ui';
import * as voice from '../lib/voice';
import {
  MicIcon,
  MicOffIcon,
  HeadsetIcon,
  HeadsetOffIcon,
  VideoIcon,
  VideoOffIcon,
  ScreenShareIcon,
  HangupIcon,
  SignalIcon,
} from './icons';

export function VoicePanel() {
  const channelId = useVoiceStore((s) => s.channelId);
  const connecting = useVoiceStore((s) => s.connecting);
  const muted = useVoiceStore((s) => s.muted);
  const deafened = useVoiceStore((s) => s.deafened);
  const sharingScreen = useVoiceStore((s) => s.sharingScreen);
  const cameraOn = useVoiceStore((s) => s.cameraOn);
  const openPicker = useUiStore((s) => s.openScreenPicker);
  const channel = useChatStore((s) => s.channels.find((c) => c.id === channelId));

  if (!channelId) return null;

  return (
    <div
      className="mx-2 mb-1 mt-1 rounded-glass p-2"
      style={{ background: 'rgba(35,165,89,0.08)', border: '1px solid rgba(35,165,89,0.22)' }}
    >
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#3edb86]">
            <SignalIcon size={15} />
            {connecting ? 'connecting…' : 'voice connected'}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-text-muted">{channel?.name ?? 'voice'}</div>
        </div>
        <button
          onClick={() => voice.leaveVoice()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-muted transition hover:bg-[rgba(242,63,67,0.18)] hover:text-[#f23f43]"
          title="disconnect"
        >
          <HangupIcon size={19} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1">
        <Toggle active={muted} on={() => voice.toggleMute()} label={muted ? 'unmute' : 'mute'}>
          {muted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
        </Toggle>
        <Toggle active={deafened} on={() => voice.toggleDeafen()} label={deafened ? 'undeafen' : 'deafen'}>
          {deafened ? <HeadsetOffIcon size={18} /> : <HeadsetIcon size={18} />}
        </Toggle>
        <Toggle active={cameraOn} on={() => voice.toggleCamera()} label={cameraOn ? 'cam off' : 'cam on'}>
          {cameraOn ? <VideoIcon size={18} /> : <VideoOffIcon size={18} />}
        </Toggle>
        <Toggle
          active={sharingScreen}
          on={() => (sharingScreen ? voice.stopScreenShare() : openPicker())}
          label={sharingScreen ? 'stop' : 'screen'}
        >
          <ScreenShareIcon size={18} />
        </Toggle>
      </div>
    </div>
  );
}

function Toggle({
  children,
  on,
  active,
  label,
}: {
  children: React.ReactNode;
  on: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={on}
      title={label}
      className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] transition"
      style={
        active
          ? { background: 'rgba(242,63,67,0.16)', color: '#f23f43' }
          : { background: 'rgba(255,255,255,0.05)', color: '#cfc9e0' }
      }
    >
      {children}
      <span className="leading-none">{label}</span>
    </button>
  );
}
