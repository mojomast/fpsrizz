import { definePlugin, ThemeRole } from '@bulkhead/sdk';
import type { SoundDef, SoundLayer } from '@bulkhead/sdk';
import { textures } from './generated.ts';

// Original glass-like tones: an intimate, quiet contrast to the arcade pack.
const glass = (frequency: number, delay: number, duration: number, gain = 0.28): SoundLayer => ({
  kind: 'osc', wave: 'sine', freq: [frequency, frequency * 1.002], gain: [gain, 0], delay, duration,
});
export const sounds: Record<string, SoundDef> = {
  'story-inspect': { duration: 0.32, gain: 0.35, layers: [glass(740, 0, 0.3), glass(1480, 0, 0.18, 0.08)] },
  'story-take': { duration: 0.4, gain: 0.35, layers: [glass(554, 0, 0.2), glass(831, 0.12, 0.28)] },
  'story-reveal': { duration: 0.85, gain: 0.4, layers: [
    glass(370, 0, 0.5), glass(554, 0.14, 0.55), glass(1110, 0.3, 0.55, 0.16),
    { kind: 'noise', duration: 0.45, gain: [0.05, 0], filter: { type: 'highpass', freq: [4500, 7000] } },
  ] },
  'story-victory': { duration: 1.3, gain: 0.42, layers: [
    glass(277, 0, 0.8), glass(415, 0.18, 0.85), glass(554, 0.36, 0.9), glass(831, 0.56, 0.72, 0.16),
  ] },
};

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ThemeRole, 'theme/story', { name: 'The Indigo Observatory', textures, sounds, visuals: {} });
  },
});
