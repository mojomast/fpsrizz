import type { CommandToken, EventToken, ServiceToken } from './bus.ts';
import { CommandBus, EventBus, ServiceMap } from './bus.ts';
import type { ComponentToken, EntityId, Query, QuerySpec } from './ecs.ts';
import { EntityStore } from './ecs.ts';
import type { ConfigField, ContentEntry, GamePreset, PluginManifest } from './manifest.ts';
import { checkConfigValue, parseContentEntries, parseManifest, parsePreset } from './manifest.ts';
import type { RegistryEntry, RegistryToken } from './registry.ts';
import { RegistrySet } from './registry.ts';
import { resolveGraph } from './resolver.ts';
import type { Rng } from './rng.ts';
import { createRng, hashString } from './rng.ts';
import type { FrameSystemDef, SystemDef, SystemFault } from './scheduler.ts';
import { Scheduler } from './scheduler.ts';
import { Scope } from './scope.ts';
import type { Issue, Json } from './validate.ts';
import { Reporter, formatIssues } from './validate.ts';

// ---------------------------------------------------------------------------------------------------------------------
// Public plugin-facing types
// ---------------------------------------------------------------------------------------------------------------------

export interface RoleToken<T> {
  readonly id: string;
  readonly _t?: T;
}

/** Read-only view of the active registries. */
export interface RegistryReader {
  get<T>(token: RegistryToken<T>, id: string): T | undefined;
  require<T>(token: RegistryToken<T>, id: string): T;
  has(token: RegistryToken<unknown>, id: string): boolean;
  ownerOf(token: RegistryToken<unknown>, id: string): string | undefined;
  entries<T>(token: RegistryToken<T>): RegistryEntry<T>[];
  ids(token: RegistryToken<unknown>): string[];
}

export interface ContentLoadContext {
  /** Plugin or pack that contributed the entry (becomes the owner of whatever is registered). */
  readonly owner: string;
  readonly id: string;
  /** Reporter positioned at the entry's `data`. Report problems here; never throw for bad data. */
  readonly r: Reporter;
  register<T>(token: RegistryToken<T>, id: string, value: T): void;
  readonly registries: RegistryReader;
}

/** Turns one declarative content entry into registry contributions. Registered by trusted code plugins. */
export interface ContentKind {
  description: string;
  load(data: Json, ctx: ContentLoadContext): void;
}

export interface ValidationContext {
  readonly registries: RegistryReader;
  readonly preset: GamePreset;
  readonly activePlugins: readonly string[];
  /** Selected provider id for a role, if the preset chose one. */
  selectedRole(role: RoleToken<unknown>): string | undefined;
  /** All enabled providers for a role, including their registering owner, for composition validation. */
  roleProviders<T>(role: RoleToken<T>): RegistryEntry<T>[];
  reporter(source: string, path?: string): Reporter;
}

export interface RegisterContext {
  readonly pluginId: string;
  readonly manifest: PluginManifest;
  readonly config: Readonly<Record<string, Json>>;
  /** Registration-lifetime scope (lives until this plugin graph is replaced). */
  readonly scope: Scope;
  readonly registries: RegistryReader;
  register<T>(token: RegistryToken<T>, id: string, value: T): void;
  /** Offers a provider for an exclusive role. The preset decides which provider is active. */
  provideRole<T>(role: RoleToken<T>, id: string, provider: T): void;
  /** Declares how a kind of declarative content ("weapon", "map", ...) is validated and registered. */
  contentKind(kind: string, loader: ContentKind): void;
  /** Adds content from code through exactly the same loader path data packs use. */
  defineContent(kind: string, id: string, data: Json): void;
  /** Runs after every plugin registered, before anything is committed. Use it for cross-reference checks. */
  addValidator(fn: (v: ValidationContext) => void): void;
}

export interface EntityApi {
  create(): EntityId;
  destroy(id: EntityId): void;
  isAlive(id: EntityId): boolean;
  add<T>(id: EntityId, token: ComponentToken<T>, data: T): T;
  get<T>(id: EntityId, token: ComponentToken<T>): T | undefined;
  has(id: EntityId, token: ComponentToken<unknown>): boolean;
  remove(id: EntityId, token: ComponentToken<unknown>): void;
  each<T>(token: ComponentToken<T>, fn: (id: EntityId, data: T) => void): void;
  first(token: ComponentToken<unknown>): EntityId | undefined;
  count(token?: ComponentToken<unknown>): number;
  ownerOf(id: EntityId): string | undefined;
  /**
   * Cached multi-component query with added/removed/changed tracking (SDK 3). The handle is disposed with the
   * calling plugin's session scope. Create queries in activate(), not every tick.
   */
  query(spec: QuerySpec): Query;
  /** Flags an in-place mutation so queries that require the component report the entity in `changed` (SDK 3). */
  markChanged(id: EntityId, token: ComponentToken<unknown>): void;
}

export interface SessionContext {
  readonly pluginId: string;
  readonly manifest: PluginManifest;
  readonly config: Readonly<Record<string, Json>>;
  /** Session-lifetime scope owned by this plugin. Disposed (reverse dependency order) when the session stops. */
  readonly scope: Scope;
  readonly signal: AbortSignal;
  readonly registries: RegistryReader;
  readonly preset: GamePreset;
  readonly world: EntityApi;
  readonly systems: { add(def: SystemDef): void; addFrame(def: FrameSystemDef): void };
  readonly events: { on<T>(token: EventToken<T>, fn: (payload: T) => void): void; emit<T>(token: EventToken<T>, payload: T): void };
  readonly commands: { handle<P, R>(token: CommandToken<P, R>, fn: (payload: P) => R): void; dispatch<P, R>(token: CommandToken<P, R>, payload: P): R };
  readonly services: { provide<T>(token: ServiceToken<T>, impl: T): void; get<T>(token: ServiceToken<T>): T; tryGet<T>(token: ServiceToken<T>): T | undefined };
  readonly time: { readonly tick: number; readonly now: number; readonly step: number };
  /** Seeded gameplay randomness (stream is private to this plugin). */
  readonly rng: Rng;
  /** Unseeded-quality randomness for visuals/audio only; never let it influence simulation. */
  readonly cosmeticRng: Rng;
  readonly log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  /** Selected provider for an exclusive role, if any. */
  role<T>(role: RoleToken<T>): { id: string; provider: T } | undefined;
  /** Awaits a promise but rejects (ScopeDisposedError) if this session was disposed in the meantime. */
  guard<T>(p: Promise<T>): Promise<T>;
  /**
   * Session-bound instance of a registered factory. `start` runs once per session per (registry, id), receiving the
   * definition and the SessionContext of the plugin that REGISTERED it, so everything the instance creates is owned
   * (and later cleaned up) by that plugin, no matter who asked for it.
   */
  instantiate<V, I>(token: RegistryToken<V>, id: string, start: (def: V, ownerCtx: SessionContext) => I): I;
}

export interface PluginModule {
  /** Register definitions, factories, content kinds and role providers. Must not start anything. */
  register?(ctx: RegisterContext): void;
  /** Start per-session behaviour: systems, subscriptions, services, entities, UI/scene roots. */
  activate?(ctx: SessionContext): void | Promise<void>;
}

/** Role providers that expose activate() are started by the host after all plugins activated. */
export interface ActivatableProvider {
  activate(ctx: SessionContext): void | Promise<void>;
}

export interface CatalogEntry {
  /** Raw manifest JSON (validated by the host before any code is imported). */
  manifest: unknown;
  /** Lazy module loader for code plugins. Must not be invoked until the graph is validated. */
  load?: () => Promise<{ default: PluginModule }>;
  /** Raw declarative content entries (data packs, or data shipped alongside a code plugin). */
  content?: unknown;
  /** Where this entry came from: "built-in" or "imported". */
  origin?: string;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  tick: number;
}

export type HostStage = 'catalog' | 'preset' | 'graph' | 'load' | 'register' | 'validate' | 'activate' | 'superseded';

export class HostError extends Error {
  readonly stage: HostStage;
  readonly issues: Issue[];
  readonly pluginId: string | undefined;
  constructor(stage: HostStage, issues: Issue[], pluginId?: string) {
    super(`Plugin host failed at "${stage}"${pluginId ? ` (plugin "${pluginId}")` : ''}:\n${formatIssues(issues)}`);
    this.name = 'HostError';
    this.stage = stage;
    this.issues = issues;
    this.pluginId = pluginId;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------------------------------------------------

export type SessionState = 'starting' | 'running' | 'faulted' | 'disposed';

export class Session {
  readonly generation: number;
  readonly preset: GamePreset;
  readonly order: readonly string[];
  readonly registries: RegistrySet;
  readonly entities = new EntityStore();
  readonly events = new EventBus();
  readonly commands = new CommandBus();
  readonly services = new ServiceMap();
  readonly scheduler: Scheduler;
  readonly scope: Scope;
  readonly pluginScopes = new Map<string, Scope>();
  readonly contexts = new Map<string, SessionContext>();
  readonly instances = new Map<string, unknown>();
  state: SessionState = 'starting';
  fault: SystemFault | undefined;
  onFault: ((fault: SystemFault) => void) | undefined;
  private beforeTick: (() => void)[] = [];

  constructor(generation: number, preset: GamePreset, order: readonly string[], registries: RegistrySet, phases: readonly string[], sink: (e: unknown, owner: string, kind: string) => void) {
    this.generation = generation;
    this.preset = preset;
    this.order = order;
    this.registries = registries;
    this.scope = new Scope('host', `session#${generation}`, undefined, sink);
    this.scheduler = new Scheduler(phases, {
      beforeTick: () => {
        for (const fn of this.beforeTick) fn();
      },
      beforeSystem: () => {
        this.events.deferring = true;
      },
      afterSystem: () => {
        this.events.deferring = false;
        this.entities.flush();
        this.events.drain();
        this.entities.flush();
      },
      onFault: (f) => {
        this.events.deferring = false;
        this.state = 'faulted';
        this.fault = f;
        this.onFault?.(f);
      },
    });
    this.events.onHandlerError = (error, owner, eventId) => this.scheduler.fault({ owner, systemId: `event:${eventId}`, error });
  }

  /** Host adapters (input sampling) hook the start of every simulation tick. */
  addBeforeTick(fn: () => void, scope: Scope): void {
    this.beforeTick.push(fn);
    scope.add(() => {
      const i = this.beforeTick.indexOf(fn);
      if (i >= 0) this.beforeTick.splice(i, 1);
    }, 'tick-hook');
  }

  get disposed(): boolean {
    return this.state === 'disposed';
  }

  /** Idempotent. Plugin scopes are disposed in reverse activation order, then host-owned session resources. */
  dispose(): void {
    if (this.state === 'disposed') return;
    this.state = 'disposed';
    this.scheduler.paused = true;
    for (const id of [...this.order].reverse()) this.pluginScopes.get(id)?.dispose();
    this.scope.dispose();
    this.scheduler.clear();
    this.events.clear();
    this.commands.clear();
    this.services.clear();
    this.entities.clear();
    this.contexts.clear();
    this.instances.clear();
    this.beforeTick.length = 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Staged graph (registered + validated, not yet running)
// ---------------------------------------------------------------------------------------------------------------------

export interface StagedGraph {
  readonly preset: GamePreset;
  /** Concrete dependency order used for loading and registration. */
  readonly order: string[];
  /** Dependency order augmented with selected roleDependencies provider owners. */
  readonly activationOrder: string[];
  readonly manifests: Map<string, PluginManifest>;
  readonly modules: Map<string, PluginModule>;
  readonly registries: RegistrySet;
  readonly scope: Scope;
  readonly configs: Map<string, Record<string, Json>>;
  readonly contentKinds: Map<string, { loader: ContentKind; owner: string }>;
  /** Catalog entries that were supplied as `extra` and must be committed if this graph is applied. */
  readonly extra: CatalogEntry[];
}

export interface CatalogStatus {
  id: string;
  manifest: PluginManifest | undefined;
  origin: string;
  active: boolean;
  issues: Issue[];
}

export interface HostOptions {
  sdkVersion: string;
  phases: readonly string[];
  /** Called for every new session before plugins activate. Provide platform services with owner "host". */
  installHostServices?(session: Session, scope: Scope): void;
  onLog?(entry: LogEntry): void;
}

const roleKind = (roleId: string): RegistryToken<unknown> => ({ kind: `role:${roleId}` });

/** Roles are resolved only after registration; they affect session startup, never registration. */
function sessionActivationOrder(order: readonly string[], manifests: ReadonlyMap<string, PluginManifest>, preset: GamePreset, registries: RegistrySet, issues: Issue[]): string[] {
  const enabled = new Set(order);
  const edges = new Map<string, Map<string, string>>();
  for (const id of order) {
    const manifest = manifests.get(id)!;
    const deps = new Map<string, string>();
    for (const dep of Object.keys(manifest.dependencies)) deps.set(dep, `dependencies.${dep}`);
    for (const dep of Object.keys(manifest.optionalDependencies)) if (enabled.has(dep)) deps.set(dep, `optionalDependencies.${dep}`);
    for (const role of manifest.roleDependencies ?? []) {
      const provider = preset.roles[role]!;
      const owner = registries.ownerOf(roleKind(role), provider)!;
      if (owner !== id) deps.set(owner, `roleDependencies (${role} selects ${provider}, owned by ${owner})`);
    }
    edges.set(id, deps);
  }
  const remaining = new Map([...edges].map(([id, deps]) => [id, new Set(deps.keys())]));
  const result: string[] = [];
  while (remaining.size) {
    const ready = [...remaining.keys()].filter(id => remaining.get(id)!.size === 0).sort();
    if (!ready.length) {
      // Follow blocked edges to identify an actual cycle, excluding downstream dependents.
      const path: string[] = [];
      let current = [...remaining.keys()].sort()[0]!;
      while (!path.includes(current)) {
        path.push(current);
        current = [...remaining.get(current)!].sort()[0]!;
      }
      const cycle = path.slice(path.indexOf(current));
      const details = cycle.map((id, i) => {
        const dep = cycle[(i + 1) % cycle.length]!;
        return `"${id}" waits for "${dep}" via ${edges.get(id)!.get(dep)}`;
      });
      new Reporter(issues, cycle[0]!, 'roleDependencies').error(`Session activation cycle: ${details.join('; ')}. Select a different role provider or remove a dependency/roleDependencies edge to break the cycle.`);
      break;
    }
    const id = ready[0]!;
    result.push(id);
    remaining.delete(id);
    for (const deps of remaining.values()) deps.delete(id);
  }
  return result;
}

export class PluginHost {
  readonly options: HostOptions;
  session: Session | undefined;
  active: StagedGraph | undefined;
  readonly log: LogEntry[] = [];
  private catalog = new Map<string, { entry: CatalogEntry; manifest: PluginManifest }>();
  private broken: CatalogStatus[] = [];
  private epoch = 0;
  private generation = 0;

  constructor(options: HostOptions) {
    this.options = options;
  }

  // ---- catalog -------------------------------------------------------------------------------------------------------

  /** Replaces the installed catalog. Invalid or duplicate manifests are kept out and reported, never imported. */
  setCatalog(entries: readonly CatalogEntry[]): Issue[] {
    const { map, broken, issues } = this.buildCatalog(entries);
    this.catalog = map;
    this.broken = broken;
    return issues;
  }

  private buildCatalog(entries: readonly CatalogEntry[], base?: Map<string, { entry: CatalogEntry; manifest: PluginManifest }>): { map: Map<string, { entry: CatalogEntry; manifest: PluginManifest }>; broken: CatalogStatus[]; issues: Issue[] } {
    const map = new Map(base ?? []);
    const broken: CatalogStatus[] = [];
    const issues: Issue[] = [];
    const seen = new Set<string>();
    entries.forEach((entry, i) => {
      const local: Issue[] = [];
      const rawId = typeof (entry.manifest as { id?: unknown } | null)?.id === 'string' ? ((entry.manifest as { id: string }).id) : `catalog[${i}]`;
      const manifest = parseManifest(entry.manifest, new Reporter(local, rawId, 'manifest'));
      if (manifest && seen.has(manifest.id)) local.push({ source: manifest.id, path: 'manifest.id', message: `Duplicate plugin id "${manifest.id}" in the catalog. Only one version of a plugin can be installed.` });
      if (manifest && manifest.kind === 'code' && !entry.load) local.push({ source: manifest.id, path: 'manifest.kind', message: 'Code plugins must be compiled into the application; they cannot be imported as data.' });
      if (manifest && manifest.kind === 'content' && entry.load) local.push({ source: manifest.id, path: 'manifest.kind', message: 'Content packs cannot carry executable code.' });
      if (!manifest || local.length > 0) {
        broken.push({ id: rawId, manifest, origin: entry.origin ?? 'built-in', active: false, issues: local });
        issues.push(...local);
        return;
      }
      seen.add(manifest.id);
      map.set(manifest.id, { entry, manifest });
    });
    return { map, broken, issues };
  }

  installed(): Map<string, PluginManifest> {
    return new Map([...this.catalog].map(([id, e]) => [id, e.manifest]));
  }

  catalogEntry(id: string): CatalogEntry | undefined {
    return this.catalog.get(id)?.entry;
  }

  removeFromCatalog(id: string): void {
    if (this.active?.order.includes(id)) throw new Error(`Plugin "${id}" is active; apply a preset without it before removing it.`);
    this.catalog.delete(id);
  }

  catalogStatus(): CatalogStatus[] {
    const act = new Set(this.active?.order ?? []);
    return [...[...this.catalog.values()].map((e) => ({ id: e.manifest.id, manifest: e.manifest, origin: e.entry.origin ?? 'built-in', active: act.has(e.manifest.id), issues: [] as Issue[] })), ...this.broken].sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  // ---- staging -------------------------------------------------------------------------------------------------------

  /**
   * Resolves, loads, registers and validates a candidate plugin graph in isolated registries.
   * Never touches the active session or registries. Throws HostError with actionable issues on failure,
   * after disposing everything the attempt created.
   */
  async stage(rawPreset: unknown, extra: readonly CatalogEntry[] = [], opts: { skipValidation?: boolean } = {}): Promise<StagedGraph> {
    const issues: Issue[] = [];
    const preset = parsePreset(rawPreset, new Reporter(issues, 'preset'));
    if (!preset) throw new HostError('preset', issues);

    const cat = extra.length > 0 ? this.buildCatalog(extra, this.catalog) : { map: this.catalog, broken: [], issues: [] as Issue[] };
    if (cat.issues.length > 0) throw new HostError('catalog', cat.issues);
    const manifests = new Map([...cat.map].map(([id, e]) => [id, e.manifest]));

    const graph = resolveGraph(manifests, preset.plugins, this.options.sdkVersion);
    if (graph.issues.length > 0) throw new HostError('graph', graph.issues);

    // Plugin configuration: manifest defaults overlaid with preset values.
    const configs = new Map<string, Record<string, Json>>();
    for (const id of graph.order) {
      const m = manifests.get(id)!;
      const values: Record<string, Json> = {};
      const given = preset.config[id] ?? {};
      for (const [key, field] of Object.entries<ConfigField>(m.config)) {
        const v = key in given ? given[key]! : field.default;
        const err = checkConfigValue(field, v);
        if (err) issues.push({ source: 'preset', path: `config.${id}.${key}`, message: `${err} (plugin "${id}" setting "${field.label}")` });
        values[key] = v;
      }
      for (const key of Object.keys(given)) if (!(key in m.config)) issues.push({ source: 'preset', path: `config.${id}.${key}`, message: `plugin "${id}" has no setting named "${key}"` });
      configs.set(id, values);
    }
    for (const id of Object.keys(preset.config)) if (!graph.order.includes(id)) issues.push({ source: 'preset', path: `config.${id}`, message: `configuration given for "${id}", which is not an enabled plugin` });
    if (issues.length > 0) throw new HostError('preset', issues);

    // Import code only now that the graph is known to be valid.
    const modules = new Map<string, PluginModule>();
    for (const id of graph.order) {
      const load = cat.map.get(id)!.entry.load;
      if (!load) continue;
      try {
        const mod = await load();
        if (!mod || typeof mod.default !== 'object' || mod.default === null) throw new Error('module has no default export object');
        modules.set(id, mod.default);
      } catch (e) {
        throw new HostError('load', [{ source: id, path: 'module', message: `could not load plugin code: ${errText(e)}` }], id);
      }
    }

    const registries = new RegistrySet();
    const scope = new Scope('host', 'registration', undefined, this.sink);
    const contentKinds = new Map<string, { loader: ContentKind; owner: string }>();
    const validators: { fn: (v: ValidationContext) => void; owner: string }[] = [];
    const reader = readerOf(registries);
    const fail = (stage: HostStage, pluginId?: string): never => {
      scope.dispose();
      registries.clear();
      throw new HostError(stage, issues, pluginId);
    };

    for (const id of graph.order) {
      const manifest = manifests.get(id)!;
      const loadContent = (kind: string, cid: string, data: Json, r: Reporter): void => {
        const k = contentKinds.get(kind);
        if (!k) {
          r.error(`no enabled plugin understands content kind "${kind}". Known kinds: ${[...contentKinds.keys()].join(', ') || '(none)'}. Add the plugin that defines it to this pack's dependencies.`);
          return;
        }
        try {
          k.loader.load(data, { owner: id, id: cid, r, registries: reader, register: (t, rid, v) => registries.register(t, rid, v, id) });
        } catch (e) {
          r.error(errText(e));
        }
      };
      const ctx: RegisterContext = {
        pluginId: id,
        manifest,
        config: configs.get(id)!,
        scope: scope.child(`register:${id}`, id),
        registries: reader,
        register: (t, rid, v) => registries.register(t, rid, v, id),
        provideRole: (role, rid, provider) => registries.register(roleKind(role.id), rid, provider, id),
        contentKind: (kind, loader) => {
          const prev = contentKinds.get(kind);
          if (prev) throw new Error(`Content kind "${kind}" is already defined by "${prev.owner}"; "${id}" cannot define it again.`);
          contentKinds.set(kind, { loader, owner: id });
        },
        defineContent: (kind, cid, data) => loadContent(kind, cid, data, new Reporter(issues, id, `content(${kind} "${cid}")`)),
        addValidator: (fn) => void validators.push({ fn, owner: id }),
      };
      try {
        modules.get(id)?.register?.(ctx);
      } catch (e) {
        issues.push({ source: id, path: 'register()', message: errText(e) });
        fail('register', id);
      }
      const rawContent = cat.map.get(id)!.entry.content;
      if (rawContent !== undefined) {
        const entries: ContentEntry[] | undefined = parseContentEntries(rawContent, new Reporter(issues, id, 'content'));
        for (const [i, e] of (entries ?? []).entries()) loadContent(e.kind, e.id, e.data, new Reporter(issues, id, `content[${i}](${e.kind} "${e.id}").data`));
      }
      if (issues.length > 0) fail('register', id);
    }

    if (opts.skipValidation) return { preset, order: graph.order, activationOrder: [...graph.order], manifests, modules, registries, scope, configs, contentKinds, extra: [...extra] };

    // Cross-reference validation over the complete selection.
    const vctx: ValidationContext = {
      registries: reader,
      preset,
      activePlugins: graph.order,
      selectedRole: (role) => preset.roles[role.id],
      roleProviders: <T>(role: RoleToken<T>) => reader.entries<T>({ kind: `role:${role.id}` }),
      reporter: (source, path) => new Reporter(issues, source, path),
    };
    const requiredRoles = new Map<string, string>();
    for (const id of graph.order) {
      const manifest = manifests.get(id)!;
      for (const role of [...manifest.requiresRoles, ...(manifest.roleDependencies ?? [])]) if (!requiredRoles.has(role)) requiredRoles.set(role, id);
    }
    const offered = new Map<string, RegistryEntry<unknown>[]>();
    for (const kind of Object.keys(registries.summary())) if (kind.startsWith('role:')) offered.set(kind.slice(5), registries.entries({ kind }));
    for (const [role, by] of requiredRoles) {
      if (preset.roles[role] === undefined) {
        const have = (offered.get(role) ?? []).map((e) => `"${e.id}" (from ${e.owner})`);
        issues.push({ source: 'preset', path: `roles.${role}`, message: `plugin "${by}" requires a provider for exclusive role "${role}", but the preset selects none. ${have.length ? `Available: ${have.join(', ')}.` : 'No enabled plugin offers one.'}` });
      }
    }
    for (const [role, list] of offered) {
      if (preset.roles[role] === undefined && list.length > 1 && !requiredRoles.has(role))
        issues.push({ source: 'preset', path: `roles.${role}`, message: `ambiguous exclusive role "${role}": ${list.map((e) => `"${e.id}" (from ${e.owner})`).join(' and ')} are all enabled. Select exactly one in the preset.` });
    }
    for (const [role, pid] of Object.entries(preset.roles)) {
      if (!registries.has(roleKind(role), pid)) {
        const have = (offered.get(role) ?? []).map((e) => `"${e.id}"`);
        issues.push({ source: 'preset', path: `roles.${role}`, message: `selected provider "${pid}" is not offered by any enabled plugin. ${have.length ? `Available for this role: ${have.join(', ')}.` : `No enabled plugin offers role "${role}".`}` });
      }
    }
    for (const v of validators) {
      try {
        v.fn(vctx);
      } catch (e) {
        issues.push({ source: v.owner, path: 'validator', message: errText(e) });
      }
    }
    if (issues.length > 0) fail('validate');

    const activationOrder = sessionActivationOrder(graph.order, manifests, preset, registries, issues);
    if (issues.length > 0) fail('validate');
    return { preset, order: graph.order, activationOrder, manifests, modules, registries, scope, configs, contentKinds, extra: [...extra] };
  }

  /**
   * Lists what every installed plugin WOULD contribute (registry kind, id, owner, display name), by registering the
   * whole catalog into throwaway registries. Used by tooling to offer choices (maps, role providers) for plugins that
   * are not active. Never touches the running session. Plugins that cannot be registered together are skipped.
   */
  async survey(): Promise<{ kind: string; id: string; owner: string; name: string }[]> {
    let ids = [...this.catalog.keys()].sort();
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const staged = await this.stage({ schema: 1, id: 'host/survey', name: 'survey', plugins: ids }, [], { skipValidation: true });
        const out: { kind: string; id: string; owner: string; name: string }[] = [];
        for (const kind of Object.keys(staged.registries.summary()))
          for (const e of staged.registries.entries<unknown>({ kind })) {
            const n = (e.value as { name?: unknown } | null)?.name;
            out.push({ kind, id: e.id, owner: e.owner, name: typeof n === 'string' ? n : e.id });
          }
        this.discard(staged);
        return out;
      } catch (e) {
        if (!(e instanceof HostError)) throw e;
        const bad = new Set(e.issues.map((i) => i.source));
        if (e.pluginId) bad.add(e.pluginId);
        const next = ids.filter((id) => !bad.has(id));
        if (next.length === ids.length) return [];
        ids = next;
      }
    }
    return [];
  }

  /** Disposes a staged graph that will not be used. */
  discard(staged: StagedGraph): void {
    if (staged === this.active) return;
    staged.scope.dispose();
    staged.registries.clear();
  }

  // ---- sessions ------------------------------------------------------------------------------------------------------

  /**
   * Validates the candidate first (the running session is untouched if that fails), then stops the old session,
   * disposes its registrations, and starts a fresh session on fresh registries.
   */
  async apply(rawPreset: unknown, extra: readonly CatalogEntry[] = []): Promise<Session> {
    const my = ++this.epoch;
    const staged = await this.stage(rawPreset, extra);
    if (my !== this.epoch) {
      this.discard(staged);
      throw new HostError('superseded', [{ source: 'host', path: 'apply', message: 'a newer apply request replaced this one' }]);
    }
    this.stop();
    if (staged.extra.length > 0) {
      const merged = this.buildCatalog(staged.extra, this.catalog);
      this.catalog = merged.map;
    }
    this.active = staged;
    try {
      return await this.startSession(staged, this.epoch);
    } catch (e) {
      // A superseded attempt already cleaned up after itself; whatever is active now belongs to the newer request.
      if (!(e instanceof HostError && e.stage === 'superseded')) this.stop();
      throw e;
    }
  }

  /** Restarts the active graph with a brand-new session (same registrations). */
  async restart(): Promise<Session> {
    const staged = this.active;
    if (!staged) throw new Error('Nothing to restart: no preset is active.');
    const my = ++this.epoch;
    this.session?.dispose();
    this.session = undefined;
    try {
      return await this.startSession(staged, my);
    } catch (e) {
      // A superseded attempt already cleaned up after itself; whatever is active now belongs to the newer request.
      if (!(e instanceof HostError && e.stage === 'superseded')) this.stop();
      throw e;
    }
  }

  /** Stops the session and disposes the active registrations. Idempotent. */
  stop(): void {
    this.epoch++;
    this.session?.dispose();
    this.session = undefined;
    if (this.active) {
      const a = this.active;
      this.active = undefined;
      a.scope.dispose();
      a.registries.clear();
    }
  }

  private async startSession(staged: StagedGraph, epoch: number): Promise<Session> {
    const session = new Session(++this.generation, staged.preset, staged.activationOrder, staged.registries, this.options.phases, this.sink);
    this.session = session;
    const reader = readerOf(staged.registries);
    const contexts = session.contexts;
    const alive = (): boolean => !session.disposed && epoch === this.epoch && this.session === session;
    let current = 'host';
    try {
      this.options.installHostServices?.(session, session.scope);
      for (const id of staged.activationOrder) {
        current = id;
        const ctx = this.makeContext(session, staged, id, reader);
        contexts.set(id, ctx);
        await staged.modules.get(id)?.activate?.(ctx);
        if (!alive()) throw new Error('session was disposed while activating');
      }
      // Selected role providers start after every plugin is active: owner order first, then role id.
      const selected = Object.entries(staged.preset.roles)
        .map(([role, pid]) => ({ role, pid, owner: staged.registries.ownerOf(roleKind(role), pid)! }))
        .sort((a, b) => staged.activationOrder.indexOf(a.owner) - staged.activationOrder.indexOf(b.owner) || (a.role < b.role ? -1 : 1));
      for (const s of selected) {
        current = s.owner;
        const provider = staged.registries.get(roleKind(s.role), s.pid) as Partial<ActivatableProvider> | undefined;
        if (provider && typeof provider.activate === 'function') {
          await provider.activate(contexts.get(s.owner)!);
          if (!alive()) throw new Error('session was disposed while activating');
        }
      }
    } catch (e) {
      const superseded = !alive();
      session.dispose();
      if (this.session === session) this.session = undefined;
      if (superseded) throw new HostError('superseded', [{ source: 'host', path: 'activate', message: 'the session was stopped or replaced while it was starting' }]);
      this.push('error', current, `activation failed: ${errText(e)}`, 0);
      throw new HostError('activate', [{ source: current, path: 'activate()', message: errText(e) }], current);
    }
    session.entities.flush();
    session.state = 'running';
    return session;
  }

  private makeContext(session: Session, staged: StagedGraph, id: string, reader: RegistryReader): SessionContext {
    const scope = session.scope.child(`plugin:${id}`, id);
    session.pluginScopes.set(id, scope);
    const ents = session.entities;
    const sched = session.scheduler;
    const world: EntityApi = {
      create: () => ents.create(id),
      destroy: (e) => ents.destroy(e),
      isAlive: (e) => ents.isAlive(e),
      add: (e, t, d) => ents.add(e, t, d),
      get: (e, t) => ents.get(e, t),
      has: (e, t) => ents.has(e, t),
      remove: (e, t) => ents.remove(e, t),
      each: (t, fn) => ents.each(t, fn),
      first: (t) => ents.first(t),
      count: (t) => ents.count(t),
      ownerOf: (e) => ents.ownerOf(e),
      query: (spec) => {
        const q = ents.query(spec);
        scope.add(() => q.dispose(), 'query');
        return q;
      },
      markChanged: (e, t) => ents.markChanged(e, t),
    };
    const log = (level: LogEntry['level']) => (msg: string) => this.push(level, id, msg, sched.tick);
    return {
      pluginId: id,
      manifest: staged.manifests.get(id)!,
      config: staged.configs.get(id)!,
      scope,
      signal: scope.signal,
      registries: reader,
      preset: staged.preset,
      world,
      systems: {
        add: (def) => void scope.add(sched.addSystem(def, id), 'system'),
        addFrame: (def) => void scope.add(sched.addFrameSystem(def, id), 'system'),
      },
      events: { on: (t, fn) => session.events.on(t, fn, id, scope), emit: (t, p) => session.events.emit(t, p) },
      commands: { handle: (t, fn) => session.commands.handle(t, fn, id, scope), dispatch: (t, p) => session.commands.dispatch(t, p) },
      services: { provide: (t, impl) => session.services.provide(t, impl, id, scope), get: (t) => session.services.get(t), tryGet: (t) => session.services.tryGet(t) },
      time: {
        get tick() {
          return sched.tick;
        },
        get now() {
          return sched.time;
        },
        step: sched.step,
      },
      rng: createRng((staged.preset.seed ^ hashString(id)) >>> 0),
      cosmeticRng: createRng((Date.now() ^ hashString(id)) >>> 0),
      log: { info: log('info'), warn: log('warn'), error: log('error') },
      role: (role) => {
        const pid = staged.preset.roles[role.id];
        if (pid === undefined) return undefined;
        const provider = staged.registries.get(roleKind(role.id), pid);
        return provider === undefined ? undefined : { id: pid, provider: provider as never };
      },
      guard: (p) => scope.guard(p),
      instantiate: (token, iid, start) => {
        const key = `${token.kind}\n${iid}`;
        if (session.instances.has(key)) return session.instances.get(key) as never;
        const def = staged.registries.require(token, iid);
        const owner = staged.registries.ownerOf(token, iid)!;
        const octx = session.contexts.get(owner);
        if (!octx) throw new Error(`Cannot instantiate ${token.kind} "${iid}" yet: its owner "${owner}" has not been activated. Declare a dependency on "${owner}" or defer the call until a system runs.`);
        const inst = start(def, octx);
        session.instances.set(key, inst);
        return inst;
      },
    };
  }

  // ---- diagnostics ---------------------------------------------------------------------------------------------------

  private sink = (error: unknown, owner: string, kind: string): void => this.push('error', owner, `cleanup of ${kind} failed: ${errText(error)}`, this.session?.scheduler.tick ?? 0);

  private push(level: LogEntry['level'], source: string, message: string, tick: number): void {
    const entry: LogEntry = { level, source, message, tick };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.options.onLog?.(entry);
  }

  /** Counts of everything owned right now; compare across restarts to detect leaks. */
  resourceReport(): { registrations: number; registrationScope: number; sessionScope: number; entities: number; systems: number; eventHandlers: number; commandHandlers: number; services: number; byOwner: Record<string, Record<string, number>> } {
    const s = this.session;
    const byOwner: Record<string, Record<string, number>> = {};
    this.active?.scope.stats(byOwner);
    s?.scope.stats(byOwner);
    return {
      registrations: this.active?.registries.total() ?? 0,
      registrationScope: this.active?.scope.size() ?? 0,
      sessionScope: s?.scope.size() ?? 0,
      entities: s?.entities.count() ?? 0,
      systems: s?.scheduler.systemCount() ?? 0,
      eventHandlers: s?.events.handlerCount() ?? 0,
      commandHandlers: s?.commands.handlerCount() ?? 0,
      services: s?.services.list().length ?? 0,
      byOwner,
    };
  }
}

function readerOf(r: RegistrySet): RegistryReader {
  return {
    get: (t, id) => r.get(t, id),
    require: (t, id) => r.require(t, id),
    has: (t, id) => r.has(t, id),
    ownerOf: (t, id) => r.ownerOf(t, id),
    entries: (t) => r.entries(t),
    ids: (t) => r.ids(t),
  };
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
