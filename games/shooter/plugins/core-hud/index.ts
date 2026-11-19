import type { EntityId, SessionContext } from '../../../../src/sdk/index.ts';
import { Flow, Ui, Health, HudRole, Inventory, Player, View, definePlugin } from '../../../../src/sdk/index.ts';
import { Damaged, PickupCollected, UseFailed, WeaponDry, WeaponRuntime, Weapons, AmmoTypes } from '../../contracts/shooter.ts';
import { HUD_CSS } from './styles.ts';

const NOTICE_SECONDS = 2.5;
const DAMAGE_FADE_SECONDS = 0.4;
const FIRE_KICK_SECONDS = 0.12;
const SEGMENTS = 20;
const CRITICAL = 0.3;
const LOW_PULSE = 0.25;

interface SlotView {
  id: string;
  slot: number;
  ammoType: string;
  el: HTMLElement;
  ammoText: Text;
  ammo: number;
  cur: boolean;
  empty: boolean;
}

function div(cls: string, parent?: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = cls;
  parent?.appendChild(el);
  return el;
}
function text(parent: HTMLElement, s = ''): Text {
  const t = document.createTextNode(s);
  parent.appendChild(t);
  return t;
}
function label(parent: HTMLElement, s: string): HTMLDivElement {
  const el = div('core-hud-label', parent);
  el.textContent = s;
  return el;
}

function activateHud(sctx: SessionContext): void {
  const ui = sctx.services.tryGet(Ui);
  if (!ui) return; // headless
  const flow = sctx.services.tryGet(Flow);
  const showCrosshair = sctx.config.showCrosshair !== false;

  ui.addStyles(sctx, HUD_CSS);
  const root = ui.mount(sctx, 'hud', 'core-hud');

  // ---- static DOM, built once -------------------------------------------------------------------------------------
  const vignette = div('core-hud-vignette', root);
  const lowhp = div('core-hud-lowhp', root);

  const objective = div('core-hud-panel core-hud-objective', root);
  label(objective, 'Objective');
  const objText = div('core-hud-objtext', objective);
  const statsEl = div('core-hud-stats', objective);

  const notice = div('core-hud-panel core-hud-notice', root);
  const noticeText = text(notice);

  const cross = div('core-hud-cross', root);
  if (!showCrosshair) cross.classList.add('core-hud-hidden');
  for (let i = 0; i < 4; i++) cross.appendChild(document.createElement('i'));
  cross.appendChild(document.createElement('b'));

  const health = div('core-hud-panel core-hud-health', root);
  label(health, 'Health');
  const hpNum = div('core-hud-num', health);
  const hpText = text(hpNum, '0');
  const bar = div('core-hud-bar', health);
  const segs: HTMLElement[] = [];
  for (let i = 0; i < SEGMENTS; i++) segs.push(div('core-hud-seg', bar));

  const ammo = div('core-hud-panel core-hud-ammo', root);
  const weaponName = div('core-hud-weapon', ammo);
  const weaponText = text(weaponName);
  const ammoNum = div('core-hud-num', ammo);
  const ammoNumText = text(ammoNum, '0');
  const ammoType = div('core-hud-label core-hud-ammotype', ammo);
  const ammoTypeText = text(ammoType);
  const slotsEl = div('core-hud-slots', ammo);

  // ---- caches -----------------------------------------------------------------------------------------------------
  let lastHp = NaN;
  let lastMax = NaN;
  let filled = 0;
  let crit = false;
  let low = false;
  let dead = false;
  let lastRev = -1;
  let objCache = '';
  let noticeCacheText = '';
  let noticeCacheAt = -1;
  let noticeLeft = 0;
  let noticeShown = false;
  let shownNotice = '';
  let damage = 0;
  let damageShown = 0;
  let fireLeft = 0;
  let fireOn = false;
  let lastFired = NaN;
  let trackedEntity: EntityId = 0;
  let weaponCache: string | null | undefined;
  let weaponLabel = '';
  let ammoTypeLabel = '';
  let ammoValue = NaN;
  let curAmmoType = '';
  const slots: SlotView[] = [];
  const ownedIds: string[] = [];
  const statRows: { row: HTMLElement; k: Text; v: Text; kc: string; vc: string }[] = [];
  let statCount = 0;

  const setText = (t: Text, s: string): void => { if (t.data !== s) t.data = s; };

  const playerId = (): EntityId | undefined => {
    const view = sctx.services.tryGet(View);
    if (view && view.entity !== 0 && sctx.world.isAlive(view.entity)) return view.entity;
    return sctx.world.first(Player);
  };

  const showNotice = (msg: string): void => {
    noticeLeft = NOTICE_SECONDS;
    if (msg !== shownNotice) {
      shownNotice = msg;
      noticeText.data = msg;
    }
  };

  // ---- events -----------------------------------------------------------------------------------------------------
  sctx.events.on(Damaged, (e) => {
    if (e.target !== playerId()) return;
    const level = Math.min(1, 0.35 + e.amount / 40);
    if (level > damage) damage = level;
  });
  sctx.events.on(PickupCollected, (e) => {
    if (e.by === playerId() && e.label) showNotice(e.label);
  });
  sctx.events.on(UseFailed, (e) => {
    if (e.reason === 'locked' && e.by === playerId()) showNotice('LOCKED — find the switch');
  });
  sctx.events.on(WeaponDry, (e) => {
    if (e.entity === playerId()) {
      const def = sctx.registries.get(Weapons, e.weapon);
      const inv = sctx.world.get(e.entity, Inventory);
      showNotice(def?.magazineSize !== undefined && (inv?.ammo[def.ammoType] ?? 0) > 0 ? 'RELOAD' : 'OUT OF AMMO');
    }
  });

  // ---- slot bar ---------------------------------------------------------------------------------------------------
  const rebuildSlots = (inv: { weapons: string[] }): void => {
    for (const s of slots) s.el.remove();
    slots.length = 0;
    ownedIds.length = 0;
    for (const id of inv.weapons) {
      ownedIds.push(id);
      const def = sctx.registries.get(Weapons, id);
      const el = div('core-hud-slot');
      const num = document.createElement('b');
      num.textContent = def ? String(def.slot) : '?';
      el.appendChild(num);
      const am = document.createElement('i');
      const ammoText = text(am);
      el.appendChild(am);
      slots.push({ id, slot: def?.slot ?? 99, ammoType: def?.ammoType ?? '', el, ammoText, ammo: NaN, cur: false, empty: false });
    }
    slots.sort((a, b) => a.slot - b.slot);
    for (const s of slots) slotsEl.appendChild(s.el);
  };

  // ---- per-frame update -------------------------------------------------------------------------------------------
  const update = (_alpha: number, dt: number): void => {
    const pid = playerId();
    const hp = pid === undefined ? undefined : sctx.world.get(pid, Health);
    const inv = pid === undefined ? undefined : sctx.world.get(pid, Inventory);
    const runtime = pid === undefined ? undefined : sctx.world.get(pid, WeaponRuntime);
    const pEntity = pid ?? 0;

    if (pEntity !== trackedEntity) {
      trackedEntity = pEntity;
      lastFired = inv ? inv.lastFiredAt : NaN;
    }

    // Health
    const hv = hp ? Math.max(0, Math.ceil(hp.hp)) : 0;
    const hm = hp ? hp.max : 0;
    if (hv !== lastHp || hm !== lastMax) {
      lastHp = hv;
      lastMax = hm;
      setText(hpText, String(hv));
      const frac = hm > 0 ? Math.min(1, hv / hm) : 0;
      const n = hv > 0 ? Math.max(1, Math.ceil(frac * SEGMENTS - 1e-9)) : 0;
      for (let i = Math.min(n, filled); i < Math.max(n, filled); i++) segs[i]!.classList.toggle('core-hud-on', i < n);
      filled = n;
      const c = frac < CRITICAL;
      if (c !== crit) { crit = c; root.classList.toggle('core-hud-crit', c); }
      const l = frac < LOW_PULSE && hv > 0;
      if (l !== low) { low = l; root.classList.toggle('core-hud-low', l); }
    }
    const isDead = hp ? hp.dead : false;
    if (isDead !== dead) {
      dead = isDead;
      root.classList.toggle('core-hud-dead', dead);
      if (dead) { low = false; root.classList.remove('core-hud-low'); }
    }

    // Weapon / ammo
    const cur = inv ? inv.current : null;
    if (inv) {
      let changed = inv.weapons.length !== ownedIds.length;
      for (let i = 0; !changed && i < ownedIds.length; i++) if (inv.weapons[i] !== ownedIds[i]) changed = true;
      if (changed) rebuildSlots(inv);
      for (const s of slots) {
        const isCur = s.id === cur;
        const def = sctx.registries.get(Weapons, s.id);
        const a = def?.magazineSize !== undefined ? (runtime?.loaded[s.id] ?? 0) : s.ammoType === '' ? Infinity : (inv.ammo[s.ammoType] ?? 0);
        if (a !== s.ammo) {
          s.ammo = a;
          setText(s.ammoText, a === Infinity ? '∞' : String(Math.floor(a)));
          const emp = a <= 0;
          if (emp !== s.empty) { s.empty = emp; s.el.classList.toggle('core-hud-empty', emp); }
        }
        if (isCur !== s.cur) { s.cur = isCur; s.el.classList.toggle('core-hud-cur', isCur); }
      }
      if (cur !== weaponCache) {
        weaponCache = cur;
        const def = cur ? sctx.registries.get(Weapons, cur) : undefined;
        weaponLabel = def ? def.name : cur ? cur : '—';
        curAmmoType = def ? def.ammoType : '';
        ammoTypeLabel = curAmmoType === '' ? (def ? 'Unlimited' : '') : (sctx.registries.get(AmmoTypes, curAmmoType)?.name ?? curAmmoType);
        setText(weaponText, weaponLabel);
        setText(ammoTypeText, ammoTypeLabel);
        ammoValue = NaN;
      }
      const curDef = cur ? sctx.registries.get(Weapons, cur) : undefined;
      const av = curDef?.magazineSize !== undefined ? (runtime?.loaded[cur!] ?? 0) : curAmmoType === '' ? Infinity : Math.floor(inv.ammo[curAmmoType] ?? 0);
      if (av !== ammoValue) {
        ammoValue = av;
        
        setText(ammoNumText, av === Infinity ? '\u221E' : String(av));
      }
      if (curDef?.magazineSize !== undefined) {
        setText(ammoNumText, `${av} / ${Math.floor(inv.ammo[curAmmoType] ?? 0)}`);
        setText(ammoTypeText, runtime?.reload ? 'RELOADING' : ammoTypeLabel);
      }
      // Crosshair kick on firing
      if (inv.lastFiredAt !== lastFired) {
        lastFired = inv.lastFiredAt;
        fireLeft = FIRE_KICK_SECONDS;
        if (!fireOn) { fireOn = true; root.classList.add('core-hud-fire'); }
      }
    }

    if (fireOn) {
      fireLeft -= dt;
      if (fireLeft <= 0) { fireOn = false; root.classList.remove('core-hud-fire'); }
    }

    // Flow: objective, status, notice
    if (flow && flow.revision !== lastRev) {
      lastRev = flow.revision;
      if (flow.objective !== objCache) {
        objCache = flow.objective;
        objText.textContent = objCache;
      }
      let n = 0;
      for (const v of flow.status.values()) {
        let r = statRows[n];
        if (!r) {
          const row = div('core-hud-stat');
          const k = document.createElement('span');
          const val = document.createElement('span');
          const kt = text(k);
          const vt = text(val);
          row.append(k, val);
          r = { row, k: kt, v: vt, kc: '', vc: '' };
          statRows.push(r);
        }
        if (n >= statCount) statsEl.appendChild(r.row);
        if (r.kc !== v.label) { r.kc = v.label; r.k.data = v.label; }
        if (r.vc !== v.value) { r.vc = v.value; r.v.data = v.value; }
        n++;
      }
      while (statCount > n) { statCount--; statRows[statCount]!.row.remove(); }
      statCount = n;
      const nt = flow.notice;
      if (nt.text !== '' && (nt.text !== noticeCacheText || nt.at !== noticeCacheAt)) showNotice(nt.text);
      noticeCacheText = nt.text;
      noticeCacheAt = nt.at;
    }

    // Notice timer
    if (noticeLeft > 0) {
      noticeLeft -= dt;
      if (!noticeShown) { noticeShown = true; notice.classList.add('core-hud-show'); }
      if (noticeLeft <= 0) { noticeShown = false; notice.classList.remove('core-hud-show'); }
    }

    // Damage vignette (fades with frame time; opacity quantised so idle frames write nothing)
    if (damage > 0) {
      damage = Math.max(0, damage - dt / DAMAGE_FADE_SECONDS);
    }
    const q = Math.round(damage * 50) / 50;
    if (q !== damageShown) {
      damageShown = q;
      vignette.style.opacity = q === 0 ? '0' : String(q);
    }
  };

  sctx.systems.addFrame({ id: 'core/hud.update', update });
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(HudRole, 'core/hud', {
      name: 'Standard HUD',
      description: 'Retro-industrial HUD: health, ammo and weapon bar, objective and status lines, notices, crosshair, damage and low-health feedback.',
      activate: activateHud,
    });
  },
});
