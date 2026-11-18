import { defineRegistry } from '../core.ts';

export type Range2 = readonly [number, number]; // start → end value over the layer's duration
export interface SoundLayer {
  kind: 'osc' | 'noise';
  wave?: 'sine' | 'square' | 'sawtooth' | 'triangle'; // osc only
  freq?: Range2; // Hz, osc only (exponential ramp)
  gain: Range2; // linear gain envelope start → end (ramp to ~0 at the end regardless)
  delay?: number; // seconds from sound start
  duration?: number; // seconds; defaults to SoundDef.duration - delay
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; freq: Range2; q?: number };
}
export interface SoundDef {
  duration: number;
  gain: number;
  layers: readonly SoundLayer[];
}
export interface PlayOptions {
  gain?: number;
  /** -1..1 stereo pan (ignored when `position` is set). */
  pan?: number;
  /** Playback rate; for synth sounds it multiplies all oscillator frequencies. */
  rate?: number;
  /** SDK 3: mixer bus (default: the sample's bus, else "sfx"). */
  bus?: AudioBus;
  /** SDK 3: world position (metres) for 3D sound; relative to the listener set with setListener. */
  position?: Readonly<{ x: number; y: number; z: number }>;
  /** SDK 3: loop until stopped (samples only; use start() to get the handle). */
  loop?: boolean;
}

/** SDK 3 mixer buses. Each has its own volume; all feed "master". */
export type AudioBus = 'music' | 'sfx' | 'ui' | 'ambience';
export const AUDIO_BUSES: readonly AudioBus[] = ['music', 'sfx', 'ui', 'ambience'];

/**
 * SDK 3 sample-based sound (P1.6), registered in `AudioSamples` under a sound id. When a sample with the same id as a
 * synth SoundDef exists and has decoded, it plays instead; until then (or if it fails to load) the synth plays.
 */
export interface SampleDef {
  /** Audio file under public/ (ogg, mp3, wav... anything decodeAudioData supports), loaded through the asset service. */
  url: string;
  /** Base gain (default 1). */
  gain?: number;
  bus?: AudioBus;
  loop?: boolean;
  /** Random playback-rate range per play, e.g. [0.95, 1.05] for variety (cosmetic randomness). */
  rateJitter?: readonly [number, number];
  /** 3D falloff: full volume within refDistance (default 2 m), inverse rolloff (default 1) up to maxDistance (60 m). */
  refDistance?: number;
  maxDistance?: number;
  rolloff?: number;
}
export const AudioSamples = defineRegistry<SampleDef>('audio-sample');

/** A started voice (loops, music, moving emitters). Stopping twice is harmless. */
export interface VoiceHandle {
  stop(fadeSeconds?: number): void;
  setPosition(p: Readonly<{ x: number; y: number; z: number }>): void;
  setGain(g: number): void;
  readonly playing: boolean;
}

export interface Listener {
  position: Readonly<{ x: number; y: number; z: number }>;
  /** Unit forward and up vectors. */
  forward: Readonly<{ x: number; y: number; z: number }>;
  up: Readonly<{ x: number; y: number; z: number }>;
}

export interface AudioService {
  /** Plays a registered sound id (namespaced, e.g. "core/pistol-fire"). Unknown ids are ignored with one warning. */
  play(soundId: string, opts?: PlayOptions): void;
  setMasterVolume(v: number): void; // 0..1
  getMasterVolume(): number;
  /** Must be called from a user gesture at least once; safe to call repeatedly. */
  resume(): void;
  /** Number of currently sounding voices (diagnostics). */
  readonly activeVoices: number;
  // ---- SDK 3 (optional so older fakes still type-check; the host implements all of them) ----
  /** Starts a sound and returns a handle (needed for loops and moving 3D emitters). Undefined when silent. */
  start?(soundId: string, opts?: PlayOptions): VoiceHandle | undefined;
  setBusVolume?(bus: AudioBus, v: number): void;
  getBusVolume?(bus: AudioBus): number;
  /** Ear position/orientation for 3D sounds. The app sets it from the world camera every frame by default. */
  setListener?(l: Listener): void;
  /** Sample loading state. */
  readonly samples?: { readonly loaded: number; readonly failed: number; readonly pending: number };
}
