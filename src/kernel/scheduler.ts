export interface SystemDef {
  /** Namespaced id, unique per session. */
  id: string;
  /** One of the session's phases. */
  phase: string;
  /** Order inside the phase (lower first, default 0). Ties break on id (lexicographic). */
  order?: number;
  update(dt: number): void;
}

export interface FrameSystemDef {
  id: string;
  order?: number;
  /** alpha in [0,1): how far the render frame is between the previous and current simulation tick. */
  update(alpha: number, frameDt: number): void;
}

export interface SystemFault {
  owner: string;
  systemId: string;
  error: unknown;
}

interface Entry<T> {
  def: T;
  owner: string;
  phaseIndex: number;
  ms: number;
}

export interface SchedulerHooks {
  beforeTick?(tick: number): void;
  beforeSystem?(): void;
  afterSystem?(): void;
  onFault(fault: SystemFault): void;
}

/**
 * Fixed-step scheduler. Simulation advances in whole ticks of `step` seconds.
 * At most `maxTicksPerFrame` ticks run per rendered frame; any accumulated time beyond that is discarded
 * (the simulation slows down after a stall instead of spiralling), and counted in `droppedTime`.
 */
export class Scheduler {
  readonly step: number;
  readonly maxTicksPerFrame: number;
  readonly phases: readonly string[];
  tick = 0;
  paused = false;
  faulted = false;
  droppedTime = 0;
  lastFrameTicks = 0;
  private acc = 0;
  private systems: Entry<SystemDef>[] = [];
  private frameSystems: Entry<FrameSystemDef>[] = [];
  private hooks: SchedulerHooks;

  constructor(phases: readonly string[], hooks: SchedulerHooks, step = 1 / 60, maxTicksPerFrame = 5) {
    this.phases = phases;
    this.hooks = hooks;
    this.step = step;
    this.maxTicksPerFrame = maxTicksPerFrame;
  }

  /** Simulation time in seconds, derived from the tick count (no float accumulation). */
  get time(): number {
    return this.tick * this.step;
  }

  addSystem(def: SystemDef, owner: string): () => void {
    const phaseIndex = this.phases.indexOf(def.phase);
    if (phaseIndex < 0) throw new Error(`System "${def.id}" (plugin "${owner}") uses unknown phase "${def.phase}". Phases: ${this.phases.join(', ')}`);
    const dup = this.systems.find((s) => s.def.id === def.id);
    if (dup) throw new Error(`System "${def.id}" is already registered by "${dup.owner}"; "${owner}" cannot add it again.`);
    const entry: Entry<SystemDef> = { def, owner, phaseIndex, ms: 0 };
    this.systems.push(entry);
    this.systems.sort((a, b) => a.phaseIndex - b.phaseIndex || (a.def.order ?? 0) - (b.def.order ?? 0) || (a.def.id < b.def.id ? -1 : 1));
    return () => {
      const i = this.systems.indexOf(entry);
      if (i >= 0) this.systems.splice(i, 1);
    };
  }

  addFrameSystem(def: FrameSystemDef, owner: string): () => void {
    const dup = this.frameSystems.find((s) => s.def.id === def.id);
    if (dup) throw new Error(`Frame system "${def.id}" is already registered by "${dup.owner}"; "${owner}" cannot add it again.`);
    const entry: Entry<FrameSystemDef> = { def, owner, phaseIndex: 0, ms: 0 };
    this.frameSystems.push(entry);
    this.frameSystems.sort((a, b) => (a.def.order ?? 0) - (b.def.order ?? 0) || (a.def.id < b.def.id ? -1 : 1));
    return () => {
      const i = this.frameSystems.indexOf(entry);
      if (i >= 0) this.frameSystems.splice(i, 1);
    };
  }

  /** Advances by real elapsed seconds; runs 0..maxTicksPerFrame ticks, then frame systems once. Returns ticks run. */
  advance(frameDt: number): number {
    if (this.faulted) return 0;
    let ran = 0;
    if (!this.paused) {
      this.acc += Math.max(0, frameDt);
      const eps = this.step * 1e-6;
      while (this.acc + eps >= this.step && ran < this.maxTicksPerFrame && !this.paused && !this.faulted) {
        this.acc -= this.step;
        this.runTick();
        ran++;
      }
      if (this.acc + eps >= this.step) {
        // Catch-up budget exhausted: drop the backlog but keep the sub-step remainder for smooth interpolation.
        const whole = Math.floor((this.acc + eps) / this.step) * this.step;
        this.droppedTime += whole;
        this.acc = Math.max(0, this.acc - whole);
      }
    }
    this.lastFrameTicks = ran;
    if (!this.faulted) this.runFrame(Math.min(1, Math.max(0, this.acc / this.step)), frameDt);
    return ran;
  }

  /** Runs exactly one simulation tick (also used directly by headless tests). */
  runTick(): void {
    if (this.faulted) return;
    this.hooks.beforeTick?.(this.tick);
    const list = this.systems;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const t0 = now();
      this.hooks.beforeSystem?.();
      try {
        s.def.update(this.step);
        this.hooks.afterSystem?.();
      } catch (error) {
        this.fault({ owner: s.owner, systemId: s.def.id, error });
        return;
      }
      s.ms = s.ms * 0.9 + (now() - t0) * 0.1;
      if (this.faulted) return;
    }
    this.tick++;
  }

  runFrame(alpha: number, frameDt: number): void {
    const list = this.frameSystems;
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      const t0 = now();
      try {
        s.def.update(alpha, frameDt);
      } catch (error) {
        this.fault({ owner: s.owner, systemId: s.def.id, error });
        return;
      }
      s.ms = s.ms * 0.9 + (now() - t0) * 0.1;
    }
  }

  fault(f: SystemFault): void {
    if (this.faulted) return;
    this.faulted = true;
    this.paused = true;
    this.hooks.onFault(f);
  }

  resetAccumulator(): void {
    this.acc = 0;
  }

  describe(): { id: string; owner: string; phase: string; order: number; ms: number }[] {
    return [
      ...this.systems.map((s) => ({ id: s.def.id, owner: s.owner, phase: s.def.phase, order: s.def.order ?? 0, ms: s.ms })),
      ...this.frameSystems.map((s) => ({ id: s.def.id, owner: s.owner, phase: 'frame', order: s.def.order ?? 0, ms: s.ms })),
    ];
  }
  systemCount(): number {
    return this.systems.length + this.frameSystems.length;
  }
  clear(): void {
    this.systems.length = 0;
    this.frameSystems.length = 0;
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
