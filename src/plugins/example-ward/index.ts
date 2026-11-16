import { DamageModifiers, Health, PickupEffects, defineComponent, definePlugin } from '../../sdk/index.ts';

interface Ward {
  expires: number;
  multiplier: number;
}

const WardState = defineComponent<Ward>('example/ward.state');

export default definePlugin({
  register(ctx) {
    ctx.register(PickupEffects, 'example/ward', {
      description: 'Temporarily multiply incoming damage; another ward replaces and refreshes the current ward.',
      validateParams(params, r) {
        for (const key of Object.keys(params)) {
          if (key !== 'duration' && key !== 'multiplier') r.at(key).error('unknown ward parameter');
        }
        for (const [key, min, max] of [['duration', 0.1, 3600], ['multiplier', 0, 1]] as const) {
          const value = params[key];
          if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
            r.at(key).error(`must be a finite number between ${min} and ${max}`);
          }
        }
      },
      start(owner) {
        return (target, params) => {
          const health = owner.world.get(target, Health);
          if (!health || health.dead) return false;
          owner.world.add(target, WardState, {
            expires: owner.time.now + (params['duration'] as number),
            multiplier: params['multiplier'] as number,
          });
          return true;
        };
      },
    });
    ctx.register(DamageModifiers, 'example/ward', {
      description: 'Apply an active ward to incoming damage.',
      order: 0,
      start(owner) {
        return (request, amount) => {
          const ward = owner.world.get(request.target, WardState);
          return ward && owner.time.now < ward.expires ? amount * ward.multiplier : amount;
        };
      },
    });
  },
  activate(ctx) {
    ctx.systems.add({
      id: 'example/ward.expire',
      phase: 'rules',
      update() {
        ctx.world.each(WardState, (entity, ward) => {
          if (ctx.time.now >= ward.expires) ctx.world.remove(entity, WardState);
        });
      },
    });
  },
});
