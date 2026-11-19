import type { CatalogEntry } from '../sdk/index.ts';
import { HostError, errText } from '../kernel/host.ts';
import type { CatalogStatus, PluginHost } from '../kernel/host.ts';
import { PACK_SCHEMA, PRESET_SCHEMA, parsePreset } from '../kernel/manifest.ts';
import type { ConfigField, GamePreset, PluginManifest } from '../kernel/manifest.ts';
import { dependentsOf } from '../kernel/resolver.ts';
import type { Issue, Json } from '../kernel/validate.ts';
import { Reporter } from '../kernel/validate.ts';
import { CREATOR_CSS } from './creator-styles.ts';
import { createGameComposer } from './game-composer.ts';
import providerCatalog from './catalog-providers.json' with { type: 'json' };
import type { DevTools } from '../platform/devtools.ts';
import type { Inspector } from './inspector.ts';

export interface FrameStats {
  fps: number;
  /** Average milliseconds of CPU work per rendered frame (simulation + render submission). */
  frameMs: number;
  /** Worst frame time (ms) over the last second. */
  worstMs: number;
  ticksLastFrame: number;
  droppedTime: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  width: number;
  height: number;
  pixelRatio: number;
  /** GPU ms per frame (EXT_disjoint_timer_query_webgl2), measured while the perf HUD is open; undefined otherwise. */
  gpuMs?: number;
}

export type ApplyResult = { ok: true } | { ok: false; error: unknown };

/** Everything the creator/dev panel may touch. It never reaches into the game loop directly. */
export interface CreatorApi {
  host: PluginHost;
  builtinPresets: readonly unknown[];
  /** Validates the complete selection in isolation, then restarts on it. On failure the running game is untouched. */
  apply(preset: unknown, extra?: CatalogEntry[]): Promise<ApplyResult>;
  frameStats(): FrameStats;
  assets(): { key: string; refs: number; owners: string[] }[];
  counts(): { uiRoots: number; sceneRoots: number; audioVoices: number };
  /** Dev tools core (lazy). Enables the Inspect tab. */
  dev?(): Promise<DevTools>;
}

export interface CreatorPanel {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------------------------------------------------

const MAX_IMPORT_BYTES = 1024 * 1024;
const REFRESH_MS = 250;
const STYLE_ATTR = 'data-creator-style';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void, cls = '', fk?: string): HTMLButtonElement {
  const b = h('button', `creator-btn ${cls}`.trim(), label);
  b.type = 'button';
  if (fk) b.dataset['fk'] = fk;
  b.addEventListener('click', onClick);
  return b;
}

function heading(text: string): HTMLElement {
  return h('div', 'creator-h', text);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

type ViewKind = 'ok' | 'error' | 'warn' | 'info';
interface ResultView {
  kind: ViewKind;
  title: string;
  lines?: string[];
  issues?: Issue[];
}

function renderResult(v: ResultView, actions?: HTMLElement): HTMLElement {
  const box = h('div', 'creator-box');
  box.dataset['k'] = v.kind;
  box.setAttribute('role', v.kind === 'error' ? 'alert' : 'status');
  box.append(h('strong', '', v.title));
  for (const l of v.lines ?? []) box.append(h('p', '', l));
  if (v.issues && v.issues.length > 0) {
    const ul = h('ul', 'creator-issues');
    for (const i of v.issues) {
      const li = h('li');
      li.append(h('span', 'creator-src', i.source), document.createTextNode(' · '), h('span', 'creator-path', i.path), document.createTextNode(` · ${i.message}`));
      ul.append(li);
    }
    box.append(ul);
  }
  if (actions) box.append(actions);
  return box;
}

// ---------------------------------------------------------------------------------------------------------------------
// Debug view building blocks (update text nodes in place)
// ---------------------------------------------------------------------------------------------------------------------

interface Kv {
  el: HTMLElement;
  set(label: string, text: string): void;
}

function makeKv(title: string, labels: string[]): Kv {
  const ul = h('ul', 'creator-kv');
  ul.append(h('h4', '', title));
  const nodes = new Map<string, Text>();
  for (const label of labels) {
    const li = h('li');
    const v = h('span', 'v');
    const t = document.createTextNode('—');
    v.append(t);
    li.append(h('span', 'k', label), h('span', 'd'), v);
    ul.append(li);
    nodes.set(label, t);
  }
  return {
    el: ul,
    set(label, text) {
      const t = nodes.get(label);
      if (t && t.data !== text) t.data = text;
    },
  };
}

interface SyncRow {
  key: string;
  cells: string[];
  cls?: string;
}
interface SyncTable {
  el: HTMLElement;
  update(rows: SyncRow[]): void;
}

function makeSyncTable(columns: { label: string; num?: boolean }[], emptyText: string): SyncTable {
  const wrap = h('div', 'creator-scrolltable');
  const table = h('table', 'creator-table');
  const head = h('tr');
  for (const c of columns) head.append(h('th', c.num ? 'creator-num' : '', c.label));
  const thead = h('thead');
  thead.append(head);
  table.append(thead);
  const tbody = h('tbody');
  table.append(tbody);
  const empty = h('div', 'creator-empty', emptyText);
  wrap.append(table, empty);
  const rows = new Map<string, { tr: HTMLTableRowElement; tds: HTMLTableCellElement[] }>();
  return {
    el: wrap,
    update(list) {
      const seen = new Set<string>();
      list.forEach((r, i) => {
        seen.add(r.key);
        let row = rows.get(r.key);
        if (!row) {
          const tr = h('tr');
          const tds = columns.map((c) => {
            const td = h('td', c.num ? 'creator-num' : '');
            tr.append(td);
            return td;
          });
          row = { tr, tds };
          rows.set(r.key, row);
        }
        const cls = r.cls ?? '';
        if (row.tr.className !== cls) row.tr.className = cls;
        row.tds.forEach((td, ci) => {
          const text = r.cells[ci] ?? '';
          if (td.textContent !== text) td.textContent = text;
        });
        if (tbody.children[i] !== row.tr) tbody.insertBefore(row.tr, tbody.children[i] ?? null);
      });
      for (const [k, row] of rows)
        if (!seen.has(k)) {
          row.tr.remove();
          rows.delete(k);
        }
      empty.hidden = list.length > 0;
      table.hidden = list.length === 0;
    },
  };
}

const fmt = (n: number, d = 1): string => (Number.isFinite(n) ? n.toFixed(d) : '—');

interface DebugView {
  el: HTMLElement;
  update(): void;
}

function createDebugView(api: CreatorApi): DebugView {
  const host = api.host;
  const el = h('div');
  const frame = makeKv('Frame timing', ['FPS', 'CPU ms / frame', 'Worst frame ms', 'Ticks last frame', 'Dropped time', 'Resolution']);
  const render = makeKv('Render', ['Draw calls', 'Triangles', 'Geometries', 'Textures']);
  const sess = makeKv('Session', ['State', 'Tick', 'Sim time', 'Preset']);
  const counts = makeKv('UI / scene / audio', ['UI roots', 'Scene roots', 'Audio voices']);
  const res = makeKv('Host resources', ['Registrations', 'Registration scope', 'Session scope', 'Entities', 'Systems', 'Event handlers', 'Command handlers', 'Services']);
  const grid = h('div', 'creator-kv-grid');
  grid.append(frame.el, render.el, sess.el, counts.el, res.el);
  el.append(grid);

  const systems = makeSyncTable([{ label: 'System' }, { label: 'Owner' }, { label: 'Phase' }, { label: 'Order', num: true }, { label: 'Avg ms', num: true }], 'No active systems (no running session).');
  const entities = makeSyncTable([{ label: 'Owner' }, { label: 'Entities', num: true }], 'No entities.');
  const owned = makeSyncTable([{ label: 'Plugin' }, { label: 'Resources (kind: count)' }], 'No owned resources.');
  const assets = makeSyncTable([{ label: 'Key' }, { label: 'Refs', num: true }, { label: 'Owners' }], 'No shared assets.');
  const registry = makeSyncTable([{ label: 'Kind' }, { label: 'Owner' }, { label: 'Count', num: true }], 'No registry contributions (nothing active).');
  const log = makeSyncTable([{ label: 'Level' }, { label: 'Source' }, { label: 'Message' }], 'Log is empty.');
  el.append(heading('Active systems'), systems.el, heading('Entities per owner'), entities.el, heading('Resource ownership per plugin'), owned.el, heading('Shared assets'), assets.el, heading('Registry contributions'), registry.el, heading('Host log (last 30)'), log.el);

  return {
    el,
    update() {
      const fs = api.frameStats();
      frame.set('FPS', fmt(fs.fps));
      frame.set('CPU ms / frame', fmt(fs.frameMs, 2));
      frame.set('Worst frame ms', fmt(fs.worstMs));
      frame.set('Ticks last frame', String(fs.ticksLastFrame));
      frame.set('Dropped time', `${fmt(fs.droppedTime, 2)} s`);
      frame.set('Resolution', `${fs.width}×${fs.height} @${fmt(fs.pixelRatio, 2)}x`);
      render.set('Draw calls', String(fs.calls));
      render.set('Triangles', String(fs.triangles));
      render.set('Geometries', String(fs.geometries));
      render.set('Textures', String(fs.textures));

      const s = host.session;
      sess.set('State', s ? `${s.state}${s.scheduler.paused ? ' (paused)' : ''}` : 'none');
      sess.set('Tick', s ? String(s.scheduler.tick) : '—');
      sess.set('Sim time', s ? `${fmt(s.scheduler.time, 2)} s` : '—');
      sess.set('Preset', host.active?.preset.id ?? '—');
      const c = api.counts();
      counts.set('UI roots', String(c.uiRoots));
      counts.set('Scene roots', String(c.sceneRoots));
      counts.set('Audio voices', String(c.audioVoices));
      const rr = host.resourceReport();
      res.set('Registrations', String(rr.registrations));
      res.set('Registration scope', String(rr.registrationScope));
      res.set('Session scope', String(rr.sessionScope));
      res.set('Entities', String(rr.entities));
      res.set('Systems', String(rr.systems));
      res.set('Event handlers', String(rr.eventHandlers));
      res.set('Command handlers', String(rr.commandHandlers));
      res.set('Services', String(rr.services));

      systems.update((s?.scheduler.describe() ?? []).map((d) => ({ key: `${d.owner}|${d.id}`, cells: [d.id, d.owner, d.phase, String(d.order), fmt(d.ms, 3)] })));
      entities.update(Object.entries(s?.entities.countsByOwner() ?? {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([o, n]) => ({ key: o, cells: [o, String(n)] })));
      owned.update(
        Object.entries(rr.byOwner)
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([o, kinds]) => ({ key: o, cells: [o, Object.entries(kinds).map(([k, n]) => `${k}: ${n}`).join(', ')] })),
      );
      assets.update(api.assets().map((a) => ({ key: a.key, cells: [a.key, String(a.refs), a.owners.join(', ')] })));
      const rows: SyncRow[] = [];
      for (const [kind, owners] of Object.entries(host.active?.registries.summary() ?? {})) for (const [owner, n] of Object.entries(owners)) rows.push({ key: `${kind}|${owner}`, cells: [kind, owner, String(n)] });
      registry.update(rows);
      log.update(
        host.log
          .slice(-30)
          .reverse()
          .map((e, i) => ({ key: String(i), cls: `creator-lv-${e.level}`, cells: [e.level, e.source, e.message] })),
      );
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------------------------------------------------

type TabId = 'plugins' | 'content' | 'canvas' | 'debug' | 'inspect';
type SurveyItem = { kind: string; id: string; owner: string; name: string };

interface Draft {
  id: string;
  name: string;
  plugins: string[];
  roles: Record<string, string>;
  options: Record<string, Json>;
  config: Record<string, Record<string, Json>>;
  seed: number;
}

const SELECTORS: { label: string; kind: string; role?: string; option?: string; none: string }[] = [
  { label: 'Experience', kind: 'role:sdk/experience', role: 'sdk/experience', none: '(legacy first-person controls)' },
  { label: 'Map', kind: 'map', option: 'map', none: '(none)' },
  { label: 'Controller', kind: 'role:sdk/controller', role: 'sdk/controller', none: '(not selected)' },
  { label: 'Camera', kind: 'role:sdk/camera', role: 'sdk/camera', none: '(not selected)' },
  { label: 'Game mode', kind: 'role:sdk/mode', role: 'sdk/mode', none: '(not selected)' },
  { label: 'HUD', kind: 'role:sdk/hud', role: 'sdk/hud', none: '(none)' },
  { label: 'Theme', kind: 'role:sdk/theme', role: 'sdk/theme', none: '(not selected)' },
];

export function createCreatorPanel(container: HTMLElement, api: CreatorApi): CreatorPanel {
  const host = api.host;
  const doc = container.ownerDocument;

  // ---- state ---------------------------------------------------------------------------------------------------------
  let isOpen = false;
  let disposed = false;
  let tab: TabId = 'plugins';
  let renderedTab: TabId | undefined;
  let busy = false;
  let dirty = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();

  const builtins: GamePreset[] = [];
  for (const raw of api.builtinPresets) {
    const p = parsePreset(raw, new Reporter([], 'preset'));
    if (p) builtins.push(p);
  }
  const toDraft = (p: GamePreset): Draft => ({ id: p.id, name: p.name, plugins: [...p.plugins], roles: clone(p.roles), options: clone(p.options), config: clone(p.config), seed: p.seed });
  const baseline = (): Draft => {
    const p = host.active?.preset ?? builtins[0];
    return p ? toDraft(p) : { id: 'creator/draft', name: 'Draft', plugins: [], roles: {}, options: {}, config: {}, seed: 1 };
  };
  let draft: Draft = baseline();

  let survey: SurveyItem[] | undefined;
  let surveyBusy = false;
  let surveyEpoch = 0;
  let refusal: { id: string; dependents: string[] } | undefined;
  let planResult: ResultView | undefined;
  let contentResult: ResultView | undefined;
  let pasteText = '';
  let exportView: { title: string; filename: string; text: string; status?: string } | undefined;

  // ---- static DOM ----------------------------------------------------------------------------------------------------
  const style = h('style');
  style.setAttribute(STYLE_ATTR, '');
  style.textContent = CREATOR_CSS;
  doc.head.append(style);

  const root = h('aside', 'creator-panel');
  root.hidden = true;
  root.setAttribute('aria-label', 'Creator tools');
  root.dataset['open'] = '0';
  const head = h('div', 'creator-head');
  head.append(h('h2', 'creator-title', 'Creator tools'), h('span', 'creator-hint', '` or Esc closes'));
  const closeBtn = button('×', () => close(), 'creator-close');
  closeBtn.setAttribute('aria-label', 'Close creator tools');
  head.append(closeBtn);
  const tabs = h('div', 'creator-tabs');
  tabs.setAttribute('role', 'tablist');
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const [id, label] of [['plugins', 'Plugins & preset'], ['content', 'Content'], ['canvas', 'Canvas'], ['debug', 'Debug'], ['inspect', 'Inspect']] as const) {
    if (id === 'inspect' && !api.dev) continue;
    const b = h('button', 'creator-tab', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset['tab'] = id;
    b.addEventListener('click', () => setTab(id));
    tabs.append(b);
    tabButtons.set(id, b);
  }
  const body = h('div', 'creator-body');
  const foot = h('div', 'creator-foot');
  const validateBtn = button('Validate', () => void validate(), '', 'validate');
  const applyBtn = button('Apply & restart', () => void applyDraft(), 'creator-primary', 'apply');
  const resetBtn = button('Reset draft', () => resetDraft(), '', 'reset');
  foot.append(validateBtn, applyBtn, resetBtn);
  root.append(head, tabs, body, foot);
  container.append(root);

  const debug = createDebugView(api);
  let inspector: Inspector | undefined;
  let inspectorLoading = false;
  const loadInspector = (): void => {
    if (inspector || inspectorLoading || !api.dev) return;
    inspectorLoading = true;
    void Promise.all([api.dev(), import('./inspector.ts')]).then(([dev, m]) => {
      if (disposed) return;
      inspector = m.createInspector(dev, doc);
      if (tab === 'inspect') render();
    }, (e: unknown) => { inspectorLoading = false; console.warn('inspector failed to load', e); });
  };
  const composer = createGameComposer({ host: api.host, builtinPresets: api.builtinPresets, apply: (preset, extra) => api.apply(preset, extra) });

  // ---- keyboard ------------------------------------------------------------------------------------------------------
  const isEditable = (t: EventTarget | null): boolean => {
    if (!(t instanceof HTMLElement)) return false;
    if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
    return t instanceof HTMLInputElement && !['checkbox', 'button', 'file', 'radio'].includes(t.type);
  };
  const onRootKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      close();
      return;
    }
    // Typing (including a backquote) in a field must not reach the game's global shortcuts.
    if (isEditable(e.target)) e.stopPropagation();
  };
  root.addEventListener('keydown', onRootKey);
  root.addEventListener('keyup', (e) => {
    if (isEditable(e.target)) e.stopPropagation();
  });
  const onDocKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') close();
  };

  // ---- timers --------------------------------------------------------------------------------------------------------
  function syncTimer(): void {
    const want = isOpen && !disposed && (tab === 'debug' || tab === 'inspect');
    if (want && timer === undefined) {
      const tickView = (): void => { if (tab === 'debug') debug.update(); else inspector?.update(); };
      tickView();
      timer = setInterval(tickView, REFRESH_MS);
    } else if (!want && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  // ---- draft helpers -------------------------------------------------------------------------------------------------
  const installedMap = (): Map<string, PluginManifest> => host.installed();

  function exportDraft(): Record<string, unknown> {
    const config: Record<string, Record<string, Json>> = {};
    for (const id of draft.plugins) {
      const c = draft.config[id];
      if (c && Object.keys(c).length > 0) config[id] = clone(c);
    }
    const options = clone(draft.options);
    if (options['map'] === undefined || options['map'] === '') delete options['map'];
    const roles: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft.roles)) if (v) roles[k] = v;
    return { schema: PRESET_SCHEMA, id: draft.id, name: draft.name, plugins: [...draft.plugins], roles, options, config, seed: draft.seed };
  }

  function touch(): void {
    dirty = true;
    planResult = undefined;
  }

  function removePlugins(ids: string[]): void {
    draft.plugins = draft.plugins.filter((p) => !ids.includes(p));
    for (const id of ids) delete draft.config[id];
  }

  /** Every installed plugin that `id` needs, transitively (not including `id`). */
  function requiredClosure(id: string): string[] {
    const installed = installedMap();
    const out: string[] = [];
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const dep of Object.keys(installed.get(cur)?.dependencies ?? {})) {
        if (dep === id || out.includes(dep)) continue;
        out.push(dep);
        stack.push(dep);
      }
    }
    return out;
  }

  function onToggle(id: string, on: boolean): void {
    refusal = undefined;
    if (on) {
      if (!draft.plugins.includes(id)) draft.plugins.push(id);
      touch();
    } else {
      const deps = dependentsOf(installedMap(), draft.plugins, id);
      if (deps.length > 0) refusal = { id, dependents: deps };
      else {
        removePlugins([id]);
        touch();
      }
    }
    render();
  }

  function resyncFromActive(): void {
    draft = baseline();
    dirty = false;
    refusal = undefined;
  }

  function resetDraft(): void {
    resyncFromActive();
    planResult = { kind: 'info', title: 'Draft reset', lines: [host.active ? 'The draft now matches the running preset.' : 'The draft now matches the default preset.'] };
    render();
  }

  // ---- survey --------------------------------------------------------------------------------------------------------
  async function loadSurvey(): Promise<void> {
    const my = ++surveyEpoch;
    surveyBusy = true;
    if (isOpen && tab === 'plugins') render();
    let result: SurveyItem[] = [];
    try {
      result = await host.survey();
    } catch {
      result = [];
    }
    if (my !== surveyEpoch || disposed) return;
    // The host survey has a 64-plugin staging bound. Merge the generated role-provider catalog so larger builds
    // still offer every provider, without guessing ownership from provider names.
    const generated = providerCatalog as unknown as { providers?: Record<string, Record<string, string[]>>; maps?: Record<string, { id: string; name: string }[]> };
    const merged = new Map(result.map(item => [`${item.kind}\u0000${item.id}\u0000${item.owner}`, item]));
    for (const [owner, roles] of Object.entries(generated.providers ?? {})) for (const [role, providers] of Object.entries(roles)) for (const id of providers)
      merged.set(`role:${role}\u0000${id}\u0000${owner}`, { kind: `role:${role}`, id, owner, name: id });
    for (const [owner, maps] of Object.entries(generated.maps ?? {})) for (const map of maps)
      merged.set(`map\u0000${map.id}\u0000${owner}`, { kind: 'map', id: map.id, owner, name: map.name });
    survey = [...merged.values()];
    surveyBusy = false;
    if (isOpen && tab === 'plugins') render();
  }

  // ---- actions -------------------------------------------------------------------------------------------------------
  function setBusy(b: boolean): void {
    busy = b;
    validateBtn.disabled = b;
    applyBtn.disabled = b;
    resetBtn.disabled = b;
  }

  const gameStatusLine = (): string => (host.session ? 'The running game was not changed.' : 'No game session is running right now.');

  function errorView(title: string, e: unknown): ResultView {
    if (e instanceof HostError) return { kind: 'error', title: `${title} (stage: ${e.stage})`, issues: e.issues, lines: [gameStatusLine()] };
    return { kind: 'error', title, lines: [errText(e), gameStatusLine()] };
  }

  function scrollToResult(): void {
    body.querySelector('[data-result]')?.scrollIntoView({ block: 'nearest' });
  }

  async function safeApply(preset: unknown, extra?: CatalogEntry[]): Promise<ApplyResult> {
    try {
      return await api.apply(preset, extra);
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  async function validate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const staged = await host.stage(exportDraft());
      host.discard(staged);
      planResult = { kind: 'ok', title: 'Selection is valid', lines: [`${staged.order.length} plugins resolved in isolation; the running game was not touched.`] };
    } catch (e) {
      planResult = errorView('Selection is not valid', e);
    }
    setBusy(false);
    render();
    scrollToResult();
  }

  async function applyDraft(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const r = await safeApply(exportDraft());
    if (r.ok) {
      resyncFromActive();
      planResult = { kind: 'ok', title: 'Applied', lines: [`Restarted on "${host.active?.preset.name ?? draft.name}".`] };
      void loadSurvey();
    } else planResult = errorView('Apply failed', r.error);
    setBusy(false);
    render();
    scrollToResult();
  }

  async function importText(text: string, what: string): Promise<void> {
    if (busy) return;
    const reject = (...lines: string[]): void => {
      contentResult = { kind: 'error', title: `Import rejected: ${what}`, lines: [...lines, 'Nothing was staged or changed.'] };
      render();
      scrollToResult();
    };
    if (new Blob([text]).size > MAX_IMPORT_BYTES) return reject(`The data is larger than the ${MAX_IMPORT_BYTES / 1024 / 1024} MB import limit.`);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return reject(`Not valid JSON: ${errText(e)}`);
    }
    if (!isRecord(data)) return reject('Expected a JSON object: a content pack { schema, manifest, content } or a preset { schema, id, name, plugins, roles, ... }.');

    let preset: unknown;
    let extra: CatalogEntry[] | undefined;
    let describe: string;
    if ('manifest' in data) {
      if (data['schema'] !== PACK_SCHEMA) return reject(`Unsupported content pack schema ${JSON.stringify(data['schema'])}; this build understands schema ${PACK_SCHEMA}.`);
      const manifest = data['manifest'];
      if (!isRecord(manifest)) return reject('The pack "manifest" must be an object.');
      if (manifest['kind'] !== 'content') return reject(`The pack manifest kind is ${JSON.stringify(manifest['kind'])}; only "content" packs can be imported. Code plugins are compiled into the build and cannot be imported as data.`);
      const packId = manifest['id'];
      if (typeof packId !== 'string' || packId === '') return reject('The pack manifest has no string "id".');
      if (!Array.isArray(data['content'])) return reject('The pack "content" must be an array of { kind, id, data } entries.');
      const existing = installedMap().get(packId);
      if (existing && existing.kind !== 'content') return reject(`"${packId}" is an installed code plugin; a data pack cannot replace it.`);
      const plugins = draft.plugins.includes(packId) ? [...draft.plugins] : [...draft.plugins, packId];
      preset = { ...exportDraft(), plugins };
      extra = [{ manifest, content: data['content'], origin: 'imported' }];
      describe = `content pack "${packId}" (${data['content'].length} entries)${existing ? ' (replaced the installed pack of the same id)' : ''}`;
    } else if ('plugins' in data) {
      if (data['schema'] !== PRESET_SCHEMA) return reject(`Unsupported preset schema ${JSON.stringify(data['schema'])}; this build understands schema ${PRESET_SCHEMA}.`);
      preset = data;
      describe = `preset "${String(data['name'] ?? data['id'])}"`;
    } else return reject('Unrecognised JSON: expected a content pack (has "manifest" and "content") or a preset (has "plugins"). Nothing in it was used.');

    setBusy(true);
    const r = await safeApply(preset, extra);
    if (r.ok) {
      resyncFromActive();
      contentResult = { kind: 'ok', title: `Imported ${describe}`, lines: ['Validated in isolation, then the game restarted on the new selection.'] };
      void loadSurvey();
    } else contentResult = errorView(`Import failed: ${what}`, r.error);
    setBusy(false);
    render();
    scrollToResult();
  }

  async function importFile(file: File): Promise<void> {
    if (file.size > MAX_IMPORT_BYTES) {
      contentResult = { kind: 'error', title: `Import rejected: ${file.name}`, lines: [`The file is ${(file.size / 1024).toFixed(0)} KB; the limit is 1 MB.`, 'Nothing was staged or changed.'] };
      render();
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      contentResult = { kind: 'error', title: `Import rejected: ${file.name}`, lines: [`The file could not be read: ${errText(e)}`, 'Nothing was staged or changed.'] };
      render();
      return;
    }
    await importText(text, file.name);
  }

  function exportPreset(): void {
    const p = host.active?.preset;
    if (!p) {
      contentResult = { kind: 'warn', title: 'No active preset', lines: ['Nothing is running, so there is no active preset to export.'] };
    } else exportView = { title: `Active preset: ${p.id}`, filename: `${p.id.replace(/\//g, '-')}.preset.json`, text: JSON.stringify(p, null, 2) };
    render();
  }

  function exportPack(id: string): void {
    const entry = host.catalogEntry(id);
    if (!entry) return;
    const pack = { schema: PACK_SCHEMA, manifest: entry.manifest, content: entry.content ?? [] };
    exportView = { title: `Pack: ${id}`, filename: `${id.replace(/\//g, '-')}.pack.json`, text: JSON.stringify(pack, null, 2) };
    render();
  }

  async function copyExport(): Promise<void> {
    if (!exportView) return;
    const text = exportView.text;
    try {
      await navigator.clipboard.writeText(text);
      exportView.status = 'Copied to the clipboard.';
    } catch {
      const ta = body.querySelector<HTMLTextAreaElement>('textarea[data-fk="export-text"]');
      ta?.select();
      let ok = false;
      try {
        ok = doc.execCommand('copy');
      } catch {
        ok = false;
      }
      exportView.status = ok ? 'Copied to the clipboard.' : 'Copy is not available here; select the text and copy it manually.';
    }
    render();
  }

  function downloadExport(): void {
    if (!exportView) return;
    const url = URL.createObjectURL(new Blob([exportView.text], { type: 'application/json' }));
    const a = h('a');
    a.href = url;
    a.download = exportView.filename;
    a.hidden = true;
    root.append(a);
    a.click();
    a.remove();
    const t = setTimeout(() => {
      timeouts.delete(t);
      URL.revokeObjectURL(url);
    }, 1000);
    timeouts.add(t);
    exportView.status = `Download started: ${exportView.filename}`;
    render();
  }

  // ---- Plugins tab ---------------------------------------------------------------------------------------------------
  function renderPlugins(): HTMLElement {
    const el = h('div');
    const note = h('p', 'creator-note', 'Code plugins are discovered at build time. A deployed build can import data packs, not new JavaScript.');
    el.append(note);

    // preset picker
    el.append(heading('Preset'));
    const row = h('div', 'creator-row');
    const lab = h('label', '', 'Load');
    const sel = h('select');
    sel.dataset['fk'] = 'preset-picker';
    lab.htmlFor = 'creator-preset-picker';
    sel.id = 'creator-preset-picker';
    const matches = builtins.some((b) => b.id === draft.id);
    if (!matches) sel.append(new Option(`— draft: ${draft.name} —`, ''));
    for (const b of builtins) sel.append(new Option(b.name, b.id));
    sel.value = matches ? draft.id : '';
    sel.addEventListener('change', () => {
      const p = builtins.find((b) => b.id === sel.value);
      if (!p) return;
      draft = toDraft(p);
      refusal = undefined;
      touch();
      render();
    });
    row.append(lab, sel);
    el.append(row);

    // plugin table
    el.append(heading('Installed plugins'));
    const statuses = host.catalogStatus();
    const installed = installedMap();
    const table = h('table', 'creator-table creator-plugins');
    const hr = h('tr');
    for (const c of ['', 'Plugin', 'Ver', 'Kind', 'Origin', 'Status']) hr.append(h('th', '', c));
    const thead = h('thead');
    thead.append(hr);
    table.append(thead);
    const tbody = h('tbody');
    table.append(tbody);
    for (const st of statuses) tbody.append(...pluginRows(st, installed));
    el.append(table);

    // selectors
    el.append(heading('Map, roles & theme'));
    const fields = h('div', 'creator-fields');
    for (const s of SELECTORS) fields.append(...selectorField(s));
    // New exclusive roles remain authorable without teaching the app each game's vocabulary.
    const knownRoles = new Set(SELECTORS.flatMap((s) => s.role ? [s.role] : []));
    const extraRoles = new Set([
      ...Object.keys(draft.roles),
      ...(survey ?? []).filter((s) => s.kind.startsWith('role:')).map((s) => s.kind.slice(5)),
    ]);
    for (const role of [...extraRoles].sort()) {
      if (!knownRoles.has(role)) fields.append(...selectorField({ label: role, kind: `role:${role}`, role, none: '(not selected)' }));
    }
    el.append(fields);
    if (surveyBusy && !survey) el.append(h('p', 'creator-note', 'Loading choices from the installed plugins…'));

    // config
    const cfgPlugins = statuses.filter((s) => draft.plugins.includes(s.id) && s.manifest && Object.keys(s.manifest.config).length > 0);
    el.append(heading('Plugin configuration'));
    if (cfgPlugins.length === 0) el.append(h('p', 'creator-note', 'None of the enabled plugins has settings.'));
    for (const s of cfgPlugins) {
      const m = s.manifest!;
      const box = h('div', 'creator-cfg');
      const h4 = h('h4', '', m.name);
      h4.append(h('span', '', m.id));
      box.append(h4);
      const grid = h('div', 'creator-fields');
      for (const [key, f] of Object.entries(m.config)) {
        const id = `creator-cfg-${m.id}-${key}`.replace(/[^a-z0-9-]/gi, '_');
        const l = h('label', '', f.label);
        l.htmlFor = id;
        l.append(h('small', '', `${key} · default ${JSON.stringify(f.default)}`));
        const input = configInput(m.id, key, f);
        input.id = id;
        grid.append(l, input);
      }
      box.append(grid);
      el.append(box);
    }

    // seed
    el.append(heading('Seed'));
    const seedRow = h('div', 'creator-row');
    const seedLab = h('label', '', 'Gameplay seed');
    seedLab.htmlFor = 'creator-seed';
    const seed = h('input');
    seed.type = 'number';
    seed.id = 'creator-seed';
    seed.min = '0';
    seed.max = '4294967295';
    seed.step = '1';
    seed.value = String(draft.seed);
    seed.dataset['fk'] = 'seed';
    seed.addEventListener('change', () => {
      const n = Number(seed.value);
      if (seed.value.trim() !== '' && Number.isInteger(n)) draft.seed = n;
      touch();
      render();
    });
    seedRow.append(seedLab, seed);
    el.append(seedRow);

    if (planResult) {
      const box = renderResult(planResult);
      box.dataset['result'] = '1';
      el.append(box);
    }
    return el;
  }

  function pluginRows(st: CatalogStatus, installed: Map<string, PluginManifest>): HTMLTableRowElement[] {
    const m = st.manifest;
    const failed = st.issues.length > 0;
    const ticked = draft.plugins.includes(st.id);
    const main = h('tr', 'creator-main');
    main.dataset['plugin'] = st.id;
    main.dataset['changed'] = ticked !== st.active ? '1' : '0';
    const check = h('input');
    check.type = 'checkbox';
    check.checked = ticked;
    check.disabled = failed || !m;
    check.dataset['fk'] = `tick:${st.id}`;
    check.setAttribute('aria-label', `Enable ${m?.name ?? st.id}`);
    check.addEventListener('change', () => onToggle(st.id, check.checked));
    const tdCheck = h('td');
    tdCheck.append(check);
    const tdName = h('td');
    const nm = h('div', 'creator-pname', m?.name ?? st.id);
    if (m?.description) nm.title = m.description;
    tdName.append(nm, h('div', 'creator-pid', st.id));
    const tdVer = h('td', 'creator-id', m?.version ?? '—');
    const tdKind = h('td');
    tdKind.append(h('span', 'creator-tag', m?.kind ?? '—'));
    const tdOrigin = h('td');
    tdOrigin.append(h('span', 'creator-tag', st.origin));
    const tdStatus = h('td');
    const status = failed ? 'error' : st.active ? 'active' : 'inactive';
    const badge = h('span', 'creator-badge', status);
    badge.dataset['s'] = status;
    tdStatus.append(badge);
    main.append(tdCheck, tdName, tdVer, tdKind, tdOrigin, tdStatus);

    const detail = h('tr', 'creator-detail');
    const td = h('td');
    td.colSpan = 6;
    if (m) {
      const deps = Object.entries(m.dependencies);
      const line = h('div', 'creator-deps');
      if (deps.length === 0) line.append(document.createTextNode('no dependencies'));
      else {
        line.append(document.createTextNode('requires '));
        deps.forEach(([d, range], i) => {
          if (i > 0) line.append(document.createTextNode(', '));
          line.append(h('b', '', `${d} ${range}`));
        });
      }
      const opt = Object.entries(m.optionalDependencies);
      if (opt.length > 0) line.append(document.createTextNode(` · optional ${opt.map(([d, r]) => `${d} ${r}`).join(', ')}`));
      if (m.conflicts.length > 0) line.append(document.createTextNode(` · conflicts ${m.conflicts.join(', ')}`));
      td.append(line);
    }
    for (const i of st.issues) {
      const msg = h('div', 'creator-inline-msg creator-bad');
      msg.append(h('span', 'creator-src', i.source), document.createTextNode(` · ${i.path} · ${i.message}`));
      td.append(msg);
    }
    if (ticked && m) {
      const missing = requiredClosure(st.id).filter((d) => installed.has(d) && !draft.plugins.includes(d));
      if (missing.length > 0) {
        const msg = h('div', 'creator-inline-msg');
        msg.append(document.createTextNode(`Requires ${missing.join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not enabled in this draft. `));
        const act = h('div', 'creator-actions');
        act.append(
          button(
            'Enable required plugins',
            () => {
              for (const d of missing) if (!draft.plugins.includes(d)) draft.plugins.push(d);
              touch();
              render();
            },
            'creator-small',
            `enable-required:${st.id}`,
          ),
        );
        msg.append(act);
        td.append(msg);
      }
    }
    if (refusal && refusal.id === st.id) {
      const r = refusal;
      const msg = h('div', 'creator-inline-msg creator-bad');
      msg.dataset['refusal'] = '1';
      msg.append(document.createTextNode(`Cannot disable ${st.id}: ${r.dependents.join(', ')} ${r.dependents.length === 1 ? 'requires' : 'require'} it. `));
      const act = h('div', 'creator-actions');
      act.append(
        button(
          'Disable these too',
          () => {
            removePlugins([r.id, ...r.dependents]);
            refusal = undefined;
            touch();
            render();
          },
          'creator-small',
          `disable-too:${st.id}`,
        ),
        button(
          'Keep enabled',
          () => {
            refusal = undefined;
            render();
          },
          'creator-small',
        ),
      );
      msg.append(act);
      td.append(msg);
    }
    detail.append(td);
    return [main, detail];
  }

  function selectorField(s: (typeof SELECTORS)[number]): HTMLElement[] {
    const id = `creator-sel-${s.label.replace(/\W/g, '').toLowerCase()}`;
    const label = h('label', '', s.label);
    label.htmlFor = id;
    const sel = h('select');
    sel.id = id;
    sel.dataset['fk'] = id;
    sel.dataset['selector'] = s.label;
    const current = s.option ? (typeof draft.options[s.option] === 'string' ? (draft.options[s.option] as string) : '') : (draft.roles[s.role!] ?? '');
    sel.append(new Option(s.none, ''));
    const items = (survey ?? []).filter((i) => i.kind === s.kind).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const enabled = draft.plugins.includes(it.owner);
      const text = `${it.name === it.id ? it.id : `${it.name} (${it.id})`}${enabled ? '' : ` (enable ${it.owner})`}`;
      const o = new Option(text, it.id);
      o.disabled = !enabled;
      sel.append(o);
    }
    if (current && !seen.has(current)) {
      const o = new Option(`${current} (not offered by any installed plugin)`, current);
      o.disabled = true;
      sel.append(o);
    }
    sel.value = current;
    sel.addEventListener('change', () => {
      if (s.option) {
        if (sel.value) draft.options[s.option] = sel.value;
        else delete draft.options[s.option];
      } else if (sel.value) draft.roles[s.role!] = sel.value;
      else delete draft.roles[s.role!];
      touch();
      render();
    });
    return [label, sel];
  }

  function configInput(pid: string, key: string, f: ConfigField): HTMLElement {
    const stored = draft.config[pid]?.[key];
    const val = stored === undefined ? f.default : stored;
    const setVal = (v: Json | undefined): void => {
      const c = (draft.config[pid] ??= {});
      if (v === undefined || JSON.stringify(v) === JSON.stringify(f.default)) delete c[key];
      else c[key] = v;
      if (Object.keys(c).length === 0) delete draft.config[pid];
      touch();
      render();
    };
    const fk = `cfg:${pid}:${key}`;
    switch (f.type) {
      case 'boolean': {
        const i = h('input');
        i.type = 'checkbox';
        i.checked = val === true;
        i.dataset['fk'] = fk;
        i.addEventListener('change', () => setVal(i.checked));
        return i;
      }
      case 'number': {
        const i = h('input');
        i.type = 'number';
        i.step = 'any';
        if (f.min !== undefined) i.min = String(f.min);
        if (f.max !== undefined) i.max = String(f.max);
        i.value = String(val);
        i.dataset['fk'] = fk;
        i.addEventListener('change', () => {
          const n = i.value.trim() === '' ? NaN : Number(i.value);
          setVal(Number.isFinite(n) ? n : undefined);
        });
        return i;
      }
      case 'select': {
        const s = h('select');
        for (const o of f.options ?? []) s.append(new Option(o, o));
        s.value = String(val);
        s.dataset['fk'] = fk;
        s.addEventListener('change', () => setVal(s.value));
        return s;
      }
      default: {
        const i = h('input');
        i.type = 'text';
        i.value = String(val);
        i.dataset['fk'] = fk;
        i.addEventListener('change', () => setVal(i.value));
        return i;
      }
    }
  }

  // ---- Content tab ---------------------------------------------------------------------------------------------------
  function renderContent(): HTMLElement {
    const el = h('div');
    el.append(heading('Import'));
    el.append(h('p', 'creator-note', 'Accepts a content pack { schema, manifest, content } or a preset. The candidate is validated in isolation first; if it fails, the running game is left exactly as it was. Max 1 MB. Nothing is executed and no URLs are fetched.'));
    const fileRow = h('div', 'creator-row');
    const file = h('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.dataset['fk'] = 'import-file';
    file.setAttribute('aria-label', 'Import a JSON file');
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (f) void importFile(f);
    });
    fileRow.append(file);
    el.append(fileRow);
    const ta = h('textarea');
    ta.rows = 7;
    ta.placeholder = 'Or paste pack / preset JSON here';
    ta.spellcheck = false;
    ta.value = pasteText;
    ta.dataset['fk'] = 'import-text';
    ta.setAttribute('aria-label', 'Pasted JSON');
    ta.addEventListener('input', () => (pasteText = ta.value));
    el.append(ta);
    const act = h('div', 'creator-row');
    const importBtn = button('Import pasted JSON', () => void importText(ta.value, 'pasted JSON'), 'creator-primary', 'import-pasted');
    importBtn.disabled = busy;
    act.append(importBtn);
    el.append(act);
    if (contentResult) {
      const box = renderResult(contentResult);
      box.dataset['result'] = '1';
      el.append(box);
    }

    el.append(heading('Export'));
    const exp = h('div', 'creator-row');
    exp.append(button('Export active preset', exportPreset, '', 'export-preset'));
    el.append(exp);
    const packs = host.catalogStatus().filter((s) => s.manifest?.kind === 'content' && s.issues.length === 0);
    if (packs.length > 0) {
      const table = h('table', 'creator-packs');
      for (const p of packs) {
        const tr = h('tr');
        tr.dataset['pack'] = p.id;
        const a = h('td');
        a.append(h('div', 'creator-pname', p.manifest!.name), h('div', 'creator-pid', `${p.id} · ${p.manifest!.version}`));
        const b = h('td');
        b.append(h('span', 'creator-tag', p.origin));
        const c = h('td');
        c.append(button('Export pack', () => exportPack(p.id), 'creator-small', `export-pack:${p.id}`));
        tr.append(a, b, c);
        table.append(tr);
      }
      el.append(table);
    } else el.append(h('p', 'creator-note', 'No content packs installed.'));

    if (exportView) {
      const v = exportView;
      const hd = h('div', 'creator-export-head');
      hd.append(h('span', '', v.title), button('Copy', () => void copyExport(), 'creator-small', 'export-copy'), button('Download', downloadExport, 'creator-small', 'export-download'));
      el.append(hd);
      const out = h('textarea');
      out.readOnly = true;
      out.rows = 14;
      out.spellcheck = false;
      out.value = v.text;
      out.dataset['fk'] = 'export-text';
      out.setAttribute('aria-label', 'Exported JSON');
      el.append(out);
      if (v.status) el.append(h('p', 'creator-note', v.status));
    }
    return el;
  }

  function renderCanvasTab(): HTMLElement {
    const el = h('div');
    el.append(h('p', 'creator-note', 'The composition canvas edits the same versioned GameGraph JSON that agents and the CLI use. It composes installed plugins, exclusive roles, options and typed config, then validates through the real host before applying.'));
    const box = h('div', 'creator-box');
    box.dataset['k'] = 'info';
    box.append(h('strong', '', 'CANVAS FOUNDATION'));
    box.append(h('p', '', 'Drag nodes and role ports, add/remove plugins, inspect typed config and export a graph. Layout is presentation-only and never changes the compiled preset.'));
    const actions = h('div', 'creator-actions');
    actions.append(button('Open composition canvas', () => composer.open(), 'creator-primary'));
    box.append(actions);
    el.append(box);
    el.append(heading('Agent-friendly workflow'));
    const list = h('ul', 'creator-kv');
    for (const line of [
      'Stable IDs: plugin:<id>, role:<id>, dependency:from->to, selects:role->owner.',
      'Compile to preset schema 1; host.stage remains the validation authority.',
      'Export the .graph.json, or modify it as JSON without coordinates.',
      'CLI: npm run graph -- validate <file> / to-preset <file> / from-preset <preset>.',
    ]) list.append(h('li', '', line));
    el.append(list);
    return el;
  }

  // ---- render --------------------------------------------------------------------------------------------------------
  function render(): void {
    if (!isOpen || disposed) return;
    const active = doc.activeElement as HTMLElement | null;
    const fk = active && root.contains(active) ? active.dataset['fk'] : undefined;
    const scroll = renderedTab === tab ? body.scrollTop : 0;
    for (const [id, b] of tabButtons) b.setAttribute('aria-selected', String(id === tab));
    foot.hidden = tab !== 'plugins';
    if (tab === 'plugins') body.replaceChildren(renderPlugins());
    else if (tab === 'content') body.replaceChildren(renderContent());
    else if (tab === 'canvas') body.replaceChildren(renderCanvasTab());
    else if (tab === 'inspect') {
      if (!inspector) { body.replaceChildren(h('p', 'creator-note', 'Loading inspector…')); loadInspector(); }
      else if (body.firstChild !== inspector.el) body.replaceChildren(inspector.el);
    } else {
      if (body.firstChild !== debug.el) body.replaceChildren(debug.el);
      debug.update();
    }
    renderedTab = tab;
    body.scrollTop = scroll;
    if (fk) body.querySelector<HTMLElement>(`[data-fk="${CSS.escape(fk)}"]`)?.focus({ preventScroll: true });
  }

  function setTab(t: TabId): void {
    if (tab === t) return;
    tab = t;
    render();
    syncTimer();
  }

  // ---- lifecycle -----------------------------------------------------------------------------------------------------
  function open(): void {
    if (isOpen || disposed) return;
    isOpen = true;
    root.hidden = false;
    root.dataset['open'] = '1';
    if (!dirty) draft = baseline();
    doc.addEventListener('keydown', onDocKey);
    render();
    syncTimer();
    if (!survey && !surveyBusy) void loadSurvey();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    root.hidden = true;
    root.dataset['open'] = '0';
    doc.removeEventListener('keydown', onDocKey);
    syncTimer();
  }

  function dispose(): void {
    if (disposed) return;
    close();
    disposed = true;
    composer.dispose();
    inspector?.dispose();
    surveyEpoch++;
    for (const t of timeouts) clearTimeout(t);
    timeouts.clear();
    root.remove();
    style.remove();
  }

  return {
    get isOpen() {
      return isOpen;
    },
    open,
    close,
    toggle: () => (isOpen ? close() : open()),
    dispose,
  };
}
