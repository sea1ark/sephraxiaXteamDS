// Records a short voice message from the mic via MediaRecorder. On stop it
// hands back a File (webm/ogg opus) ready to upload as a message attachment;
// on cancel it discards. Used by the channel and DM composers.
import { useRef, useState } from 'react';

function pickMime(): { mimeType?: string } {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return { mimeType: t };
  }
  return {};
}

export function useVoiceRecorder(onComplete: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const [ms, setMs] = useState(0);

  const cbRef = useRef(onComplete);
  cbRef.current = onComplete; // always call the freshest handler

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);
  const cancelRef = useRef(false);

  async function start() {
    if (recording) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('нет доступа к микрофону.');
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    cancelRef.current = false;

    const mr = new MediaRecorder(stream, pickMime());
    recorderRef.current = mr;
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRecording(false);
      setMs(0);
      const type = mr.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      if (!cancelRef.current && blob.size > 0) {
        const ext = type.includes('ogg') ? 'ogg' : 'webm';
        const stamp = `${Math.round(startedRef.current)}`;
        const file = new File([blob], `voice-message-${stamp}.${ext}`, { type });
        cbRef.current(file);
      }
    };

    mr.start();
    startedRef.current = performance.now();
    setMs(0);
    timerRef.current = setInterval(() => setMs(performance.now() - startedRef.current), 100);
    setRecording(true);
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }
  function cancel() {
    cancelRef.current = true;
    stop();
  }

  return { recording, ms, start, stop, cancel };
}

/** mm:ss from elapsed milliseconds. */
export function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
