/**
 * GameGraph v1: a pure, versioned authoring model for a Bulkhead preset.
 *
 * ## Model
 *
 * A graph is a set of **plugin nodes** and **role slots** plus directed edges:
 *
 * - `plugin` nodes are the enabled plugin set. Their semantic key is `plugin`; the node id is the stable
 *   `plugin:<plugin-id>` string.
 * - `role` nodes are exclusive-role slots. Their semantic key is `role`; the node id is `role:<role-id>`.
 *   A role node may exist without a selection (an empty slot).
 * - `dependency` edges point from a plugin to a plugin it depends on. They are a **visible projection of the
 *   manifest graph**, not a second dependency declaration: manifests stay authoritative, so deleting one of these
 *   edges does not remove a declared dependency. `presetToGraph` emits them, and the host-style resolver below still
 *   validates the manifest dependencies.
 * - `selects` edges point from a role node to the plugin that owns the selected provider. The edge's `provider` field
 *   carries the runtime provider id (which need not equal the owner plugin id). These edges are the **source of truth**
 *   for the preset's `roles` map.
 *
 * Nodes may carry an optional `layout` (`x`, `y`, `collapsed`). Layout is presentation-only: compilation, validation,
 * ordering and every semantic operation ignore it. No coordinates are required to author or compile a graph.
 *
 * ## Catalog input
 *
 * Exclusive role providers are registered by plugin code (`ctx.provideRole(...)`), so a manifest alone cannot describe
 * them. A `PluginDescriptor` therefore carries the manifest plus an explicit `providers` map obtained from registration
 * metadata or an authored catalog. Missing provider metadata is never guessed: a selected role whose owner does not
 * declare the provider produces an actionable issue.
 *
 * The module is pure: it does not import plugin modules, activate a host, read JSON or touch the DOM.
 */
import { checkConfigValue } from '@bulkhead/kernel/manifest.ts';
import type { ConfigField, GamePreset, PluginManifest } from '@bulkhead/kernel/manifest.ts';
import { satisfies } from '@bulkhead/kernel/semver.ts';
import { ID_PATTERN, isObject } from '@bulkhead/kernel/validate.ts';
import type { Json } from '@bulkhead/kernel/validate.ts';

export const GAME_GRAPH_SCHEMA = 1;

/** Optional presentation metadata. Never read by compilation. */
export interface GraphLayout {
  x?: number;
  y?: number;
  collapsed?: boolean;
}

export interface PluginGraphNode {
  /** Stable node id: `plugin:<plugin-id>`. */
  id: string;
  type: 'plugin';
  plugin: string;
  layout?: GraphLayout;
}

export interface RoleGraphNode {
  /** Stable node id: `role:<role-id>`. */
  id: string;
  type: 'role';
  role: string;
  layout?: GraphLayout;
}

export type GameGraphNode = PluginGraphNode | RoleGraphNode;

/** Visible projection of a manifest dependency. Manifests remain authoritative. */
export interface DependencyGraphEdge {
  id: string;
  type: 'dependency';
  /** Dependent plugin node. */
  from: string;
  /** Prerequisite plugin node. */
  to: string;
}

/** Source of truth for one entry in the compiled preset's `roles` map. */
export interface RoleSelectionGraphEdge {
  id: string;
  type: 'selects';
  /** Role node. */
  from: string;
  /** Plugin node that owns the selected provider. */
  to: string;
  /** Provider id offered by the target plugin for this role. */
  provider: string;
}

export type GameGraphEdge = DependencyGraphEdge | RoleSelectionGraphEdge;

export interface GameGraph {
  schema: 1;
  id: string;
  name: string;
  seed: number;
  options: Record<string, Json>;
  config: Record<string, Record<string, Json>>;
  nodes: GameGraphNode[];
  edges: GameGraphEdge[];
}

/**
 * One installed plugin available to the graph compiler.
 *
 * `providers` maps an exclusive role id to the provider ids this plugin offers for that role. The plugin's manifest
 * supplies dependencies, conflicts, role requirements, SDK range and typed config fields.
 */
export interface PluginDescriptor {
  manifest: PluginManifest;
  providers?: Readonly<Record<string, readonly string[]>>;
}

/** Catalog input. Duplicate manifest ids are reported by `compileGraph`; the first descriptor wins. */
export type GameGraphCatalog = readonly PluginDescriptor[];

export type GameGraphIssueCode =
  | 'graph/invalid'
  | 'graph/schema'
  | 'graph/id'
  | 'graph/name'
  | 'graph/seed'
  | 'graph/options'
  | 'graph/config'
  | 'catalog/invalid'
  | 'catalog/duplicate'
  | 'node/invalid'
  | 'node/id'
  | 'node/duplicate'
  | 'edge/invalid'
  | 'edge/duplicate'
  | 'edge/endpoint'
  | 'edge/dependency'
  | 'plugin/unknown'
  | 'plugin/duplicate'
  | 'plugin/dependency-missing'
  | 'plugin/dependency-version'
  | 'plugin/conflict'
  | 'plugin/cycle'
  | 'role/unknown'
  | 'role/missing'
  | 'role/duplicate'
  | 'role/ambiguous'
  | 'role/provider'
  | 'config/plugin'
  | 'config/key'
  | 'config/value';

/** A compile error. `source`, `path` and `message` intentionally match the kernel's `Issue` shape. */
export interface GameGraphIssue {
  code: GameGraphIssueCode;
  source: string;
  path: string;
  message: string;
}

export interface CompileGraphResult {
  ok: boolean;
  /** Present only when `ok` is true. */
  preset?: GamePreset;
  issues: GameGraphIssue[];
}

export const pluginNodeId = (plugin: string): string => `plugin:${plugin}`;
export const roleNodeId = (role: string): string => `role:${role}`;
export const dependencyEdgeId = (plugin: string, dependency: string): string => `dependency:${plugin}->${dependency}`;
export const selectionEdgeId = (role: string, owner: string): string => `selects:${role}->${owner}`;

const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value);

/** Safe, non-throwing description for issue messages built from unknown user data. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value.length > 60 ? `${value.slice(0, 60)}…` : value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : typeof value;
}

function defineOwn<T>(target: Record<string, T>, key: string, value: T): void {
  // Avoid invoking the `__proto__` setter for JSON keys that came from untrusted graph data.
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}

const cloneLayout = (layout: GraphLayout): GraphLayout => {
  const out: GraphLayout = {};
  if (typeof layout.x === 'number') out.x = layout.x;
  if (typeof layout.y === 'number') out.y = layout.y;
  if (typeof layout.collapsed === 'boolean') out.collapsed = layout.collapsed;
  return out;
};

const cloneNode = (node: GameGraphNode): GameGraphNode => {
  const layout = node.layout === undefined ? {} : { layout: cloneLayout(node.layout) };
  return node.type === 'plugin'
    ? { id: node.id, type: 'plugin', plugin: node.plugin, ...layout }
    : { id: node.id, type: 'role', role: node.role, ...layout };
};

const cloneEdge = (edge: GameGraphEdge): GameGraphEdge =>
  edge.type === 'selects'
    ? { id: edge.id, type: 'selects', from: edge.from, to: edge.to, provider: edge.provider }
    : { id: edge.id, type: 'dependency', from: edge.from, to: edge.to };

/** Recursively clone JSON with sorted object keys. Arrays keep their order. */
function stableJson(value: Json): Json {
  if (Array.isArray(value)) return value.map(stableJson);
  if (isObject(value)) {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) defineOwn(out, key, stableJson(value[key] as Json));
    return out;
  }
  return value;
}

const stableRecord = (value: unknown): Record<string, Json> =>
  isObject(value) ? (stableJson(value as Record<string, Json>) as Record<string, Json>) : {};

const stableConfig = (value: unknown): Record<string, Record<string, Json>> => {
  if (!isObject(value)) return {};
  const out: Record<string, Record<string, Json>> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (isObject(entry)) defineOwn(out, key, stableJson(entry as Record<string, Json>) as Record<string, Json>);
  }
  return out;
};

const uniqueSorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

/** Locale-independent code-unit ordering, so generated graphs are byte-for-byte stable across environments. */
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (typeof item === 'string') defineOwn(out, key, item);
  }
  return out;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

interface IndexedPlugin {
  descriptor: PluginDescriptor;
  manifest: PluginManifest;
  id: string;
  /** role -> provider ids */
  providers: Map<string, string[]>;
}

function indexCatalog(
  catalog: GameGraphCatalog,
  issues?: GameGraphIssue[],
): Map<string, IndexedPlugin> {
  const out = new Map<string, IndexedPlugin>();
  const report = (path: string, message: string): void => {
    issues?.push({ code: 'catalog/invalid', source: 'catalog', path, message });
  };
  if (!Array.isArray(catalog)) {
    report('(root)', 'catalog must be an array of plugin descriptors');
    return out;
  }
  for (let i = 0; i < catalog.length; i++) {
    const descriptor: PluginDescriptor | undefined = catalog[i];
    const manifestValue: unknown = descriptor?.manifest;
    if (!descriptor || !isObject(manifestValue)) {
      report(`[${i}].manifest`, 'descriptor must contain a manifest object');
      continue;
    }
    const manifest = manifestValue as unknown as PluginManifest;
    if (!isId(manifest.id)) {
      report(`[${i}].manifest.id`, `${describeValue(manifest.id)} is not a namespaced plugin id like "core/world"`);
      continue;
    }
    if (out.has(manifest.id)) {
      issues?.push({
        code: 'catalog/duplicate',
        source: 'catalog',
        path: `[${i}].manifest.id`,
        message: `plugin "${manifest.id}" appears more than once in the catalog; the first descriptor is used`,
      });
      continue;
    }
    const providers = new Map<string, string[]>();
    const rawProviders: unknown = descriptor.providers;
    if (rawProviders !== undefined) {
      if (!isObject(rawProviders)) {
        report(`[${i}].providers`, 'providers must be an object mapping role ids to provider id arrays');
      } else {
        for (const role of Object.keys(rawProviders).sort()) {
          const list = rawProviders[role];
          if (!isId(role)) {
            report(`[${i}].providers.${role}`, `"${role}" is not a namespaced exclusive-role id`);
            continue;
          }
          if (!Array.isArray(list)) {
            report(`[${i}].providers.${role}`, 'provider list must be an array of namespaced provider ids');
            continue;
          }
          const ids: string[] = [];
          for (const provider of list) {
            if (!isId(provider)) {
              report(`[${i}].providers.${role}`, `${describeValue(provider)} is not a namespaced provider id`);
              continue;
            }
            ids.push(provider);
          }
          providers.set(role, uniqueSorted(ids));
        }
      }
    }
    out.set(manifest.id, { descriptor, manifest, id: manifest.id, providers });
  }
  return out;
}

/** Canonical ordering and cloned values. Does not repair semantics or invent nodes. */
export function normalizeGraph(graph: GameGraph): GameGraph {
  const nodes = graph.nodes.map(cloneNode).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'plugin' ? -1 : 1;
    return a.type === 'plugin'
      ? compareText(a.plugin, b.type === 'plugin' ? b.plugin : '')
      : compareText(a.role, b.type === 'role' ? b.role : '');
  });
  const edges = graph.edges.map(cloneEdge).sort((a, b) => {
    const byId = compareText(a.id, b.id);
    if (byId !== 0) return byId;
    const byKind = compareText(a.type, b.type);
    if (byKind !== 0) return byKind;
    const byFrom = compareText(a.from, b.from);
    return byFrom !== 0 ? byFrom : compareText(a.to, b.to);
  });
  return {
    schema: graph.schema,
    id: graph.id,
    name: graph.name,
    seed: graph.seed,
    options: stableRecord(graph.options),
    config: stableConfig(graph.config),
    nodes,
    edges,
  };
}

/**
 * Deterministic presentation-only layout. Role slots occupy the first column; plugins are placed in dependency
 * layers. It never changes node ids, edges, options, config or the compiled preset.
 */
export function autoLayout(graph: GameGraph): GameGraph {
  const normalized = normalizeGraph(graph);
  const plugins = normalized.nodes.filter((node): node is PluginGraphNode => node.type === 'plugin');
  const roles = normalized.nodes.filter((node): node is RoleGraphNode => node.type === 'role');
  const pluginIds = plugins.map((node) => node.plugin).sort();
  const known = new Set(pluginIds);
  const dependencies = new Map<string, string[]>(pluginIds.map((id) => [id, []]));
  for (const edge of normalized.edges) {
    if (edge.type !== 'dependency') continue;
    const from = normalized.nodes.find((node) => node.id === edge.from);
    const to = normalized.nodes.find((node) => node.id === edge.to);
    if (from?.type === 'plugin' && to?.type === 'plugin') {
      const list = dependencies.get(from.plugin);
      if (list && known.has(to.plugin)) list.push(to.plugin);
    }
  }
  const depth = new Map<string, number>();
  for (let pass = 0; pass < Math.max(1, pluginIds.length); pass++) {
    let changed = false;
    for (const id of pluginIds) {
      let next = 0;
      for (const dependency of dependencies.get(id) ?? []) next = Math.max(next, (depth.get(dependency) ?? 0) + 1);
      if (next > (depth.get(id) ?? 0)) {
        depth.set(id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const y = new Map<string, number>();
  roles.forEach((node, index) => y.set(node.id, index * 120));
  const byDepth = [...plugins].sort((a, b) => {
    const da = depth.get(a.plugin) ?? 0;
    const db = depth.get(b.plugin) ?? 0;
    return da !== db ? da - db : compareText(a.plugin, b.plugin);
  });
  byDepth.forEach((node, index) => y.set(node.id, 40 + index * 120));
  return {
    ...normalized,
    nodes: normalized.nodes.map((node) => ({
      ...node,
      layout: {
        ...node.layout,
        x: node.type === 'role' ? 0 : 280 + (depth.get(node.plugin) ?? 0) * 280,
        y: y.get(node.id) ?? 0,
      },
    })),
  };
}

/**
 * Convert a preset to a graph. Unknown plugins and role selections are preserved so compilation can report them;
 * dependencies are emitted only when both endpoints are enabled. Existing plugin/provider node ordering is canonical.
 */
export function presetToGraph(preset: GamePreset, catalog: GameGraphCatalog): GameGraph {
  const indexed = indexCatalog(catalog);
  const pluginIds = uniqueSorted(preset.plugins.filter((id): id is string => typeof id === 'string'));
  const enabled = new Set(pluginIds);
  const roleIds = new Set<string>();

  for (const pluginId of pluginIds) {
    const descriptor = indexed.get(pluginId);
    if (!descriptor) continue;
    for (const role of stringArray(descriptor.manifest.requiresRoles)) roleIds.add(role);
    for (const role of stringArray(descriptor.manifest.roleDependencies)) roleIds.add(role);
    for (const role of descriptor.providers.keys()) roleIds.add(role);
  }
  for (const role of Object.keys(preset.roles)) roleIds.add(role);

  const pluginNodes: PluginGraphNode[] = pluginIds.map((plugin) => ({ id: pluginNodeId(plugin), type: 'plugin', plugin }));
  const roleNodes: RoleGraphNode[] = uniqueSorted(roleIds).map((role) => ({
    id: roleNodeId(role),
    type: 'role',
    role,
  }));
  const edges: GameGraphEdge[] = [];
  for (const pluginId of pluginIds) {
    const descriptor = indexed.get(pluginId);
    if (!descriptor) continue;
    const dependencyIds = new Set([
      ...Object.keys(stringRecord(descriptor.manifest.dependencies)),
      ...Object.keys(stringRecord(descriptor.manifest.optionalDependencies)),
    ]);
    for (const dependency of [...dependencyIds].sort()) {
      if (!enabled.has(dependency)) continue;
      edges.push({
        id: dependencyEdgeId(pluginId, dependency),
        type: 'dependency',
        from: pluginNodeId(pluginId),
        to: pluginNodeId(dependency),
      });
    }
  }

  const allOwners = [...indexed.values()];
  for (const role of uniqueSorted(Object.keys(preset.roles))) {
    const provider = preset.roles[role]!;
    const enabledOwner = pluginIds.find((pluginId) => indexed.get(pluginId)?.providers.get(role)?.includes(provider));
    const catalogOwner = allOwners
      .filter((entry) => entry.providers.get(role)?.includes(provider))
      .map((entry) => entry.id)
      .sort()[0];
    const owner = enabledOwner ?? catalogOwner ?? provider;
    const target = pluginNodeId(owner);
    edges.push({
      id: selectionEdgeId(role, owner),
      type: 'selects',
      from: roleNodeId(role),
      to: target,
      provider,
    });
  }

  return normalizeGraph({
    schema: GAME_GRAPH_SCHEMA,
    id: preset.id,
    name: preset.name,
    seed: preset.seed,
    options: stableRecord(preset.options),
    config: stableConfig(preset.config),
    nodes: [...pluginNodes, ...roleNodes],
    edges,
  });
}

/** Deterministic projection to a preset. Duplicate/semantically invalid graphs should be rejected by `compileGraph`. */
export function graphToPreset(graph: GameGraph): GamePreset {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const plugins = uniqueSorted(
    nodes
      .filter((node): node is PluginGraphNode => node.type === 'plugin' && typeof node.plugin === 'string')
      .map((node) => node.plugin),
  );
  const roleByNode = new Map<string, string>();
  for (const node of nodes) if (node.type === 'role' && typeof node.role === 'string') roleByNode.set(node.id, node.role);
  const selections = edges
    .filter((edge): edge is RoleSelectionGraphEdge => edge.type === 'selects' && typeof edge.provider === 'string')
    .sort((a, b) => compareText(a.id, b.id));
  const roles: Record<string, string> = {};
  for (const edge of selections) {
    const role = roleByNode.get(edge.from);
    if (role !== undefined) defineOwn(roles, role, edge.provider);
  }
  return {
    schema: GAME_GRAPH_SCHEMA,
    id: graph.id,
    name: graph.name,
    plugins,
    roles: stableJson(roles as unknown as Json) as Record<string, string>,
    options: stableRecord(graph.options),
    config: stableConfig(graph.config),
    seed: graph.seed,
  };
}

interface ParsedNode<T extends GameGraphNode> {
  node: T;
  index: number;
}

interface ParsedSelectionEdge extends RoleSelectionGraphEdge {
  index: number;
  /** Semantic role/plugin values resolved from endpoints. */
  role: string;
  owner: string;
}

interface ParsedDependencyEdge extends DependencyGraphEdge {
  index: number;
  plugin: string;
  dependency: string;
}

interface EnabledOffer {
  owner: string;
  provider: string;
}

function offersOf(plugins: Iterable<IndexedPlugin>): Map<string, EnabledOffer[]> {
  const out = new Map<string, EnabledOffer[]>();
  for (const plugin of plugins) {
    for (const [role, providers] of plugin.providers) {
      const list = out.get(role) ?? [];
      for (const provider of providers) list.push({ owner: plugin.id, provider });
      out.set(role, list);
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => compareText(a.owner, b.owner) || compareText(a.provider, b.provider));
  }
  return out;
}

const offerText = (list: readonly EnabledOffer[]): string =>
  list.map((offer) => `"${offer.provider}" (from "${offer.owner}")`).join(', ');

function findCycle(remaining: Map<string, Set<string>>): string[] {
  const start = [...remaining.keys()].sort()[0]!;
  const path: string[] = [];
  let current = start;
  while (!path.includes(current)) {
    path.push(current);
    current = [...(remaining.get(current) ?? [])].filter((id) => remaining.has(id)).sort()[0] ?? start;
  }
  return path.slice(path.indexOf(current));
}

/**
 * Validate user-authored graph data and compile it to a preset. Never throws for graph data; every problem is an issue.
 * Compilation is independent of node/edge array order and of all layout metadata.
 */
export function compileGraph(graph: unknown, catalog: GameGraphCatalog): CompileGraphResult {
  const issues: GameGraphIssue[] = [];
  const issue = (code: GameGraphIssueCode, source: string, path: string, message: string): void => {
    issues.push({ code, source, path, message });
  };

  if (!isObject(graph)) {
    issue('graph/invalid', 'graph', '(root)', `expected a GameGraph object, got ${Array.isArray(graph) ? 'an array' : typeof graph}`);
    return { ok: false, issues };
  }

  if (graph.schema !== GAME_GRAPH_SCHEMA) {
    issue(
      'graph/schema',
      'graph',
      'schema',
      `unsupported game graph schema ${describeValue(graph.schema)}; this build understands schema ${GAME_GRAPH_SCHEMA}`,
    );
  }
  if (!isId(graph.id)) {
    issue('graph/id', 'graph', 'id', `${describeValue(graph.id)} is not a namespaced preset id like "core/default"`);
  }
  if (typeof graph.name !== 'string' || graph.name.length === 0 || graph.name.length > 80) {
    issue('graph/name', 'graph', 'name', 'name must be a non-empty string of at most 80 characters');
  }
  if (typeof graph.seed !== 'number' || !Number.isInteger(graph.seed) || graph.seed < 0 || graph.seed > 0xffffffff) {
    issue('graph/seed', 'graph', 'seed', 'seed must be an integer between 0 and 4294967295');
  }

  const readJson = (value: unknown, path: string, code: 'graph/options' | 'graph/config', depth = 0): Json | undefined => {
    if (depth > 32) {
      issue(code, 'graph', path, 'JSON nesting is deeper than 32 levels');
      return undefined;
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return value;
      issue(code, 'graph', path, 'numbers must be finite');
      return undefined;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (readJson(value[i], `${path}[${i}]`, code, depth + 1) === undefined) return undefined;
      }
      return value as Json[];
    }
    if (isObject(value)) {
      for (const key of Object.keys(value)) {
        if (readJson(value[key], `${path}.${key}`, code, depth + 1) === undefined) return undefined;
      }
      return value as { [key: string]: Json };
    }
    issue(code, 'graph', path, `${typeof value} values are not JSON`);
    return undefined;
  };

  const options: Record<string, Json> = {};
  if (graph.options !== undefined) {
    if (!isObject(graph.options)) {
      issue('graph/options', 'graph', 'options', 'options must be an object of JSON values');
    } else {
      for (const key of Object.keys(graph.options).sort()) {
        const value = readJson(graph.options[key], `options.${key}`, 'graph/options');
        if (value !== undefined) defineOwn(options, key, value);
      }
    }
  }

  const config: Record<string, Record<string, Json>> = {};
  if (graph.config !== undefined) {
    if (!isObject(graph.config)) {
      issue('graph/config', 'graph', 'config', 'config must map plugin ids to objects of JSON setting values');
    } else {
      for (const pluginId of Object.keys(graph.config).sort()) {
        const values = graph.config[pluginId];
        if (!isObject(values)) {
          issue('graph/config', 'graph', `config.${pluginId}`, 'plugin configuration must be an object');
          continue;
        }
        const clean: Record<string, Json> = {};
        for (const key of Object.keys(values).sort()) {
          const value = readJson(values[key], `config.${pluginId}.${key}`, 'graph/config');
          if (value !== undefined) defineOwn(clean, key, value);
        }
        defineOwn(config, pluginId, clean);
      }
    }
  }

  const catalogIndex = indexCatalog(catalog, issues);
  const pluginNodes = new Map<string, ParsedNode<PluginGraphNode>>();
  const roleNodes = new Map<string, ParsedNode<RoleGraphNode>>();
  const nodesById = new Map<string, ParsedNode<GameGraphNode>>();
  const nodeIds = new Set<string>();

  if (!Array.isArray(graph.nodes)) {
    issue('node/invalid', 'graph', 'nodes', 'nodes must be an array');
  } else {
    for (let i = 0; i < graph.nodes.length; i++) {
      const raw = graph.nodes[i];
      const path = `nodes[${i}]`;
      if (!isObject(raw)) {
        issue('node/invalid', 'graph', path, 'node must be an object');
        continue;
      }
      const type = raw.type;
      if (type !== 'plugin' && type !== 'role') {
        issue('node/invalid', 'graph', `${path}.type`, 'node type must be "plugin" or "role"');
        continue;
      }
      const id = raw.id;
      if (typeof id !== 'string' || id.length === 0 || id.length > 300) {
        issue('node/invalid', 'graph', `${path}.id`, 'node id must be a non-empty string');
        continue;
      }
      const semantic = type === 'plugin' ? raw.plugin : raw.role;
      if (!isId(semantic)) {
        issue(
          'node/invalid',
          'graph',
          `${path}.${type === 'plugin' ? 'plugin' : 'role'}`,
          `${describeValue(semantic)} is not a namespaced ${type} id`,
        );
        continue;
      }
      const expected = type === 'plugin' ? pluginNodeId(semantic) : roleNodeId(semantic);
      if (id !== expected) {
        issue('node/id', 'graph', `${path}.id`, `node id must be "${expected}" for ${type} "${semantic}"`);
      }
      if (nodeIds.has(id)) {
        issue('node/duplicate', 'graph', `${path}.id`, `node id "${id}" is used more than once`);
        continue;
      }
      nodeIds.add(id);
      if (type === 'plugin') {
        const node: PluginGraphNode = { id, type: 'plugin', plugin: semantic };
        const parsed = { node, index: i };
        nodesById.set(id, parsed);
        if (pluginNodes.has(semantic)) {
          issue('plugin/duplicate', 'graph', `${path}.plugin`, `plugin "${semantic}" is enabled more than once`);
        } else {
          pluginNodes.set(semantic, parsed);
        }
      } else {
        const node: RoleGraphNode = { id, type: 'role', role: semantic };
        const parsed = { node, index: i };
        nodesById.set(id, parsed);
        if (roleNodes.has(semantic)) {
          issue('node/duplicate', 'graph', `${path}.role`, `role slot "${semantic}" appears more than once`);
        } else {
          roleNodes.set(semantic, parsed);
        }
      }
    }
  }

  const dependencyEdges: ParsedDependencyEdge[] = [];
  const selectionEdges: ParsedSelectionEdge[] = [];
  const edgeIds = new Set<string>();
  if (graph.edges !== undefined && !Array.isArray(graph.edges)) {
    issue('edge/invalid', 'graph', 'edges', 'edges must be an array');
  } else if (Array.isArray(graph.edges)) {
    for (let i = 0; i < graph.edges.length; i++) {
      const raw = graph.edges[i];
      const path = `edges[${i}]`;
      if (!isObject(raw)) {
        issue('edge/invalid', 'graph', path, 'edge must be an object');
        continue;
      }
      const id = raw.id;
      if (typeof id !== 'string' || id.length === 0 || id.length > 400) {
        issue('edge/invalid', 'graph', `${path}.id`, 'edge id must be a non-empty string');
        continue;
      }
      if (edgeIds.has(id)) {
        issue('edge/duplicate', 'graph', `${path}.id`, `edge id "${id}" is used more than once`);
        continue;
      }
      edgeIds.add(id);
      const type = raw.type;
      if (type !== 'dependency' && type !== 'selects') {
        issue('edge/invalid', 'graph', `${path}.type`, 'edge type must be "dependency" or "selects"');
        continue;
      }
      const from = raw.from;
      const to = raw.to;
      if (typeof from !== 'string' || typeof to !== 'string') {
        issue('edge/invalid', 'graph', path, 'edge endpoints must be node id strings');
        continue;
      }
      const fromNode = nodesById.get(from);
      const toNode = nodesById.get(to);
      if (!fromNode || !toNode) {
        const missing = !fromNode ? from : to;
        issue('edge/endpoint', 'graph', path, `edge endpoint "${missing}" does not name a node in this graph`);
        continue;
      }
      if (type === 'dependency') {
        if (fromNode.node.type !== 'plugin' || toNode.node.type !== 'plugin') {
          issue('edge/endpoint', 'graph', path, 'dependency edges must connect two plugin nodes');
          continue;
        }
        dependencyEdges.push({
          id,
          type: 'dependency',
          from,
          to,
          index: i,
          plugin: fromNode.node.plugin,
          dependency: toNode.node.plugin,
        });
      } else {
        if (fromNode.node.type !== 'role' || toNode.node.type !== 'plugin') {
          issue('edge/endpoint', 'graph', path, 'selects edges must point from a role node to a plugin node');
          continue;
        }
        const provider = raw.provider;
        if (!isId(provider)) {
          issue(
            'edge/invalid',
            'graph',
            `${path}.provider`,
            `selection edge for role "${fromNode.node.role}" needs an explicit namespaced provider id`,
          );
          continue;
        }
        selectionEdges.push({
          id,
          type: 'selects',
          from,
          to,
          provider,
          index: i,
          role: fromNode.node.role,
          owner: toNode.node.plugin,
        });
      }
    }
  }

  const enabled = new Map<string, IndexedPlugin>();
  for (const [pluginId, parsed] of pluginNodes) {
    const descriptor = catalogIndex.get(pluginId);
    if (!descriptor) {
      issue(
        'plugin/unknown',
        'graph',
        `nodes[${parsed.index}].plugin`,
        `plugin "${pluginId}" is not installed in the supplied catalog`,
      );
      continue;
    }
    enabled.set(pluginId, descriptor);
  }

  // Dependency edges are a projection. Check that a present edge is truthful, but do not require one per manifest edge.
  const seenDependencies = new Set<string>();
  for (const edge of dependencyEdges) {
    const key = `${edge.plugin}\n${edge.dependency}`;
    if (seenDependencies.has(key)) {
      issue(
        'edge/duplicate',
        'graph',
        `edges[${edge.index}]`,
        `dependency edge "${edge.plugin}" -> "${edge.dependency}" is duplicated`,
      );
      continue;
    }
    seenDependencies.add(key);
    const descriptor = enabled.get(edge.plugin);
    if (!descriptor) continue;
    const required = Object.prototype.hasOwnProperty.call(stringRecord(descriptor.manifest.dependencies), edge.dependency);
    const optional = Object.prototype.hasOwnProperty.call(
      stringRecord(descriptor.manifest.optionalDependencies),
      edge.dependency,
    );
    if (!required && !optional) {
      issue(
        'edge/dependency',
        'graph',
        `edges[${edge.index}]`,
        `plugin "${edge.plugin}" does not declare a dependency on "${edge.dependency}"; remove the edge or fix the manifest`,
      );
    }
  }

  // Host-style manifest resolution: enabled dependencies, versions, conflicts and cycles.
  for (const pluginId of [...enabled.keys()].sort()) {
    const descriptor = enabled.get(pluginId)!;
    const manifest = descriptor.manifest;
    for (const [dependency, range] of Object.entries(stringRecord(manifest.dependencies))) {
      const target = enabled.get(dependency);
      if (!target) {
        const installed = catalogIndex.has(dependency);
        issue(
          'plugin/dependency-missing',
          pluginId,
          `dependencies.${dependency}`,
          installed
            ? `plugin "${pluginId}" requires "${dependency}", which is installed but not enabled. Enable "${dependency}" or disable "${pluginId}".`
            : `plugin "${pluginId}" requires "${dependency}" (${range}), which is not installed in the catalog.`,
        );
      } else {
        const version = typeof target.manifest.version === 'string' ? target.manifest.version : '';
        if (!satisfies(version, range)) {
          issue(
            'plugin/dependency-version',
            pluginId,
            `dependencies.${dependency}`,
            `plugin "${pluginId}" requires "${dependency}" ${range}, but version ${version || '(missing)'} is enabled.`,
          );
        }
      }
    }
    for (const [dependency, range] of Object.entries(stringRecord(manifest.optionalDependencies))) {
      const target = enabled.get(dependency);
      if (target) {
        const version = typeof target.manifest.version === 'string' ? target.manifest.version : '';
        if (!satisfies(version, range)) {
          issue(
            'plugin/dependency-version',
            pluginId,
            `optionalDependencies.${dependency}`,
            `plugin "${pluginId}" optionally uses "${dependency}" ${range}, but version ${version || '(missing)'} is enabled.`,
          );
        }
      }
    }
    for (const conflict of stringArray(manifest.conflicts)) {
      if (enabled.has(conflict)) {
        issue(
          'plugin/conflict',
          pluginId,
          'conflicts',
          `plugin "${pluginId}" conflicts with "${conflict}"; disable one of them.`,
        );
      }
    }
  }

  // Typed config values, matching the host's manifest defaults/ranges.
  for (const pluginId of Object.keys(config).sort()) {
    const descriptor = enabled.get(pluginId);
    if (!descriptor) {
      issue(
        'config/plugin',
        'graph',
        `config.${pluginId}`,
        `configuration is set for "${pluginId}", which is not an enabled plugin in this graph`,
      );
      continue;
    }
    const fields = isObject(descriptor.manifest.config) ? descriptor.manifest.config : {};
    for (const key of Object.keys(config[pluginId]!).sort()) {
      const field = fields[key];
      if (!isObject(field) || typeof field.type !== 'string') {
        const known = Object.keys(fields).sort();
        issue(
          'config/key',
          pluginId,
          `config.${pluginId}.${key}`,
          `plugin "${pluginId}" has no setting named "${key}".${known.length ? ` Settings: ${known.join(', ')}.` : ''}`,
        );
        continue;
      }
      const problem = checkConfigValue(field as ConfigField, config[pluginId]![key]!);
      if (problem) {
        issue(
          'config/value',
          pluginId,
          `config.${pluginId}.${key}`,
          `${problem} for plugin "${pluginId}" setting "${field.label ?? key}"`,
        );
      }
    }
  }

  const allOffers = offersOf(catalogIndex.values());
  const enabledOffers = offersOf(enabled.values());
  const requiredRoles = new Map<string, string>();
  for (const pluginId of [...enabled.keys()].sort()) {
    const manifest = enabled.get(pluginId)!.manifest;
    for (const role of [...stringArray(manifest.requiresRoles), ...stringArray(manifest.roleDependencies)]) {
      if (!requiredRoles.has(role)) requiredRoles.set(role, pluginId);
    }
  }

  const selections = new Map<string, ParsedSelectionEdge[]>();
  for (const edge of selectionEdges) {
    const list = selections.get(edge.role) ?? [];
    list.push(edge);
    selections.set(edge.role, list);
  }

  for (const [role, requiredBy] of [...requiredRoles].sort(([a], [b]) => compareText(a, b))) {
    if (selections.has(role)) continue;
    const available = enabledOffers.get(role) ?? [];
    const installed = allOffers.get(role) ?? [];
    issue(
      'role/missing',
      requiredBy,
      `roles.${role}`,
      `plugin "${requiredBy}" requires a provider for exclusive role "${role}", but the graph selects none. ${
        available.length
          ? `Available: ${offerText(available)}.`
          : installed.length
            ? `Installed providers: ${offerText(installed)}; enable their owners or add a selection.`
            : 'No catalog plugin offers this role.'
      }`,
    );
  }

  for (const [role, list] of [...enabledOffers].sort(([a], [b]) => compareText(a, b))) {
    if (selections.has(role) || requiredRoles.has(role)) continue;
    if (list.length > 1) {
      issue(
        'role/ambiguous',
        'graph',
        `roles.${role}`,
        `ambiguous exclusive role "${role}": ${offerText(list)} are all enabled. Select exactly one provider edge or disable the extra providers.`,
      );
    }
  }

  for (const [role, list] of [...selections].sort(([a], [b]) => compareText(a, b))) {
    const ordered = [...list].sort((a, b) => compareText(a.id, b.id));
    if (ordered.length > 1) {
      issue(
        'role/duplicate',
        'graph',
        `edges[${ordered[1]!.index}].from`,
        `exclusive role "${role}" has ${ordered.length} selection edges (${ordered
          .map((edge) => `"${edge.provider}" via "${edge.id}"`)
          .join(', ')}). Keep exactly one.`,
      );
    }
    const edge = ordered[0]!;
    const installed = allOffers.get(role);
    if (!installed && !requiredRoles.has(role)) {
      issue(
        'role/unknown',
        'graph',
        `roles.${role}`,
        `unknown exclusive role "${role}": no catalog plugin offers it and no enabled plugin requires it`,
      );
      continue;
    }
    const available = enabledOffers.get(role);
    if (!available) {
      issue(
        'role/provider',
        'graph',
        `edges[${edge.index}]`,
        `no enabled plugin offers exclusive role "${role}". ${
          installed?.length ? `Installed providers: ${offerText(installed)}; enable their owner.` : ''
        }`,
      );
      continue;
    }
    const target = enabled.get(edge.owner);
    if (!target) continue; // plugin/unknown already reported
    const offeredByTarget = target.providers.get(role) ?? [];
    if (!offeredByTarget.includes(edge.provider)) {
      const owners = (installed ?? []).filter((offer) => offer.provider === edge.provider);
      const ownerText = owners.length
        ? ` Provider "${edge.provider}" is offered by ${owners.map((offer) => `"${offer.owner}"`).join(', ')}.`
        : '';
      issue(
        'role/provider',
        'graph',
        `edges[${edge.index}]`,
        `plugin "${edge.owner}" does not offer provider "${edge.provider}" for exclusive role "${role}".${
          offeredByTarget.length ? ` It offers: ${offeredByTarget.join(', ')}.` : ''
        }${ownerText}`,
      );
    }
  }

  for (const [role, parsed] of roleNodes) {
    if (selections.has(role)) continue;
    if (allOffers.has(role) || requiredRoles.has(role)) continue;
    issue(
      'role/unknown',
      'graph',
      `nodes[${parsed.index}].role`,
      `unknown role slot "${role}": no catalog plugin offers it and no enabled plugin requires it`,
    );
  }

  // Resolve activation edges, including selected roleDependencies providers, and reject cycles deterministically.
  const activation = new Map<string, Map<string, string>>();
  for (const pluginId of enabled.keys()) activation.set(pluginId, new Map());
  for (const [pluginId, descriptor] of enabled) {
    const edges = activation.get(pluginId)!;
    for (const dependency of Object.keys(stringRecord(descriptor.manifest.dependencies))) {
      if (enabled.has(dependency)) edges.set(dependency, `dependencies.${dependency}`);
    }
    for (const dependency of Object.keys(stringRecord(descriptor.manifest.optionalDependencies))) {
      if (enabled.has(dependency)) edges.set(dependency, `optionalDependencies.${dependency}`);
    }
    for (const role of stringArray(descriptor.manifest.roleDependencies)) {
      const list = selections.get(role);
      if (!list?.length) continue;
      const edge = [...list].sort((a, b) => compareText(a.id, b.id))[0]!;
      if (edge.owner !== pluginId && enabled.has(edge.owner)) {
        edges.set(edge.owner, `roleDependencies.${role} (selects "${edge.provider}" from "${edge.owner}")`);
      }
    }
  }
  const remaining = new Map<string, Set<string>>();
  for (const [pluginId, edges] of activation) remaining.set(pluginId, new Set(edges.keys()));
  while (remaining.size > 0) {
    const ready = [...remaining].filter(([, edges]) => edges.size === 0).map(([id]) => id).sort();
    if (ready.length === 0) {
      const cycle = findCycle(remaining);
      const details = cycle.map((id, index) => {
        const dependency = cycle[(index + 1) % cycle.length]!;
        return `"${id}" waits for "${dependency}" via ${activation.get(id)?.get(dependency) ?? 'dependency'}`;
      });
      issue(
        'plugin/cycle',
        cycle[0] ?? 'graph',
        'dependencies',
        `Dependency/role activation cycle: ${details.join('; ')}. Break the cycle or select a different role provider.`,
      );
      break;
    }
    const id = ready[0]!;
    remaining.delete(id);
    for (const edges of remaining.values()) edges.delete(id);
  }

  if (issues.length > 0) return { ok: false, issues };

  const roles: Record<string, string> = {};
  for (const [role, list] of [...selections].sort(([a], [b]) => compareText(a, b))) {
    defineOwn(roles, role, [...list].sort((a, b) => compareText(a.id, b.id))[0]!.provider);
  }
  const preset: GamePreset = {
    schema: GAME_GRAPH_SCHEMA,
    id: graph.id as string,
    name: graph.name as string,
    plugins: [...enabled.keys()].sort(),
    roles: stableJson(roles as unknown as Json) as Record<string, string>,
    options: stableJson(options) as Record<string, Json>,
    config: stableJson(config) as Record<string, Record<string, Json>>,
    seed: graph.seed as number,
  };
  return { ok: true, preset, issues };
}

/** Compile issues only; useful for editors that keep showing the current graph. */
export function validateGraph(graph: unknown, catalog: GameGraphCatalog): GameGraphIssue[] {
  return compileGraph(graph, catalog).issues;
}

/** Pure helper: add (or re-layout) a plugin node. Dependencies are derived from manifests at compile time. */
export function addPluginNode(graph: GameGraph, plugin: string, layout?: GraphLayout): GameGraph {
  const id = pluginNodeId(plugin);
  const exists = graph.nodes.some((node) => node.id === id || (node.type === 'plugin' && node.plugin === plugin));
  const nodes = exists
    ? graph.nodes.map((node) =>
        node.id === id && layout ? { ...node, layout: cloneLayout(layout) } : node,
      )
    : [...graph.nodes, layout ? { id, type: 'plugin' as const, plugin, layout: cloneLayout(layout) } : { id, type: 'plugin' as const, plugin }];
  return normalizeGraph({ ...graph, nodes });
}

/** Pure helper: remove a plugin node and every edge that touches it. Role slots are kept. */
export function removePluginNode(graph: GameGraph, plugin: string): GameGraph {
  const ids = new Set(
    graph.nodes
      .filter((node) => node.type === 'plugin' && node.plugin === plugin)
      .map((node) => node.id),
  );
  ids.add(pluginNodeId(plugin));
  return normalizeGraph({
    ...graph,
    nodes: graph.nodes.filter((node) => !ids.has(node.id)),
    edges: graph.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to)),
  });
}

/**
 * Pure helper: select `provider` from the plugin node owned by `owner` (defaults to `provider` itself). Existing
 * selections for the role are replaced. Compilation reports a missing owner node or an unoffered provider.
 */
export function selectRoleProvider(
  graph: GameGraph,
  role: string,
  provider: string,
  owner: string = provider,
): GameGraph {
  const roleId = roleNodeId(role);
  const ownerId = pluginNodeId(owner);
  const nodes = graph.nodes.some((node) => node.id === roleId)
    ? graph.nodes
    : [...graph.nodes, { id: roleId, type: 'role' as const, role }];
  return normalizeGraph({
    ...graph,
    nodes,
    edges: [
      ...graph.edges.filter((edge) => !(edge.type === 'selects' && edge.from === roleId)),
      {
        id: selectionEdgeId(role, owner),
        type: 'selects',
        from: roleId,
        to: ownerId,
        provider,
      },
    ],
  });
}

/** Pure helper: set one preset option. */
export function setGraphOption(graph: GameGraph, key: string, value: Json): GameGraph {
  return normalizeGraph({ ...graph, options: stableRecord({ ...graph.options, [key]: value }) });
}

/** Pure helper: set or replace one typed plugin config value. */
export function setPluginConfig(graph: GameGraph, plugin: string, key: string, value: Json): GameGraph {
  const existing = graph.config[plugin] ?? {};
  return normalizeGraph({
    ...graph,
    config: stableConfig({ ...graph.config, [plugin]: { ...existing, [key]: value } }),
  });
}
