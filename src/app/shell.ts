import { SHELL_CSS } from './shell-styles.ts';

export interface ShellSettings {
  sensitivity: number;
  volume: number;
  pixelRatioCap: number;
}
export interface ShellCallbacks {
  onPlay(): void;
  onResume(): void;
  onRestart(): void;
  onQuitToMenu(): void;
  onSettingsChange(s: ShellSettings): void;
  onOpenCreator(): void;
}
export type ShellScreen = 'none' | 'start' | 'pause' | 'end' | 'error' | 'loading' | 'unsupported';
export interface EndInfo {
  outcome: 'victory' | 'defeat';
  title: string;
  detail: string;
  stats: [label: string, value: string][];
}
export interface StartInfo {
  presetName: string;
  objective: string;
  controls: [keys: string, action: string][];
  extensions: string[];
}
export interface Shell {
  readonly canvas: HTMLCanvasElement;
  readonly hudLayer: HTMLElement;
  readonly overlayLayer: HTMLElement;
  readonly creatorHost: HTMLElement;
  readonly screen: ShellScreen;
  showStart(info: StartInfo): void;
  showPause(): void;
  showEnd(info: EndInfo): void;
  showError(title: string, lines: string[], canReturnToMenu: boolean): void;
  showLoading(text: string): void;
  showUnsupported(message: string): void;
  hide(): void;
  setHint(text: string | null): void;
  setSettings(s: ShellSettings): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const QUALITY: [number, string][] = [
  [1, 'Performance'],
  [1.5, 'Balanced'],
  [2, 'Sharp'],
];

export function createShell(root: HTMLElement, cb: ShellCallbacks, initial: ShellSettings): Shell {
  const style = document.createElement('style');
  style.setAttribute('data-bulkhead-shell', '');
  style.textContent = SHELL_CSS;
  document.head.appendChild(style);

  const wrap = el('div', 'bh-root');
  const canvas = el('canvas', 'bh-canvas');
  const hudLayer = el('div', 'bh-hud');
  const overlayLayer = el('div', 'bh-overlay');
  const hint = el('div', 'bh-hint');
  hint.hidden = true;
  hint.setAttribute('role', 'status');
  const screenEl = el('div', 'bh-screen');
  const creatorHost = el('div', 'bh-creator');
  wrap.append(canvas, hudLayer, overlayLayer, hint, screenEl, creatorHost);
  root.appendChild(wrap);

  // Menus never leak pointer/click events to the canvas or anything beneath.
  const stop = (e: Event): void => e.stopPropagation();
  const stopTypes = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'wheel'];
  for (const t of stopTypes) screenEl.addEventListener(t, stop);

  let settings: ShellSettings = { ...initial };
  let current: ShellScreen = 'none';
  let lastControls: [string, string][] = [];
  let syncers: (() => void)[] = [];
  let pending: (() => void)[] = [];

  const emit = (): void => cb.onSettingsChange({ ...settings });

  function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', 'bh-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function label(text: string): HTMLElement {
    return el('div', 'bh-label', text);
  }

  function controlsTable(controls: [string, string][]): HTMLElement {
    const box = el('div', 'bh-ctrl-grid');
    const half = Math.ceil(controls.length / 2);
    for (const part of [controls.slice(0, half), controls.slice(half)]) {
      const t = el('table', 'bh-table');
      const tb = el('tbody');
      for (const [k, a] of part) {
        const tr = el('tr');
        tr.append(el('td', undefined, k), el('td', undefined, a));
        tb.appendChild(tr);
      }
      t.appendChild(tb);
      box.appendChild(t);
    }
    return box;
  }

  function settingsBlock(): HTMLElement {
    const g = el('div', 'bh-settings');
    const mkSlider = (
      name: string,
      min: number,
      max: number,
      step: number,
      get: () => number,
      set: (v: number) => void,
      fmt: (v: number) => string,
    ): void => {
      const l = el('label', undefined, name);
      const input = el('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(get());
      input.setAttribute('aria-label', name);
      const out = el('output', 'bh-readout', fmt(get()));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        set(v);
        out.textContent = fmt(v);
        emit();
      });
      pending.push(() => {
        input.value = String(get());
        out.textContent = fmt(get());
      });
      g.append(l, input, out);
    };
    mkSlider('Mouse sensitivity', 0.2, 3, 0.05, () => settings.sensitivity, (v) => { settings.sensitivity = v; }, (v) => v.toFixed(2));
    mkSlider('Volume', 0, 1, 0.05, () => settings.volume, (v) => { settings.volume = v; }, (v) => Math.round(v * 100) + '%');

    const ql = el('label', undefined, 'Quality');
    const sel = el('select');
    sel.setAttribute('aria-label', 'Quality');
    for (const [v, name] of QUALITY) {
      const o = el('option', undefined, name);
      o.value = String(v);
      sel.appendChild(o);
    }
    const syncSel = (): void => {
      let best = QUALITY[0]?.[0] ?? 1;
      for (const [v] of QUALITY) {
        if (Math.abs(v - settings.pixelRatioCap) < Math.abs(best - settings.pixelRatioCap)) best = v;
      }
      sel.value = String(best);
    };
    syncSel();
    pending.push(syncSel);
    sel.addEventListener('change', () => {
      settings.pixelRatioCap = Number(sel.value);
      emit();
    });
    g.append(ql, sel);
    return g;
  }

  function panel(extra = '', tone?: string): HTMLElement {
    const p = el('div', 'bh-panel' + (extra ? ' ' + extra : ''));
    if (tone) p.dataset['tone'] = tone;
    return p;
  }

  function mount(kind: ShellScreen, content: HTMLElement | null, focus: HTMLElement | null): void {
    current = kind;
    syncers = pending;
    pending = [];
    screenEl.replaceChildren();
    if (content) {
      const c = el('div', 'bh-center');
      c.appendChild(content);
      screenEl.appendChild(c);
      screenEl.dataset['active'] = '1';
      screenEl.scrollTop = 0;
    } else {
      delete screenEl.dataset['active'];
    }
    screenEl.dataset['kind'] = kind;
    wrap.dataset['hideLayers'] = kind === 'start' || kind === 'unsupported' || kind === 'loading' || kind === 'error' ? '1' : '0';
    if (kind === 'loading') screenEl.setAttribute('aria-busy', 'true');
    else screenEl.removeAttribute('aria-busy');
    if (focus) focus.focus({ preventScroll: true });
  }

  function onKey(e: KeyboardEvent): void {
    if (current === 'start' && e.key === 'Enter' && !e.repeat) {
      const t = e.target;
      // Buttons handle Enter natively; avoid double-firing.
      if (t instanceof HTMLButtonElement) return;
      e.preventDefault();
      cb.onPlay();
    }
  }
  document.addEventListener('keydown', onKey);

  const shell: Shell = {
    canvas,
    hudLayer,
    overlayLayer,
    creatorHost,
    get screen() {
      return current;
    },
    showStart(info) {
      lastControls = info.controls.map(([k, a]) => [k, a]);
      const p = panel('bh-wide');
      p.append(el('h1', 'bh-title', 'Bulkhead'), el('div', 'bh-sub', 'modular shooter foundation'));
      const pre = el('p', 'bh-preset');
      pre.append('Preset: ', el('b', undefined, info.presetName));
      p.append(pre, el('p', 'bh-objective', info.objective));
      p.append(label('Controls'), controlsTable(lastControls));
      if (info.extensions.length > 0) {
        p.append(label('Extensions'));
        const ul = el('ul', 'bh-ext');
        for (const n of info.extensions) ul.appendChild(el('li', undefined, n));
        p.appendChild(ul);
      }
      p.append(label('Settings'), settingsBlock());
      const play = btn('Play', () => cb.onPlay(), 'bh-primary');
      play.autofocus = true;
      const row = el('div', 'bh-btns');
      row.append(play, btn('Creator tools', () => cb.onOpenCreator(), 'bh-small'));
      p.append(row, el('p', 'bh-foot', 'Esc releases the mouse and pauses.'));
      mount('start', p, play);
    },
    showPause() {
      const p = panel('bh-wide');
      p.append(el('h2', 'bh-h2', 'Paused'));
      const resume = btn('Resume', () => cb.onResume(), 'bh-primary');
      resume.autofocus = true;
      const row = el('div', 'bh-btns');
      row.style.marginTop = '0';
      row.append(resume, btn('Restart', () => cb.onRestart()), btn('Main menu', () => cb.onQuitToMenu()));
      p.appendChild(row);
      p.append(label('Settings'), settingsBlock());
      if (lastControls.length > 0) p.append(label('Controls'), controlsTable(lastControls));
      const row2 = el('div', 'bh-btns');
      row2.append(btn('Creator tools', () => cb.onOpenCreator(), 'bh-small'));
      p.appendChild(row2);
      mount('pause', p, resume);
    },
    showEnd(info) {
      const p = panel('', info.outcome === 'defeat' ? 'danger' : undefined);
      const h = el('h2', 'bh-h2', info.title);
      h.dataset['tone'] = info.outcome;
      p.append(h, el('p', 'bh-text', info.detail));
      if (info.stats.length > 0) {
        const ul = el('ul', 'bh-stats');
        for (const [k, v] of info.stats) {
          const li = el('li');
          li.append(el('span', 'k', k), el('span', 'd'), el('span', 'v', v));
          ul.appendChild(li);
        }
        p.appendChild(ul);
      }
      const restart = btn('Restart', () => cb.onRestart(), 'bh-primary');
      restart.autofocus = true;
      const row = el('div', 'bh-btns');
      row.append(restart, btn('Main menu', () => cb.onQuitToMenu()));
      p.appendChild(row);
      mount('end', p, restart);
    },
    showError(title, lines, canReturnToMenu) {
      const p = panel('bh-wide', 'danger');
      p.setAttribute('role', 'alert');
      const h = el('h2', 'bh-h2', title);
      h.dataset['tone'] = 'error';
      p.appendChild(h);
      const box = el('div', 'bh-errlines');
      box.tabIndex = 0;
      for (const l of lines) box.appendChild(el('div', undefined, l));
      p.appendChild(box);
      let focus: HTMLElement | null = box;
      if (canReturnToMenu) {
        const b = btn('Main menu', () => cb.onQuitToMenu(), 'bh-primary');
        const row = el('div', 'bh-btns');
        row.appendChild(b);
        p.appendChild(row);
        focus = b;
      }
      mount('error', p, focus);
    },
    showLoading(text) {
      const p = panel('bh-loading');
      p.append(el('h2', 'bh-h2', 'Loading'), el('p', 'bh-text', text), el('div', 'bh-bar'));
      p.setAttribute('role', 'status');
      mount('loading', p, null);
    },
    showUnsupported(message) {
      const p = panel('bh-wide', 'danger');
      const h = el('h2', 'bh-h2', 'Unsupported');
      h.dataset['tone'] = 'error';
      p.append(h, el('p', 'bh-text', message));
      p.setAttribute('role', 'alert');
      mount('unsupported', p, null);
    },
    hide() {
      mount('none', null, null);
    },
    setHint(text) {
      if (text === null) {
        hint.hidden = true;
        hint.textContent = '';
      } else {
        hint.textContent = text;
        hint.hidden = false;
      }
    },
    setSettings(s) {
      settings = { ...s };
      for (const f of syncers) f();
    },
    dispose() {
      document.removeEventListener('keydown', onKey);
      for (const t of stopTypes) screenEl.removeEventListener(t, stop);
      syncers = [];
      pending = [];
      wrap.remove();
      style.remove();
    },
  };
  mount('none', null, null);
  return shell;
}
