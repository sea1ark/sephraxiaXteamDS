// Tiny synthesized UI sounds (no audio files). Used for voice join/leave and
// mute/deafen toggles, Discord-style.
let ctx: AudioContext | null = null;

function audioCtx(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Play a short sequence of notes (each note is freq + offset within the cue).
function cue(notes: number[], step = 0.07, dur = 0.16, gain = 0.07): void {
  try {
    const ac = audioCtx();
    const now = ac.currentTime;
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * step;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(gain, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g).connect(ac.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  } catch {
    /* audio not available */
  }
}

// Looping incoming-call ringtone (a two-note chirp repeated until answered).
let ringTimer: ReturnType<typeof setInterval> | null = null;

export const sounds = {
  join: () => cue([523.25, 783.99]), // C5 → G5 (ascending)
  leave: () => cue([783.99, 523.25]), // G5 → C5 (descending)
  mute: () => cue([440, 311.13], 0.06, 0.12), // A4 → D#4
  unmute: () => cue([311.13, 440], 0.06, 0.12), // D#4 → A4
  deafen: () => cue([466.16, 277.18], 0.06, 0.14), // A#4 → C#4
  undeafen: () => cue([277.18, 466.16], 0.06, 0.14),
  screenOn: () => cue([587.33, 880], 0.05, 0.13), // D5 → A5
  screenOff: () => cue([880, 587.33], 0.05, 0.13), // A5 → D5
  cameraOn: () => cue([659.25, 987.77], 0.05, 0.12), // E5 → B5
  cameraOff: () => cue([987.77, 659.25], 0.05, 0.12), // B5 → E5
  ringtone: {
    start: (): void => {
      if (ringTimer) return;
      const ring = () => cue([659.25, 830.61, 659.25], 0.18, 0.22, 0.06); // E5–G#5–E5
      ring();
      ringTimer = setInterval(ring, 1600);
    },
    stop: (): void => {
      if (ringTimer) {
        clearInterval(ringTimer);
        ringTimer = null;
      }
    },
  },
};
