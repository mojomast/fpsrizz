import type { RaceGate, RacePoint, RaceState, RaceTrack, Reporter } from '../../sdk/index.ts';
import {
  ExperienceRole,
  Flow,
  Input,
  InputActions,
  OutcomeRatingRole,
  OutcomeRatingProviders,
  Race,
  RaceTracks,
  SequenceMechanicRole,
  SequenceProviders,
  definePlugin,
  isObject,
  outcomeRatingMechanic,
  sequenceMechanic,
  vArray,
  vNumber,
  vString,
} from '../../sdk/index.ts';

const actions = {
  gas: 'vehicle/gas',
  brake: 'vehicle/brake',
  left: 'vehicle/left',
  right: 'vehicle/right',
  drift: 'vehicle/drift',
} as const;
const EXPERIENCE = 'vehicle/arcade-race';

function rejectUnknown(data: Record<string, unknown>, allowed: readonly string[], r: Reporter): void {
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) r.at(key).error('unknown property');
  }
}

function point(v: unknown, r: Reporter): RacePoint | undefined {
  if (!isObject(v)) return r.error('expected a point with x and z');
  const x = vNumber(v.x, r.at('x'), { min: -500, max: 500 });
  const z = vNumber(v.z, r.at('z'), { min: -500, max: 500 });
  return x === undefined || z === undefined ? undefined : { x, z };
}
function gate(v: unknown, r: Reporter): RaceGate | undefined {
  const p = point(v, r);
  if (!p || !isObject(v)) return;
  rejectUnknown(v, ['x', 'z', 'dx', 'dz', 'width'], r);
  const dx = vNumber(v.dx, r.at('dx'), { min: -1, max: 1 });
  const dz = vNumber(v.dz, r.at('dz'), { min: -1, max: 1 });
  const width = vNumber(v.width, r.at('width'), { min: 2, max: 50 });
  if (dx === undefined || dz === undefined || width === undefined) return;
  const length = Math.hypot(dx, dz);
  if (length < 0.1) return r.error('gate direction must be nonzero');
  return { ...p, dx: dx / length, dz: dz / length, width };
}
function distanceToRoad(x: number, z: number, points: readonly RacePoint[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      d = dx * dx + dz * dz;
    const t = d ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / d)) : 0;
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}
function crosses(g: RaceGate, ax: number, az: number, bx: number, bz: number): boolean {
  const a = (ax - g.x) * g.dx + (az - g.z) * g.dz,
    b = (bx - g.x) * g.dx + (bz - g.z) * g.dz;
  if (a >= 0 || b < 0 || b === a) return false;
  const t = -a / (b - a),
    x = ax + (bx - ax) * t - g.x,
    z = az + (bz - az) * t - g.z;
  return Math.abs(x * -g.dz + z * g.dx) <= g.width / 2;
}
export default definePlugin({
  register(ctx) {
    ctx.register(InputActions, actions.gas, { label: 'Accelerate', keys: ['KeyW', 'ArrowUp'] });
    ctx.register(InputActions, actions.brake, { label: 'Brake / reverse', keys: ['KeyS', 'ArrowDown'] });
    ctx.register(InputActions, actions.left, { label: 'Steer left', keys: ['KeyA', 'ArrowLeft'] });
    ctx.register(InputActions, actions.right, { label: 'Steer right', keys: ['KeyD', 'ArrowRight'] });
    ctx.register(InputActions, actions.drift, { label: 'Drift', keys: ['Space'] });
    ctx.provideRole(ExperienceRole, EXPERIENCE, {
      name: 'Neon Run',
      description: 'Cross the ordered gates and complete the circuit before the clock runs out.',
      pointer: 'none',
      controls: [
        ['W / ↑', 'Accelerate'],
        ['S / ↓', 'Brake / reverse'],
        ['A D / ← →', 'Steer'],
        ['Space', 'Drift'],
      ],
    });
    ctx.contentKind('vehicle-track', {
      description: 'Closed polyline track with ordered directional gates.',
      load(data, c) {
        if (!isObject(data)) return void c.r.error('expected a track object');
        rejectUnknown(data, ['name', 'width', 'laps', 'timeLimit', 'start', 'points', 'gates'], c.r);
        if (isObject(data.start)) rejectUnknown(data.start, ['x', 'z', 'yaw'], c.r.at('start'));
        const name = vString(data.name, c.r.at('name'));
        const width = vNumber(data.width, c.r.at('width'), { min: 4, max: 30 });
        const laps = vNumber(data.laps, c.r.at('laps'), { min: 1, max: 20, int: true });
        const timeLimit = vNumber(data.timeLimit, c.r.at('timeLimit'), { min: 5, max: 3600 });
        const start = point(data.start, c.r.at('start'));
        const yaw = isObject(data.start)
          ? vNumber(data.start.yaw, c.r.at('start').at('yaw'), { min: -10, max: 10 })
          : undefined;
        const ps = vArray(data.points, c.r.at('points'), { min: 3, max: 128 });
        const gs = vArray(data.gates, c.r.at('gates'), { min: 2, max: 128 });
        const points = ps?.map((p, i) => {
          if (isObject(p)) rejectUnknown(p, ['x', 'z'], c.r.at('points').at(i));
          return point(p, c.r.at('points').at(i));
        });
        const gates = gs?.map((g, i) => gate(g, c.r.at('gates').at(i)));
        if (
          !name ||
          width === undefined ||
          laps === undefined ||
          timeLimit === undefined ||
          !start ||
          yaw === undefined ||
          !points ||
          !gates ||
          points.some((p) => !p) ||
          gates.some((g) => !g)
        )
          return;
        const track: RaceTrack = {
          name,
          width,
          laps,
          timeLimit,
          start: { ...start, yaw },
          points: points as RacePoint[],
          gates: gates as RaceGate[],
        };
        for (let i = 0; i < track.points.length; i++) {
          const a = track.points[i]!;
          const b = track.points[(i + 1) % track.points.length]!;
          if (Math.hypot(a.x - b.x, a.z - b.z) < 0.001) {
            c.r
              .at('points')
              .at((i + 1) % track.points.length)
              .error('adjacent track points must be distinct');
          }
        }
        for (let i = 0; i < track.gates.length; i++) {
          const a = track.gates[i]!;
          const b = track.gates[(i + 1) % track.gates.length]!;
          if (Math.hypot(a.x - b.x, a.z - b.z) < 0.001) {
            c.r
              .at('gates')
              .at((i + 1) % track.gates.length)
              .error('adjacent gates must have distinct centers');
          }
        }
        if (distanceToRoad(start.x, start.z, track.points) > width / 2)
          return void c.r.at('start').error('start must be on the track');
        for (const [i, g] of track.gates.entries())
          if (distanceToRoad(g.x, g.z, track.points) > width / 2)
            c.r.at('gates').at(i).error('gate must be on the track');
        c.register(RaceTracks, c.id, track);
      },
    });
    ctx.addValidator((v) => {
      const rating = v.selectedRole(OutcomeRatingRole);
      if (rating && !v.registries.has(OutcomeRatingProviders, rating))
        v.reporter('preset', 'roles.sdk/mechanic-outcome-rating').error('selected rating role needs a registered OutcomeRatingProviders factory');
      const sequence = v.selectedRole(SequenceMechanicRole);
      if (!sequence || !v.registries.has(SequenceProviders, sequence))
        v.reporter('preset', 'roles.sdk/mechanic-sequence').error('select a sequence role with a registered SequenceProviders factory');
      if (v.selectedRole(ExperienceRole) !== EXPERIENCE) {
        v.reporter('preset', 'roles.sdk/experience').error(`vehicle/racing requires experience ${EXPERIENCE}`);
      }
      const id = v.preset.options.track;
      if (typeof id !== 'string' || !v.registries.has(RaceTracks, id))
        v.reporter('preset', 'options.track').error('select an enabled vehicle-track id');
    });
  },
  activate(ctx) {
    const track = ctx.registries.require(RaceTracks, ctx.preset.options.track as string),
      input = ctx.services.get(Input),
      flow = ctx.services.tryGet(Flow);
    const steps = track.gates.map((_, i) => `gate-${i}`);
    const sequence = sequenceMechanic(ctx).create(ctx, 'vehicle/race', { steps, rounds: track.laps });
    const state = {
      track,
      x: track.start.x,
      z: track.start.z,
      prevX: track.start.x,
      prevZ: track.start.z,
      yaw: track.start.yaw,
      vx: 0,
      vz: 0,
      speed: 0,
      drifting: false,
      offTrack: false,
      elapsed: 0,
      status: 'racing' as RaceState['status'],
      revision: 0,
    };
    // Publish accessors, not the mutable authority object.
    const view: RaceState = {
      track,
      get x() {
        return state.x;
      },
      get z() {
        return state.z;
      },
      get prevX() {
        return state.prevX;
      },
      get prevZ() {
        return state.prevZ;
      },
      get yaw() {
        return state.yaw;
      },
      get vx() {
        return state.vx;
      },
      get vz() {
        return state.vz;
      },
      get speed() {
        return state.speed;
      },
      get drifting() {
        return state.drifting;
      },
      get offTrack() {
        return state.offTrack;
      },
      get elapsed() {
        return state.elapsed;
      },
      get lap() {
        return sequence.round;
      },
      get nextGate() {
        return sequence.index;
      },
      get status() {
        return state.status;
      },
      get revision() {
        return state.revision;
      },
    };
    ctx.services.provide(Race, view);
    ctx.systems.add({
      id: 'vehicle/racing.drive',
      phase: 'movement',
      update(dt) {
        if (state.status !== 'racing') return;
        const tick = input.tick,
          gas = tick.held(actions.gas),
          brake = tick.held(actions.brake);
        let fx = -Math.sin(state.yaw),
          fz = -Math.cos(state.yaw);
        let forward = state.vx * fx + state.vz * fz;
        const steer = Number(tick.held(actions.left)) - Number(tick.held(actions.right));
        state.drifting = tick.held(actions.drift) && Math.abs(forward) > 3;
        state.yaw += steer * 2.05 * Math.min(1, Math.abs(forward) / 4) * Math.sign(forward) * dt;
        fx = -Math.sin(state.yaw);
        fz = -Math.cos(state.yaw);
        forward = state.vx * fx + state.vz * fz;
        const lateral = state.vx * fz - state.vz * fx;
        const accel = brake ? (forward > 0.3 ? -18 : -5) : gas ? 10 : 0;
        forward += accel * dt;
        forward *= Math.max(0, 1 - (state.offTrack ? 2.4 : 0.32) * dt);
        forward = Math.max(-5, Math.min(state.offTrack ? 8 : 19, forward));
        const side = lateral * Math.max(0, 1 - (state.drifting ? 1.5 : 8) * dt);
        state.vx = fx * forward + fz * side;
        state.vz = fz * forward - fx * side;
        state.prevX = state.x;
        state.prevZ = state.z;
        state.x += state.vx * dt;
        state.z += state.vz * dt;
        state.offTrack = distanceToRoad(state.x, state.z, track.points) > track.width / 2;
        state.speed = Math.hypot(state.vx, state.vz);
        const gate = track.gates[sequence.index]!;
        if (crosses(gate, state.prevX, state.prevZ, state.x, state.z) && sequence.advance(steps[sequence.index]!).ok) {
          state.revision++;
          if (sequence.complete) {
            state.status = 'won';
            const rating = ctx.role(OutcomeRatingRole) ? outcomeRatingMechanic(ctx).create(ctx, 'vehicle/finish', {
              tiers: [
                { id: 'Bronze', conditions: [{ metric: 'seconds', operator: 'at-least', value: 0 }] },
                { id: 'Silver', conditions: [{ metric: 'seconds', operator: 'at-most', value: track.timeLimit * 0.75 }] },
                { id: 'Gold', conditions: [{ metric: 'seconds', operator: 'at-most', value: track.timeLimit * 0.5 }] },
              ],
            }) : undefined;
            const medal = rating?.evaluate({ seconds: state.elapsed + dt });
            rating?.dispose();
            flow?.end({
              outcome: 'victory',
              title: 'Circuit complete',
              detail: 'All laps cleared.',
              stats: [['Time', `${(state.elapsed + dt).toFixed(1)}s`], ...(medal ? [['Medal', medal] as [string, string]] : [])],
            });
          }
        }
        state.elapsed += dt;
        if (state.elapsed >= track.timeLimit && state.status === 'racing') {
          state.status = 'lost';
          state.revision++;
          flow?.end({
            outcome: 'defeat',
            title: 'Time expired',
            detail: 'Restart and find a faster line.',
            stats: [['Lap', `${sequence.round} / ${track.laps}`]],
          });
        }
      },
    });
  },
});
