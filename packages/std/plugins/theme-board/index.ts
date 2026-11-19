import { definePlugin, ThemeRole } from '@bulkhead/sdk';
import type { SoundDef, SoundLayer } from '@bulkhead/sdk';
import { textures } from './generated.ts';

// Dry wooden taps and soft mallet intervals: original synthesis, no samples.
const mallet = (frequency: number, delay: number, duration: number): SoundLayer => ({
  kind: 'osc', wave: 'triangle', freq: [frequency, frequency * 0.97], gain: [0.35, 0], delay, duration,
});
export const sounds: Record<string, SoundDef> = {
  'tactics-select': { duration: 0.12, gain: 0.4, layers: [mallet(880, 0, 0.12)] },
  'tactics-move': { duration: 0.2, gain: 0.4, layers: [mallet(330, 0, 0.08), mallet(440, 0.09, 0.11)] },
  'tactics-attack': { duration: 0.24, gain: 0.45, layers: [
    mallet(180, 0, 0.18),
    { kind: 'noise', duration: 0.07, gain: [0.38, 0], filter: { type: 'lowpass', freq: [1800, 350], q: 0.7 } },
  ] },
  'tactics-victory': { duration: 0.95, gain: 0.48, layers: [
    mallet(392, 0, 0.28), mallet(494, 0.15, 0.28), mallet(587, 0.3, 0.3), mallet(784, 0.46, 0.48),
    { kind: 'osc', wave: 'sine', freq: [196, 196], gain: [0.15, 0], duration: 0.9 },
  ] },
};

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ThemeRole, 'theme/board', {
      name: 'Chalk & Timber',
      textures: {
        ...textures,
        'puzzle-floor': textures['tactics-ground']!,
        'puzzle-explorer': textures['tactics-unit']!,
        'puzzle-golem': textures['tactics-enemy']!,
        'puzzle-boulder': textures['tactics-cover']!,
      },
      sounds: {
        ...sounds,
        'puzzle-step': sounds['tactics-move']!,
        'puzzle-push': sounds['tactics-attack']!,
        'puzzle-clear': sounds['tactics-victory']!,
        'puzzle-undo': sounds['tactics-select']!,
        'puzzle-gate': { duration: 0.6, gain: 0.4, layers: [mallet(392, 0, 0.2), mallet(587, 0.16, 0.35)] },
        'puzzle-caught': { duration: 0.5, gain: 0.4, layers: [mallet(196, 0, 0.2), mallet(130, 0.18, 0.3)] },
      },
      visuals: {},
    });
  },
});
