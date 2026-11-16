import type { SoundDef, SoundLayer } from '../../sdk/index.ts';

type W = 'sine' | 'square' | 'sawtooth' | 'triangle';
const osc = (wave: W, f0: number, f1: number, g0: number, g1 = 0, extra: Partial<SoundLayer> = {}): SoundLayer => ({
  kind: 'osc', wave, freq: [f0, f1], gain: [g0, g1], ...extra,
});
const noise = (g0: number, type: 'lowpass' | 'highpass' | 'bandpass', f0: number, f1: number, extra: Partial<SoundLayer> = {}, q = 1): SoundLayer => ({
  kind: 'noise', gain: [g0, 0], filter: { type, freq: [f0, f1], q }, ...extra,
});

/** Rising/falling note sequence helper. */
const notes = (wave: W, freqs: number[], step: number, len: number, g: number): SoundLayer[] =>
  freqs.map((f, i) => osc(wave, f, f * 1.01, g, 0, { delay: i * step, duration: len }));

export const sounds: Record<string, SoundDef> = {
  'pistol-fire': { duration: 0.22, gain: 0.9, layers: [
    noise(1, 'highpass', 3500, 1200, { duration: 0.08 }),
    noise(0.7, 'bandpass', 1800, 300, { duration: 0.2 }, 0.8),
    osc('square', 900, 90, 0.5, 0, { duration: 0.1 }),
  ] },
  'launcher-fire': { duration: 0.6, gain: 0.9, layers: [
    osc('sawtooth', 160, 40, 0.8, 0, { duration: 0.5 }),
    osc('sine', 90, 35, 0.9, 0, { duration: 0.45 }),
    noise(0.7, 'lowpass', 2500, 200, { duration: 0.55 }, 1.5),
    osc('square', 600, 1400, 0.15, 0, { duration: 0.2 }),
  ] },
  'blade-swing': { duration: 0.24, gain: 0.7, layers: [
    noise(0.8, 'bandpass', 3200, 700, { duration: 0.16 }, 1.4),
    osc('sine', 240, 90, 0.25, 0, { duration: 0.18 }),
    noise(0.35, 'highpass', 5500, 2500, { duration: 0.08, delay: 0.03 }),
  ] },
  'cinderkey-fire': { duration: 0.3, gain: 0.9, layers: [
    noise(1, 'highpass', 3000, 1100, { duration: 0.08 }),
    noise(0.55, 'bandpass', 1600, 320, { duration: 0.2 }, 1.2),
    osc('square', 740, 110, 0.4, 0, { duration: 0.1 }),
    osc('sine', 1880, 1240, 0.18, 0, { duration: 0.22, delay: 0.02 }),
  ] },
  'mothspindle-fire': { duration: 0.12, gain: 0.62, layers: [
    noise(0.8, 'highpass', 3800, 1500, { duration: 0.05 }),
    osc('square', 620, 180, 0.28, 0, { duration: 0.06 }),
  ] },
  'briarward-fire': { duration: 0.24, gain: 0.85, layers: [
    noise(0.9, 'bandpass', 2300, 500, { duration: 0.1 }, 0.9),
    osc('sawtooth', 430, 90, 0.5, 0, { duration: 0.14 }),
    osc('sine', 120, 55, 0.45, 0, { duration: 0.15 }),
  ] },
  'oracle-fire': { duration: 0.5, gain: 1, layers: [
    noise(1, 'highpass', 5200, 1100, { duration: 0.12 }),
    osc('sawtooth', 980, 75, 0.5, 0, { duration: 0.18 }),
    osc('sine', 2100, 1500, 0.22, 0, { duration: 0.45 }),
    noise(0.4, 'lowpass', 1200, 180, { duration: 0.4, delay: 0.04 }),
  ] },
  'ashbell-fire': { duration: 0.9, gain: 0.95, layers: [
    osc('sawtooth', 150, 34, 0.75, 0, { duration: 0.65 }),
    osc('sine', 78, 26, 0.85, 0, { duration: 0.6 }),
    noise(0.75, 'lowpass', 2200, 160, { duration: 0.75 }, 1.3),
    ...notes('sine', [784, 523, 392], 0.22, 0.5, 0.22),
  ] },
  'ricochet-fire': { duration: 0.35, gain: 0.8, layers: [
    osc('sawtooth', 2400, 300, 0.5, 0, { duration: 0.25 }),
    osc('square', 1200, 1800, 0.25, 0, { duration: 0.3, delay: 0.02 }),
    osc('triangle', 600, 3000, 0.3, 0, { duration: 0.15 }),
    noise(0.3, 'highpass', 4000, 6000, { duration: 0.06 }),
  ] },
  'ricochet-bounce': { duration: 0.25, gain: 0.6, layers: [
    osc('sine', 2200, 1900, 0.6, 0, { duration: 0.22 }),
    osc('triangle', 3300, 2900, 0.3, 0, { duration: 0.15 }),
    noise(0.3, 'highpass', 6000, 6000, { duration: 0.02 }),
  ] },
  'impact-wall': { duration: 0.18, gain: 0.6, layers: [
    noise(0.8, 'bandpass', 2500, 600, { duration: 0.12 }, 1.2),
    osc('square', 300, 80, 0.3, 0, { duration: 0.08 }),
  ] },
  'impact-flesh': { duration: 0.2, gain: 0.7, layers: [
    noise(0.8, 'lowpass', 900, 150, { duration: 0.18 }, 1),
    osc('sine', 140, 50, 0.7, 0, { duration: 0.15 }),
  ] },
  'explosion-small': { duration: 0.9, gain: 1, layers: [
    noise(1, 'lowpass', 3000, 120, { duration: 0.85 }, 0.8),
    osc('sine', 100, 25, 1, 0, { duration: 0.7 }),
    osc('sawtooth', 220, 40, 0.4, 0, { duration: 0.4 }),
    noise(0.5, 'highpass', 4000, 1500, { duration: 0.1 }),
  ] },
  'enemy-alert': { duration: 0.5, gain: 0.7, layers: [
    osc('sawtooth', 180, 420, 0.5, 0, { duration: 0.2 }),
    osc('square', 420, 140, 0.4, 0, { duration: 0.3, delay: 0.18 }),
    noise(0.3, 'bandpass', 900, 500, { duration: 0.4 }, 3),
  ] },
  'enemy-hurt': { duration: 0.25, gain: 0.7, layers: [
    osc('sawtooth', 320, 140, 0.6, 0, { duration: 0.22 }),
    osc('square', 160, 90, 0.3, 0, { duration: 0.2 }),
    noise(0.3, 'bandpass', 1200, 400, { duration: 0.12 }, 2),
  ] },
  'enemy-die': { duration: 0.9, gain: 0.8, layers: [
    osc('sawtooth', 300, 40, 0.6, 0, { duration: 0.8 }),
    osc('square', 150, 30, 0.35, 0, { duration: 0.7 }),
    noise(0.5, 'lowpass', 1800, 100, { duration: 0.85 }, 1.5),
  ] },
  'enemy-shoot': { duration: 0.4, gain: 0.7, layers: [
    noise(0.8, 'bandpass', 600, 3000, { duration: 0.3 }, 2.5),
    osc('sawtooth', 200, 700, 0.4, 0, { duration: 0.25 }),
    osc('sine', 1000, 400, 0.3, 0, { duration: 0.2, delay: 0.05 }),
  ] },
  'enemy-melee': { duration: 0.3, gain: 0.8, layers: [
    noise(0.9, 'highpass', 1500, 5000, { duration: 0.15 }),
    osc('sawtooth', 240, 80, 0.5, 0, { duration: 0.2, delay: 0.06 }),
    noise(0.6, 'lowpass', 800, 200, { duration: 0.2, delay: 0.08 }),
  ] },
  'player-hurt': { duration: 0.3, gain: 0.8, layers: [
    osc('square', 220, 70, 0.6, 0, { duration: 0.25 }),
    noise(0.7, 'lowpass', 1200, 200, { duration: 0.25 }),
    osc('sine', 80, 50, 0.7, 0, { duration: 0.2 }),
  ] },
  'player-die': { duration: 1.2, gain: 0.9, layers: [
    osc('sawtooth', 400, 35, 0.6, 0, { duration: 1.1 }),
    osc('square', 200, 30, 0.3, 0, { duration: 1.0, delay: 0.1 }),
    noise(0.6, 'lowpass', 2000, 80, { duration: 1.1 }, 1.2),
  ] },
  'pickup-health': { duration: 0.35, gain: 0.6, layers: [
    ...notes('triangle', [523, 784], 0.08, 0.2, 0.6),
    osc('sine', 1568, 1568, 0.2, 0, { delay: 0.12, duration: 0.2 }),
  ] },
  'pickup-ammo': { duration: 0.25, gain: 0.6, layers: [
    osc('square', 1200, 1200, 0.35, 0, { duration: 0.05 }),
    osc('square', 1800, 1800, 0.35, 0, { delay: 0.06, duration: 0.08 }),
    noise(0.4, 'highpass', 4000, 4000, { duration: 0.03 }),
  ] },
  'door-open': { duration: 0.9, gain: 0.7, layers: [
    noise(0.5, 'bandpass', 200, 500, { duration: 0.85 }, 2),
    osc('sawtooth', 55, 80, 0.5, 0.1, { duration: 0.85 }),
    osc('square', 120, 90, 0.15, 0, { duration: 0.2 }),
    osc('sine', 60, 40, 0.6, 0, { delay: 0.8, duration: 0.1 }),
  ] },
  'door-close': { duration: 0.8, gain: 0.7, layers: [
    noise(0.5, 'bandpass', 500, 200, { duration: 0.65 }, 2),
    osc('sawtooth', 80, 50, 0.1, 0.5, { duration: 0.65 }),
    osc('sine', 70, 30, 0.9, 0, { delay: 0.6, duration: 0.2 }),
    noise(0.7, 'lowpass', 1200, 150, { delay: 0.6, duration: 0.18 }),
  ] },
  'switch-on': { duration: 0.3, gain: 0.7, layers: [
    osc('square', 300, 150, 0.5, 0, { duration: 0.05 }),
    osc('square', 600, 600, 0.3, 0, { delay: 0.07, duration: 0.05 }),
    osc('triangle', 440, 880, 0.4, 0, { delay: 0.12, duration: 0.15 }),
  ] },
  'weapon-switch': { duration: 0.2, gain: 0.5, layers: [
    noise(0.6, 'bandpass', 1500, 800, { duration: 0.05 }, 3),
    osc('square', 500, 300, 0.3, 0, { duration: 0.04, delay: 0.08 }),
    noise(0.5, 'bandpass', 2500, 1500, { duration: 0.05, delay: 0.1 }, 3),
  ] },
  'weapon-empty': { duration: 0.08, gain: 0.5, layers: [
    noise(0.8, 'highpass', 3000, 2000, { duration: 0.03 }),
    osc('square', 180, 120, 0.4, 0, { duration: 0.04 }),
  ] },
  'ui-click': { duration: 0.06, gain: 0.4, layers: [
    osc('square', 900, 600, 0.4, 0, { duration: 0.05 }),
  ] },
  'victory': { duration: 1.1, gain: 0.6, layers: [
    ...notes('square', [262, 330, 392, 523], 0.14, 0.25, 0.3),
    ...notes('triangle', [524, 660, 784, 1046], 0.14, 0.3, 0.3),
    osc('triangle', 1046, 1046, 0.35, 0, { delay: 0.56, duration: 0.5 }),
  ] },
  'defeat': { duration: 1.2, gain: 0.6, layers: [
    ...notes('sawtooth', [392, 330, 262, 196], 0.2, 0.3, 0.3),
    osc('sine', 98, 49, 0.5, 0, { delay: 0.6, duration: 0.6 }),
  ] },
  'wave-start': { duration: 0.8, gain: 0.7, layers: [
    osc('sawtooth', 110, 110, 0.4, 0.4, { duration: 0.35 }),
    osc('square', 220, 220, 0.2, 0.2, { duration: 0.35 }),
    osc('sawtooth', 110, 165, 0.4, 0, { delay: 0.4, duration: 0.4 }),
    osc('sine', 55, 55, 0.6, 0, { duration: 0.7 }),
  ] },
};
