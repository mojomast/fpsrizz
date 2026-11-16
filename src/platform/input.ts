import type { InputContextsService, InputService, TickInput } from '../sdk/contracts/shooter.ts';

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
}

function createInputState() {
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
  const legacy = createInputState();
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
    press: (action) => legacy.press(action),
    release: (action) => legacy.release(action),
    addLook(dx, dy) { for (const s of pointerStates()) s.addLook(dx, dy); },
    setPointer(x, y, inside) { for (const s of pointerStates()) s.setPointer(x, y, inside); },
    beginTick() {
      legacy.beginTick();
      for (const c of contexts) c.state.beginTick();
    },
    clear() { cancel(); down.clear(); },
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
        const c = { state: createInputState(), bindings, priority: options.priority ?? 0, consume: options.consume ?? true, exclusive: options.exclusive ?? false, enabled: options.enabled ?? true };
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
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!isCaptured() || e.defaultPrevented || e.isComposing || isInputUiTarget(e.target) || isInputUiTarget(document.activeElement)) return;
    if (e.repeat) return;
    if (core.pressKey(e.code, lookup(e.code) ?? [])) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    core.releaseKey(e.code); // always allowed so keys never stick; do not interfere with native UI
  };
  const onMouseDown = (e: MouseEvent): void => {
    if (!isCaptured() || e.defaultPrevented || isInputUiTarget(e.target)) return;
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
    refresh() { map = null; core.clear(); },
    dispose() {
      core.clear();
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
