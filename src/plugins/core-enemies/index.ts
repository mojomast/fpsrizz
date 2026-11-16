import type { AiBehavior, AiFn, ContentKind, EnemyDef, EnemyService, EntityId, Json, Params, Prefab, Reporter, SessionContext } from '../../sdk/index.ts';
import { AiBehaviors, AttackBehaviors, Collider, Combat, Damaged, DamageModifiers, Died, Enemies, Enemy, EnemyAi, EnemyAlerted, Health, Player, Prefabs, Transform, Visual, World, definePlugin, isObject, makeTransform, vId, vJson, vNumber, vObject, vString, yawOf } from '../../sdk/index.ts';

const PATH_INTERVAL = 0.4;
const PAIN_SECONDS = 0.28;
const ALARM_RADIUS = 10;

function vParams(v: unknown, r: Reporter): Params | undefined {
  if (v === undefined) return {};
  const o = vObject(v, r);
  const j = o && vJson(o, r);
  return j !== undefined && isObject(j) ? (j as Record<string, Json>) : undefined;
}

const enemyKind: ContentKind = {
  description: 'An enemy definition selecting a registered AI behaviour and attack behaviour. Also registers a prefab with the same id.',
  load(data, c) {
    const o = vObject(data, c.r);
    if (!o) return;
    const r = c.r;
    const n = (k: string, min: number, max: number, fallback?: number): number | undefined => (o[k] === undefined && fallback !== undefined ? fallback : vNumber(o[k], r.at(k), { min, max }));
    const s = (k: string, fallback?: string): string | undefined => (o[k] === undefined && fallback !== undefined ? fallback : vString(o[k], r.at(k), { max: 60 }));
    const name = s('name');
    const health = n('health', 1, 100000);
    const speed = n('speed', 0, 30);
    const radius = n('radius', 0.1, 2, 0.4);
    const sightRange = n('sightRange', 1, 200, 18);
    const ai = vId(o.ai, r.at('ai'));
    const aiParams = vParams(o.aiParams, r.at('aiParams'));
    const visual = s('visual');
    const tint = s('tint', '');
    if (tint && !/^#[0-9a-fA-F]{6}$/.test(tint)) r.at('tint').error(`"${tint}" is not a colour like "#ffaa33"`);
    const scale = n('scale', 0.25, 4, 1);
    const painChance = n('painChance', 0, 1, 0.3);
    const score = n('score', 0, 1e6, 100);
    const ao = vObject(o.attack, r.at('attack'));
    const ar = r.at('attack');
    const behavior = ao && vId(ao.behavior, ar.at('behavior'));
    const params = ao && vParams(ao.params, ar.at('params'));
    const cooldown = ao && vNumber(ao.cooldown, ar.at('cooldown'), { min: 0.1, max: 60 });
    const range = ao && vNumber(ao.range, ar.at('range'), { min: 0.2, max: 200 });
    const windup = ao && (ao.windup === undefined ? 0.3 : vNumber(ao.windup, ar.at('windup'), { min: 0, max: 5 }));
    const sound = ao && (ao.sound === undefined ? '' : vString(ao.sound, ar.at('sound'), { max: 60, nonEmpty: false }));
    const so = o.sounds === undefined ? {} : vObject(o.sounds, r.at('sounds'));
    const snd = (k: string): string => (so && typeof so[k] === 'string' ? (so[k] as string) : '');
    if ([name, health, speed, radius, sightRange, ai, aiParams, visual, tint, scale, painChance, score, behavior, params, cooldown, range, windup, sound].includes(undefined) || !so) return;
    const def: EnemyDef = {
      name: name!, health: health!, speed: speed!, radius: radius!, sightRange: sightRange!, ai: ai!, aiParams: aiParams!,
      attack: { behavior: behavior!, params: params!, cooldown: cooldown!, range: range!, windup: windup!, sound: sound! },
      visual: visual!, tint: tint!, scale: scale!, painChance: painChance!, score: score!,
      sounds: { alert: snd('alert'), hurt: snd('hurt'), die: snd('die') },
    };
    c.register(Enemies, c.id, def);
    const id = c.id;
    const prefab: Prefab = { description: `Enemy: ${def.name}`, start: (ctx) => (at) => spawnEnemy(ctx, id, def, at.x, at.z, at.yaw) };
    c.register(Prefabs, c.id, prefab);
  },
};

function spawnEnemy(ctx: SessionContext, id: string, def: EnemyDef, x: number, z: number, yaw: number): EntityId {
  const e = ctx.world.create();
  ctx.world.add(e, Transform, makeTransform(x, z, yaw));
  ctx.world.add(e, Collider, { radius: def.radius, team: 'enemy', solid: true });
  ctx.world.add(e, Health, { hp: def.health, max: def.health, dead: false });
  ctx.world.add(e, Enemy, { def: id, state: 'idle', target: 0, stateUntil: 0, nextAttackAt: 0, path: [], nextPathAt: 0, memory: {} });
  ctx.world.add(e, Visual, { key: def.visual, state: 'idle', stateAt: ctx.time.now, y: 0, scale: def.scale, tint: def.tint, renderer: '' });
  return e;
}

/** Runs straight at the target and strikes when in reach. */
const chaser: AiBehavior = {
  description: 'Pursues the target along a path and attacks when within attack.range with a clear line.',
  start(ctx) {
    const ai = ctx.services.get(EnemyAi);
    return (self, enemy, def, dt) => {
      const target = enemy.target;
      if (ai.distanceTo(self, target) <= def.attack.range && ai.canSee(self, target, def.attack.range + 1)) {
        ai.faceTarget(self, target);
        ai.beginAttack(self, target);
        return;
      }
      const t = ctx.world.get(target, Transform);
      if (t) ai.moveToward(self, t.x, t.z, def.speed, dt);
    };
  },
};

/** Keeps its distance, only shoots with line of sight, sidesteps while its attack recharges. */
const ranged: AiBehavior = {
  description: 'Attacks only with line of sight; closes in when it cannot see the target; strafes between shots. aiParams: preferredRange',
  validateParams(p, r) {
    for (const k of Object.keys(p)) if (k !== 'preferredRange') r.at(k).error('unknown parameter. Supported: preferredRange');
    if (p['preferredRange'] !== undefined) vNumber(p['preferredRange'], r.at('preferredRange'), { min: 1, max: 100 });
  },
  start(ctx) {
    const ai = ctx.services.get(EnemyAi);
    return (self, enemy, def, dt) => {
      const target = enemy.target;
      const me = ctx.world.get(self, Transform);
      const them = ctx.world.get(target, Transform);
      if (!me || !them) return;
      const preferred = typeof def.aiParams['preferredRange'] === 'number' ? def.aiParams['preferredRange'] : 7;
      const dist = ai.distanceTo(self, target);
      const sees = ai.canSee(self, target, def.sightRange);
      if (!sees || dist > def.attack.range) {
        ai.moveToward(self, them.x, them.z, def.speed, dt);
        return;
      }
      ai.faceTarget(self, target);
      if (ai.beginAttack(self, target)) return;
      // Recharging: sidestep (direction re-rolled now and then with the seeded RNG), back off if crowded.
      const now = ctx.time.now;
      const m = enemy.memory;
      if (now >= (m['strafeUntil'] ?? 0)) {
        m['strafeDir'] = ctx.rng.next() < 0.5 ? -1 : 1;
        m['strafeUntil'] = now + ctx.rng.range(0.6, 1.4);
      }
      const dx = (them.x - me.x) / (dist || 1);
      const dz = (them.z - me.z) / (dist || 1);
      const side = m['strafeDir'] ?? 1;
      const back = dist < preferred * 0.6 ? -0.8 : dist > preferred ? 0.5 : 0;
      const yaw = me.yaw;
      ai.moveDir(self, -dz * side + dx * back, dx * side + dz * back, def.speed * 0.7, dt);
      me.yaw = yaw; // keep facing the target while strafing
    };
  },
};

function createEnemies(ctx: SessionContext): EnemyService {
  const world = ctx.services.get(World);
  const combat = ctx.services.get(Combat);
  const out = { x: 0, z: 0 };
  const aiFn = (id: string): AiFn => ctx.instantiate(AiBehaviors, id, (def, owner) => def.start(owner));
  const setState = (e: EntityId, enemy: Enemy, state: Enemy['state'], until = 0): void => {
    enemy.state = state;
    enemy.stateUntil = until;
  };
  const setVisual = (e: EntityId, state: string): void => {
    const v = ctx.world.get(e, Visual);
    if (v && v.state !== state) {
      v.state = state;
      v.stateAt = ctx.time.now;
    }
  };

  const service: EnemyService = {
    spawn(defId, at) {
      return spawnEnemy(ctx, defId, ctx.registries.require(Enemies, defId), at.x, at.z, at.yaw);
    },
    findTarget(self) {
      const me = ctx.world.get(self, Transform);
      let best = 0;
      let bestD = Infinity;
      if (me)
        ctx.world.each(Player, (p) => {
          const t = ctx.world.get(p, Transform);
          if (!t || ctx.world.get(p, Health)?.dead) return;
          const d = Math.hypot(t.x - me.x, t.z - me.z);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        });
      return best;
    },
    canSee(self, target, maxRange) {
      const a = ctx.world.get(self, Transform);
      const b = ctx.world.get(target, Transform);
      if (!a || !b) return false;
      return Math.hypot(b.x - a.x, b.z - a.z) <= maxRange && world.lineOfSight(a.x, a.z, b.x, b.z);
    },
    distanceTo(self, target) {
      const a = ctx.world.get(self, Transform);
      const b = ctx.world.get(target, Transform);
      return a && b ? Math.hypot(b.x - a.x, b.z - a.z) : Infinity;
    },
    moveDir(self, dirX, dirZ, speed, dt) {
      const t = ctx.world.get(self, Transform);
      const c = ctx.world.get(self, Collider);
      const len = Math.hypot(dirX, dirZ);
      if (!t || !c || len < 1e-6) return;
      world.moveCircle(t.x, t.z, c.radius, (dirX / len) * speed * dt, (dirZ / len) * speed * dt, out);
      t.x = out.x;
      t.z = out.z;
      t.yaw = yawOf(dirX, dirZ);
      const en = ctx.world.get(self, Enemy);
      if (en) en.memory['movedAt'] = ctx.time.now;
    },
    moveToward(self, x, z, speed, dt) {
      const t = ctx.world.get(self, Transform);
      const en = ctx.world.get(self, Enemy);
      const c = ctx.world.get(self, Collider);
      if (!t || !en || !c) return;
      const now = ctx.time.now;
      if (now >= en.nextPathAt || en.memory['worldVersion'] !== world.version) {
        // Stagger re-pathing a little per entity so a crowd does not path on the same tick.
        en.nextPathAt = now + PATH_INTERVAL + (self % 7) * 0.02;
        en.memory['worldVersion'] = world.version;
        const d = Math.hypot(x - t.x, z - t.z);
        if (d > 1e-6 && world.raycast(t.x, t.z, (x - t.x) / d, (z - t.z) / d, d, c.radius) === null) {
          en.path.length = 0;
          en.path.push(x, z);
        } else if (!world.findPath(t.x, t.z, x, z, en.path)) en.path.length = 0;
      }
      while (en.path.length >= 2 && Math.hypot(en.path[0]! - t.x, en.path[1]! - t.z) < 0.25) en.path.splice(0, 2);
      if (en.path.length < 2) return;
      service.moveDir(self, en.path[0]! - t.x, en.path[1]! - t.z, speed, dt);
    },
    faceTarget(self, target) {
      const a = ctx.world.get(self, Transform);
      const b = ctx.world.get(target, Transform);
      if (a && b && (a.x !== b.x || a.z !== b.z)) a.yaw = yawOf(b.x - a.x, b.z - a.z);
    },
    beginAttack(self, target) {
      const en = ctx.world.get(self, Enemy);
      if (!en || en.state !== 'chase' || ctx.time.now < en.nextAttackAt) return false;
      const def = ctx.registries.require(Enemies, en.def);
      en.target = target;
      service.faceTarget(self, target);
      setState(self, en, 'windup', ctx.time.now + def.attack.windup);
      return true;
    },
    aliveCount() {
      let n = 0;
      ctx.world.each(Enemy, (_e, en) => {
        if (en.state !== 'dead') n++;
      });
      return n;
    },
  };

  const alert = (e: EntityId, enemy: Enemy, def: EnemyDef): void => {
    if (enemy.state !== 'idle') return;
    setState(e, enemy, 'chase');
    // A short reaction delay before the first attack keeps ambushes fair.
    enemy.nextAttackAt = ctx.time.now + 0.35 + ctx.rng.range(0, 0.25);
    const t = ctx.world.get(e, Transform);
    ctx.events.emit(EnemyAlerted, { entity: e, def: enemy.def, x: t?.x ?? 0, z: t?.z ?? 0 });
    void def;
    if (!t) return;
    // Raise the alarm: idle enemies nearby that can see this one wake up too (and pass it on).
    ctx.world.each(Enemy, (other, oe) => {
      if (other === e || oe.state !== 'idle') return;
      const ot = ctx.world.get(other, Transform);
      const od = ctx.registries.get(Enemies, oe.def);
      if (!ot || !od || Math.hypot(ot.x - t.x, ot.z - t.z) > ALARM_RADIUS || !world.lineOfSight(ot.x, ot.z, t.x, t.z)) return;
      oe.target = enemy.target;
      alert(other, oe, od);
    });
  };

  ctx.systems.add({
    id: 'core/enemies.think',
    phase: 'ai',
    update(dt) {
      const now = ctx.time.now;
      ctx.world.each(Enemy, (e, enemy) => {
        if (enemy.state === 'dead') return;
        const def = ctx.registries.get(Enemies, enemy.def);
        const t = ctx.world.get(e, Transform);
        if (!def || !t) return;
        if (!ctx.world.isAlive(enemy.target) || ctx.world.get(enemy.target, Health)?.dead) enemy.target = service.findTarget(e);

        if (enemy.state === 'pain') {
          if (now < enemy.stateUntil) return;
          setState(e, enemy, 'chase');
        }
        if (enemy.state === 'windup') {
          if (now < enemy.stateUntil) return;
          setState(e, enemy, 'chase');
          enemy.nextAttackAt = now + def.attack.cooldown;
          const tt = ctx.world.get(enemy.target, Transform);
          // The attack is released only if the target is still visible: no shooting through walls.
          if (tt && world.lineOfSight(t.x, t.z, tt.x, tt.z)) {
            const d = Math.hypot(tt.x - t.x, tt.z - t.z) || 1;
            t.yaw = yawOf(tt.x - t.x, tt.z - t.z);
            combat.fireAttack({ shooter: e, team: 'enemy', x: t.x, z: t.z, dirX: (tt.x - t.x) / d, dirZ: (tt.z - t.z) / d, attackId: enemy.def, params: def.attack.params }, def.attack.behavior, def.attack.sound);
          }
          return;
        }
        if (enemy.state === 'idle') {
          if (enemy.target && service.canSee(e, enemy.target, def.sightRange)) alert(e, enemy, def);
          else return;
        }
        if (!enemy.target) {
          setVisual(e, 'idle');
          return;
        }
        aiFn(def.ai)(e, enemy, def, dt);
      });
    },
  });

  // Keep solid actors from stacking: enemies are nudged apart from each other and from players.
  ctx.systems.add({
    id: 'core/enemies.separate',
    phase: 'ai',
    order: 10,
    update() {
      ctx.world.each(Enemy, (a, ea) => {
        if (ea.state === 'dead') return;
        const ta = ctx.world.get(a, Transform);
        const ca = ctx.world.get(a, Collider);
        if (!ta || !ca) return;
        ctx.world.each(Collider, (b, cb) => {
          if (a === b || !cb.solid) return;
          const tb = ctx.world.get(b, Transform);
          if (!tb) return;
          const dx = ta.x - tb.x;
          const dz = ta.z - tb.z;
          const min = ca.radius + cb.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) return;
          const d = Math.sqrt(d2);
          // Deterministic fallback direction when two actors coincide exactly.
          const ux = d > 1e-5 ? dx / d : a < b ? 1 : -1;
          const uz = d > 1e-5 ? dz / d : 0;
          const push = (min - d) * (ctx.world.has(b, Enemy) ? 0.5 : 1);
          world.moveCircle(ta.x, ta.z, ca.radius, ux * push, uz * push, out);
          ta.x = out.x;
          ta.z = out.z;
        });
      });
    },
  });

  ctx.systems.add({
    id: 'core/enemies.animate',
    phase: 'presentation',
    update() {
      const now = ctx.time.now;
      ctx.world.each(Enemy, (e, enemy) => {
        if (enemy.state === 'dead') return;
        const moving = now - (enemy.memory['movedAt'] ?? -1) < 0.1;
        setVisual(e, enemy.state === 'windup' ? 'attack' : enemy.state === 'pain' ? 'hurt' : enemy.state === 'chase' && moving ? 'walk' : 'idle');
      });
    },
  });

  ctx.events.on(Damaged, (d) => {
    const enemy = ctx.world.get(d.target, Enemy);
    if (!enemy || enemy.state === 'dead' || d.lethal) return;
    const def = ctx.registries.get(Enemies, enemy.def);
    if (!def) return;
    if (ctx.world.has(d.source, Player)) enemy.target = d.source;
    if (enemy.state === 'idle') alert(d.target, enemy, def);
    if (ctx.rng.next() < def.painChance) setState(d.target, enemy, 'pain', ctx.time.now + PAIN_SECONDS);
  });

  ctx.events.on(Died, (d) => {
    const enemy = ctx.world.get(d.entity, Enemy);
    if (!enemy || enemy.state === 'dead') return;
    setState(d.entity, enemy, 'dead');
    enemy.path.length = 0;
    ctx.world.remove(d.entity, Collider); // corpses neither block nor absorb shots
    const v = ctx.world.get(d.entity, Visual);
    if (v) {
      v.key = `${v.key}-corpse`;
      v.state = 'idle';
      v.stateAt = ctx.time.now;
    }
  });

  return service;
}

export default definePlugin({
  register(ctx) {
    ctx.contentKind('enemy', enemyKind);
    ctx.register(AiBehaviors, 'core/chaser', chaser);
    ctx.register(AiBehaviors, 'core/ranged', ranged);
    ctx.register(DamageModifiers, 'core/team-immunity', {
      description: 'Actors never damage members of their own team (order 0).',
      order: 0,
      start: (c) => (req, amount) => {
        const a = c.world.get(req.source, Collider);
        const b = c.world.get(req.target, Collider);
        return a && b && a.team === b.team && req.source !== req.target ? 0 : amount;
      },
    });
    ctx.addValidator((v) => {
      for (const e of v.registries.entries(Enemies)) {
        const r = v.reporter(e.owner, `enemy "${e.id}"`);
        const ai = v.registries.get(AiBehaviors, e.value.ai);
        if (!ai) r.at('ai').error(`unknown AI behaviour "${e.value.ai}". Installed: ${v.registries.ids(AiBehaviors).join(', ') || '(none)'}`);
        else ai.validateParams?.(e.value.aiParams, r.at('aiParams'), v.registries);
        const atk = v.registries.get(AttackBehaviors, e.value.attack.behavior);
        if (!atk) r.at('attack').at('behavior').error(`unknown attack behaviour "${e.value.attack.behavior}". Installed: ${v.registries.ids(AttackBehaviors).join(', ') || '(none)'}`);
        else atk.validateParams?.(e.value.attack.params, r.at('attack').at('params'), v.registries);
      }
    });
  },
  activate(ctx) {
    ctx.services.provide(EnemyAi, createEnemies(ctx));
  },
});
