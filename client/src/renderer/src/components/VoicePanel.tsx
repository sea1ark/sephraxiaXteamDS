// Voice control strip shown above the user footer while connected to a voice
// channel: status, mute, deafen, and disconnect.
import { useChatStore } from '../store/chat';
import { useVoiceStore } from '../store/voice';
import { useUiStore } from '../store/ui';
import * as voice from '../lib/voice';

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

  const iconBtn = (active: boolean) =>
    `grid h-8 w-8 place-items-center rounded-md text-sm transition ${
      active ? 'text-accent-pink' : 'text-text-muted hover:text-accent-violet'
    }`;

  return (
    <div
      className="mx-2 mb-1 mt-1 rounded-glass px-3 py-2"
      style={{ background: 'rgba(108,212,126,0.08)', border: '1px solid rgba(108,212,126,0.25)' }}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8fe0a1]">
            <span className="status-dot" style={{ background: connecting ? '#d4b25a' : '#6cd47e', boxShadow: '0 0 8px currentColor' }} />
            {connecting ? 'connecting…' : 'voice connected'}
          </div>
          <div className="truncate text-[11px] text-text-muted">🔊 {channel?.name ?? 'voice'}</div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => voice.toggleMute()} className={iconBtn(muted)} title={muted ? 'unmute' : 'mute'}>
            {muted ? '🔇' : '🎙'}
          </button>
          <button
            onClick={() => voice.toggleDeafen()}
            className={iconBtn(deafened)}
            title={deafened ? 'undeafen' : 'deafen'}
          >
            {deafened ? '🔈' : '🎧'}
          </button>
          <button onClick={() => voice.toggleCamera()} className={iconBtn(cameraOn)} title={cameraOn ? 'turn camera off' : 'turn camera on'}>
            {cameraOn ? '📹' : '📷'}
          </button>
          <button
            onClick={() => (sharingScreen ? voice.stopScreenShare() : openPicker())}
            className={iconBtn(sharingScreen)}
            title={sharingScreen ? 'stop sharing' : 'share screen'}
          >
            🖥
          </button>
          <button
            onClick={() => voice.leaveVoice()}
            className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition hover:bg-accent-pink/20 hover:text-accent-pink"
            title="disconnect"
          >
            ⏏
          </button>
        </div>
      </div>
    </div>
  );
}
