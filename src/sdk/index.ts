/**
 * THE public SDK entry point. Plugins and content tooling import from here and nowhere else in src/kernel or
 * src/platform. (Rendering plugins additionally use src/sdk/render.ts, which exposes the Three-style scene API.)
 */
export * from './core.ts';
export * from './contracts/shooter.ts';
export * from './contracts/profile.ts';
export type * from './contracts/audio.ts';
