/**
 * Host implementation of `InputBindings` (SDK 3 input v2): action key overrides on top of the InputActions
 * registry, persisted in a profile store (one value per action, key "bind/<action id>", JSON string list).
 */
import type { BindingRow, InputBindingsService } from '@bulkhead/sdk/contracts/input.ts';
import type { InputActionDef } from '@bulkhead/sdk/contracts/game.ts';
import type { ProfileService } from '@bulkhead/sdk/contracts/profile.ts';
import type { InputCore } from './input.ts';

const PREFIX = 'bind/';
const KEY_RE = /^[A-Za-z0-9]{1,32}$/;

export interface InputBindingsHost extends InputBindingsService {
  /** Registry actions with overrides applied (feed this to the DOM, gamepad and touch adapters). */
  effective(): { id: string; keys: string[]; label: string }[];
}

export function createInputBindings(opts: {
  core: InputCore;
  store: ProfileService | null;
  actions: () => ReadonlyArray<{ id: string; value: InputActionDef }>;
  onChange?: () => void;
}): InputBindingsHost {
  const overrides = new Map<string, string[]>();
  const loaded = opts.store?.load();
  if (loaded?.ok && loaded.value) {
    for (const [k, v] of Object.entries(loaded.value.values)) {
      if (!k.startsWith(PREFIX) || typeof v !== 'string') continue;
      try {
        const keys = JSON.parse(v) as unknown;
        if (Array.isArray(keys) && keys.every((x) => typeof x === 'string' && KEY_RE.test(x))) overrides.set(k.slice(PREFIX.length), keys as string[]);
      } catch { /* ignore a corrupt entry */ }
    }
  }
  const persist = (): void => {
    if (!opts.store) return;
    const values: Record<string, string> = {};
    for (const [a, keys] of overrides) values[`${PREFIX}${a}`] = JSON.stringify(keys);
    if (overrides.size === 0) opts.store.clear();
    else opts.store.save({ values });
  };
  const changed = (): void => { persist(); opts.core.clear(); opts.onChange?.(); };
  return {
    effective: () => opts.actions().map((e) => ({ id: e.id, label: e.value.label, keys: overrides.get(e.id) ?? e.value.keys })),
    list: () => opts.actions().map((e): BindingRow => {
      const o = overrides.get(e.id);
      return { action: e.id, label: e.value.label, keys: o ?? e.value.keys, defaults: e.value.keys, overridden: o !== undefined };
    }),
    rebind(action, keys) {
      if (!keys.every((k) => KEY_RE.test(k))) throw new Error(`invalid key code in ${JSON.stringify(keys)}`);
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,120}$/.test(action)) throw new Error(`invalid action id "${action}"`);
      overrides.set(action, [...keys]);
      changed();
    },
    reset(action) {
      if (action === undefined) overrides.clear();
      else overrides.delete(action);
      changed();
    },
    capture: (o) => opts.core.capture(o?.timeoutMs),
    get lastDevice() { return opts.core.lastDevice; },
  };
}
