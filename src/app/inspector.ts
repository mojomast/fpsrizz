/**
 * Creator tools > Inspect (P2.5): time controls, debug-draw toggles, an entity list with a live component editor, and
 * a plugin-config tweak panel that restarts with state kept and exports the tweaked preset. Loaded lazily (its own
 * chunk) and driven entirely through the dev-tools core, so it does exactly what the JSON-RPC protocol can do.
 */
import type { DevTools } from '../platform/devtools.ts';
import type { ConfigField } from '../kernel/manifest.ts';
import type { Json } from '../kernel/validate.ts';

export interface Inspector { el: HTMLElement; update(): void; dispose(): void }
type Summary = { id: number; owner: string; name?: string; components: string[] };

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function createInspector(dev: DevTools, doc: Document): Inspector {
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const btn = (label: string, fn: () => void, extra = ''): HTMLButtonElement => {
    const b = h('button', `creator-btn creator-small ${extra}`.trim(), label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const status = h('p', 'creator-note');
  const say = (text: string): void => { status.textContent = text; };
  const run = (fn: () => unknown): void => {
    try {
      const r = fn();
      if (r instanceof Promise) r.then((v) => { say(describe(v)); refreshAll(); }, (e: unknown) => say(`Error: ${e instanceof Error ? e.message : String(e)}`));
      else refreshAll();
    } catch (e) { say(`Error: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const describe = (v: unknown): string => {
    const o = v as { kept?: boolean; reason?: string } | undefined;
    return o && 'kept' in o ? (o.kept ? 'Applied; game state kept.' : `Applied; restarted fresh (${o.reason ?? 'state not kept'}).`) : 'Done.';
  };
  const download = (name: string, data: unknown): void => {
    const a = h('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const el = h('div', 'inspector');
  el.dataset['inspector'] = '';

  // ---- time controls ----
  const simLine = h('span', 'creator-note');
  const speed = h('select');
  for (const s of SPEEDS) speed.append(new Option(`${s}×`, String(s)));
  speed.dataset['fk'] = 'insp-speed';
  speed.addEventListener('change', () => run(() => dev['sim.speed']({ speed: Number(speed.value) })));
  const timeRow = h('div', 'creator-row');
  const holdBtn = btn('Hold', () => run(() => dev['sim.pause']({ paused: true })));
  holdBtn.dataset['act'] = 'hold';
  const runBtn = btn('Run', () => run(() => dev['sim.pause']({ paused: false })));
  runBtn.dataset['act'] = 'run';
  const autoBtn = btn('Auto', () => run(() => dev['sim.resume']()));
  const step1 = btn('Step 1', () => run(() => dev['sim.step']({ n: 1 })));
  step1.dataset['act'] = 'step';
  const step10 = btn('Step 10', () => run(() => dev['sim.step']({ n: 10 })));
  timeRow.append(holdBtn, runBtn, autoBtn, step1, step10, h('label', '', 'Speed'), speed);
  // ---- debug draw ----
  const drawRow = h('div', 'creator-row');
  const check = (label: string, key: 'enabled' | 'colliders'): HTMLInputElement => {
    const i = h('input');
    i.type = 'checkbox';
    i.dataset['fk'] = `insp-${key}`;
    i.addEventListener('change', () => run(() => dev['draw.set']({ [key]: i.checked })));
    const l = h('label');
    l.append(i, ` ${label}`);
    drawRow.append(l);
    return i;
  };
  const drawOn = check('Debug draw', 'enabled');
  const collOn = check('Colliders', 'colliders');
  drawRow.append(btn('System timings JSON', () => download('system-timings.json', dev['perf.systems']())));
  drawRow.append(btn('Screenshot', () => void dev.screenshot().then((r) => { const a = h('a'); a.href = (r as { dataUrl: string }).dataUrl; a.download = 'screenshot.png'; a.click(); })));

  // ---- entities ----
  const filter = h('input');
  filter.type = 'search';
  filter.placeholder = 'Filter: name, owner or component id';
  filter.dataset['fk'] = 'insp-filter';
  filter.addEventListener('input', () => refreshList());
  const list = h('table', 'creator-table');
  list.dataset['list'] = 'entities';
  const listInfo = h('p', 'creator-note');
  const editor = h('div', 'inspector-editor');
  let selected: number | undefined;
  const editing = new Set<string>();

  function refreshList(): void {
    let res: { total: number; entities: Summary[] };
    try { res = dev['world.query']({ limit: 5000 }) as unknown as typeof res; } catch { list.replaceChildren(); listInfo.textContent = 'No session.'; return; }
    const q = filter.value.trim().toLowerCase();
    const rows = res.entities.filter((e) => !q || (e.name ?? '').toLowerCase().includes(q) || e.owner.toLowerCase().includes(q) || e.components.some((c) => c.includes(q)) || String(e.id) === q);
    listInfo.textContent = `${rows.length} of ${res.total} entities${rows.length > 300 ? ' (first 300 shown)' : ''}`;
    const body = h('tbody');
    for (const e of rows.slice(0, 300)) {
      const tr = h('tr');
      tr.dataset['entity'] = String(e.id);
      if (e.id === selected) tr.className = 'creator-sel';
      tr.style.cursor = 'pointer';
      tr.append(h('td', 'creator-num', String(e.id)), h('td', '', e.name ?? ''), h('td', 'creator-id', e.owner), h('td', '', e.components.map((c) => c.replace(/^sdk\//, '')).join(' ')));
      tr.addEventListener('click', () => { selected = e.id; editing.clear(); refreshList(); refreshEditor(true); });
      body.append(tr);
    }
    const head = h('thead');
    const hr = h('tr');
    for (const t of ['Id', 'Name', 'Owner', 'Components']) hr.append(h('th', '', t));
    head.append(hr);
    list.replaceChildren(head, body);
  }

  function refreshEditor(force = false): void {
    if (selected === undefined) { editor.replaceChildren(h('p', 'creator-note', 'Select an entity to edit its components.')); return; }
    let ent: { id: number; owner: string; components: Record<string, Json> };
    try { ent = dev['entity.get']({ id: selected }) as unknown as typeof ent; } catch { selected = undefined; editor.replaceChildren(h('p', 'creator-note', 'Entity is gone.')); return; }
    const existing = new Map([...editor.querySelectorAll<HTMLTextAreaElement>('textarea[data-component]')].map((t) => [t.dataset['component']!, t]));
    const sameSet = existing.size === Object.keys(ent.components).length && Object.keys(ent.components).every((c) => existing.has(c));
    if (!force && sameSet) {
      // Live values: update every component that is not being edited.
      for (const [cid, data] of Object.entries(ent.components)) if (!editing.has(cid)) existing.get(cid)!.value = JSON.stringify(data, null, 1);
      return;
    }
    const wrap = h('div');
    wrap.append(h('h4', 'creator-h', `Entity ${ent.id} · ${ent.owner}`));
    for (const [cid, data] of Object.entries(ent.components).sort()) {
      const box = h('details');
      box.open = cid !== 'sdk/prev-transform';
      box.append(h('summary', 'creator-id', cid));
      const ta = h('textarea');
      ta.dataset['component'] = cid;
      ta.rows = Math.min(12, JSON.stringify(data, null, 1).split('\n').length);
      ta.style.width = '100%';
      ta.value = JSON.stringify(data, null, 1);
      ta.addEventListener('input', () => editing.add(cid));
      const apply = btn('Apply', () => {
        let v: Json;
        try { v = JSON.parse(ta.value) as Json; } catch (e) { say(`${cid}: invalid JSON (${(e as Error).message})`); return; }
        run(() => dev['entity.set']({ id: ent.id, component: cid, value: v }));
        editing.delete(cid);
        say(`${cid} updated.`);
      });
      apply.dataset['apply'] = cid;
      const revert = btn('Revert', () => { editing.delete(cid); refreshEditor(true); });
      const remove = btn('Remove', () => run(() => { dev['entity.set']({ id: ent.id, component: cid, value: null }); refreshEditor(true); }));
      const row = h('div', 'creator-row');
      row.append(apply, revert, remove);
      box.append(ta, row);
      wrap.append(box);
    }
    const addId = h('input');
    addId.placeholder = 'component id, e.g. game/tag';
    const addVal = h('input');
    addVal.placeholder = 'JSON value';
    const addRow = h('div', 'creator-row');
    addRow.append(addId, addVal, btn('Add', () => {
      let v: Json;
      try { v = JSON.parse(addVal.value || '{}') as Json; } catch { say('Invalid JSON'); return; }
      run(() => { dev['entity.set']({ id: ent.id, component: addId.value.trim(), value: v }); refreshEditor(true); });
    }));
    wrap.append(addRow);
    editor.replaceChildren(wrap);
  }

  // ---- tweak panel ----
  const tweaks = h('div');
  function refreshTweaks(): void {
    const plugins = dev['config.describe']() as unknown as { plugin: string; name: string; fields: Record<string, ConfigField>; values: Record<string, Json> }[];
    const out = h('div');
    if (!plugins.length) out.append(h('p', 'creator-note', 'No active plugin declares config fields.'));
    for (const p of plugins) {
      out.append(h('h4', 'creator-h', `${p.name} (${p.plugin})`));
      for (const [key, f] of Object.entries(p.fields)) {
        const cur = key in p.values ? p.values[key]! : f.default;
        const row = h('div', 'creator-row');
        row.append(h('label', '', f.label || key));
        let input: HTMLInputElement | HTMLSelectElement;
        if (f.type === 'select') { input = h('select'); for (const o of f.options ?? []) input.append(new Option(o, o)); input.value = String(cur); }
        else {
          input = h('input');
          input.type = f.type === 'boolean' ? 'checkbox' : f.type === 'number' ? 'range' : 'text';
          if (f.type === 'boolean') input.checked = cur === true;
          else {
            if (f.type === 'number') { input.min = String(f.min ?? 0); input.max = String(f.max ?? Math.max(10, Number(cur) * 4)); input.step = 'any'; }
            input.value = String(cur);
          }
        }
        input.dataset['fk'] = `tweak:${p.plugin}:${key}`;
        const shown = h('span', 'creator-num', f.type === 'number' ? String(cur) : '');
        const value = (): Json => (f.type === 'boolean' ? (input as HTMLInputElement).checked : f.type === 'number' ? Number(input.value) : input.value);
        if (f.type === 'number') input.addEventListener('input', () => { shown.textContent = input.value; });
        input.addEventListener('change', () => run(() => dev['config.set']({ plugin: p.plugin, key, value: value() })));
        row.append(input, shown);
        out.append(row);
      }
    }
    out.append(btn('Export preset', () => download(`${String((dev['preset.get']() as { id: string }).id).replace(/\W+/g, '-')}.json`, dev['preset.get']())));
    tweaks.replaceChildren(out);
  }

  const heading = (t: string): HTMLElement => h('h3', 'creator-h', t);
  el.append(heading('Time'), timeRow, simLine, heading('Debug'), drawRow, status, heading('Entities'), filter, listInfo, list, heading('Components'), editor, heading('Tweak plugin config (restarts, keeps state when possible)'), tweaks);

  function refreshAll(): void {
    const st = dev['sim.state']() as { tick: number; time: number; mode: string; speed: number; preset: string | null };
    simLine.textContent = `Tick ${st.tick} · ${st.time.toFixed(2)} s · mode ${st.mode} · ${st.speed}× · ${st.preset ?? 'no preset'}`;
    if (doc.activeElement !== speed) speed.value = String(st.speed);
    const d = dev['draw.set']({}) as { enabled: boolean; colliders: boolean };
    drawOn.checked = d.enabled;
    collOn.checked = d.colliders;
    if (doc.activeElement !== filter) refreshList();
    refreshEditor();
  }
  refreshAll();
  refreshTweaks();
  let tweakFor = '';
  return {
    el,
    update() {
      refreshAll();
      const key = JSON.stringify(dev['config.describe']());
      if (key !== tweakFor && !el.contains(doc.activeElement)) { tweakFor = key; refreshTweaks(); }
    },
    dispose() { el.remove(); },
  };
}
