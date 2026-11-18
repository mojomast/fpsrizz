/**
 * On-screen touch controls (SDK 3 input v2): a left virtual stick ("touch:left"), a right drag area that feeds
 * `lookX/lookY` and "touch:right", and buttons for every action bound to a TouchA..TouchD virtual key. Shown on
 * coarse-pointer devices or with `?touch`; hidden otherwise. Built from pointer events, so mouse/pen work too when
 * forced on.
 */
import { TOUCH_BUTTONS } from '../sdk/contracts/input.ts';
import type { InputCore } from './input.ts';
import { createActionLookup } from './input.ts';

export interface TouchOptions {
  /** Inserts the control layer into the page (above the canvas, below menus). */
  mount: (layer: HTMLElement) => void;
  actions: () => ReadonlyArray<{ id: string; keys: readonly string[]; label?: string }>;
  isCaptured: () => boolean;
  /** Force visibility (tests, `?touch`). Default: matchMedia('(pointer: coarse)'). */
  enabled?: boolean;
  /** Stick radius in CSS pixels (default 56). */
  radius?: number;
  /** Look sensitivity: CSS pixels dragged -> look pixels (default 1.5). */
  lookScale?: number;
}

/** Pointer capture keeps a drag on its control; synthetic or already-ended pointers cannot be captured. */
function capture(el: Element, id: number): void {
  try { el.setPointerCapture(id); } catch { /* not an active pointer */ }
}

const CSS = `
.bh-touch{position:absolute;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;z-index:1}
.bh-touch[hidden]{display:none}
.bh-touch-zone{position:absolute;bottom:0;top:35%;pointer-events:auto;touch-action:none}
.bh-touch-zone.left{left:0;width:40%}.bh-touch-zone.right{right:0;width:60%}
.bh-touch-stick{position:absolute;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.35);display:none}
.bh-touch-knob{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,.45)}
.bh-touch-btns{position:absolute;right:16px;bottom:16px;display:flex;flex-wrap:wrap-reverse;gap:10px;max-width:180px;justify-content:flex-end;pointer-events:none}
.bh-touch-btn{pointer-events:auto;width:64px;height:64px;border-radius:50%;border:2px solid rgba(255,255,255,.5);background:rgba(20,24,32,.45);color:#fff;font:600 12px system-ui;touch-action:none}
.bh-touch-btn.down{background:rgba(255,255,255,.35)}
`;

export function bindTouchControls(core: InputCore, opts: TouchOptions): { refresh(): void; dispose(): void; readonly element: HTMLElement } {
  const radius = opts.radius ?? 56;
  const lookScale = opts.lookScale ?? 1.5;
  const lookup = createActionLookup(opts.actions);
  const doc = document;
  if (!doc.getElementById('bh-touch-css')) {
    const style = doc.createElement('style');
    style.id = 'bh-touch-css';
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  const layer = doc.createElement('div');
  layer.className = 'bh-touch';
  layer.dataset['inputUi'] = '';
  const enabled = opts.enabled ?? (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  layer.hidden = !enabled;
  const left = doc.createElement('div'); left.className = 'bh-touch-zone left';
  const right = doc.createElement('div'); right.className = 'bh-touch-zone right';
  const stick = doc.createElement('div'); stick.className = 'bh-touch-stick';
  const knob = doc.createElement('div'); knob.className = 'bh-touch-knob';
  stick.appendChild(knob);
  left.appendChild(stick);
  const btns = doc.createElement('div'); btns.className = 'bh-touch-btns';
  layer.append(left, right, btns);
  opts.mount(layer);

  let leftId: number | undefined, ox = 0, oy = 0;
  const onLeftDown = (e: PointerEvent): void => {
    if (leftId !== undefined || !opts.isCaptured()) return;
    leftId = e.pointerId;
    capture(left, e.pointerId);
    const r = left.getBoundingClientRect();
    ox = e.clientX; oy = e.clientY;
    stick.style.left = `${e.clientX - r.left}px`; stick.style.top = `${e.clientY - r.top}px`; stick.style.display = 'block';
    knob.style.transform = '';
    core.noteDevice('touch');
    e.preventDefault();
  };
  const onLeftMove = (e: PointerEvent): void => {
    if (e.pointerId !== leftId) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);
    if (len > radius) { dx *= radius / len; dy *= radius / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    core.setAnalog('touch:left', dx / radius, dy / radius);
  };
  const onLeftUp = (e: PointerEvent): void => {
    if (e.pointerId !== leftId) return;
    leftId = undefined;
    stick.style.display = 'none';
    core.setAnalog('touch:left', 0, 0);
  };
  let rightId: number | undefined, lx = 0, ly = 0;
  const onRightDown = (e: PointerEvent): void => {
    if (rightId !== undefined || !opts.isCaptured()) return;
    rightId = e.pointerId; lx = e.clientX; ly = e.clientY;
    capture(right, e.pointerId);
    core.noteDevice('touch');
    e.preventDefault();
  };
  const onRightMove = (e: PointerEvent): void => {
    if (e.pointerId !== rightId) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    core.addLook(dx * lookScale, dy * lookScale);
    core.setAnalog('touch:right', Math.max(-1, Math.min(1, dx / 12)), Math.max(-1, Math.min(1, dy / 12)));
  };
  const onRightUp = (e: PointerEvent): void => {
    if (e.pointerId !== rightId) return;
    rightId = undefined;
    core.setAnalog('touch:right', 0, 0);
  };
  left.addEventListener('pointerdown', onLeftDown);
  left.addEventListener('pointermove', onLeftMove);
  left.addEventListener('pointerup', onLeftUp);
  left.addEventListener('pointercancel', onLeftUp);
  right.addEventListener('pointerdown', onRightDown);
  right.addEventListener('pointermove', onRightMove);
  right.addEventListener('pointerup', onRightUp);
  right.addEventListener('pointercancel', onRightUp);

  const buildButtons = (): void => {
    btns.replaceChildren();
    for (const key of TOUCH_BUTTONS) {
      const ids = lookup.get(key);
      if (ids.length === 0) continue;
      const label = opts.actions().find((a) => a.id === ids[0])?.label ?? key.slice(5);
      const b = doc.createElement('button');
      b.className = 'bh-touch-btn';
      b.textContent = label;
      b.dataset['key'] = key;
      const release = (): void => { b.classList.remove('down'); core.releaseKey(key); };
      b.addEventListener('pointerdown', (e) => {
        if (!opts.isCaptured()) return;
        e.preventDefault();
        capture(b, e.pointerId);
        b.classList.add('down');
        core.noteDevice('touch');
        core.pressKey(key, lookup.get(key));
      });
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      btns.appendChild(b);
    }
  };
  buildButtons();
  return {
    element: layer,
    refresh() { lookup.refresh(); buildButtons(); },
    dispose() { layer.remove(); },
  };
}
