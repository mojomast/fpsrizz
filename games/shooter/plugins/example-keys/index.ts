import type { Params, Reporter } from '../../../../src/sdk/index.ts';
import type { InteractionCandidate } from '../../contracts/shooter.ts';
import { Flow, Maps, Prefabs, defineComponent, definePlugin, vString, yawDirX, yawDirZ } from '../../../../src/sdk/index.ts';
import { Interactions, PickupEffects, World } from '../../contracts/shooter.ts';

const Keyring = defineComponent<{ keys: string[] }>('example/keys.keyring');
const Gate = defineComponent<{ door: string; key: string }>('example/keys.gate');

function validate(params: Params, r: Reporter, gate: boolean): void {
  const allowed = gate ? ['key', 'door'] : ['key'];
  for (const k of Object.keys(params)) if (!allowed.includes(k)) r.at(k).error(`unknown parameter "${k}"`);
  const key = vString(params['key'], r.at('key'), { nonEmpty: true, max: 60 });
  if (key && !key.trim()) r.at('key').error('key must contain a non-whitespace character');
  if (gate) vString(params['door'], r.at('door'), { nonEmpty: true, max: 60 });
}

export default definePlugin({
  register(ctx) {
    ctx.register(PickupEffects, 'example/give-key', {
      description: 'Give the collecting actor a named key.',
      validateParams(params, r) { validate(params, r, false); },
      start(owner) {
        return (actor, params) => {
          const key = params['key'];
          if (typeof key !== 'string' || !key.trim() || !owner.world.isAlive(actor)) return false;
          let ring = owner.world.get(actor, Keyring);
          if (!ring) ring = owner.world.add(actor, Keyring, { keys: [] });
          if (ring.keys.includes(key)) return false;
          ring.keys.push(key);
          return true;
        };
      },
    });
    ctx.register(Prefabs, 'example/keyed-gate', {
      description: 'Guard a map door until an actor uses it with the named key.',
      start(owner) {
        const world = owner.services.get(World);
        owner.services.get(Interactions).register(owner, 'example/keys', (actor, pose) => {
          const candidates: InteractionCandidate[] = [];
          owner.world.each(Gate, (entity, gate) => {
            const door = world.door(gate.door);
            // An unlocked or externally opened door is no longer guarded.
            if (!door || !door.locked || door.open) return;
            const dx = (door.desc.minX + door.desc.maxX) / 2 - pose.x;
            const dz = (door.desc.minZ + door.desc.maxZ) / 2 - pose.z;
            const distance = Math.hypot(dx, dz);
            if (distance > world.desc.cellSize * 0.95 || (distance > 0.3 && (dx * yawDirX(pose.yaw) + dz * yawDirZ(pose.yaw)) / distance < 0.2)) return;
            candidates.push({
              id: String(entity), priority: 0.5, distance,
              use() {
                if (!owner.world.get(actor, Keyring)?.keys.includes(gate.key)) {
                  owner.services.tryGet(Flow)?.notify(`Requires key: ${gate.key}`);
                  return;
                }
                if (world.setDoorOpen(gate.door, true, true)) owner.services.tryGet(Flow)?.notify(`Unlocked: ${gate.door}`);
              },
            });
          });
          return candidates;
        });
        return (_at, params) => {
          const entity = owner.world.create();
          if (typeof params['door'] === 'string' && typeof params['key'] === 'string') owner.world.add(entity, Gate, { door: params['door'], key: params['key'] });
          return entity;
        };
      },
    });
    ctx.addValidator((v) => {
      for (const map of v.registries.entries(Maps)) {
        const seen = new Set<string>();
        map.value.world.spawns.forEach((spawn, i) => {
          if (spawn.prefab !== 'example/keyed-gate') return;
          const r = v.reporter(map.owner, `map "${map.id}"`).at('spawns').at(i).at('params');
          validate(spawn.params, r, true);
          const door = spawn.params['door'];
          if (typeof door !== 'string' || !door) return;
          const target = map.value.world.doors.find((d) => d.id === door);
          if (!target) r.at('door').error(`unknown door "${door}"`);
          else if (!target.locked) r.at('door').error(`door "${door}" must start locked`);
          if (seen.has(door)) r.at('door').error(`door "${door}" already has a keyed gate`);
          seen.add(door);
        });
      }
    });
  },
});
