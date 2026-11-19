/*
 * SOLD / UNSOLD celebration: confetti "party poppers", popper pops and a short fanfare generated with the Web Audio API
 * (no audio files, so nothing to license or download).
 *
 * Browsers only allow sound after the person has clicked or tapped the page once, so
 * `unlockAudio` is called on the first interaction; screens that never had one stay silent.
 */

const SOUND_KEY = "ccl-sound";
let context: AudioContext | undefined;

export function soundEnabled() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked (private mode); the choice just isn't remembered.
  }
  if (on) unlockAudio();
}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    void loadCustomCheer(context);
  } catch {
    // No audio on this device.
  }
}

function ready() {
  if (!context || context.state !== "running" || !soundEnabled()) return undefined;
  return context;
}

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Two quick "pop" bursts, like party poppers going off. */
function pops(ctx: AudioContext, out: AudioNode, start: number) {
  [0, 0.14].forEach((offset) => {
    const at = start + offset;
    const crack = ctx.createBufferSource();
    crack.buffer = noiseBuffer(ctx, 0.12);
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 1800;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.45, at);
    crackGain.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
    crack.connect(high).connect(crackGain).connect(out);
    crack.start(at);

    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(180, at);
    thump.frequency.exponentialRampToValueAtTime(60, at + 0.12);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.6, at);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
    thump.connect(thumpGain).connect(out);
    thump.start(at);
    thump.stop(at + 0.2);
  });
}

/** One brass-like note: two slightly detuned sawtooths, softened by a filter, with a quick swell. */
function brass(ctx: AudioContext, out: AudioNode, at: number, freq: number, seconds: number, level: number) {
  const tone = ctx.createGain();
  tone.gain.setValueAtTime(0.0001, at);
  tone.gain.exponentialRampToValueAtTime(level, at + 0.03);
  tone.gain.setValueAtTime(level * 0.85, at + Math.max(0.05, seconds - 0.12));
  tone.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.setValueAtTime(1400, at);
  soften.frequency.linearRampToValueAtTime(3200, at + 0.06);
  soften.Q.value = 0.8;
  soften.connect(tone).connect(out);
  [-6, 6].forEach((cents) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = cents;
    osc.connect(soften);
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  });
}

/** A soft bell ping (sine plus an octave overtone) for the sparkle. */
function bell(ctx: AudioContext, out: AudioNode, at: number, freq: number, level: number) {
  [1, 2].forEach((harmonic) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * harmonic;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level / harmonic, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.65);
  });
}

/** Victory fanfare: quick rising "ta-ta-ta" into a held chord, with sparkling chimes on top. */
function fanfare(ctx: AudioContext, out: AudioNode, start: number) {
  const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
  [G4, C5, E5].forEach((freq, index) => brass(ctx, out, start + index * 0.11, freq, 0.14, 0.16));
  // Final held chord.
  const chordAt = start + 0.36;
  [C5, E5, G5, C6].forEach((freq, index) => brass(ctx, out, chordAt, freq, 1.15, index === 3 ? 0.1 : 0.12));
  // Sparkle: a little run of high chimes while the confetti flies.
  [2093, 2637, 3136, 2637, 3520, 4186].forEach((freq, index) => bell(ctx, out, chordAt + 0.05 + index * 0.09, freq, 0.05));
}

/** Soft descending "aww" for an unsold player. */
function aww(ctx: AudioContext, out: AudioNode, start: number) {
  [0, 0.28].forEach((offset, index) => {
    const at = start + offset;
    const tone = ctx.createOscillator();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(index ? 330 : 392, at);
    tone.frequency.exponentialRampToValueAtTime(index ? 220 : 330, at + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    tone.connect(gain).connect(out);
    tone.start(at);
    tone.stop(at + 0.55);
  });
}

/*
 * Optional real recording: put any cheer sound at public/sounds/cheer.mp3 and it is played
 * instead of the generated "yaaay" (the popper pops still play). Use a file you are allowed to use.
 */
const CHEER_FILE = "/sounds/cheer.mp3";
let customCheer: AudioBuffer | null | undefined; // undefined = not checked yet, null = no file

async function loadCustomCheer(ctx: AudioContext) {
  if (customCheer !== undefined) return customCheer;
  customCheer = null;
  try {
    const response = await fetch(CHEER_FILE, { cache: "force-cache" });
    if (response.ok && (response.headers.get("content-type") ?? "").startsWith("audio")) {
      customCheer = await ctx.decodeAudioData(await response.arrayBuffer());
    }
  } catch {
    // No file or not decodable: the generated cheer is used.
  }
  return customCheer;
}

function playSound(kind: "sold" | "unsold") {
  const ctx = ready();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  // Gentle limiter so the many voices plus the roar never distort.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 10;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.2;
  master.connect(limiter).connect(ctx.destination);
  const now = ctx.currentTime + 0.02;
  if (kind === "sold") {
    pops(ctx, master, now);
    if (customCheer) {
      const source = ctx.createBufferSource();
      source.buffer = customCheer;
      source.connect(master);
      source.start(now + 0.08);
    } else {
      fanfare(ctx, master, now + 0.1);
    }
  } else {
    aww(ctx, master, now);
  }
}

/** Confetti bursts from both bottom corners, in the winning team's colour plus gold and white. */
async function poppers(teamColor?: string) {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const { default: confetti } = await import("canvas-confetti");
  const colors = [teamColor ?? "#ffca5f", "#ffca5f", "#ffffff", teamColor ?? "#f97316"];
  const shared = { particleCount: 90, spread: 70, startVelocity: 62, ticks: 260, gravity: 0.9, scalar: 1.05, zIndex: 80, colors };
  void confetti({ ...shared, angle: 60, origin: { x: 0, y: 1 } });
  void confetti({ ...shared, angle: 120, origin: { x: 1, y: 1 } });
  window.setTimeout(() => {
    void confetti({ ...shared, particleCount: 60, angle: 75, origin: { x: 0.1, y: 1 } });
    void confetti({ ...shared, particleCount: 60, angle: 105, origin: { x: 0.9, y: 1 } });
  }, 380);
}

export function celebrate(kind: "sold" | "unsold", teamColor?: string) {
  playSound(kind);
  if (kind === "sold") void poppers(teamColor);
}
