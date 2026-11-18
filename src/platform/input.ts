import type { InputContextsService, InputService, TickInput } from '../sdk/contracts/shooter.ts';
import { applyDeadzone } from '../sdk/contracts/input.ts';
import type { AnalogSource, AxisValue, InputAxisDef, InputDevice } from '../sdk/contracts/input.ts';

type AxisResolver = (id: string, held: (action: string) => boolean) => AxisValue;
const ZERO: AxisValue = Object.freeze({ x: 0, y: 0 });

export interface InputCore {
  press(action: string): void;
  release(action: string): void;
  addLook(dx: number, dy: number): void;
  setPointer(x: number, y: number, inside: boolean): void;
  /** Physical bindings route through active contexts, then the legacy action list. */
  pressKey(key: string, legacyActions: readonly string[]): boolean;
  releaseKey(key: string): void;
  readonly contexts: InputContextsService;
  /** Called once at the start of every simulation tick: pending edges + look move into the tick snapshot. */
  beginTick(): void;
  /** Wipes held state, pending edges, the snapshot and look. Generates no release edges. */
  clear(): void;
  readonly service: InputService;
  // ---- SDK 3 (input v2) ----
  /** Axis definitions (the active session's InputAxes registry). */
  setAxes(defs: () => Iterable<readonly [string, InputAxisDef]>): void;
  /** Latest raw analog value of a source (gamepad poll, touch stick); sampled into the tick at beginTick. */
  setAnalog(source: AnalogSource, x: number, y: number): void;
  noteDevice(device: InputDevice): void;
  readonly lastDevice: InputDevice;
  /** Starts capturing the next physical key (rebinding). Resolves undefined on timeout, Escape or clear(). */
  capture(timeoutMs?: number): Promise<string | undefined>;
  /** Adapters call this before routing a pressed key; true = the key was captured and must not reach gameplay. */
  offerCapture(key: string): boolean;
  readonly capturing: boolean;
}

function createInputState(axisOf: AxisResolver = () => ZERO) {
  const held = new Set<string>();
  const pendPressed = new Set<string>();
  const pendReleased = new Set<string>();
  const snapPressed = new Set<string>();
  const snapReleased = new Set<string>();
  let pendX = 0;
  let pendY = 0;
  let snapX = 0;
  let snapY = 0;
  let pointer = { x: 0, y: 0, inside: false };
  let snapPointer = pointer;

  const tick: TickInput = {
    held: (a) => held.has(a),
    pressed: (a) => snapPressed.has(a),
    released: (a) => snapReleased.has(a),
    get lookX() { return snapX; },
    get lookY() { return snapY; },
    get pointer() { return snapPointer; },
    axis: (id) => axisOf(id, (a) => held.has(a)),
  };

  return {
    press(action: string) {
      if (held.has(action)) return; // auto-repeat
      held.add(action);
      pendPressed.add(action);
    },
    release(action: string) {
      if (!held.has(action)) return;
      held.delete(action);
      pendReleased.add(action);
    },
    setPointer(x: number, y: number, inside: boolean) { pointer = { x, y, inside }; },
    addLook(dx: number, dy: number) {
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
      snapPointer = pointer;
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
      pointer = snapPointer = { x: 0, y: 0, inside: false };
    },
    service: { tick },
  };
}

export function createInputCore(): InputCore {
  let axisDefs: () => Iterable<readonly [string, InputAxisDef]> = () => [];
  let axisCache: Map<string, InputAxisDef> | undefined;
  const pendAnalog = new Map<AnalogSource, AxisValue>();
  const snapAnalog = new Map<AnalogSource, AxisValue>();
  let lastDevice: InputDevice = 'keyboard';
  let pendingCapture: { resolve: (key: string | undefined) => void; timer: ReturnType<typeof setTimeout> | undefined } | undefined;
  const endCapture = (key: string | undefined): void => {
    const c = pendingCapture;
    if (!c) return;
    pendingCapture = undefined;
    if (c.timer !== undefined) clearTimeout(c.timer);
    c.resolve(key);
  };
  const resolveAxis: AxisResolver = (id, held) => {
    axisCache ??= new Map(axisDefs());
    const def = axisCache.get(id);
    if (!def) return ZERO;
    const dx = def.x ? Number(held(def.x[1])) - Number(held(def.x[0])) : 0;
    const dy = def.y ? Number(held(def.y[1])) - Number(held(def.y[0])) : 0;
    const dl = Math.hypot(dx, dy);
    let best: AxisValue = dl > 0 ? { x: dx / dl, y: dy / dl } : ZERO;
    let bestLen = dl > 0 ? 1 : 0;
    for (const src of def.sticks ?? []) {
      const raw = snapAnalog.get(src);
      if (!raw) continue;
      const v = applyDeadzone(raw.x, raw.y, def.deadzone ?? 0.15);
      const l = Math.hypot(v.x, v.y);
      if (l > bestLen) { best = v; bestLen = l; }
    }
    return best;
  };
  const legacy = createInputState(resolveAxis);
  type State = ReturnType<typeof createInputState>;
  const contexts: { state: State; bindings: Map<string, string[]>; priority: number; consume: boolean; exclusive: boolean; enabled: boolean }[] = [];
  const down = new Map<string, { state: State; action: string }[]>();
  const cancel = (): void => {
    legacy.clear();
    for (const c of contexts) c.state.clear();
    // Keep physical keys quarantined until keyup. No repeat may enter a newly focused context.
    for (const key of down.keys()) down.set(key, []);
  };
  const ordered = () => contexts.filter((c) => c.enabled).sort((a, b) => b.priority - a.priority);
  const pointerStates = (): State[] => {
    const states: State[] = [];
    for (const c of ordered()) {
      states.push(c.state);
      if (c.exclusive) return states;
    }
    return [...states, legacy];
  };
  return {
    service: legacy.service,
    setAxes(defs) { axisDefs = defs; axisCache = undefined; },
    setAnalog(source, x, y) { pendAnalog.set(source, { x, y }); },
    noteDevice(device) { lastDevice = device; },
    get lastDevice() { return lastDevice; },
    get capturing() { return pendingCapture !== undefined; },
    capture(timeoutMs = 8000) {
      endCapture(undefined);
      cancel();
      return new Promise((resolve) => {
        pendingCapture = { resolve, timer: timeoutMs > 0 ? setTimeout(() => endCapture(undefined), timeoutMs) : undefined };
      });
    },
    offerCapture(key) {
      if (!pendingCapture) return false;
      endCapture(key === 'Escape' ? undefined : key);
      return true;
    },
    press: (action) => legacy.press(action),
    release: (action) => legacy.release(action),
    addLook(dx, dy) { for (const s of pointerStates()) s.addLook(dx, dy); },
    setPointer(x, y, inside) { for (const s of pointerStates()) s.setPointer(x, y, inside); },
    beginTick() {
      axisCache = undefined;
      snapAnalog.clear();
      for (const [k, v] of pendAnalog) snapAnalog.set(k, v);
      legacy.beginTick();
      for (const c of contexts) c.state.beginTick();
    },
    clear() { cancel(); down.clear(); pendAnalog.clear(); snapAnalog.clear(); endCapture(undefined); },
    pressKey(key, legacyActions) {
      if (down.has(key)) return down.get(key)!.length > 0;
      const routes: { state: State; action: string }[] = [];
      let consumed = false;
      for (const c of ordered()) {
        const actions = c.bindings.get(key) ?? [];
        for (const action of actions) routes.push({ state: c.state, action });
        if (c.exclusive || (c.consume && actions.length > 0)) { consumed = true; break; }
      }
      if (!consumed) for (const action of legacyActions) routes.push({ state: legacy, action });
      down.set(key, routes);
      for (const route of routes) route.state.press(route.action);
      return consumed || routes.length > 0;
    },
    releaseKey(key) {
      const routes = down.get(key);
      down.delete(key);
      for (const route of routes ?? []) {
        // Multiple physical keys can hold one action; releasing one must not release the other.
        const heldElsewhere = [...down.values()].some((rs) => rs.some((r) => r.state === route.state && r.action === route.action));
        if (!heldElsewhere) route.state.release(route.action);
      }
    },
    contexts: {
      create(ctx, options) {
        const bindings = new Map<string, string[]>();
        for (const b of options.bindings) for (const key of b.keys) bindings.set(key, [...(bindings.get(key) ?? []), b.action]);
        const c = { state: createInputState(resolveAxis), bindings, priority: options.priority ?? 0, consume: options.consume ?? true, exclusive: options.exclusive ?? false, enabled: options.enabled ?? true };
        cancel();
        contexts.push(c);
        let disposed = false;
        const dispose = ctx.scope.add(() => {
          cancel();
          contexts.splice(contexts.indexOf(c), 1);
          c.enabled = false;
          disposed = true;
        }, 'input-context');
        return {
          tick: c.state.service.tick,
          get enabled() { return c.enabled; },
          setEnabled(enabled) {
            if (disposed || c.enabled === enabled) return;
            cancel();
            c.enabled = enabled;
          },
          dispose,
        };
      },
    },
  };
}

/** Editable controls own typing shortcuts, including inside editable descendants. */
export function isInputEditableTarget(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element
    && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
}

/** Native UI owns gameplay keys/clicks. Host shortcuts may use the narrower editable-target check. */
export function isInputUiTarget(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element
    && !!target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="textbox"], [data-input-ui]');
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
/** Lazily built physical key -> action ids map; `refresh()` drops it after the action list changed. */
export function createActionLookup(actions: () => ReadonlyArray<{ id: string; keys: readonly string[] }>): { get(key: string): string[]; refresh(): void } {
  let map: Map<string, string[]> | null = null;
  return {
    get(key) {
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
      return map.get(key) ?? [];
    },
    refresh() { map = null; },
  };
}

export function bindDomInput(core: InputCore, opts: DomInputOptions): { dispose(): void; refresh(): void } {
  const { target, actions, isCaptured } = opts;
  const actionLookup = createActionLookup(actions);
  const lookup = (key: string): string[] => actionLookup.get(key);
  // Rebinding capture runs in the capture phase so the key (Escape included) never reaches the shell or gameplay.
  const onCaptureKeyDown = (e: KeyboardEvent): void => {
    if (!core.capturing || e.repeat || e.isComposing) return;
    if (core.offerCapture(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onCaptureMouseDown = (e: MouseEvent): void => {
    if (!core.capturing || isInputUiTarget(e.target)) return;
    if (core.offerCapture(`Mouse${e.button}`)) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!isCaptured() || e.defaultPrevented || e.isComposing || isInputUiTarget(e.target) || isInputUiTarget(document.activeElement)) return;
    if (e.repeat) return;
    core.noteDevice('keyboard');
    if (core.pressKey(e.code, lookup(e.code) ?? [])) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    core.releaseKey(e.code); // always allowed so keys never stick; do not interfere with native UI
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (!isCaptured() || e.defaultPrevented || isInputUiTarget(e.target)) return;
    core.noteDevice('mouse');
    // A mapped canvas click prevents native defaults, so explicitly return focus from form controls.
    if (typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement && isInputUiTarget(document.activeElement)) document.activeElement.blur();
    updatePointer(e);
    if (core.pressKey(`Mouse${e.button}`, lookup(`Mouse${e.button}`) ?? [])) e.preventDefault();
  };
  const onMouseUp = (e: MouseEvent): void => {
    core.releaseKey(`Mouse${e.button}`);
  };
  const onWheel = (e: WheelEvent): void => {
    if (!isCaptured() || e.defaultPrevented || isInputUiTarget(e.target) || e.deltaY === 0) return;
    const key = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
    if (core.pressKey(key, lookup(key) ?? [])) e.preventDefault();
    core.releaseKey(key);
  };
  const updatePointer = (e: MouseEvent): void => {
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    core.setPointer(x, y, x >= 0 && y >= 0 && x < rect.width && y < rect.height);
  };
  const onMouseMove = (e: MouseEvent): void => {
    if (!isCaptured() || isInputUiTarget(e.target) || isInputUiTarget(document.activeElement)) return;
    updatePointer(e);
    core.addLook(e.movementX, e.movementY);
  };
  const onClear = (): void => core.clear();
  const onFocus = (e: FocusEvent): void => { if (isInputUiTarget(e.target)) core.clear(); };
  const onVisibility = (): void => { if (document.visibilityState === 'hidden') core.clear(); };
  const onLock = (): void => { if (!document.pointerLockElement) core.clear(); };

  window.addEventListener('keydown', onCaptureKeyDown, true);
  window.addEventListener('mousedown', onCaptureMouseDown, true);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onClear);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerlockchange', onLock);
  document.addEventListener('focusin', onFocus);
  window.addEventListener('mousemove', onMouseMove);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('wheel', onWheel, { passive: false });

  return {
    refresh() { actionLookup.refresh(); core.clear(); },
    dispose() {
      core.clear();
      window.removeEventListener('keydown', onCaptureKeyDown, true);
      window.removeEventListener('mousedown', onCaptureMouseDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onClear);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerlockchange', onLock);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('wheel', onWheel);
    },
  };
}
