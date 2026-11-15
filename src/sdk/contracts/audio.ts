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
  pan?: number;
  rate?: number;
} // pan -1..1, rate multiplies all osc freqs
export interface AudioService {
  /** Plays a registered sound id (namespaced, e.g. "core/pistol-fire"). Unknown ids are ignored with one warning. */
  play(soundId: string, opts?: PlayOptions): void;
  setMasterVolume(v: number): void; // 0..1
  getMasterVolume(): number;
  /** Must be called from a user gesture at least once; safe to call repeatedly. */
  resume(): void;
  /** Number of currently sounding voices (diagnostics). */
  readonly activeVoices: number;
}
