// Attaches a MediaStream (camera or shared screen) to a <video>. The element is
// always muted — call audio is played through the hidden <audio> elements that
// lib/voice manages, so we never double up the sound here.
import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  mirror?: boolean; // mirror your own camera, webcam-style
  objectFit?: 'contain' | 'cover';
  className?: string;
}

export function VideoTile({ stream, mirror = false, objectFit = 'contain', className }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.srcObject !== stream) el.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={className}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        background: '#000',
        transform: mirror ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
