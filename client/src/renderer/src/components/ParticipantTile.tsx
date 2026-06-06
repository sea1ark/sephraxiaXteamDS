// A single voice-stage tile, Discord-style: either the participant's camera
// feed or, when the camera is off, their avatar centered on a colored gradient.
// A name pill sits bottom-left (with a mute glyph), and a green ring lights up
// while they're speaking.
import type { PublicUser } from '@sephraxia/shared';
import { Avatar } from './Avatar';
import { VideoTile } from './VideoTile';
import { nameColor } from '../lib/roles';

/** Deterministic muted gradient per user (stands in for a Discord accent color). */
export function tileColors(seed: string): { from: string; to: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { from: `hsl(${hue} 36% 40%)`, to: `hsl(${hue} 40% 26%)` };
}

interface Props {
  user?: PublicUser;
  fallbackName?: string;
  muted?: boolean;
  speaking?: boolean;
  stream?: MediaStream | null; // camera feed (null → show avatar)
  mirror?: boolean; // mirror your own camera
  label?: string;
}

export function ParticipantTile({ user, fallbackName, muted, speaking, stream, mirror, label }: Props) {
  const name = user?.username ?? fallbackName ?? 'user';
  const c = tileColors(user?.id ?? name);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl"
      style={{
        background: stream ? '#000' : `radial-gradient(circle at 50% 38%, ${c.from}, ${c.to})`,
        boxShadow: speaking ? '0 0 0 2px #23a559, 0 0 0 4px rgba(35,165,89,0.25)' : 'inset 0 0 0 1px rgba(255,255,255,0.04)',
      }}
    >
      {stream ? (
        <VideoTile stream={stream} mirror={mirror} objectFit="cover" />
      ) : (
        <div className="grid h-full place-items-center">
          <Avatar username={name} avatarUrl={user?.avatarUrl} size={88} color={nameColor(user)} />
        </div>
      )}

      <div
        className="absolute bottom-2 left-2 flex max-w-[80%] items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-white"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        {muted && <span className="text-[#f23f43]">🔇</span>}
        <span className="truncate">{label ?? name}</span>
      </div>
    </div>
  );
}
