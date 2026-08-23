/**
 * Audio (GDD Section 8).
 *
 * Everything is synthesised at runtime with Web Audio -- no audio files, per
 * the no-external-resources rule and the byte budget.
 *
 * The whole SFX set is ONE voice function with different numbers. Section 8
 * calls for exactly this: the six hit-colours share a single patch and differ
 * only by pitch, rather than getting six separate sound designs. That keeps
 * both the bytes and the design effort down while still giving each colour its
 * own identity.
 */

/** Master level. Deliberately modest: this plays over a browser tab. */
const MASTER_VOLUME = 0.25;

let audio = null;
let master = null;
let muted = false;

/**
 * Browsers block audio until a user gesture, so the context is created lazily
 * and resumed on input. The resume() rejection is swallowed deliberately: a
 * blocked resume is normal and must never surface as a console error, since
 * the jam requires a clean console.
 */
function ctx() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
    master = audio.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}

/** Attach one-time unlock handlers. Safe to call before any gesture. */
export function initAudio() {
  const unlock = () => ctx();
  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);
}

export function toggleMute() {
  muted = !muted;
  return !muted;
}

export function isMuted() {
  return muted;
}

/**
 * One synth voice: an oscillator with a pitch sweep and a percussive envelope.
 * Every sound in the game is built from this.
 *
 * @param {string} type oscillator waveform
 * @param {number} f0 start frequency
 * @param {number} f1 end frequency (swept toward)
 * @param {number} dur seconds
 * @param {number} vol 0..1
 * @param {number} delay seconds to wait before starting
 */
function voice(type, f0, f1, dur, vol, delay = 0) {
  const a = ctx();
  if (!a || muted) return;
  voiceAt(a, type, f0, f1, dur, vol, a.currentTime + delay, master);
}

/**
 * The same voice, at an absolute context time and into a chosen destination.
 * The music sequencer schedules ahead of the clock, so it needs absolute times
 * rather than delays.
 */
function voiceAt(a, type, f0, f1, dur, vol, t, dest) {
  const osc = a.createOscillator();
  const gain = a.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  // Exponential ramps cannot reach or cross zero, hence the floor.
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Cached white-noise buffer, built once and reused by every impact. */
let noiseBuffer = null;

function getNoise(a) {
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** A filtered noise burst: the body of every impact sound. */
function burst(dur, vol, cutoff, delay = 0) {
  const a = ctx();
  if (!a || muted) return;

  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  const filter = a.createBiquadFilter();
  const gain = a.createGain();

  src.buffer = getNoise(a);
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(cutoff, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.35), t + dur);

  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/**
 * Pitch offsets for the six hit-colours, in semitones from the base note.
 * Chosen as a pentatonic-ish set so that a fast combo sequence sounds musical
 * rather than arbitrary -- the colours are heard together constantly.
 *
 * Index order matches HIT_COLORS: red, green, blue, orange, purple, cyan.
 */
const COLOR_SEMITONES = [0, 3, 7, 5, 10, 2];
const HIT_BASE_FREQ = 220;

function semitone(base, n) {
  return base * Math.pow(2, n / 12);
}

// --- The sound set ----------------------------------------------------------

export function sfxJump() {
  voice('square', 260, 540, 0.11, 0.18);
}

/** Arming a combo: a short rising blip that says "the window is open". */
export function sfxArm() {
  voice('triangle', 520, 740, 0.05, 0.12);
}

/** Combo cancelled, by timeout or a key on cooldown. Falls, never harsh. */
export function sfxCancel() {
  voice('sine', 420, 190, 0.13, 0.1);
}

/**
 * Firing an ability, whether or not it connects.
 *
 * Without this, a combo that hits nothing is silent, which reads as the input
 * having been dropped. It is pitched by output colour like the hit, but softer,
 * so a landed hit still clearly rewards over a whiff.
 *
 * @param {number} colorIndex index into HIT_COLORS
 * @param {string} archetype guard/assault/flow, which shapes the sweep
 */
export function sfxCast(colorIndex, archetype) {
  const f = semitone(HIT_BASE_FREQ, COLOR_SEMITONES[colorIndex] || 0);
  // Each archetype sweeps differently, so the three feel distinct by ear:
  // guard blooms outward, assault stabs forward, flow sweeps across.
  if (archetype === 'guard') voice('sine', f, f * 1.6, 0.18, 0.1);
  else if (archetype === 'assault') voice('sawtooth', f * 1.5, f * 0.8, 0.1, 0.1);
  else voice('triangle', f * 0.9, f * 1.8, 0.16, 0.09);
}

/**
 * A colour landing on an enemy. One patch, pitched by colour.
 * @param {number} colorIndex index into HIT_COLORS
 * @param {boolean} killed whether the hit finished the enemy
 */
export function sfxHit(colorIndex, killed) {
  const f = semitone(HIT_BASE_FREQ, COLOR_SEMITONES[colorIndex] || 0);
  voice('square', f * 2, f, 0.13, 0.16);
  burst(0.09, 0.14, 1400);
  // A kill adds an octave above, so success is audible without a second patch.
  if (killed) voice('triangle', f * 4, f * 3, 0.22, 0.12, 0.02);
}

/** A hit that landed but was the wrong colour: dull, clearly unrewarding. */
export function sfxResist() {
  voice('sawtooth', 150, 90, 0.09, 0.1);
  burst(0.06, 0.08, 500);
}

/** Player took damage. */
export function sfxHurt() {
  voice('sawtooth', 320, 70, 0.3, 0.22);
  burst(0.16, 0.16, 900);
}

/**
 * The ultimate: all six colours fired as a rising arpeggio, which is the audio
 * equivalent of the full-spectrum explosion it accompanies.
 */
export function sfxUltimate() {
  for (let i = 0; i < COLOR_SEMITONES.length; i++) {
    const f = semitone(HIT_BASE_FREQ * 2, COLOR_SEMITONES[i]);
    voice('triangle', f, f * 1.5, 0.5, 0.11, i * 0.045);
  }
  burst(0.5, 0.2, 2600);
}

export function sfxBossHit() {
  voice('square', 180, 120, 0.18, 0.2);
  burst(0.14, 0.18, 800);
}

/** The boss goes down: a long rising swell under the restoration wipe. */
export function sfxBossDefeat() {
  for (let i = 0; i < 6; i++) {
    const f = semitone(110, COLOR_SEMITONES[i]);
    voice('triangle', f, f * 4, 1.6, 0.13, i * 0.09);
  }
  burst(1.2, 0.22, 1800);
}

// --- Dynamic music (GDD Section 8) ------------------------------------------
/**
 * A tiny step sequencer driven by the same `voiceAt` used for every sound
 * effect. Section 8 asks for a procedural sequencer rather than pre-rendered
 * clips, driven by a single intensity parameter.
 *
 * Intensity (0..1) affects two of the three things Section 8 lists:
 *   - tempo, which ramps between the theme's BPM range
 *   - layering, as percussion and lead fade in at thresholds
 * Filter cutoff is the "optionally" item and is skipped: a per-note filter node
 * costs more bytes than it earns here, and tempo plus layering already carry
 * the change in tension clearly.
 *
 * The boss theme reuses this entire engine and swaps only the pattern data and
 * the tempo range, exactly as Section 8 recommends -- "boss feels different"
 * for almost no extra bytes.
 */

/** Patterns are 16 steps of semitone offsets from the theme root; null rests. */
const THEMES = {
  level: {
    root: 110,
    bpm: [92, 130],
    // A minor vamp that circles without resolving: the world is still stolen.
    bass: [0, null, 0, null, -5, null, -5, null, -3, null, -3, null, -7, null, -7, null],
    lead: [null, null, 12, null, null, 15, null, null, null, 19, null, 15, null, null, 12, null],
  },
  boss: {
    root: 98,
    bpm: [132, 168],
    // Tighter and more insistent, a semitone lower, with a tritone leaning on
    // it -- same engine, different data.
    bass: [0, 0, null, 0, 6, null, 0, null, -2, -2, null, -2, 5, null, -2, null],
    lead: [12, null, 13, null, 18, null, 13, null, 12, null, 10, null, 18, 17, null, null],
  },
};

const STEPS = 16;

/** Scheduling lookahead, in seconds. */
const LOOKAHEAD = 0.12;

let musicGain = null;
let musicStep = 0;
let nextStepTime = 0;
let intensity = 0;
let themeName = 'level';

export function setMusicIntensity(value) {
  intensity = Math.max(0, Math.min(1, value));
}

export function setMusicTheme(name) {
  if (name === themeName || !THEMES[name]) return;
  themeName = name;
  // Restart the bar so the swap lands on a downbeat rather than mid-phrase.
  musicStep = 0;
}

function stepDuration() {
  const theme = THEMES[themeName];
  const bpm = theme.bpm[0] + (theme.bpm[1] - theme.bpm[0]) * intensity;
  return 60 / bpm / 4; // sixteenth notes
}

function note(root, semitones) {
  return root * Math.pow(2, semitones / 12);
}

/**
 * Advance the sequencer. Called once per frame from the game loop rather than
 * on its own timer, so it cannot keep running after the game stops.
 */
export function updateMusic() {
  const a = ctx();
  if (!a || muted) return;

  if (!musicGain) {
    musicGain = a.createGain();
    // Music sits under the SFX: it is atmosphere, not feedback.
    musicGain.gain.value = 0.38;
    musicGain.connect(master);
  }

  // After a backgrounded tab the clock has run on without us. Resync instead
  // of scheduling a burst of notes that are all already in the past.
  if (nextStepTime < a.currentTime) nextStepTime = a.currentTime;

  while (nextStepTime < a.currentTime + LOOKAHEAD) {
    scheduleStep(a, musicStep % STEPS, nextStepTime);
    nextStepTime += stepDuration();
    musicStep++;
  }
}

function scheduleStep(a, step, when) {
  const theme = THEMES[themeName];

  // Bass: always present, so there is never silence.
  const bass = theme.bass[step];
  if (bass !== null) {
    const f = note(theme.root, bass);
    voiceAt(a, 'triangle', f, f * 0.98, 0.22, 0.3, when, musicGain);
  }

  // Percussion fades in early: the first sign that something is coming.
  if (intensity > 0.22 && step % 4 === 0) {
    voiceAt(a, 'sine', 90, 40, 0.12, 0.28 * intensity, when, musicGain);
  }
  if (intensity > 0.45 && step % 2 === 1) {
    burstAt(a, 0.03, 0.05 * intensity, 6000, when);
  }

  // Lead enters late, so the approach to the boss genuinely escalates.
  if (intensity > 0.5) {
    const lead = theme.lead[step];
    if (lead !== null) {
      const f = note(theme.root, lead);
      voiceAt(a, 'square', f, f, 0.14, 0.09 * intensity, when, musicGain);
      // A high octave doubles the lead at full tension.
      if (intensity > 0.82) {
        voiceAt(a, 'triangle', f * 2, f * 2, 0.1, 0.05, when, musicGain);
      }
    }
  }
}

/** Noise burst at an absolute time, for the hi-hat layer. */
function burstAt(a, dur, vol, cutoff, when) {
  const src = a.createBufferSource();
  const filter = a.createBiquadFilter();
  const gain = a.createGain();

  src.buffer = getNoise(a);
  filter.type = 'highpass';
  filter.frequency.value = cutoff;
  gain.gain.setValueAtTime(vol, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(musicGain);
  src.start(when);
  src.stop(when + dur + 0.02);
}
