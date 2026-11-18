// Writes the sandbox's sample sounds (public/sounds/sandbox/*.wav): small, deterministic, synthesised PCM so the
// SDK 3 sample path (P1.6) has real files to load. Run: node assets/sounds/build-sandbox-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/sounds/sandbox');
const RATE = 22050;

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
let seed = 0x2545f491;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x80000000 - 1; };
const render = (seconds, fn) => Array.from({ length: Math.floor(seconds * RATE) }, (_, i) => fn(i / RATE));

// Chime: two bell partials with exponential decay.
const chime = render(0.9, (t) => Math.exp(-t * 5) * (0.5 * Math.sin(2 * Math.PI * 880 * t) + 0.3 * Math.sin(2 * Math.PI * 1320 * t) + 0.15 * Math.sin(2 * Math.PI * 2640 * t)));
// Thud: a pitch-dropping sine plus a short filtered noise burst.
let lp = 0;
const thud = render(0.35, (t) => { lp += (noise() - lp) * 0.08; return Math.exp(-t * 14) * (0.8 * Math.sin(2 * Math.PI * (110 - 140 * t) * t) + 0.6 * lp); });
// Wind: a seamless 2 s loop of slowly modulated low-passed noise (fades at both ends cross over).
let w = 0;
const windRaw = render(2, (t) => { w += (noise() - w) * (0.02 + 0.015 * Math.sin(2 * Math.PI * 0.5 * t)); return w * 1.8; });
const n = windRaw.length, fade = Math.floor(0.25 * RATE);
const wind = windRaw.slice(0, n - fade).map((v, i) => (i < fade ? v * (i / fade) + windRaw[n - fade + i] * (1 - i / fade) : v));

mkdirSync(out, { recursive: true });
for (const [name, s] of Object.entries({ chime, thud, wind })) {
  writeFileSync(resolve(out, `${name}.wav`), wav(s));
  console.log(`${name}.wav: ${(s.length / RATE).toFixed(2)} s`);
}
