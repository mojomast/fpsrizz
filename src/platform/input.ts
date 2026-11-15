import type { InputService, TickInput } from '../sdk/contracts/shooter.ts';

export interface InputCore {
  press(action: string): void;
  release(action: string): void;
  addLook(dx: number, dy: number): void;
  /** Called once at the start of every simulation tick: pending edges + look move into the tick snapshot. */
  beginTick(): void;
  /** Wipes held state, pending edges, the snapshot and look. Generates no release edges. */
  clear(): void;
  readonly service: InputService;
}

export function createInputCore(): InputCore {
  const held = new Set<string>();
  const pendPressed = new Set<string>();
  const pendReleased = new Set<string>();
  const snapPressed = new Set<string>();
  const snapReleased = new Set<string>();
  let pendX = 0;
  let pendY = 0;
  let snapX = 0;
  let snapY = 0;

  const tick: TickInput = {
    held: (a) => held.has(a),
    pressed: (a) => snapPressed.has(a),
    released: (a) => snapReleased.has(a),
    get lookX() { return snapX; },
    get lookY() { return snapY; },
  };

  return {
    press(action) {
      if (held.has(action)) return; // auto-repeat
      held.add(action);
      pendPressed.add(action);
    },
    release(action) {
      if (!held.has(action)) return;
      held.delete(action);
      pendReleased.add(action);
    },
    addLook(dx, dy) {
      pendX += dx;
      pendY += dy;
    },
    beginTick() {
      snapPressed.clear();
      snapReleased.clear();
      for (const a of pendPressed) snapPressed.add(a);
      for (const a of pendReleased) snapReleased.add(a);
      pendPressed.clear();
      pendReleased.clear();
      snapX = pendX;
      snapY = pendY;
      pendX = 0;
      pendY = 0;
    },
    clear() {
      held.clear();
      pendPressed.clear();
      pendReleased.clear();
      snapPressed.clear();
      snapReleased.clear();
      pendX = pendY = snapX = snapY = 0;
    },
    service: { tick },
  };
}

export interface DomInputOptions {
  /** The canvas: receives mouse buttons, wheel and mousemove. */
  target: HTMLElement;
  actions: () => ReadonlyArray<{ id: string; keys: readonly string[] }>;
  isCaptured: () => boolean;
}

/**
 * Returns { dispose, refresh }. `refresh()` invalidates the key -> action lookup (rebuilt lazily from `actions()` on
 * the next event); call it when the action registry changes. `dispose()` removes every listener.
 */
export function bindDomInput(core: InputCore, opts: DomInputOptions): { dispose(): void; refresh(): void } {
  const { target, actions, isCaptured } = opts;
  let map: Map<string, string[]> | null = null;
  const lookup = (key: string): string[] | undefined => {
    if (!map) {
      map = new Map();
      for (const a of actions()) {
        for (const k of a.keys) {
          const l = map.get(k);
          if (l) l.push(a.id);
          else map.set(k, [a.id]);
        }
      }
    }
    return map.get(key);
  };
  const press = (list: string[]): void => { for (let i = 0; i < list.length; i++) core.press(list[i]!); };
  const release = (list: string[]): void => { for (let i = 0; i < list.length; i++) core.release(list[i]!); };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!isCaptured()) return;
    const l = lookup(e.code);
    if (!l) return;
    e.preventDefault();
    press(l);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const l = lookup(e.code);
    if (!l) return;
    if (isCaptured()) e.preventDefault();
    release(l); // always allowed so keys never stick
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (!isCaptured()) return;
    const l = lookup(`Mouse${e.button}`);
    if (!l) return;
    e.preventDefault();
    press(l);
  };
  const onMouseUp = (e: MouseEvent): void => {
    const l = lookup(`Mouse${e.button}`);
    if (l) release(l);
  };
  const onWheel = (e: WheelEvent): void => {
    if (!isCaptured() || e.deltaY === 0) return;
    const l = lookup(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
    if (!l) return;
    e.preventDefault();
    press(l);
    release(l);
  };
  const onMouseMove = (e: MouseEvent): void => {
    if (isCaptured()) core.addLook(e.movementX, e.movementY);
  };
  const onClear = (): void => core.clear();
  const onVisibility = (): void => { if (document.visibilityState === 'hidden') core.clear(); };
  const onLock = (): void => { if (!document.pointerLockElement) core.clear(); };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onClear);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerlockchange', onLock);
  window.addEventListener('mousemove', onMouseMove);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('wheel', onWheel, { passive: false });

  return {
    refresh() { map = null; },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onClear);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerlockchange', onLock);
      window.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('wheel', onWheel);
    },
  };
}
