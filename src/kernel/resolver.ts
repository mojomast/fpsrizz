import type { PluginManifest } from './manifest.ts';
import type { Issue } from './validate.ts';
import { satisfies } from './semver.ts';

export interface GraphResult {
  /** Activation order (dependencies first). Disposal uses the reverse. */
  order: string[];
  issues: Issue[];
}

/**
 * Validates the requested plugin set against the installed catalog and returns a stable topological order.
 * Tie-breaker: among plugins whose dependencies are all satisfied, the lexicographically smallest id goes first.
 * Dependencies are never auto-enabled: a preset must list every plugin it activates.
 */
export function resolveGraph(installed: ReadonlyMap<string, PluginManifest>, requested: readonly string[], sdkVersion: string): GraphResult {
  const issues: Issue[] = [];
  const err = (source: string, path: string, message: string): void => void issues.push({ source, path, message });
  const active = new Map<string, PluginManifest>();

  for (const id of requested) {
    const m = installed.get(id);
    if (!m) {
      err('preset', 'plugins', `Plugin "${id}" is requested but not installed. Installed: ${[...installed.keys()].sort().join(', ') || '(none)'}`);
      continue;
    }
    if (active.has(id)) {
      err('preset', 'plugins', `Plugin "${id}" is listed more than once.`);
      continue;
    }
    active.set(id, m);
  }

  const edges = new Map<string, Set<string>>(); // plugin -> plugins it must come after
  for (const [id, m] of active) {
    const deps = new Set<string>();
    edges.set(id, deps);
    if (!satisfies(sdkVersion, m.sdk)) err(id, 'sdk', `Plugin "${id}" needs SDK ${m.sdk} but this build provides SDK ${sdkVersion}.`);
    for (const [dep, range] of Object.entries(m.dependencies)) {
      const dm = active.get(dep);
      if (!dm) {
        err(id, `dependencies.${dep}`, installed.has(dep) ? `Plugin "${id}" requires "${dep}", which is installed but not enabled. Enable "${dep}" or disable "${id}".` : `Plugin "${id}" requires "${dep}" (${range}), which is not installed.`);
        continue;
      }
      if (!satisfies(dm.version, range)) err(id, `dependencies.${dep}`, `Plugin "${id}" requires "${dep}" ${range}, but version ${dm.version} is installed.`);
      deps.add(dep);
    }
    for (const [dep, range] of Object.entries(m.optionalDependencies)) {
      const dm = active.get(dep);
      if (!dm) continue; // optional: absence is fine
      if (!satisfies(dm.version, range)) err(id, `optionalDependencies.${dep}`, `Plugin "${id}" optionally uses "${dep}" ${range}, but the enabled version is ${dm.version}.`);
      deps.add(dep);
    }
    for (const c of m.conflicts) if (active.has(c)) err(id, 'conflicts', `Plugin "${id}" conflicts with "${c}"; they cannot be enabled together. Disable one of them.`);
  }

  // Kahn's algorithm with a lexicographic ready-set.
  const order: string[] = [];
  const remaining = new Map<string, Set<string>>();
  for (const [id, deps] of edges) remaining.set(id, new Set(deps));
  while (remaining.size > 0) {
    const ready = [...remaining].filter(([, d]) => d.size === 0).map(([id]) => id).sort();
    if (ready.length === 0) {
      const cyc = findCycle(remaining);
      err(cyc[0] ?? 'preset', 'dependencies', `Dependency cycle: ${[...cyc, cyc[0]].join(' -> ')}. Break the cycle by removing one of these dependencies.`);
      break;
    }
    const id = ready[0]!;
    order.push(id);
    remaining.delete(id);
    for (const d of remaining.values()) d.delete(id);
  }
  return { order, issues };
}

function findCycle(remaining: Map<string, Set<string>>): string[] {
  const start = [...remaining.keys()].sort()[0]!;
  const path: string[] = [];
  let cur = start;
  while (!path.includes(cur)) {
    path.push(cur);
    cur = [...(remaining.get(cur) ?? [])].filter((d) => remaining.has(d)).sort()[0] ?? start;
  }
  return path.slice(path.indexOf(cur));
}

/** Plugins among `active` that (transitively) require `id` - used to refuse removing a required dependency. */
export function dependentsOf(installed: ReadonlyMap<string, PluginManifest>, active: readonly string[], id: string): string[] {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of active) {
      if (out.has(a) || a === id) continue;
      const m = installed.get(a);
      if (m && Object.keys(m.dependencies).some((d) => d === id || out.has(d))) {
        out.add(a);
        grew = true;
      }
    }
  }
  return [...out].sort();
}
