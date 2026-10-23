// Real cat recordings (public domain / CC0, see sounds/CREDITS.md), played
// through WebAudio so each kitty can get its own pan and a slight pitch shift.
const CLIPS = Array.from({ length: 12 }, (_, i) => `sounds/meow-${String(i + 1).padStart(2, '0')}.mp3`);

let ctx = null;
let master = null;
let buffers = [];
let purrBuf = null;

async function loadClips() {
  fetch('sounds/purr.mp3').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => (purrBuf = b)).catch(() => {});
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

  // Looping purr while a kitty is petted. Returns { stop() }.
  purr(voice, pan = 0) {
    if (!this.enabled || !ctx || ctx.state !== 'running' || !purrBuf) return { stop() {} };
    const src = ctx.createBufferSource();
    src.buffer = purrBuf;
    src.loop = true;
    src.loopStart = 0.05; // skip mp3 encoder padding so the loop is seamless
    src.loopEnd = purrBuf.duration - 0.05;
    src.playbackRate.value = voice.rate;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.4);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (panner.pan) panner.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(gain).connect(panner).connect(master);
    src.start(0, Math.random() * 5);
    return {
      stop() {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
        src.stop(ctx.currentTime + 0.55);
      },
    };
  },
};
