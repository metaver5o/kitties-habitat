// Real cat recordings (public domain / CC0, see sounds/CREDITS.md), played
// through WebAudio so each kitty can get its own pan and a slight pitch shift.
const CLIPS = Array.from({ length: 12 }, (_, i) => `sounds/meow-${String(i + 1).padStart(2, '0')}.mp3`);

let ctx = null;
let master = null;
let buffers = [];

async function loadClips() {
  const decoded = await Promise.all(CLIPS.map(async (url) => {
    try {
      const r = await fetch(url);
      return await ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      return null;
    }
  }));
  buffers = decoded.filter(Boolean);
}

export const audio = {
  enabled: true,

  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      loadClips();
    }
    if (ctx.state === 'suspended') ctx.resume();
  },

  // voice: { clips: [indices], rate }. Returns the clip length in seconds, or 0.
  meow(voice, pan = 0) {
    if (!this.enabled || !ctx || ctx.state !== 'running' || !buffers.length) return 0;
    const buf = buffers[voice.clips[Math.floor(Math.random() * voice.clips.length)] % buffers.length];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = voice.rate * (0.97 + Math.random() * 0.06);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (panner.pan) panner.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(panner).connect(master);
    src.start();
    return buf.duration / src.playbackRate.value;
  },
};
