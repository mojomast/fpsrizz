import { Flow, Health, HudRole, Inventory, Player, Transform, Ui, View, definePlugin } from '../../../../src/sdk/index.ts';
import { AmmoTypes, Damaged, PickupCollected, UseFailed, WeaponDry, Weapons } from '../../contracts/shooter.ts';

const ACCENTS: Readonly<Record<string, string>> = { cyan: '#5ef2ff', amber: '#ffc24d', green: '#6dff9a' };

const SEGMENTS = 24;
const PX_PER_DEG = 5;
const NOTICE_SECONDS = 3;

const CSS = `
.example-visor { position: absolute; inset: 0; overflow: hidden; pointer-events: none; user-select: none;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: var(--visor-c); text-shadow: 0 0 6px var(--visor-glow), 0 1px 2px #000; }
.visor-edge { position: absolute; inset: 0; opacity: 0;
  box-shadow: inset 0 0 90px 24px rgba(255, 40, 50, .85), inset 0 0 220px 40px rgba(255, 0, 20, .35); }
.visor-edge.visor-hit { animation: visor-hit .55s ease-out; }
@keyframes visor-hit { 0% { opacity: 1; } 100% { opacity: 0; } }
.visor-compass { position: absolute; top: 8px; left: 50%; width: 480px; height: 34px; margin-left: -240px; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent); mask-image: linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent); }
.visor-track { position: absolute; left: 240px; top: 0; height: 34px; will-change: transform; }
.visor-tick { position: absolute; top: 0; width: 0; height: 34px; }
.visor-tick::before { content: ""; position: absolute; left: 0; top: 0; width: 1px; height: 8px; background: var(--visor-c); opacity: .9; }
.visor-tick.visor-major::before { height: 14px; width: 2px; opacity: 1; }
.visor-tick span { position: absolute; left: -10px; width: 20px; top: 16px; text-align: center; font-size: 14px; font-weight: 700; letter-spacing: 1px; }
.visor-lubber { position: absolute; top: 0; left: 50%; margin-left: -4px; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 6px solid var(--visor-c); }
.visor-heading { position: absolute; top: 44px; left: 50%; transform: translateX(-50%); font-size: 10px; letter-spacing: 2px; opacity: .7; }
.visor-objective { position: absolute; top: 58px; left: 50%; transform: translateX(-50%); max-width: 80%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-size: 13px; letter-spacing: 2px; text-transform: uppercase; padding: 3px 14px; border-top: 1px solid var(--visor-dim); border-bottom: 1px solid var(--visor-dim); }
.visor-objective:empty { display: none; }
.visor-toast { position: absolute; top: 96px; left: 50%; transform: translateX(-50%); font-size: 13px; letter-spacing: 3px; text-transform: uppercase;
  opacity: 0; transition: opacity .25s; padding: 2px 12px; background: rgba(0, 20, 28, .45); border: 1px solid var(--visor-dim); }
.visor-toast.visor-on { opacity: 1; }
.visor-cross { position: absolute; left: 50%; top: 50%; width: 20px; height: 20px; margin: -10px 0 0 -10px; }
.visor-cross i { position: absolute; left: 50%; top: 50%; width: 3px; height: 3px; margin: -1.5px; border-radius: 50%; background: var(--visor-c); box-shadow: 0 0 4px #000; }
.visor-cross b { position: absolute; inset: 0; border: 1px solid var(--visor-c); border-radius: 50%; opacity: .85; box-shadow: 0 0 3px #000, inset 0 0 3px #000; }
.visor-cluster { position: absolute; bottom: 14px; left: 50%; width: 440px; margin-left: -220px; height: 150px; }
.visor-cluster::before { content: ""; position: absolute; left: -20px; right: -20px; top: 10px; bottom: -14px; z-index: -1; background: radial-gradient(ellipse at 50% 60%, rgba(0, 12, 18, .78), rgba(0, 12, 18, .5) 55%, transparent 75%); }
.visor-arc { position: absolute; left: 40px; top: 0; width: 360px; height: 108px; overflow: visible; }
.visor-seg { fill: none; stroke: var(--visor-c); stroke-width: 6; stroke-linecap: butt; opacity: .18; }
.visor-seg.visor-lit { opacity: 1; filter: drop-shadow(0 0 3px var(--visor-glow)); }
.visor-low .visor-seg.visor-lit { stroke: #ff5560; filter: drop-shadow(0 0 3px rgba(255, 60, 70, .8)); }
.visor-rail { fill: none; stroke: var(--visor-dim); stroke-width: 1; }
.visor-hp { position: absolute; left: 6px; top: 50px; text-align: left; font-size: 34px; font-weight: 300; letter-spacing: 3px; }
.visor-hp small { font-size: 10px; letter-spacing: 2px; opacity: .6; margin-right: 6px; }
.visor-low .visor-hp { color: #ff6a72; animation: visor-pulse .8s infinite alternate; }
@keyframes visor-pulse { from { opacity: 1; } to { opacity: .45; } }
.visor-ammo { position: absolute; right: 6px; top: 50px; text-align: right; font-size: 34px; font-weight: 300; line-height: 1; }
.visor-ammo small { display: block; font-size: 10px; letter-spacing: 2px; opacity: .65; margin-top: 3px; }
.visor-ammo.visor-dry { color: #ff6a72; }
.visor-ammo.visor-blink { animation: visor-hit .4s ease-out; }
.visor-weapon { position: absolute; left: 0; width: 100%; top: 114px; text-align: center; font-size: 11px; letter-spacing: 4px; text-transform: uppercase; opacity: .75; }
.visor-pick { position: absolute; left: 6px; top: 92px; font-size: 11px; letter-spacing: 1px; opacity: 0; transition: opacity .3s; text-transform: uppercase; }
.visor-pick.visor-on { opacity: .9; }
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Points on the gauge arc: centre (150,150), radius 120, sweeping left to right over the top. */
function arcPoint(r: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  return `${(150 + r * Math.cos(a)).toFixed(2)} ${(150 - r * Math.sin(a)).toFixed(2)}`;
}
function arcPath(r: number, from: number, to: number): string {
  return `M ${arcPoint(r, from)} A ${r} ${r} 0 0 1 ${arcPoint(r, to)}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(HudRole, 'example/visor-hud', {
      name: 'Visor HUD',
      description: 'Minimalist helmet-visor HUD with compass strip and arc health gauge.',
      activate(ctx) {
        const ui = ctx.services.tryGet(Ui);
        if (!ui) return;
        const flow = ctx.services.get(Flow);

        const accentName = String((ctx.config as Record<string, unknown>)['accent'] ?? 'cyan');
        const accent = ACCENTS[accentName] ?? '#5ef2ff';

        ui.addStyles(ctx, CSS);
        const root = ui.mount(ctx, 'hud', 'example-visor');
        root.style.setProperty('--visor-c', accent);
        root.style.setProperty('--visor-glow', accent + 'aa');
        root.style.setProperty('--visor-dim', accent + '66');

        // ---- build DOM -------------------------------------------------------------------------------------------
        const edge = el('div', 'visor-edge', root);

        const compass = el('div', 'visor-compass', root);
        const track = el('div', 'visor-track', compass);
        const labels: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        for (let h = -90; h <= 450; h += 15) {
          const norm = ((h % 360) + 360) % 360;
          const tick = el('div', 'visor-tick' + (norm % 90 === 0 ? ' visor-major' : ''), track);
          tick.style.left = `${h * PX_PER_DEG}px`;
          const label = labels[norm];
          if (label) el('span', '', tick).textContent = label;
        }
        el('div', 'visor-lubber', root);
        const heading = el('div', 'visor-heading', root);

        const objective = el('div', 'visor-objective', root);
        const toast = el('div', 'visor-toast', root);

        const cross = el('div', 'visor-cross', root);
        el('b', '', cross);
        el('i', '', cross);

        const cluster = el('div', 'visor-cluster', root);
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'visor-arc');
        svg.setAttribute('viewBox', '0 0 300 90');
        const rail = document.createElementNS(SVG_NS, 'path');
        rail.setAttribute('class', 'visor-rail');
        rail.setAttribute('d', arcPath(108, 140, 40));
        svg.appendChild(rail);
        const segs: SVGPathElement[] = [];
        const span = 90;
        const step = span / SEGMENTS;
        for (let i = 0; i < SEGMENTS; i++) {
          const p = document.createElementNS(SVG_NS, 'path');
          const a0 = 135 - i * step;
          p.setAttribute('class', 'visor-seg');
          p.setAttribute('d', arcPath(120, a0, a0 - step * 0.7));
          svg.appendChild(p);
          segs.push(p);
        }
        // viewBox crop: arc occupies y 30..150 of the 300x300 plane; shift to fit.
        svg.setAttribute('viewBox', '0 36 300 90');
        cluster.appendChild(svg);
        const hp = el('div', 'visor-hp', cluster);
        const ammo = el('div', 'visor-ammo', cluster);
        const ammoNum = el('span', '', ammo);
        const ammoSub = el('small', '', ammo);
        const weaponEl = el('div', 'visor-weapon', cluster);
        const pick = el('div', 'visor-pick', cluster);

        // ---- change-only DOM writers -----------------------------------------------------------------------------
        const cache = new Map<object, string>();
        const setText = (e: HTMLElement, text: string): void => {
          if (cache.get(e) === text) return;
          cache.set(e, text);
          e.textContent = text;
        };
        const setClass = (e: Element, cls: string, on: boolean): void => {
          const key = `class:${cls}`;
          const prev = cache.get(e) ?? '';
          const has = prev.split(' ').includes(key);
          if (has === on) return;
          cache.set(e, on ? `${prev} ${key}` : prev.replace(` ${key}`, ''));
          e.classList.toggle(cls, on);
        };

        // ---- state -----------------------------------------------------------------------------------------------
        let lit = -1;
        let lastHeading = Number.NaN;
        let lastRev = -1;
        let noticeLeft = 0;
        let lastNoticeAt = Number.NaN;
        let lastNoticeText = '';
        let pickLeft = 0;

        const player = (): number => {
          let id = 0;
          ctx.world.each(Player, (e) => { if (!id) id = e; });
          return id;
        };
        const isPlayer = (e: number): boolean => ctx.world.has(e, Player);

        const showToast = (text: string): void => {
          setText(toast, text);
          setClass(toast, 'visor-on', true);
          noticeLeft = NOTICE_SECONDS;
        };

        ctx.events.on(Damaged, (e) => {
          if (!isPlayer(e.target)) return;
          edge.classList.remove('visor-hit');
          void edge.offsetWidth; // restart the animation
          edge.classList.add('visor-hit');
        });
        ctx.events.on(PickupCollected, (e) => {
          if (e.by !== player() || !e.label) return;
          setText(pick, `+ ${e.label}`);
          setClass(pick, 'visor-on', true);
          pickLeft = 1.8;
        });
        ctx.events.on(WeaponDry, (e) => {
          if (!isPlayer(e.entity)) return;
          ammo.classList.remove('visor-blink');
          void ammo.offsetWidth;
          ammo.classList.add('visor-blink');
        });
        ctx.events.on(UseFailed, (e) => {
          if (!isPlayer(e.by)) return;
          showToast(e.reason === 'locked' ? 'Access denied' : 'Nothing to use');
        });
        ctx.scope.add(() => cache.clear(), 'visor-cache');

        ctx.systems.addFrame({
          id: 'example/visor-hud.frame',
          update(_alpha, frameDt) {
            const id = player();

            // health arc
            const h = id ? ctx.world.get(id, Health) : undefined;
            if (h) {
              const ratio = h.max > 0 ? Math.max(0, Math.min(1, h.hp / h.max)) : 0;
              const n = h.hp > 0 ? Math.max(1, Math.ceil(ratio * SEGMENTS)) : 0;
              if (n !== lit) {
                for (let i = 0; i < SEGMENTS; i++) segs[i]?.classList.toggle('visor-lit', i < n);
                lit = n;
              }
              setText(hp, `${Math.max(0, Math.ceil(h.hp))}`);
              setClass(cluster, 'visor-low', ratio < 0.3);
            }

            // ammo + weapon
            const inv = id ? ctx.world.get(id, Inventory) : undefined;
            if (inv && inv.current) {
              const def = ctx.registries.get(Weapons, inv.current);
              setText(weaponEl, def ? def.name : inv.current);
              if (def && def.ammoType) {
                const n = Math.floor(inv.ammo[def.ammoType] ?? 0);
                const ammoDef = ctx.registries.get(AmmoTypes, def.ammoType);
                setText(ammoNum, String(n));
                setText(ammoSub, ammoDef ? ammoDef.name : def.ammoType);
                setClass(ammo, 'visor-dry', n < def.ammoPerShot);
              } else {
                setText(ammoNum, '∞');
                setText(ammoSub, '');
                setClass(ammo, 'visor-dry', false);
              }
            } else {
              setText(weaponEl, '');
              setText(ammoNum, '');
              setText(ammoSub, '');
            }

            // compass: heading is clockwise degrees from north; yaw is positive to the left.
            const view = ctx.services.tryGet(View);
            let yaw = view ? view.yaw : undefined;
            if (yaw === undefined && id) yaw = ctx.world.get(id, Transform)?.yaw;
            if (yaw !== undefined) {
              const deg = (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
              const q = Math.round(deg * 2) / 2;
              if (q !== lastHeading) {
                lastHeading = q;
                track.style.transform = `translateX(${(-q * PX_PER_DEG).toFixed(1)}px)`;
                setText(heading, String(Math.round(q) % 360).padStart(3, '0') + '°');
              }
            }

            // objective line and notices
            if (flow.revision !== lastRev) {
              lastRev = flow.revision;
              const parts: string[] = [];
              if (flow.objective) parts.push(flow.objective);
              for (const s of flow.status.values()) parts.push(`${s.label} ${s.value}`);
              setText(objective, parts.join(' \u00b7 '));
              const n = flow.notice;
              if (n.text && (n.at !== lastNoticeAt || n.text !== lastNoticeText)) {
                lastNoticeAt = n.at;
                lastNoticeText = n.text;
                showToast(n.text);
              }
            }
            if (noticeLeft > 0) {
              noticeLeft -= frameDt;
              if (noticeLeft <= 0) setClass(toast, 'visor-on', false);
            }
            if (pickLeft > 0) {
              pickLeft -= frameDt;
              if (pickLeft <= 0) setClass(pick, 'visor-on', false);
            }
          },
        });
      },
    });
  },
});
