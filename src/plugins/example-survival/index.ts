import {
  Died,
  Enemies,
  Enemy,
  Flow,
  Health,
  Maps,
  ModeRole,
  Prefabs,
  Transform,
  World,
  definePlugin,
  spawnPrefab,
  yawOf,
} from '../../sdk/index.ts';
import type { EntityId, Json, SessionContext, SpawnDesc } from '../../sdk/index.ts';

const ID = 'example/survival';
const DEFAULT_PLAYER_PREFAB = 'core/player';
const WAVE_BONUS = 100;

const str = (cfg: Readonly<Record<string, Json>>, key: string, fallback: string): string => {
  const v = cfg[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
};
const num = (cfg: Readonly<Record<string, Json>>, key: string, fallback: number, min: number, max: number): number => {
  const v = cfg[key];
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};
const isEnemySpawn = (s: SpawnDesc): boolean => s.tags.includes('enemy');
const formatTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface PickupSlot {
  spawn: SpawnDesc;
  entity: EntityId;
}
type Phase = 'intermission' | 'spawning';

function run(ctx: SessionContext): void {
  const cfg = ctx.config;
  const waves = Math.round(num(cfg, 'waves', 5, 1, 50));
  const baseCount = Math.round(num(cfg, 'baseCount', 3, 1, 20));
  const growth = Math.round(num(cfg, 'growth', 2, 0, 10));
  const minDist = num(cfg, 'minSpawnDistance', 8, 0, 60);
  const intermission = num(cfg, 'intermission', 4, 0, 60);
  const spawnInterval = num(cfg, 'spawnInterval', 0.35, 0.05, 5);
  const maxAlive = Math.round(num(cfg, 'maxAlive', 24, 1, 100));

  const world = ctx.services.get(World);
  const flow = ctx.services.get(Flow);
  const desc = world.desc;

  // Everything the doors/pickups/player need happens once, up front.
  const start = desc.playerStart;
  const player = spawnPrefab(ctx, str(cfg, 'playerPrefab', DEFAULT_PLAYER_PREFAB), { x: start.x, z: start.z, yaw: start.yaw });
  for (const d of world.doors()) world.setDoorOpen(d.desc.id, true, true);

  const pickups: PickupSlot[] = [];
  const enemyPoints: SpawnDesc[] = [];
  for (const s of desc.spawns) {
    if (isEnemySpawn(s)) {
      enemyPoints.push(s);
    } else {
      pickups.push({ spawn: s, entity: spawnPrefab(ctx, s.prefab, { x: s.x, z: s.z, yaw: s.yaw }, s.params) });
    }
  }
  // Pool of enemy prefab ids, sorted so the rng draw order does not depend on map authoring order.
  const pool = [...new Set(enemyPoints.map((s) => s.prefab).filter((p) => ctx.registries.has(Enemies, p)))].sort();
  const points = enemyPoints.filter((s) => pool.includes(s.prefab));

  // Mutable run state (closure-owned: a restart starts clean).
  const startedAt = ctx.time.now;
  let wave = 0;
  let phase: Phase = 'intermission';
  let nextWaveAt = ctx.time.now + intermission;
  let toSpawn = 0;
  let nextSpawnAt = 0;
  let score = 0;
  let kills = 0;
  const live = new Map<EntityId, string>(); // current-wave enemy entity -> def id

  const stats = (): [string, string][] => [
    ['Wave reached', `${wave} / ${waves}`],
    ['Score', String(score)],
    ['Kills', String(kills)],
    ['Time', formatTime(ctx.time.now - startedAt)],
  ];

  let shown = '';
  const publish = (): void => {
    const key = `${wave}|${phase}|${score}|${toSpawn + live.size}`;
    if (key === shown) return;
    shown = key;
    const upcoming = wave + (phase === 'intermission' ? 1 : 0);
    flow.setObjective(phase === 'intermission' ? `Wave ${upcoming} incoming…` : `Survive — wave ${wave} of ${waves}`);
    flow.setStatus('wave', 'Wave', `${wave} / ${waves}`);
    flow.setStatus('score', 'Score', String(score));
    flow.setStatus('hostiles', 'Hostiles', String(toSpawn + live.size));
  };

  const startWave = (): void => {
    wave++;
    phase = 'spawning';
    toSpawn = baseCount + (wave - 1) * growth;
    nextSpawnAt = ctx.time.now;
    // Only pickups that were collected come back.
    for (const p of pickups) {
      if (!ctx.world.isAlive(p.entity)) {
        p.entity = spawnPrefab(ctx, p.spawn.prefab, { x: p.spawn.x, z: p.spawn.z, yaw: p.spawn.yaw }, p.spawn.params);
      }
    }
    flow.notify(`Wave ${wave} — ${toSpawn} hostiles`);
  };

  const spawnOne = (): void => {
    const pt = ctx.world.get(player, Transform);
    if (!pt || points.length === 0) return;
    const prefab = ctx.rng.pick(pool);
    const def = ctx.registries.require(Enemies, prefab);
    const free = points.filter((s) => world.isFree(s.x, s.z, def.radius));
    const usable = free.length > 0 ? free : points;
    const dist = (s: SpawnDesc): number => Math.hypot(s.x - pt.x, s.z - pt.z);
    // Prefer points that are far enough, not crowded by a living enemy, and out of the player's sight.
    const crowded = (s: SpawnDesc): boolean => {
      for (const id of live.keys()) {
        const t = ctx.world.get(id, Transform);
        if (t && Math.hypot(t.x - s.x, t.z - s.z) < def.radius * 2.5) return true;
      }
      return false;
    };
    const far = usable.filter((s) => dist(s) >= minDist && !crowded(s));
    const hidden = far.filter((s) => !world.lineOfSight(pt.x, pt.z, s.x, s.z));
    let candidates = hidden.length > 0 ? hidden : far;
    if (candidates.length === 0) {
      // Nothing qualifies: fall back to the farthest points.
      const sorted = [...usable].sort((a, b) => dist(b) - dist(a) || (a.id < b.id ? -1 : 1));
      candidates = sorted.slice(0, 3);
    }
    const at = ctx.rng.pick(candidates);
    const id = spawnPrefab(ctx, prefab, { x: at.x, z: at.z, yaw: yawOf(pt.x - at.x, pt.z - at.z) });
    live.set(id, prefab);
  };

  ctx.events.on(Died, (e) => {
    if (flow.ended) return;
    if (e.entity === player) {
      flow.end({ outcome: 'defeat', title: 'Overrun', detail: `You fell during wave ${wave}.`, stats: stats() });
      return;
    }
    const en = ctx.world.get(e.entity, Enemy);
    const defId = en?.def ?? live.get(e.entity);
    if (defId === undefined) return;
    live.delete(e.entity);
    kills++;
    score += ctx.registries.get(Enemies, defId)?.score ?? 0;
  });

  ctx.systems.add({
    id: `${ID}.waves`,
    phase: 'rules',
    update() {
      if (flow.ended) return;
      const hp = ctx.world.get(player, Health);
      if (!ctx.world.isAlive(player) || hp?.dead) {
        flow.end({ outcome: 'defeat', title: 'Overrun', detail: `You fell during wave ${wave}.`, stats: stats() });
        return;
      }
      for (const id of [...live.keys()]) if (!ctx.world.isAlive(id)) live.delete(id);

      if (phase === 'intermission') {
        if (ctx.time.now >= nextWaveAt) startWave();
      } else {
        if (toSpawn > 0 && ctx.time.now >= nextSpawnAt && live.size < maxAlive) {
          spawnOne();
          toSpawn--;
          nextSpawnAt = ctx.time.now + spawnInterval;
        }
        if (toSpawn === 0 && live.size === 0) {
          score += WAVE_BONUS * wave;
          if (wave >= waves) {
            publish();
            flow.end({ outcome: 'victory', title: 'Survived', detail: `All ${waves} waves cleared.`, stats: stats() });
            return;
          }
          flow.notify(`Wave ${wave} cleared — +${WAVE_BONUS * wave}`);
          phase = 'intermission';
          nextWaveAt = ctx.time.now + intermission;
        }
      }
      publish();
    },
  });
  publish();
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ModeRole, ID, {
      name: 'Survival',
      description: 'Waves of enemies spawn out of sight at the map\'s enemy points; clear them all to win.',
      activate: run,
    });

    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== ID) return;
      const r = v.reporter(ID);
      const mapId = v.preset.options['map'];
      const cfg = v.preset.config[ID] ?? {};
      const playerPrefab = str(cfg, 'playerPrefab', DEFAULT_PLAYER_PREFAB);
      if (!v.registries.has(Prefabs, playerPrefab)) {
        r.at('config.playerPrefab').error(`unknown player prefab "${playerPrefab}". Registered prefabs: ${v.registries.ids(Prefabs).join(', ')}`);
      }
      const map = typeof mapId === 'string' ? v.registries.get(Maps, mapId) : undefined;
      if (!map) return; // the host reports an unknown map itself
      const ok = map.world.spawns.some((s) => s.tags.includes('enemy') && v.registries.has(Enemies, s.prefab));
      if (!ok) {
        r.at('options.map').error(
          `Survival mode needs enemy spawn points, but map "${String(mapId)}" has none. Add at least one entry to the map's "spawns" with "tags": ["enemy"] and a "prefab" that is a registered enemy (e.g. "core/grunt").`,
        );
      }
    });
  },
});
