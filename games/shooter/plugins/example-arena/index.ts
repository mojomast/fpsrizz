import { Collider, Flow, Health, Maps, ModeRole, Prefabs, Profile, Transform, definePlugin, spawnPrefab, yawOf } from '@bulkhead/sdk';
import { Died, Enemies, World } from '../../contracts/shooter.ts';
import type { EntityId, SessionContext, SpawnDesc } from '@bulkhead/sdk';

const ID = 'example/arena';
const BEST_KEY = 'example/arena.best-score';

function run(ctx: SessionContext): void {
  const world = ctx.services.get(World);
  const flow = ctx.services.get(Flow);
  const killLimit = Number(ctx.config['killLimit']);
  const timeLimit = Number(ctx.config['timeLimit']);
  const interval = Number(ctx.config['spawnInterval']);
  const maxAlive = Number(ctx.config['maxAlive']);
  const minDistance = Number(ctx.config['minSpawnDistance']);
  const pickupRespawn = Number(ctx.config['pickupRespawn']);
  const player = spawnPrefab(ctx, String(ctx.config['playerPrefab']), world.desc.playerStart);
  for (const door of world.doors()) world.setDoorOpen(door.desc.id, true, true);

  const points = world.desc.spawns.filter((s) => s.tags.includes('enemy') && ctx.registries.has(Enemies, s.prefab));
  const pickups = world.desc.spawns.filter((s) => !s.tags.includes('enemy')).map((spawn) => ({
    spawn, entity: spawnPrefab(ctx, spawn.prefab, spawn, spawn.params), missingAt: -1,
  }));
  const live = new Map<EntityId, string>();
  const startedAt = ctx.time.now;
  let nextSpawnAt = startedAt;
  let kills = 0;
  let score = 0;
  const profile = ctx.services.tryGet(Profile);
  let best: number | undefined;
  let profileStatus = 'Unavailable';

  const readBest = (): ReturnType<NonNullable<typeof profile>['load']> => {
    if (!profile) return { ok: false, reason: 'unavailable' };
    const result = profile.load();
    if (!result.ok) return result;
    const value = result.value?.values[BEST_KEY];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      return { ok: false, reason: 'corrupt' };
    }
    best = value;
    return result;
  };
  const initial = readBest();
  profileStatus = initial.ok ? 'Ready' : `Unavailable (${initial.reason})`;

  const publish = (): void => {
    flow.setStatus('score', 'Score', String(score));
    flow.setStatus('best', 'Best score', best === undefined ? '—' : String(best));
    flow.setStatus('profile', 'Profile', profileStatus);
    flow.setStatus('kills', 'Kills', `${kills} / ${killLimit}`);
    flow.setStatus('time', 'Time left', String(Math.max(0, Math.ceil(timeLimit - (ctx.time.now - startedAt)))));
  };
  const end = (outcome: 'victory' | 'defeat', title: string, detail: string): void => {
    // Re-read at the end to preserve other values and scores written during the run.
    // Another tab can still write between this read and the replacement below.
    const current = readBest();
    if (!current.ok) profileStatus = `Not saved (${current.reason})`;
    else if (best === undefined || score > best) {
      const saved = profile!.save({ values: { ...current.value?.values, [BEST_KEY]: score } });
      if (saved.ok) { best = score; profileStatus = 'Saved'; }
      else profileStatus = `Not saved (${saved.reason})`;
    } else profileStatus = 'Best unchanged';
    publish();
    flow.end({ outcome, title, detail, stats: [['Score', String(score)], ['Best score', best === undefined ? '—' : String(best)], ['Profile', profileStatus], ['Kills', String(kills)], ['Time', String(Math.floor(ctx.time.now - startedAt))]] });
  };
  flow.setObjective(`Eliminate ${killLimit} enemies before time runs out`);
  publish();

  ctx.events.on(Died, (event) => {
    if (flow.ended) return;
    if (event.entity === player) {
      end('defeat', 'Arena overrun', 'You fell in the arena.');
      return;
    }
    const def = live.get(event.entity);
    if (!def) return;
    live.delete(event.entity);
    if (event.source !== player) return;
    kills++;
    score += ctx.registries.require(Enemies, def).score;
    if (kills >= killLimit) end('victory', 'Kill limit reached', 'You cleared the arena challenge.');
    else publish();
  });

  const spawnEnemy = (): void => {
    const playerPos = ctx.world.get(player, Transform);
    if (!playerPos) return;
    const candidates = points.filter((point) => {
      const def = ctx.registries.require(Enemies, point.prefab);
      if (!world.isFree(point.x, point.z, def.radius)) return false;
      let occupied = false;
      ctx.world.each(Collider, (id, collider) => {
        const pos = ctx.world.get(id, Transform);
        if (collider.solid && pos && Math.hypot(pos.x - point.x, pos.z - point.z) < collider.radius + def.radius) occupied = true;
      });
      return !occupied;
    });
    if (candidates.length === 0) return;
    const distance = (s: SpawnDesc): number => Math.hypot(s.x - playerPos.x, s.z - playerPos.z);
    const distant = candidates.filter((s) => distance(s) >= minDistance);
    const usable = distant.length ? distant : candidates;
    const hidden = usable.filter((s) => !world.lineOfSight(playerPos.x, playerPos.z, s.x, s.z));
    const point = ctx.rng.pick(hidden.length ? hidden : usable);
    const id = spawnPrefab(ctx, point.prefab, { x: point.x, z: point.z, yaw: yawOf(playerPos.x - point.x, playerPos.z - point.z) }, point.params);
    live.set(id, point.prefab);
  };

  ctx.systems.add({
    id: `${ID}.rules`, phase: 'rules',
    update() {
      if (flow.ended) return;
      if (!ctx.world.isAlive(player) || ctx.world.get(player, Health)?.dead) {
        end('defeat', 'Arena overrun', 'You fell in the arena.');
        return;
      }
      if (ctx.time.now - startedAt >= timeLimit) {
        end('victory', 'Time up', 'The score attack is complete.');
        return;
      }
      for (const id of live.keys()) if (!ctx.world.isAlive(id)) live.delete(id);
      for (const pickup of pickups) {
        if (ctx.world.isAlive(pickup.entity)) continue;
        if (pickup.missingAt < 0) pickup.missingAt = ctx.time.now;
        if (ctx.time.now - pickup.missingAt >= pickupRespawn) {
          pickup.entity = spawnPrefab(ctx, pickup.spawn.prefab, pickup.spawn, pickup.spawn.params);
          pickup.missingAt = -1;
        }
      }
      if (live.size < maxAlive && ctx.time.now >= nextSpawnAt) {
        spawnEnemy();
        nextSpawnAt = ctx.time.now + interval;
      }
      publish();
    },
  });
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ModeRole, ID, { name: 'Arena score attack', description: 'Score kills against endless enemies until the kill or time limit.', activate: run });
    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== ID) return;
      const r = v.reporter('preset', `config.${ID}`);
      for (const key of ['killLimit', 'maxAlive']) {
        if (!Number.isInteger(ctx.config[key])) r.at(key).error('must be a whole number');
      }
      const prefab = String(ctx.config['playerPrefab']);
      if (!v.registries.has(Prefabs, prefab)) r.at('playerPrefab').error(`unknown player prefab "${prefab}"`);
      const mapId = v.preset.options['map'];
      const map = typeof mapId === 'string' ? v.registries.get(Maps, mapId) : undefined;
      if (map && !map.world.spawns.some((s) => s.tags.includes('enemy') && v.registries.has(Enemies, s.prefab))) {
        v.reporter('preset', 'options.map').error('Arena needs at least one enemy-tagged spawn with a registered enemy prefab.');
      }
    });
  },
});
