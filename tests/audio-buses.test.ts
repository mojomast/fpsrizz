import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioService } from '../src/platform/audio.ts';
import type { SoundDef } from '../src/sdk/index.ts';

// Minimal Web Audio fake: records the node graph and parameter values.
class Param { value = 0; setValueAtTime(v: number) { this.value = v; } linearRampToValueAtTime(v: number) { this.value = v; } exponentialRampToValueAtTime(v: number) { this.value = v; } }
class Node {
  out: Node[] = [];
  readonly kind: string;
  constructor(kind: string) { this.kind = kind; }
  connect(n: Node) { this.out.push(n); return n; }
  disconnect() { this.out = []; }
}
class Gain extends Node { gain = new Param(); constructor() { super('gain'); } }
class Panner extends Node {
  positionX = new Param(); positionY = new Param(); positionZ = new Param();
  panningModel = ''; distanceModel = ''; refDistance = 1; maxDistance = 1; rolloffFactor = 1;
  constructor() { super('panner'); }
}
class Source extends Node {
  buffer: unknown; loop = false; loopStart = 0; loopEnd = 0; playbackRate = new Param(); frequency = new Param(); type = '';
  started = false; stopped = false; onended: (() => void) | null = null;
  constructor(kind: string) { super(kind); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
}
class FakeContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = new Node('destination');
  listener = { positionX: new Param(), positionY: new Param(), positionZ: new Param(), forwardX: new Param(), forwardY: new Param(), forwardZ: new Param(), upX: new Param(), upY: new Param(), upZ: new Param() };
  sources: Source[] = [];
  panners: Panner[] = [];
  gains: Gain[] = [];
  createGain() { const g = new Gain(); this.gains.push(g); return g; }
  createPanner() { const p = new Panner(); this.panners.push(p); return p; }
  createStereoPanner() { return Object.assign(new Node('stereo'), { pan: new Param() }); }
  createBiquadFilter() { return Object.assign(new Node('filter'), { type: '', Q: new Param(), frequency: new Param() }); }
  createOscillator() { const s = new Source('osc'); this.sources.push(s); return s; }
  createBufferSource() { const s = new Source('buffer'); this.sources.push(s); return s; }
  createBuffer(_c: number, len: number) { return { duration: len / this.sampleRate, getChannelData: () => new Float32Array(len) }; }
  async decodeAudioData(b: ArrayBuffer) {
    if (new Uint8Array(b)[0] === 0xff) throw new Error('bad audio');
    return { duration: b.byteLength / 100 };
  }
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

const SYNTH: SoundDef = { duration: 0.2, gain: 0.5, layers: [{ kind: 'osc', gain: [1, 0] }] };
/** Follows the first connection chain from a node, returning node kinds. */
const chain = (n: Node): string[] => { const out: string[] = []; let cur: Node | undefined = n; while (cur) { out.push(cur.kind); cur = cur.out[0]; } return out; };

function setup() {
  let fake: FakeContext | undefined;
  const audio = createAudioService((id) => (id === 'synth/beep' || id === 'g/broken' ? SYNTH : undefined), { createContext: () => (fake = new FakeContext()) as unknown as AudioContext, random: () => 0.5 });
  audio.resume();
  return { audio, ctx: () => fake! };
}

test('buses feed master; bus and master volumes are clamped and applied live', () => {
  const { audio, ctx } = setup();
  const c = ctx();
  const master = c.gains[0]!;
  assert.equal(master.out[0], c.destination);
  const buses = c.gains.slice(1, 5);
  assert.equal(buses.length, 4);
  for (const b of buses) assert.equal(b.out[0], master);
  audio.setBusVolume('music', 2);
  assert.equal(audio.getBusVolume('music'), 1);
  audio.setBusVolume('music', 0.25);
  assert.equal(buses[0]!.gain.value, 0.25);
  audio.setMasterVolume(-1);
  assert.equal(master.gain.value, 0);
});

test('samples decode through the loader, play on their bus with 3D panning, and loops run until stopped', async () => {
  const { audio, ctx } = setup();
  const bytes = new Uint8Array(200);
  await audio.loadSamples([
    { id: 'g/hit', def: { url: 'sounds/hit.wav', bus: 'sfx', rateJitter: [0.8, 1.2], refDistance: 3 }, load: async () => bytes },
    { id: 'g/wind', def: { url: 'sounds/wind.wav', bus: 'ambience', loop: true }, load: async () => bytes },
  ]);
  assert.deepEqual(audio.samples, { loaded: 2, failed: 0, pending: 0 });
  const c = ctx();
  audio.setListener({ position: { x: 1, y: 2, z: 3 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } });
  assert.equal(c.listener.positionX.value, 1);
  assert.equal(c.listener.forwardZ.value, -1);
  const h = audio.start('g/hit', { position: { x: 5, y: 0, z: -2 } })!;
  const src = c.sources.at(-1)!;
  assert.equal(src.kind, 'buffer');
  assert.equal(src.playbackRate.value, 1, 'jitter midpoint with random() = 0.5');
  const p = c.panners.at(-1)!;
  assert.deepEqual([p.positionX.value, p.positionY.value, p.positionZ.value, p.refDistance, p.distanceModel], [5, 0, -2, 3, 'inverse']);
  assert.deepEqual(chain(src), ['buffer', 'gain', 'panner', 'gain', 'gain', 'destination'], 'source -> voice -> panner -> sfx bus -> master');
  assert.equal(c.panners.at(-1)!.out[0], c.gains[2], 'sfx is the second bus');
  h.setPosition({ x: 9, y: 9, z: 9 });
  assert.equal(p.positionX.value, 9);
  assert.equal(audio.activeVoices, 1);
  const loop = audio.start('g/wind')!;
  assert.equal(c.sources.at(-1)!.loop, true);
  assert.equal(chain(c.sources.at(-1)!)[2], 'gain', 'non-positional voices go straight to their bus');
  assert.equal(c.sources.at(-1)!.out[0]!.out[0], c.gains[4], 'ambience is the fourth bus');
  assert.equal(audio.activeVoices, 2);
  loop.stop();
  assert.equal(loop.playing, false);
  assert.equal(c.sources.at(-1)!.stopped, true);
  h.stop();
  assert.equal(audio.activeVoices, 0);
});

test('a failed sample falls back to the synth SoundDef with the same id; retainSamples drops stale ids', async () => {
  const { audio, ctx } = setup();
  const warn = console.warn;
  const warnings: string[] = [];
  console.warn = (m: string) => { warnings.push(m); };
  try {
    await audio.loadSamples([
      { id: 'g/broken', def: { url: 'sounds/x.ogg' }, load: async () => new Uint8Array([0xff]) },
      { id: 'g/ok', def: { url: 'sounds/ok.wav' }, load: async () => new Uint8Array(10) },
    ]);
  } finally { console.warn = warn; }
  assert.deepEqual(audio.samples, { loaded: 1, failed: 1, pending: 0 });
  assert.match(warnings.join('\n'), /g\/broken.*synth fallback/);
  audio.play('g/broken');
  assert.equal(ctx().sources.at(-1)!.kind, 'osc', 'synth fallback');
  audio.retainSamples(['g/other']);
  assert.deepEqual(audio.samples, { loaded: 0, failed: 0, pending: 0 });
  assert.equal(audio.start('g/ok'), undefined, 'no sample and no synth: silent');
});

test('without a context (no user gesture yet / no Web Audio) everything is a silent no-op', () => {
  const audio = createAudioService(() => SYNTH, { createContext: () => { throw new Error('no audio'); } });
  audio.resume();
  assert.equal(audio.start('x'), undefined);
  audio.play('x', { position: { x: 0, y: 0, z: 0 } });
  audio.setBusVolume('sfx', 0.5);
  assert.equal(audio.getBusVolume('sfx'), 0.5);
});
