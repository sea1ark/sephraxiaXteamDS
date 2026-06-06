// Fullscreen view of a shared screen — opened from a call tile or from a voice
// channel participant who is sharing. Works for any user's screen (or your own).
import { useEffect } from 'react';
import { useUiStore } from '../store/ui';
import { useVoiceStore } from '../store/voice';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import * as voice from '../lib/voice';
import { displayName } from '../lib/roles';
import { VideoTile } from './VideoTile';

export function ScreenViewer() {
  const userId = useUiStore((s) => s.screenViewUserId);
  const close = useUiStore((s) => s.closeScreenView);
  const mediaVersion = useVoiceStore((s) => s.mediaVersion);
  const myId = useAuthStore((s) => s.user?.id);
  const sharer = useChatStore((s) => s.users.find((u) => u.id === userId));
  void mediaVersion;

  useEffect(() => {
    if (!userId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userId, close]);

  if (!userId) return null;
  const stream = userId === myId ? voice.getLocalScreen() : voice.getRemoteMedia(userId).screen;

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col"
      style={{ background: 'rgba(3,2,7,0.94)' }}
      onClick={close}
    >
      <div className="flex items-center justify-between px-5 py-3">
        <span className="heading-glow text-sm font-semibold">
          {userId === myId ? 'your screen' : `${displayName(sharer)}'s screen`}
        </span>
        <button onClick={close} className="text-text-muted transition hover:text-accent-pink" title="close (esc)">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 p-4" onClick={(e) => e.stopPropagation()}>
        {stream ? (
          <VideoTile stream={stream} objectFit="contain" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-text-muted">no screen stream.</div>
        )}
      </div>
    </div>
  );
}
