import { definePlugin, ThemeRole } from '@bulkhead/sdk';
import type { SoundDef, SoundLayer } from '@bulkhead/sdk';
import { textures } from './generated.ts';
import { vehicle } from './vehicle.ts';

// Original short synth stings, never sampled music or Assetrizz audio.
const note = (frequency: number, delay: number, duration: number): SoundLayer => ({
  kind: 'osc', wave: 'square', freq: [frequency, frequency], gain: [0.18, 0], delay, duration,
});
export const sounds: Record<string, SoundDef> = {
  'race-checkpoint': { duration: 0.28, gain: 0.5, layers: [note(659, 0, 0.12), note(988, 0.1, 0.18)] },
  'race-finish': { duration: 0.85, gain: 0.55, layers: [note(523, 0, 0.2), note(659, 0.12, 0.2), note(784, 0.24, 0.2), note(1047, 0.38, 0.46)] },
  'race-skid': { duration: 0.17, gain: 0.24, layers: [
    { kind: 'noise', gain: [0.35, 0], filter: { type: 'bandpass', freq: [2400, 700], q: 1.6 } },
  ] },
  'race-engine': { duration: 0.19, gain: 0.12, layers: [
    { kind: 'osc', wave: 'sawtooth', freq: [72, 108], gain: [0.25, 0], filter: { type: 'lowpass', freq: [500, 800] } },
    { kind: 'osc', wave: 'triangle', freq: [36, 54], gain: [0.3, 0] },
  ] },
};

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ThemeRole, 'theme/arcade', {
      name: 'Neon Courier', textures: { ...textures, 'race-vehicle': vehicle }, sounds, visuals: {},
    });
  },
});
