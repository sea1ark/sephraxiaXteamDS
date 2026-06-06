// Ringing UI for an inbound 1:1 call. Plays a looping ringtone while shown and
// offers accept / decline.
import { useEffect } from 'react';
import { useVoiceStore } from '../store/voice';
import { useChatStore } from '../store/chat';
import * as voice from '../lib/voice';
import { sounds } from '../lib/sounds';
import { Avatar } from './Avatar';
import { nameColor } from '../lib/roles';
import { PhoneIcon, HangupIcon } from './icons';

export function IncomingCallModal() {
  const call = useVoiceStore((s) => s.call);
  const caller = useChatStore((s) => s.users.find((u) => u.id === call.peerUserId));
  const incoming = call.status === 'incoming';

  useEffect(() => {
    if (!incoming) return;
    sounds.ringtone.start();
    return () => sounds.ringtone.stop();
  }, [incoming]);

  if (!incoming || !call.peerUserId) return null;
  const peerId = call.peerUserId;
  const name = caller?.username ?? 'someone';

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-6"
      style={{ background: 'rgba(5,4,9,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="glass flex w-full max-w-sm flex-col items-center rounded-glass px-8 py-7 text-center"
        style={{ border: '1px solid rgba(108,212,126,0.3)' }}
      >
        <div
          className="grid place-items-center rounded-full"
          style={{ boxShadow: '0 0 0 3px rgba(108,212,126,0.5), 0 0 24px rgba(108,212,126,0.4)', borderRadius: '9999px' }}
        >
          <Avatar username={name} avatarUrl={caller?.avatarUrl} size={84} color={nameColor(caller)} />
        </div>
        <div className="mt-4 text-lg font-semibold" style={{ color: nameColor(caller) }}>
          {name}
        </div>
        <div className="mt-0.5 animate-pulse text-xs text-text-muted">incoming call…</div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={() => voice.declineCall(peerId)}
            className="grid h-14 w-14 place-items-center rounded-full text-white transition hover:scale-105"
            style={{ background: '#f23f43', boxShadow: '0 0 16px rgba(242,63,67,0.5)' }}
            title="decline"
          >
            <HangupIcon size={24} />
          </button>
          <button
            onClick={() => voice.acceptCall(peerId)}
            className="grid h-14 w-14 place-items-center rounded-full text-white transition hover:scale-105"
            style={{ background: '#23a559', boxShadow: '0 0 16px rgba(35,165,89,0.5)' }}
            title="accept"
          >
            <PhoneIcon size={23} />
          </button>
        </div>
      </div>
    </div>
  );
}
