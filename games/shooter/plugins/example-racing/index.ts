import type { SessionContext, TriggerDesc } from '../../../../src/sdk/index.ts';
import { Collider, ControllerRole, Died, Flow, Health, Input, InputActions, Maps, ModeRole, Player, Prefabs, SequenceMechanicRole, SequenceProviders, Transform, World, definePlugin, sequenceMechanic, spawnPrefab, yawDirX, yawDirZ } from '../../../../src/sdk/index.ts';

const CONTROLLER = 'example/racing-controller';
const MODE = 'example/race';
const PREFIX = 'race/checkpoint/';
const FINISH = 'race/finish';
const actions = { gas: 'example/racing-gas', brake: 'example/racing-brake', left: 'example/racing-left', right: 'example/racing-right' } as const;

function controller(ctx: SessionContext): void {
  const input = ctx.services.get(Input);
  const world = ctx.services.get(World);
  const flow = ctx.services.get(Flow);
  const speeds = new Map<number, number>();
  const out = { x: 0, z: 0 };
  ctx.systems.add({ id: 'example/racing.drive', phase: 'control', update(dt) {
    ctx.world.each(Player, (id, player) => {
      const t = ctx.world.get(id, Transform);
      const c = ctx.world.get(id, Collider);
      if (!t || !c || flow.ended || ctx.world.get(id, Health)?.dead) return;
      const tick = input.tick;
      let speed = speeds.get(id) ?? 0;
      // Brake slows forward motion first, then engages a slower reverse gear.
      const target = tick.held(actions.brake) ? (speed > 0 ? 0 : -4) : tick.held(actions.gas) ? 12 : 0;
      const rate = tick.held(actions.brake) ? 16 : tick.held(actions.gas) ? 7 : 2;
      speed += Math.max(-rate * dt, Math.min(rate * dt, target - speed));
      const steer = (tick.held(actions.left) ? 1 : 0) - (tick.held(actions.right) ? 1 : 0);
      t.yaw += steer * 2.2 * Math.min(1, Math.abs(speed) / 3) * Math.sign(speed) * dt;
      const x = t.x, z = t.z;
      const hit = world.moveCircle(x, z, c.radius, yawDirX(t.yaw) * speed * dt, yawDirZ(t.yaw) * speed * dt, out);
      t.x = out.x; t.z = out.z;
      if (hit) speed = ((out.x - x) * yawDirX(t.yaw) + (out.z - z) * yawDirZ(t.yaw)) / dt;
      speeds.set(id, speed);
      player.speed = Math.min(1, Math.abs(speed) / 12);
    });
  } });
}

// Entry parameter along the centre's swept segment; starting inside is not an entry.
function entry(a: { x: number; z: number }, b: { x: number; z: number }, zone: TriggerDesc): number | undefined {
  const x = a.x - zone.x, z = a.z - zone.z;
  const dx = b.x - a.x, dz = b.z - a.z;
  const c = x * x + z * z - zone.radius * zone.radius;
  const length2 = dx * dx + dz * dz;
  if (c <= 0 || length2 === 0) return undefined;
  const dot = x * dx + z * dz;
  const discriminant = dot * dot - length2 * c;
  if (discriminant < 0) return undefined;
  const t = (-dot - Math.sqrt(discriminant)) / length2;
  return t >= 0 && t <= 1 ? t : undefined;
}

function course(triggers: readonly TriggerDesc[]): TriggerDesc[] {
  const checkpoints = triggers.filter((t) => t.kind === 'zone' && t.tags.some((tag) => /^race\/checkpoint\/[1-9]\d*$/.test(tag)));
  checkpoints.sort((a, b) => Number(a.tags.find((t) => t.startsWith(PREFIX))!.slice(PREFIX.length)) - Number(b.tags.find((t) => t.startsWith(PREFIX))!.slice(PREFIX.length)));
  const finish = triggers.find((t) => t.kind === 'zone' && t.tags.includes(FINISH));
  return finish ? [...checkpoints, finish] : checkpoints;
}

function race(ctx: SessionContext): void {
  const world = ctx.services.get(World), flow = ctx.services.get(Flow);
  const gates = course(world.desc.triggers);
  const player = spawnPrefab(ctx, 'core/player', world.desc.playerStart);
  const limit = ctx.config['timeLimit'] as number;
  const steps = gates.map((_, i) => `gate-${i}`);
  const sequence = sequenceMechanic(ctx).create(ctx, 'example/race', { steps, rounds: 1 });
  let elapsed = 0;
  const refresh = (): void => {
    const next = sequence.index;
    flow.setObjective(next < gates.length - 1 ? `Reach checkpoint ${next + 1} / ${gates.length - 1}` : 'Reach the finish');
    flow.setStatus('race-checkpoints', 'Checkpoints', `${Math.min(next, gates.length - 1)} / ${gates.length - 1}`);
    flow.setStatus('race-time', 'Time remaining', `${Math.max(0, limit - elapsed).toFixed(1)}s`);
  };
  const end = (win: boolean): void => flow.end({ outcome: win ? 'victory' : 'defeat', title: win ? 'Race complete' : 'Race over', detail: win ? 'You reached the finish in time.' : 'Time expired or the driver was eliminated.', stats: [['Time', `${elapsed.toFixed(1)}s`], ['Checkpoints', `${Math.min(sequence.index, gates.length - 1)} / ${gates.length - 1}`]] });
  refresh();
  ctx.events.on(Died, (event) => { if (event.entity === player && !flow.ended) end(false); });
  ctx.systems.add({ id: 'example/racing.rules', phase: 'rules', update(dt) {
    if (flow.ended) return;
    const t = ctx.world.get(player, Transform);
    if (!t) { end(false); return; }
    // Sort all entries by travel order: an out-of-order gate cannot be credited retroactively.
    const hits = gates.map((gate, i) => ({ i, at: entry({ x: t.prevX, z: t.prevZ }, t, gate) }))
      .filter((hit): hit is { i: number; at: number } => hit.at !== undefined)
      .sort((a, b) => a.at - b.at || a.i - b.i);
    const remaining = limit - elapsed;
    for (const hit of hits) {
      if (hit.at * dt > remaining || !sequence.advance(steps[hit.i]!).ok) continue;
      if (sequence.complete) { elapsed += hit.at * dt; refresh(); end(true); return; }
      flow.notify(`Checkpoint ${sequence.index} reached`);
    }
    elapsed += dt;
    refresh();
    if (elapsed >= limit) end(false);
  } });
}

export default definePlugin({
  register(ctx) {
    ctx.register(InputActions, actions.gas, { label: 'Accelerate', keys: ['KeyW', 'ArrowUp'] });
    ctx.register(InputActions, actions.brake, { label: 'Brake / reverse', keys: ['KeyS', 'ArrowDown'] });
    ctx.register(InputActions, actions.left, { label: 'Steer left', keys: ['KeyA', 'ArrowLeft'] });
    ctx.register(InputActions, actions.right, { label: 'Steer right', keys: ['KeyD', 'ArrowRight'] });
    ctx.provideRole(ControllerRole, CONTROLLER, { name: 'Arcade driving', description: 'W/S accelerate and brake or reverse; A/D steer.', activate: controller });
    ctx.provideRole(ModeRole, MODE, { name: 'Time trial', description: 'Pass numbered checkpoints in order, then reach the finish before time runs out.', activate: race });
    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== MODE) return;
      const sequence = v.selectedRole(SequenceMechanicRole);
      if (!sequence || !v.registries.has(SequenceProviders, sequence)) v.reporter('preset', 'roles.sdk/mechanic-sequence').error('select a sequence role with a registered SequenceProviders factory');
      if (!v.registries.has(Prefabs, 'core/player')) v.reporter('preset', 'roles.sdk/mode').error('Racing needs the core/player prefab.');
      const mapId = v.preset.options['map'];
      const map = typeof mapId === 'string' ? v.registries.get(Maps, mapId) : undefined;
      if (!map) return;
      const r = v.reporter(v.registries.ownerOf(Maps, mapId as string) ?? 'preset', `map "${mapId as string}".triggers`);
      const numbered: number[] = [];
      let finishes = 0;
      for (const t of map.world.triggers) {
        const tags = t.tags.filter((tag) => tag.startsWith(PREFIX) || tag === FINISH);
        if (!tags.length) continue;
        if (t.kind !== 'zone' || tags.length !== 1) { r.error('Each race gate must be a zone with exactly one race tag.'); continue; }
        const tag = tags[0]!;
        if (tag === FINISH) finishes++;
        else if (!/^race\/checkpoint\/[1-9]\d*$/.test(tag) || !Number.isSafeInteger(Number(tag.slice(PREFIX.length)))) r.error(`Invalid checkpoint tag "${tag}"; use race/checkpoint/1, race/checkpoint/2, ...`);
        else numbered.push(Number(tag.slice(PREFIX.length)));
      }
      numbered.sort((a, b) => a - b);
      if (!numbered.length || numbered.some((n, i) => n !== i + 1)) r.error('Race needs one zone per consecutive checkpoint tag starting at race/checkpoint/1.');
      if (finishes !== 1) r.error('Race needs exactly one zone tagged race/finish.');
    });
  },
});
