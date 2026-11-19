import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PluginHost } from '../src/kernel/host.ts';
import type { CatalogEntry } from '../src/kernel/host.ts';
import { Scheduler } from '../src/kernel/scheduler.ts';
import { createDebugDraw } from '../src/platform/debug-draw.ts';
import { createDevTools, jsonSafe } from '../src/platform/devtools.ts';
import type { DevEnv } from '../src/platform/devtools.ts';
import { connectDevRpc, handleRpc } from '../src/app/dev-rpc.ts';
import { DebugDraw, PHASES, SDK_COMPAT, SDK_VERSION, Transform3D, debugDraw, defineComponent, transform3d } from '../src/sdk/index.ts';
import { codePlugin, presetOf } from './helpers/host.ts';
// @ts-ignore -- plain .mjs tooling module without types
import { startDevRpcBridge } from '../scripts/dev-rpc-bridge.mjs';

const Speed = defineComponent<{ value: number; tags: string[] }>('test/speed');
const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../${dir}/index.ts`) });

async function devGame() {
  const draw = createDebugDraw(true);
  const host = new PluginHost({
    sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES,
    installHostServices(session, scope) {
      session.services.provide(DebugDraw, draw.service, 'host', scope);
      session.addBeforeTick(() => draw.beginTick(session.scheduler.time), scope);
    },
  });
  const game = codePlugin('test/game', {
    activate(ctx) {
      const state = { score: 0 };
      ctx.persist({ save: () => ({ ...state }), load: (d) => { Object.assign(state, d as object); } });
      const e = ctx.world.create();
      ctx.world.add(e, Transform3D, transform3d({ position: { x: 1 } }));
      ctx.world.add(e, Speed, { value: Number(ctx.config.speed ?? 1), tags: ['a'] });
      ctx.world.add(e, { id: 'sdk/scene-node' }, { name: 'runner' });
      ctx.systems.add({ id: 'test/move', phase: 'movement', update: (dt) => {
        state.score++;
        ctx.world.each(Speed, (id, s) => { ctx.world.get(id, Transform3D)!.position.x += s.value * dt; });
        debugDraw(ctx).line({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      } });
    },
  }, { sdk: '^3.0.0', config: { speed: { type: 'number', label: 'Speed', default: 1, min: 0, max: 10 } } });
  host.setCatalog([real('src/plugins/std-transform'), game]);
  const preset = presetOf('test/p', ['std/transform', 'test/game']);
  await host.apply(preset);
  const env: DevEnv = {
    host, sim: { mode: 'auto', speed: 1 }, debugDraw: draw, overlays: { colliders: false },
    snapshotReady: () => true,
    async applyPreset(p) { try { await host.apply(p); return { ok: true }; } catch (error) { return { ok: false, error }; } },
  };
  return { host, env, draw, dev: createDevTools(env) };
}

test('dev tools: query, get, set (replace, merge, remove), step, speed and logs on a live session', async () => {
  const { host, env, dev } = await devGame();
  const q = dev['world.query']({ with: ['test/speed'] }) as { total: number; entities: { id: number; name?: string; components: string[] }[] };
  assert.equal(q.total, 1);
  const id = q.entities[0]!.id;
  assert.equal(q.entities[0]!.name, 'runner');
  assert.deepEqual((dev['world.query']({ name: 'nobody' }) as { total: number }).total, 0);
  assert.deepEqual((dev['entity.get']({ id, components: ['test/speed'] }) as { components: object }).components, { 'test/speed': { value: 1, tags: ['a'] } });
  const live = host.session!.entities.get(id, Speed)!;
  dev['entity.set']({ id, component: 'test/speed', value: { value: 3 }, merge: true });
  assert.equal(live.value, 3, 'edited in place, so systems holding the object see it');
  assert.deepEqual(live.tags, ['a'], 'merge kept other fields');
  dev['entity.set']({ id, component: 'test/extra', value: { on: true } });
  assert.ok(host.session!.entities.has(id, { id: 'test/extra' }));
  dev['entity.set']({ id, component: 'test/extra', value: null });
  assert.ok(!host.session!.entities.has(id, { id: 'test/extra' }));
  assert.throws(() => dev['entity.get']({ id: 9999 }), /not alive/);

  const st = dev['sim.step']({ n: 30 }) as { tick: number; mode: string };
  assert.equal(st.tick, 30);
  assert.equal(st.mode, 'hold');
  assert.ok(Math.abs(host.session!.entities.get(id, Transform3D)!.position.x - (1 + 3 * 0.5)) < 1e-9, '30 ticks at speed 3');
  dev['sim.speed']({ speed: 0.25 });
  assert.equal(host.session!.scheduler.timeScale, 0.25);
  assert.throws(() => dev['sim.speed']({ speed: 99 }), /between/);
  assert.equal((dev['sim.pause']({ paused: false }) as { mode: string }).mode, 'run');
  assert.equal((dev['sim.resume']() as { mode: string }).mode, 'auto');
  assert.ok((dev['perf.systems']() as { systems: { id: string }[] }).systems.some((s) => s.id === 'test/move'));
  assert.ok(Array.isArray(dev['log.tail']({ n: 5 })));
  assert.equal(env.sim.speed, 0.25);
  host.stop();
});

test('dev tools: config.set restarts with the new value and keeps the run state through a snapshot', async () => {
  const { host, dev } = await devGame();
  dev['sim.step']({ n: 12 });
  const desc = dev['config.describe']() as { plugin: string; fields: Record<string, unknown> }[];
  assert.deepEqual(desc.map((d) => d.plugin), ['test/game']);
  const r = await dev['config.set']({ plugin: 'test/game', key: 'speed', value: 4 }) as { kept: boolean; tick: number };
  assert.equal(r.kept, true);
  assert.equal(host.session!.scheduler.tick, 12, 'tick restored');
  assert.equal(host.active!.preset.config['test/game']!.speed, 4);
  assert.equal((dev['preset.get']() as { config: Record<string, Record<string, number>> }).config['test/game']!.speed, 4, 'export-to-preset carries the tweak');
  await assert.rejects(dev['config.set']({ plugin: 'test/game', key: 'nope', value: 1 }), /no config field "nope"/);
  host.stop();
});

test('debug draw: tick/frame/seconds lifetimes, the bounded buffer and projection onto a 2D overlay', async () => {
  const d = createDebugDraw(true);
  d.service.line({ x: 0, y: 0, z: -5 }, { x: 1, y: 0, z: -5 });
  d.service.box({ x: 0, y: 0, z: -5 }, { x: 1, y: 1, z: 1 }, { seconds: 1 });
  d.service.text({ x: 0, y: 0, z: -5 }, 'hi', { frame: true });
  assert.equal(d.primitives().length, 3);
  d.beginTick(0.5);
  assert.deepEqual(d.primitives().map((p) => p.k), ['box', 'text'], 'tick-lifetime line dropped at the next tick');
  let segments = 0, texts = 0;
  const g = { clearRect() {}, beginPath() {}, moveTo() { segments++; }, lineTo() {}, stroke() {}, strokeText() {}, fillText() { texts++; } } as unknown as CanvasRenderingContext2D;
  // Identity view, simple perspective (w = -z): everything at z = -5 is in front of the camera.
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0];
  d.render(g, m, 100, 100);
  assert.equal(segments, 12, 'box edges');
  assert.equal(texts, 1);
  assert.deepEqual(d.primitives().map((p) => p.k), ['box'], 'frame-lifetime text dropped after one render');
  d.beginTick(2);
  assert.equal(d.primitives().length, 0, 'seconds lifetime expired');
  d.enabled = false;
  d.service.line({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  assert.equal(d.primitives().length, 0, 'disabled drawing records nothing');
  assert.equal(debugDraw({ services: { tryGet: () => undefined } } as never).enabled, false, 'no-op without a host service');
  const sched = new Scheduler(['a'], { onFault() {} }, 1 / 60);
  sched.timeScale = 0.5;
  assert.equal(sched.advance(1 / 60), 0);
  assert.equal(sched.advance(1 / 60), 1, 'half speed: one tick per two frames');
});

test('jsonSafe bounds live data', () => {
  const cyc: Record<string, unknown> = { a: 1, m: new Map([['k', new Set([1])]]), f: () => 1, n: NaN, t: new Float32Array([1, 2]) };
  cyc.self = cyc;
  assert.deepEqual(jsonSafe(cyc), { a: 1, m: { k: [1] }, f: '[function]', n: 'NaN', t: [1, 2], self: '[cycle]' });
});

const rpc = async (url: string, body: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(`${url}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() as Record<string, unknown> };
};

test('dev protocol: the bridge forwards JSON-RPC from HTTP to the game page and back; the MCP server exposes it as tools', async () => {
  const { host, dev } = await devGame();
  const bridge = await startDevRpcBridge({ port: 0, log: null, allowOrigin: (o: string) => o === 'http://127.0.0.1:5173' });
  const none = await rpc(bridge.url, { jsonrpc: '2.0', id: 1, method: 'sim.state' });
  assert.match(String((none.json.error as { message: string }).message), /no game connected/);
  const client = connectDevRpc(async () => dev, `ws://127.0.0.1:${bridge.port}/game`);
  for (let i = 0; i < 100 && !bridge.gameConnected; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(bridge.gameConnected);

  const st = await rpc(bridge.url, { jsonrpc: '2.0', id: 'a', method: 'sim.step', params: { n: 5 } });
  assert.equal((st.json.result as { tick: number }).tick, 5);
  assert.equal(st.json.id, 'a', 'the caller id is restored');
  const batch = await fetch(`${bridge.url}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'world.query', params: { with: ['test/speed'] } }, { jsonrpc: '2.0', id: 2, method: 'nope.nope' }]) }).then((r) => r.json()) as { id: number; result?: { total: number }; error?: { code: number } }[];
  assert.equal(batch[0]!.result!.total, 1);
  assert.equal(batch[1]!.error!.code, -32601);
  assert.equal((await rpc(bridge.url, { jsonrpc: '2.0', id: 3, method: 'sim.state' }, { origin: 'https://evil.example' })).status, 403, 'other web origins are refused');
  const plain = await fetch(`${bridge.url}/rpc`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(plain.status, 415, 'simple cross-site posts are refused');
  const discover = await handleRpc(async () => dev, { jsonrpc: '2.0', id: 9, method: 'rpc.discover' });
  assert.ok('world.query' in (discover!.result as { methods: object }).methods);

  // MCP over stdio
  const mcp = spawn(process.execPath, ['scripts/mcp-bulkhead.mjs'], { env: { ...process.env, BULKHEAD_RPC: `${bridge.url}/rpc` }, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map<number, Record<string, unknown>>();
  let buf = '';
  mcp.stdout!.on('data', (c) => { buf += c.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); replies.set(m.id, m); } });
  const ask = async (id: number, method: string, params: unknown = {}) => {
    mcp.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    for (let i = 0; i < 250 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 20));
    return replies.get(id)!;
  };
  const init = await ask(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  assert.equal((init.result as { serverInfo: { name: string } }).serverInfo.name, 'bulkhead-dev');
  const list = await ask(2, 'tools/list');
  const names = (list.result as { tools: { name: string }[] }).tools.map((t) => t.name);
  for (const n of ['world_query', 'entity_get', 'entity_set', 'sim_step', 'sim_pause', 'preset_apply', 'replay_run', 'screenshot', 'log_tail']) assert.ok(names.includes(n), n);
  const call = await ask(3, 'tools/call', { name: 'world_query', arguments: { with: ['test/speed'] } });
  assert.equal(((call.result as { structuredContent: { total: number } }).structuredContent).total, 1);
  const bad = await ask(4, 'tools/call', { name: 'screenshot', arguments: {} });
  assert.equal((bad.result as { isError: boolean }).isError, true, 'errors come back as tool errors');
  mcp.kill();
  client.close();
  await bridge.close();
  host.stop();
});
