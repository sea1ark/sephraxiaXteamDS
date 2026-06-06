// A shared-screen tile, Discord-style: the live feed on black, a red LIVE badge
// + live resolution/fps readout top-left, and a name pill bottom-left. Click to
// open the fullscreen viewer.
import { useEffect, useState } from 'react';
import { VideoTile } from './VideoTile';

function useResolution(stream: MediaStream | null): string {
  const [res, setRes] = useState('');
  useEffect(() => {
    if (!stream) {
      setRes('');
      return;
    }
    const read = () => {
      const s = stream.getVideoTracks()[0]?.getSettings();
      if (s?.height) setRes(`${s.height}p${s.frameRate ? ` ${Math.round(s.frameRate)}fps` : ''}`);
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [stream]);
  return res;
}

interface Props {
  stream: MediaStream | null;
  label: string;
  onClick?: () => void;
}

export function ScreenTile({ stream, label, onClick }: Props) {
  const res = useResolution(stream);

  return (
    <div
      onClick={onClick}
      className="group relative h-full w-full cursor-zoom-in overflow-hidden rounded-xl bg-black"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
    >
      <VideoTile stream={stream} objectFit="contain" />

      <div className="absolute left-2 top-2 flex items-center gap-1.5">
        <span className="rounded bg-[#f23f43] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          live
        </span>
        {res && (
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{res}</span>
        )}
      </div>

      <div className="absolute bottom-2 left-2 max-w-[80%] truncate rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
        {label}
      </div>

      <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
        <span className="rounded-md bg-black/55 px-2 py-1 text-xs text-white">click to expand</span>
      </div>
    </div>
  );
}
