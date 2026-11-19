/**
 * Full-screen visual GameGraph editor.
 *
 * Human authoring and agent authoring share the same JSON document and the same pure compiler. The canvas is a view:
 * semantic edits go through game-graph helpers, and layout is never part of the compiled preset.
 */
import type { CatalogEntry } from '@bulkhead/sdk';
import type { ConfigField, GamePreset } from '@bulkhead/kernel/manifest.ts';
import type { Json } from '@bulkhead/kernel/validate.ts';
import type { PluginHost } from '@bulkhead/kernel/host.ts';
import { HostError, errText } from '@bulkhead/kernel/host.ts';
import {
  autoLayout, addPluginNode, compileGraph, graphToPreset, normalizeGraph, presetToGraph,
  removePluginNode, roleNodeId, selectRoleProvider, setGraphOption, setPluginConfig,
} from './game-graph.ts';
import type {
  GameGraph, GameGraphCatalog, GameGraphIssue, GameGraphNode, PluginDescriptor,
  PluginGraphNode, RoleGraphNode,
} from './game-graph.ts';
import { COMPOSER_CSS } from './game-composer-styles.ts';
import providerCatalog from './catalog-providers.json' with { type: 'json' };

export interface GameComposerOptions {
  host: PluginHost;
  builtinPresets: readonly unknown[];
  apply(preset: unknown, extra?: CatalogEntry[]): Promise<{ ok: true } | { ok: false; error: unknown }>;
}

export interface GameComposer {
  open(): void;
  close(): void;
  dispose(): void;
  readonly isOpen: boolean;
}

const NS = 'http://www.w3.org/2000/svg';
const NODE_W = 220, NODE_H = 82, ROLE_W = 168, ROLE_H = 50;
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, cls?: string, text?: string): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(NS, tag);
  if (cls) node.setAttribute('class', cls);
  if (text !== undefined) node.textContent = text;
  return node;
};
const html = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const parseJson = (value: string): unknown => { try { return JSON.parse(value) as unknown; } catch { return undefined; } };
const presetShape = (value: unknown): value is GamePreset => isRecord(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string' && Array.isArray(value['plugins']);

function formatIssue(issue: GameGraphIssue | { source: string; path: string; message: string }): string {
  return `${issue.source} · ${issue.path} · ${issue.message}`;
}

export function createGameComposer(options: GameComposerOptions): GameComposer {
  const root = html('section', 'game-composer');
  root.setAttribute('aria-label', 'Game composition canvas');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const style = html('style', '', COMPOSER_CSS);
  root.append(style);
  const head = html('header', 'gc-head', undefined);
  root.append(head);
  head.append(html('h1', 'gc-title', 'Game composer'));
  const graphId = html('span', 'gc-id', '');
  head.append(graphId);
  head.append(html('span', 'gc-spacer'));
  const presetSelect = html('select', 'gc-btn') as HTMLSelectElement;
  presetSelect.setAttribute('aria-label', 'Load a built-in preset');
  presetSelect.style.minWidth = '200px';
  head.append(presetSelect);
  const button = (label: string, cls = '', onClick?: () => void): HTMLButtonElement => {
    const b = html('button', `gc-btn ${cls}`.trim(), label); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); head.append(b); return b;
  };
  const undoBtn = button('↶', 'small');
  const redoBtn = button('↷', 'small');
  const layoutBtn = button('Auto layout');
  const fitBtn = button('Fit');
  const validateBtn = button('Validate');
  const applyBtn = button('Apply & restart', 'primary');
  const exportBtn = button('Export');
  const importBtn = button('Import');
  const closeBtn = button('Close');
  const fileInput = html('input'); fileInput.type = 'file'; fileInput.accept = 'application/json,.json'; fileInput.hidden = true; head.append(fileInput);
  const main = html('main', 'gc-main'); root.append(main);
  const palette = html('aside', 'gc-panel'); main.append(palette);
  const stage = html('section', 'gc-stage'); main.append(stage);
  const right = html('aside', 'gc-panel right'); main.append(right);
  const search = html('input', 'gc-search') as HTMLInputElement; search.placeholder = 'Search plugins…'; search.setAttribute('aria-label', 'Search plugins');
  palette.append(html('div', 'gc-panel-head', 'Catalog'), search);
  const paletteList = html('div', 'gc-palette-list'); palette.append(paletteList);
  const svg = svgEl('svg'); svg.id = 'gc-svg'; svg.setAttribute('aria-label', 'Plugin and role graph'); svg.setAttribute('role', 'application'); stage.append(svg);
  const hint = html('div', 'gc-hint', 'DRAG NODE · PAN BACKGROUND · WHEEL ZOOM · DRAG ROLE PORT → PLUGIN · DELETE NODE');
  stage.append(hint);
  const legend = html('div', 'gc-legend');
  legend.innerHTML = '<span><i style="background:#ffb000"></i>ROLE</span><span><i style="background:#6fb7ff"></i>DEPENDENCY</span><span><i style="background:#7ed957"></i>ENABLED</span>';
  stage.append(legend);
  const inspector = html('div', 'gc-inspector'); right.append(inspector);
  const status = html('div'); right.append(status);
  document.body.append(root);
  let graph: GameGraph | undefined;
  let catalog: GameGraphCatalog = [];
  let descriptors = new Map<string, PluginDescriptor>();
  let selectedId: string | undefined;
  let selectedPreset = '';
  let openState = false;
  let loading = false;
  let catalogError = '';
  let history: string[] = [];
  let future: string[] = [];
  let panX = 30, panY = 30, zoom = 1;
  let drag: { kind: 'node'; id: string; startX: number; startY: number; ox: number; oy: number } | { kind: 'pan'; x: number; y: number; panX: number; panY: number } | { kind: 'link'; role: string; x: number; y: number } | undefined;
  let tempLink: SVGPathElement | undefined;
  let statusLines: GameGraphIssue[] = [];
  let statusKind: 'ok' | 'error' | 'warn' | '' = '';
  let busy = false;
  let disposed = false;
  let lastCatalogKey = '';
  const project = (input: GameGraph): GameGraph => {
    if (!descriptors.size) return ensureLayout(input);
    const base = presetToGraph(graphToPreset(input), catalog);
    const layouts = new Map(input.nodes.map(node => [node.id, node.layout]));
    return ensureLayout(normalizeGraph({ ...base, nodes: base.nodes.map(node => layouts.get(node.id) ? { ...node, layout: layouts.get(node.id) } : node) }));
  };
  const stageRect = (): DOMRect => stage.getBoundingClientRect();
  const graphPoint = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = stageRect();
    return { x: (event.clientX - r.left - panX) / zoom, y: (event.clientY - r.top - panY) / zoom };
  };
  const nodeById = (id: string): GameGraphNode | undefined => graph?.nodes.find(node => node.id === id);
  const nodeRect = (node: GameGraphNode): { x: number; y: number; w: number; h: number } => {
    const x = node.layout?.x ?? 40, y = node.layout?.y ?? 40;
    return { x, y, w: node.type === 'plugin' ? NODE_W : ROLE_W, h: node.type === 'plugin' ? NODE_H : ROLE_H };
  };
  const graphStatus = (): void => {
    if (!graph) return;
    graphId.textContent = graph.id;
    undoBtn.disabled = history.length === 0;
    redoBtn.disabled = future.length === 0;
    applyBtn.disabled = validateBtn.disabled = busy || !graph;
  };
  const setStatus = (kind: typeof statusKind, lines: readonly GameGraphIssue[] = [], note = ''): void => {
    statusKind = kind; statusLines = [...lines]; status.replaceChildren();
    const box = html('div', `gc-issue ${kind || ''}`, note || (kind === 'ok' ? 'Composition is valid.' : kind === 'error' ? 'Composition has errors.' : kind === 'warn' ? 'Composition has warnings.' : ''));
    status.append(box);
    if (kind === 'ok' && note) box.className = 'gc-issue ok';
  };
  const check = (): GameGraphIssue[] => {
    if (!graph) return [{ code: 'graph/invalid', source: 'graph', path: '(root)', message: 'No graph loaded.' }];
    const result = compileGraph(graph, catalog);
    statusLines = result.issues;
    return result.issues;
  };
  const ensureLayout = (input: GameGraph): GameGraph => {
    const missing = input.nodes.some(node => node.layout?.x === undefined || node.layout?.y === undefined);
    if (!missing) return input;
    const laid = autoLayout(input);
    return normalizeGraph({
      ...input,
      nodes: input.nodes.map(node => {
        const next = laid.nodes.find(candidate => candidate.id === node.id);
        return next?.layout ? { ...node, layout: next.layout } : node;
      }),
    });
  };
  const sync = (next: GameGraph, record = true): void => {
    if (!graph) graph = project(next);
    else {
      if (record) { history.push(JSON.stringify(graph)); if (history.length > 80) history.shift(); future = []; }
      graph = project(next);
    }
    renderPalette();
    selectedId = selectedId && graph.nodes.some(node => node.id === selectedId) ? selectedId : undefined;
    graphStatus();
    saveDraft();
    render();
  };
  const change = (next: GameGraph, record = true): void => sync(next, record);
  const pushOnly = (): void => {
    if (!graph) return;
    history.push(JSON.stringify(graph)); if (history.length > 80) history.shift(); future = [];
    graphStatus();
  };
  const saveDraft = (): void => {
    if (!graph) return;
    try { localStorage.setItem('bulkhead/composer.draft.v1', JSON.stringify(graph)); } catch { /* session-only */ }
  };
  const loadDraft = (): GameGraph | undefined => {
    try {
      const raw = localStorage.getItem('bulkhead/composer.draft.v1');
      if (!raw) return undefined;
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) && parsed['schema'] === 1 ? parsed as unknown as GameGraph : undefined;
    } catch { return undefined; }
  };
  const fit = (): void => {
    if (!graph) return;
    const rects = graph.nodes.map(nodeRect);
    if (!rects.length) return;
    const minX = Math.min(...rects.map(rect => rect.x)), minY = Math.min(...rects.map(rect => rect.y));
    const maxX = Math.max(...rects.map(rect => rect.x + rect.w)), maxY = Math.max(...rects.map(rect => rect.y + rect.h));
    const r = stageRect();
    const next = Math.min(2, Math.max(.35, Math.min((r.width - 60) / Math.max(1, maxX - minX), (r.height - 60) / Math.max(1, maxY - minY))));
    zoom = next; panX = (r.width - (maxX - minX) * zoom) / 2 - minX * zoom; panY = (r.height - (maxY - minY) * zoom) / 2 - minY * zoom;
    render();
  };
  const providersFor = (role: string, plugin: string): string[] => {
    const descriptor = descriptors.get(plugin);
    return descriptor?.providers?.[role] ? [...descriptor.providers[role]] : [];
  };
  const roleOwners = (role: string): { owner: string; provider: string }[] => {
    const out: { owner: string; provider: string }[] = [];
    const enabled = new Set(graph?.nodes.filter((node): node is PluginGraphNode => node.type === 'plugin').map(node => node.plugin) ?? []);
    for (const pluginId of [...enabled].sort()) {
      const descriptor = descriptors.get(pluginId);
      for (const provider of descriptor?.providers?.[role] ?? []) out.push({ owner: pluginId, provider });
    }
    return out;
  };
  const roleSelection = (role: string): { owner: string; provider: string } | undefined => {
    const edge = graph?.edges.find(item => item.type === 'selects' && item.from === roleNodeId(role));
    if (!edge || edge.type !== 'selects') return undefined;
    const node = nodeById(edge.to);
    return { owner: node?.type === 'plugin' ? node.plugin : edge.provider, provider: edge.provider };
  };
  const renderEdges = (world: SVGGElement): void => {
    if (!graph) return;
    for (const edge of graph.edges) {
      const from = nodeById(edge.from), to = nodeById(edge.to);
      if (!from || !to) continue;
      const a = nodeRect(from), b = nodeRect(to);
      const x1 = edge.type === 'selects' ? a.x + a.w : a.x + a.w / 2;
      const y1 = edge.type === 'selects' ? a.y + a.h / 2 : a.y + a.h;
      const x2 = edge.type === 'selects' ? b.x : b.x + b.w / 2;
      const y2 = edge.type === 'selects' ? b.y + b.h / 2 : b.y;
      const mid = (x1 + x2) / 2;
      const path = svgEl('path');
      path.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', edge.type === 'selects' ? '#ffb000' : '#466070');
      path.setAttribute('stroke-width', edge.type === 'selects' ? '2.2' : '1.2');
      if (edge.type === 'dependency') path.setAttribute('stroke-dasharray', '4 5');
      path.setAttribute('opacity', edge.type === 'selects' ? '.9' : '.65');
      world.append(path);
    }
  };
  const renderNode = (world: SVGGElement, node: GameGraphNode): void => {
    const r = nodeRect(node);
    const group = svgEl('g', `gc-node ${node.type}${selectedId === node.id ? ' selected' : ''}`);
    group.dataset['node'] = node.id;
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', node.type === 'plugin' ? `Plugin ${node.plugin}` : `Role ${node.role}`);
    const rect = svgEl('rect');
    rect.setAttribute('x', String(r.x)); rect.setAttribute('y', String(r.y)); rect.setAttribute('width', String(r.w)); rect.setAttribute('height', String(r.h));
    rect.setAttribute('rx', '4'); rect.setAttribute('fill', node.type === 'plugin' ? '#12202b' : '#2a2213'); rect.setAttribute('stroke', selectedId === node.id ? '#ffb000' : node.type === 'plugin' ? '#466070' : '#a37b25');
    rect.setAttribute('stroke-width', selectedId === node.id ? '2.2' : '1.3');
    group.append(rect);
    if (node.type === 'plugin') {
      const descriptor = descriptors.get(node.plugin);
      const title = svgEl('text', '', descriptor?.manifest.name ?? node.plugin); title.setAttribute('x', String(r.x + 12)); title.setAttribute('y', String(r.y + 23)); title.setAttribute('fill', '#e6edf3'); title.setAttribute('font-size', '13'); title.setAttribute('font-weight', '600');
      const id = svgEl('text', '', node.plugin); id.setAttribute('x', String(r.x + 12)); id.setAttribute('y', String(r.y + 41)); id.setAttribute('fill', '#6fb7ff'); id.setAttribute('font-size', '10');
      const meta = svgEl('text', '', descriptor ? `${Object.keys(descriptor.manifest.dependencies ?? {}).length} deps · ${Object.keys(descriptor.providers ?? {}).length} role offers` : 'not in catalog'); meta.setAttribute('x', String(r.x + 12)); meta.setAttribute('y', String(r.y + 61)); meta.setAttribute('fill', descriptor ? '#7f8f9f' : '#e5392b'); meta.setAttribute('font-size', '9');
      group.append(title, id, meta);
      const port = svgEl('circle');
      port.setAttribute('cx', String(r.x + r.w)); port.setAttribute('cy', String(r.y + r.h / 2)); port.setAttribute('r', '6'); port.setAttribute('fill', '#071016'); port.setAttribute('stroke', '#6fb7ff'); port.setAttribute('stroke-width', '1.5'); port.dataset['port'] = 'in';
      group.append(port);
    } else {
      const title = svgEl('text', '', node.role); title.setAttribute('x', String(r.x + 12)); title.setAttribute('y', String(r.y + 21)); title.setAttribute('fill', '#e6d19a'); title.setAttribute('font-size', '11'); title.setAttribute('font-family', 'ui-monospace, monospace');
      const selection = roleSelection(node.role);
      const sub = svgEl('text', '', selection ? selection.provider : 'unwired'); sub.setAttribute('x', String(r.x + 12)); sub.setAttribute('y', String(r.y + 38)); sub.setAttribute('fill', selection ? '#7ed957' : '#8a6100'); sub.setAttribute('font-size', '9');
      group.append(title, sub);
      const port = svgEl('circle');
      port.setAttribute('cx', String(r.x + r.w)); port.setAttribute('cy', String(r.y + r.h / 2)); port.setAttribute('r', '6'); port.setAttribute('fill', '#2a2213'); port.setAttribute('stroke', '#ffb000'); port.setAttribute('stroke-width', '1.5'); port.dataset['port'] = 'out';
      group.append(port);
    }
    group.addEventListener('pointerdown', event => {
      if ((event.target as Element).closest('[data-port]')) {
        if (node.type === 'role') {
          event.preventDefault(); event.stopPropagation();
          const p = graphPoint(event);
          drag = { kind: 'link', role: node.role, x: p.x, y: p.y };
          tempLink = svgEl('path'); tempLink.setAttribute('fill', 'none'); tempLink.setAttribute('stroke', '#ffb000'); tempLink.setAttribute('stroke-width', '2'); tempLink.setAttribute('stroke-dasharray', '5 4'); world.append(tempLink);
          svg.setPointerCapture(event.pointerId);
        }
        return;
      }
      event.preventDefault(); event.stopPropagation();
      selectedId = node.id;
      if (node.layout?.x === undefined || node.layout?.y === undefined) return;
      pushOnly();
      drag = { kind: 'node', id: node.id, startX: event.clientX, startY: event.clientY, ox: node.layout.x, oy: node.layout.y };
      svg.setPointerCapture(event.pointerId);
      render();
    });
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { selectedId = node.id; render(); event.preventDefault(); }
    });
    group.addEventListener('dblclick', event => { selectedId = node.id; render(); event.stopPropagation(); });
    world.append(group);
  };
  const render = (): void => {
    if (!graph) return;
    graphStatus();
    svg.replaceChildren();
    const world = svgEl('g'); world.setAttribute('transform', `translate(${panX} ${panY}) scale(${zoom})`); svg.append(world);
    renderEdges(world);
    for (const node of graph.nodes) renderNode(world, node);
    renderInspector();
  };
  const roleOptions = (role: string, selected?: { owner: string; provider: string }): HTMLSelectElement => {
    const select = html('select') as HTMLSelectElement;
    select.setAttribute('aria-label', `Provider for ${role}`);
    const empty = html('option', '', 'unwired') as HTMLOptionElement; empty.value = ''; select.append(empty);
    for (const entry of roleOwners(role)) {
      const option = html('option', '', `${entry.provider}  ·  ${entry.owner}`) as HTMLOptionElement;
      option.value = `${entry.owner}\u0000${entry.provider}`;
      if (selected?.owner === entry.owner && selected.provider === entry.provider) option.selected = true;
      select.append(option);
    }
    select.addEventListener('change', () => {
      if (!graph) return;
      if (!select.value) { change(normalizeGraph({ ...graph, edges: graph.edges.filter(edge => !(edge.type === 'selects' && edge.from === roleNodeId(role))) })); return; }
      const [owner, provider] = select.value.split('\u0000') as [string, string];
      change(selectRoleProvider(graph, role, provider, owner));
    });
    return select;
  };
  const configField = (plugin: string, key: string, field: ConfigField): HTMLElement => {
    const box = html('div', 'gc-field');
    const label = html('label', '', field.label ?? key); label.htmlFor = `gc-cfg-${plugin}-${key}`; box.append(label);
    const value = graph?.config[plugin]?.[key] ?? field.default;
    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.type === 'boolean') {
      const check = html('input') as HTMLInputElement; check.type = 'checkbox'; check.checked = value === true; input = check;
      check.addEventListener('change', () => { if (graph) change(setPluginConfig(graph, plugin, key, check.checked)); });
    } else if (field.type === 'select') {
      input = html('select') as HTMLSelectElement;
      for (const option of field.options ?? []) { const o = html('option', '', option) as HTMLOptionElement; o.value = option; o.selected = option === value; input.append(o); }
      input.addEventListener('change', () => { if (graph) change(setPluginConfig(graph, plugin, key, input.value)); });
    } else if (field.type === 'number') {
      input = html('input') as HTMLInputElement; input.type = 'number'; input.min = field.min === undefined ? '' : String(field.min); input.max = field.max === undefined ? '' : String(field.max); input.step = 'any'; input.value = value === undefined ? '' : String(value);
      input.addEventListener('change', () => { if (!graph) return; const number = Number(input.value); if (Number.isFinite(number)) change(setPluginConfig(graph, plugin, key, number)); });
    } else {
      input = html('input') as HTMLInputElement; input.type = 'text'; input.value = value === undefined ? '' : String(value);
      input.addEventListener('change', () => { if (graph) change(setPluginConfig(graph, plugin, key, input.value)); });
    }
    input.id = `gc-cfg-${plugin}-${key}`; box.append(input); return box;
  };
  const renderInspector = (): void => {
    if (!graph) return;
    inspector.replaceChildren();
    const node = selectedId ? nodeById(selectedId) : undefined;
    if (node?.type === 'plugin') {
      const descriptor = descriptors.get(node.plugin);
      inspector.append(html('h2', '', descriptor?.manifest.name ?? node.plugin));
      inspector.append(html('div', 'gc-idline', node.plugin));
      if (descriptor) {
        inspector.append(html('p', 'gc-desc', descriptor.manifest.description));
        inspector.append(html('h3', '', 'Dependencies'));
        const deps = Object.keys(descriptor.manifest.dependencies ?? {});
        inspector.append(html('div', 'gc-option-note', deps.length ? deps.join(' · ') : 'none'));
        inspector.append(html('h3', '', 'Required roles'));
        const required = [...new Set([...(descriptor.manifest.requiresRoles ?? []), ...(descriptor.manifest.roleDependencies ?? [])])];
        inspector.append(html('div', 'gc-option-note', required.length ? required.join(' · ') : 'none'));
        inspector.append(html('h3', '', 'Exclusive roles'));
        for (const role of required) {
          const row = html('div', 'gc-role'); row.append(html('span', '', role)); row.append(roleOptions(role, roleSelection(role))); inspector.append(row);
        }
        const offered = Object.keys(descriptor.providers ?? {});
        if (offered.length) {
          inspector.append(html('h3', '', 'Providers offered'));
          for (const role of offered) {
            const row = html('div', 'gc-role'); row.append(html('span', '', role)); row.append(html('span', '', descriptor.providers![role]!.join(' · '))); inspector.append(row);
          }
        }
        const fields = Object.entries(descriptor.manifest.config ?? {});
        if (fields.length) {
          inspector.append(html('h3', '', 'Plugin settings'));
          for (const [key, field] of fields) inspector.append(configField(node.plugin, key, field));
        }
      } else inspector.append(html('p', 'gc-desc', 'This plugin is not installed in the catalog.'));
    } else if (node?.type === 'role') {
      inspector.append(html('h2', '', node.role));
      inspector.append(html('div', 'gc-idline', 'exclusive role slot'));
      inspector.append(html('p', 'gc-desc', 'Select a provider or drag this role port to a plugin node that offers it.'));
      const row = html('div', 'gc-role'); row.append(roleOptions(node.role, roleSelection(node.role))); inspector.append(row);
      const offers = roleOwners(node.role);
      inspector.append(html('h3', '', 'Enabled offers'));
      inspector.append(html('div', 'gc-option-note', offers.length ? offers.map(offer => `${offer.provider} (${offer.owner})`).join(' · ') : 'no enabled plugin offers this role'));
    } else {
      inspector.append(html('h2', '', 'Graph settings'));
      inspector.append(html('div', 'gc-idline', graph.id));
      const name = html('div', 'gc-field'); name.append(html('label', '', 'Name')); const nameInput = html('input') as HTMLInputElement; nameInput.value = graph.name; nameInput.addEventListener('change', () => { if (graph) change({ ...graph, name: nameInput.value.trim() || graph.name }); }); name.append(nameInput); inspector.append(name);
      const id = html('div', 'gc-field'); id.append(html('label', '', 'ID')); const idInput = html('input') as HTMLInputElement; idInput.value = graph.id; idInput.addEventListener('change', () => { if (graph) change({ ...graph, id: idInput.value.trim() || graph.id }); }); id.append(idInput); inspector.append(id);
      const seed = html('div', 'gc-field'); seed.append(html('label', '', 'Seed')); const seedInput = html('input') as HTMLInputElement; seedInput.type = 'number'; seedInput.value = String(graph.seed); seedInput.addEventListener('change', () => { if (graph) change({ ...graph, seed: Number(seedInput.value) }); }); seed.append(seedInput); inspector.append(seed);
      inspector.append(html('h3', '', 'Options (JSON)'));
      const optionsArea = html('textarea') as HTMLTextAreaElement; optionsArea.value = JSON.stringify(graph.options, null, 2);
      const optionsButton = html('button', 'gc-btn small', 'Apply options'); optionsButton.type = 'button';
      optionsButton.addEventListener('click', () => { const parsed = parseJson(optionsArea.value); if (!isRecord(parsed)) { setStatus('error', [], 'Options must be a JSON object.'); return; } if (graph) change({ ...graph, options: parsed as Record<string, Json> }); });
      inspector.append(optionsArea, optionsButton);
      inspector.append(html('h3', '', 'Graph rules'));
      inspector.append(html('p', 'gc-option-note', 'Dependency edges are projected from manifests. Role edges are authored. Layout is not compiled.'));
    }
    inspector.append(html('h3', '', 'Validation'));
    const issueBox = html('div', 'gc-issues');
    if (!statusLines.length) issueBox.append(html('div', 'gc-issue ok', 'No validation issues.'));
    else for (const issue of statusLines) {
      const row = html('div', `gc-issue ${issue.code.startsWith('role/') || issue.code.startsWith('config/') ? 'warn' : ''}`, formatIssue(issue));
      row.addEventListener('click', () => {
        const match = issue.path.match(/nodes\[(\d+)\]/);
        if (match && graph) { const candidate = graph.nodes[Number(match[1])]; if (candidate) { selectedId = candidate.id; render(); } }
      });
      issueBox.append(row);
    }
    inspector.append(issueBox);
  };
  const renderPalette = (): void => {
    const query = search.value.trim().toLowerCase();
    const enabled = new Set(graph?.nodes.filter((node): node is PluginGraphNode => node.type === 'plugin').map(node => node.plugin) ?? []);
    paletteList.replaceChildren();
    const statuses = options.host.catalogStatus().filter(status => status.manifest);
    for (const entry of statuses.sort((a, b) => a.id.localeCompare(b.id))) {
      const manifest = entry.manifest!;
      if (query && !`${manifest.id} ${manifest.name} ${manifest.description}`.toLowerCase().includes(query)) continue;
      const row = html('button', `gc-palette-item${enabled.has(manifest.id) ? ' enabled' : ''}`) as HTMLButtonElement;
      row.type = 'button';
      const copy = html('span'); copy.append(html('strong', '', manifest.name), html('small', '', manifest.id)); row.append(copy);
      row.append(html('span', '', enabled.has(manifest.id) ? '✓' : '+'));
      row.addEventListener('click', () => {
        if (!graph || enabled.has(manifest.id)) return;
        const maxX = Math.max(300, ...graph.nodes.map(node => nodeRect(node).x + nodeRect(node).w));
        change(addPluginNode(graph, manifest.id, { x: maxX + 60, y: 40 }));
      });
      paletteList.append(row);
    }
    if (!paletteList.children.length) paletteList.append(html('div', 'gc-empty', 'No matching plugins.'));
  };
  const withGraph = (callback: (graph: GameGraph) => void): void => { if (graph) callback(graph); };
  // ---- async validation and application ---------------------------------------------------------------------------
  const validate = async (): Promise<void> => {
    if (!graph || busy) return;
    const compiled = compileGraph(graph, catalog);
    statusLines = compiled.issues;
    if (!compiled.ok || !compiled.preset) { setStatus('error', compiled.issues, 'Fix the graph issues before staging.'); renderInspector(); return; }
    busy = true; graphStatus(); setStatus('', [], 'Staging validation…');
    try {
      const staged = await options.host.stage(compiled.preset, [], { skipValidation: false });
      options.host.discard(staged);
      statusKind = 'ok'; statusLines = []; setStatus('ok', [], `Staged ${staged.order.length} plugins without touching the running session.`);
    } catch (error) {
      const issues = error instanceof HostError ? error.issues.map(issue => ({ code: 'graph/invalid' as const, ...issue })) : [{ code: 'graph/invalid' as const, source: 'host', path: 'stage', message: errText(error) }];
      statusKind = 'error'; statusLines = issues; setStatus('error', issues, 'Staging rejected the composition. The running game is untouched.');
    } finally { busy = false; graphStatus(); renderInspector(); }
  };
  const apply = async (): Promise<void> => {
    if (!graph || busy) return;
    const compiled = compileGraph(graph, catalog);
    if (!compiled.ok || !compiled.preset) { statusLines = compiled.issues; setStatus('error', compiled.issues, 'Fix the graph before applying.'); renderInspector(); return; }
    busy = true; graphStatus(); setStatus('', [], 'Applying composition…');
    const result = await options.apply(compiled.preset);
    busy = false; graphStatus();
    if (!result.ok) { setStatus('error', [], `Apply failed: ${errText(result.error)}`); return; }
    setStatus('ok', [], 'Applied. The new composition is running.');
    close();
  };
  const download = (): void => {
    if (!graph) return;
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = html('a'); anchor.href = url; anchor.download = `${graph.id.replace(/[^a-z0-9._-]+/gi, '-')}.graph.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = (file: File): void => {
    if (file.size > 2 * 1024 * 1024) { setStatus('error', [], 'Graph file is too large.'); return; }
    void file.text().then(text => {
      const parsed = parseJson(text);
      if (!isRecord(parsed)) { setStatus('error', [], 'Graph file must contain a JSON object.'); return; }
      if (presetShape(parsed)) {
        const next = ensureLayout(presetToGraph(parsed, catalog)); history = []; future = []; selectedId = undefined; sync(next, false); fit();
      } else if (parsed['schema'] === 1 && Array.isArray(parsed['nodes']) && Array.isArray(parsed['edges'])) {
        const next = parsed as unknown as GameGraph; history = []; future = []; selectedId = undefined; sync(next, false); fit();
      } else setStatus('error', [], 'Unrecognised JSON: expected a GameGraph or preset.');
    }).catch(() => setStatus('error', [], 'Could not read the graph file.'));
  };
  const loadPreset = (preset: unknown): void => {
    if (!presetShape(preset)) { setStatus('error', [], 'Selected preset is not a valid preset.'); return; }
    selectedPreset = preset.id;
    sync(ensureLayout(presetToGraph(preset, catalog)), false);
    history = []; future = []; selectedId = undefined; fit();
  };
  // ---- events -----------------------------------------------------------------------------------------------------
  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('[data-node]')) return;
    pushOnly();
    drag = { kind: 'pan', x: event.clientX, y: event.clientY, panX, panY };
    svg.classList.add('panning'); svg.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent): void => {
    const current = drag;
    if (!current || !graph) return;
    if (current.kind === 'pan') { panX = current.panX + event.clientX - current.x; panY = current.panY + event.clientY - current.y; render(); return; }
    if (current.kind === 'node') {
      const node = graph.nodes.find(entry => entry.id === current.id);
      if (!node) return;
      const dx = (event.clientX - current.startX) / zoom, dy = (event.clientY - current.startY) / zoom;
      const nodeId = current.id;
      graph = { ...graph, nodes: graph.nodes.map(entry => entry.id === nodeId ? { ...entry, layout: { ...entry.layout, x: Math.round(current.ox + dx), y: Math.round(current.oy + dy) } } : entry) };
      render(); return;
    }
    if (current.kind === 'link') {
      const p = graphPoint(event);
      const from = graph.nodes.find(node => node.type === 'role' && node.role === current.role);
      if (from && tempLink) {
        const r = nodeRect(from);
        tempLink.setAttribute('d', `M ${r.x + r.w} ${r.y + r.h / 2} C ${r.x + r.w + 50} ${r.y + r.h / 2}, ${p.x - 30} ${p.y}, ${p.x} ${p.y}`);
      }
    }
  };
  const pointerUp = (event: PointerEvent): void => {
    if (!drag || !graph) return;
    if (drag.kind === 'link') {
      const p = graphPoint(event);
      const target = graph.nodes.find(node => {
        if (node.type !== 'plugin') return false;
        const r = nodeRect(node);
        return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      });
      if (target?.type === 'plugin') {
        const offers = providersFor(drag.role, target.plugin);
        if (offers.length === 0) setStatus('warn', [], `${target.plugin} does not offer ${drag.role}.`);
        else change(selectRoleProvider(graph, drag.role, offers[0]!, target.plugin));
      }
      tempLink?.remove(); tempLink = undefined;
    }
    drag = undefined; svg.classList.remove('panning');
    try { svg.releasePointerCapture(event.pointerId); } catch { /* no capture */ }
  };
  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!graph) return;
    const before = graphPoint(event);
    const next = Math.max(.3, Math.min(2.5, zoom * (event.deltaY < 0 ? 1.12 : .9)));
    if (next === zoom) return;
    const rect = stageRect();
    panX = event.clientX - rect.left - before.x * next; panY = event.clientY - rect.top - before.y * next; zoom = next; render();
  };
  const key = (event: KeyboardEvent): void => {
    if (!openState) return;
    const target = event.target as HTMLElement | null;
    const editing = target?.closest('input,textarea,select');
    if (event.code === 'Escape' && !editing) { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ' && !editing) { event.preventDefault(); event.stopImmediatePropagation(); undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY' && !editing) { event.preventDefault(); event.stopImmediatePropagation(); redo(); return; }
    if ((event.code === 'Delete' || event.code === 'Backspace') && !editing) {
      if (selectedId && !selectedId.startsWith('role:')) {
        const node = nodeById(selectedId);
        if (node?.type === 'plugin') { event.preventDefault(); event.stopImmediatePropagation(); change(removePluginNode(graph!, node.plugin)); }
      }
    }
    if (event.code === 'KeyF' && !editing) { event.preventDefault(); event.stopImmediatePropagation(); fit(); }
    if ((event.code === 'Equal' || event.code === 'Minus') && !editing) { event.preventDefault(); event.stopImmediatePropagation(); zoom = Math.max(.3, Math.min(2.5, zoom * (event.code === 'Equal' ? 1.15 : .87))); render(); }
  };
  const undo = (): void => {
    if (!graph || !history.length) return;
    future.push(JSON.stringify(graph)); const raw = history.pop()!; graph = JSON.parse(raw) as GameGraph; selectedId = undefined; graphStatus(); render(); saveDraft();
  };
  const redo = (): void => {
    if (!graph || !future.length) return;
    history.push(JSON.stringify(graph)); const raw = future.pop()!; graph = JSON.parse(raw) as GameGraph; selectedId = undefined; graphStatus(); render(); saveDraft();
  };
  // ---- catalog loading --------------------------------------------------------------------------------------------
  const buildCatalog = async (): Promise<void> => {
    const statuses = options.host.catalogStatus().filter(status => status.manifest);
    const key = JSON.stringify([statuses.map(status => `${status.id}:${status.manifest?.version}`).sort(), options.host.active?.preset.id]);
    if (key === lastCatalogKey && descriptors.size) return;
    loading = true; setStatus('', [], 'Loading installed plugins and role offers…');
    const providerMap = (providerCatalog as unknown as { providers: Record<string, Record<string, string[]>> }).providers ?? {};
    descriptors = new Map(statuses.map(status => [status.id, { manifest: status.manifest!, providers: providerMap[status.id] ?? {} }]));
    catalog = [...descriptors.values()];
    lastCatalogKey = key; loading = false;
    // Populate the built-in preset picker only once.
    presetSelect.replaceChildren();
    const active = options.host.active?.preset;
    const presets = [...options.builtinPresets].filter(presetShape);
    for (const preset of presets) { const option = html('option', '', preset.name) as HTMLOptionElement; option.value = preset.id; presetSelect.append(option); }
    if (active && !presets.some(preset => preset.id === active.id)) { const option = html('option', '', `${active.name} (active)`) as HTMLOptionElement; option.value = active.id; presetSelect.append(option); }
    const preferred = active && presetShape(active) ? active.id : presets[0]?.id ?? '';
    if (preferred) presetSelect.value = preferred;
    if (!graph) {
      const draft = loadDraft();
      const base = active && presetShape(active) ? active : presets[0];
      if (draft) { graph = ensureLayout(draft); setStatus('warn', [], 'Autosaved composer draft restored. Use a preset selector or Import to replace it.'); }
      else if (base) { graph = ensureLayout(presetToGraph(base, catalog)); }
      else { setStatus('error', [], 'No installed preset can seed the canvas.'); }
      if (base) selectedPreset = base.id;
      if (graph) { history = []; future = []; graphStatus(); render(); const issues = check(); setStatus(issues.length ? 'error' : 'ok', issues, issues.length ? 'Review the graph issues.' : 'Graph loaded. Role metadata comes from the generated catalog-providers.json.'); requestAnimationFrame(fit); }
    } else render();
  };
  // ---- lifecycle -------------------------------------------------------------------------------------------------
  const open = (): void => {
    if (disposed) return;
    openState = true; root.classList.add('open'); root.focus();
    void buildCatalog().catch(error => { loading = false; catalogError = errText(error); setStatus('error', [], catalogError); });
  };
  const close = (): void => { openState = false; root.classList.remove('open'); };
  const dispose = (): void => {
    disposed = true; window.removeEventListener('keydown', key, true); root.remove();
  };
  svg.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  svg.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', key, true);
  closeBtn.addEventListener('click', close);
  undoBtn.addEventListener('click', undo); redoBtn.addEventListener('click', redo);
  layoutBtn.addEventListener('click', () => { if (!graph) return; pushOnly(); graph = autoLayout(graph); render(); fit(); });
  fitBtn.addEventListener('click', fit);
  validateBtn.addEventListener('click', () => void validate());
  applyBtn.addEventListener('click', () => void apply());
  exportBtn.addEventListener('click', download);
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) importFile(file); fileInput.value = ''; });
  search.addEventListener('input', renderPalette);
  presetSelect.addEventListener('change', () => {
    const found = options.builtinPresets.find(preset => presetShape(preset) && preset.id === presetSelect.value)
      ?? (options.host.active?.preset.id === presetSelect.value ? options.host.active.preset : undefined);
    if (found) loadPreset(found);
  });
  graphStatus();
  renderPalette();
  return Object.freeze({
    get isOpen() { return openState; },
    open, close, dispose,
    // Exported for the app's diagnostics/tests; not a serialized API surface.
    ...(undefined as unknown as Record<string, never>),
  });
}
