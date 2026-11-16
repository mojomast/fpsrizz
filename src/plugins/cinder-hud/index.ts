import { Cinder, HudRole, Inventory, Player, Transform, Ui, WeaponRuntime, Weapons, angleDelta, definePlugin } from '../../sdk/index.ts';
import { css } from './style.ts';

export default definePlugin({ register(ctx) {
  ctx.provideRole(HudRole, 'cinder/hud', { name: 'Cinder Vault', description: 'Dungeon combat HUD with non-blocking level-up boons, depth guidance and a magazine-aware weapon rack.', activate(owner) {
    const ui = owner.services.tryGet(Ui), game = owner.services.tryGet(Cinder);
    if (!ui || !game) return;
    const root = ui.mount(owner, 'hud', 'cinder-ui'); ui.addStyles(owner, css);
    const el = (tag: string, cls: string, parent: HTMLElement, text = '') => {
      const node = document.createElement(tag); node.className = cls; node.textContent = text; parent.append(node); return node;
    };
    const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
    el('div', 'cinder-vignette', root);
    const top = el('header', 'cinder-top', root);
    const brand = el('div', 'cinder-brand', top, 'CINDER VAULT'); el('span', '', brand, 'THE ASHBOUND DESCENT');
    const depthBlock = el('div', 'cinder-depth', top);
    const depthNumber = el('div', 'cinder-small', depthBlock), depthName = el('strong', '', depthBlock), waypoint = el('p', '', depthBlock);
    const legacy = el('div', 'cinder-legacy', top), legacyMain = el('div', '', legacy), legacySub = el('span', '', legacy);
    const boss = el('div', 'cinder-boss', root); const bossName = el('div', '', boss), bossBar = el('i', '', el('div', 'cinder-bar', boss));
    const depthBanner = el('div', 'cinder-depth-banner', root);
    const levelBlock = el('div', 'cinder-level', root);
    const levelLine = el('div', 'cinder-small', levelBlock), xpBar = el('i', '', el('div', 'cinder-bar', levelBlock)), xpLine = el('div', 'cinder-small', levelBlock);
    const health = el('div', 'cinder-health', root); el('div', 'cinder-small', health, 'THE FLAME WITHIN');
    const hp = el('strong', '', health), maxHp = el('small', '', health); const hpBar = el('i', '', el('div', 'cinder-bar', health));
    const ammo = el('div', 'cinder-ammo', root), weaponName = el('div', 'cinder-small', ammo), rounds = el('strong', '', ammo);
    const reserve = el('div', 'cinder-small', ammo), ammoHint = el('div', 'cinder-small', ammo);
    const bound = el('div', 'cinder-relics', root);
    const rack = el('div', 'cinder-arsenal', root);
    const pulse = el('div', 'cinder-pulse', root); const toast = el('div', 'cinder-toast', root);
    const choices = el('section', 'cinder-boon-tray', root); choices.hidden = true;
    choices.setAttribute('aria-label', 'Level-up boon choices');
    el('div', 'cinder-eyebrow', choices, 'LEVEL UP — COMBAT CONTINUES');
    const choiceTitle = el('h2', '', choices);
    el('p', 'cinder-boon-hint', choices, 'Press 7, 8 or 9 to bind a boon.');
    const choiceList = el('div', 'cinder-boon-list', choices);
    el('div', 'cinder-cross', root);
    let lastOffer = -1, lastBoons = '', lastArsenal = '', lastDepth = 0, bannerUntil = -1;
    owner.systems.addFrame({ id: 'cinder/hud.draw', order: 150, update() {
      const s = game.state();
      root.dataset['phase'] = s.phase;
      text(legacyMain, `${s.legacy} LEGACY EMBERS  /  RANK ${s.rank}`); text(legacySub, `RUN ${String(s.run).padStart(2, '0')}  ·  SEED ${s.seed}`);
      const roman = ['I', 'II', 'III', 'IV', 'V'][s.depth - 1] ?? String(s.depth);
      const romanMax = ['I', 'II', 'III', 'IV', 'V'][s.depths - 1] ?? String(s.depths);
      text(depthNumber, `DEPTH ${roman} / ${romanMax}`); text(depthName, s.depthTitle);
      const player = owner.world.first(Player), inv = player === undefined ? undefined : owner.world.get(player, Inventory);
      const transform = player === undefined ? undefined : owner.world.get(player, Transform);
      if (s.target && transform) {
        const distance = Math.hypot(s.target.x - transform.x, s.target.z - transform.z);
        const relative = angleDelta(transform.yaw, Math.atan2(-(s.target.x - transform.x), -(s.target.z - transform.z)));
        const direction = Math.abs(relative) < 0.45 ? 'AHEAD' : relative > 0 ? 'LEFT' : 'RIGHT';
        text(waypoint, `${s.target.name.toUpperCase()}  ·  ${Math.ceil(distance)}m  ·  ${direction}`);
      } else text(waypoint, s.portal ? 'THE DESCENT IS OPEN' : 'THE VAULT WAITS');
      text(bossName, s.boss ? s.boss.name.toUpperCase() : '');
      boss.hidden = !s.boss; if (s.boss) bossBar.style.width = `${Math.max(0, 100 * s.boss.health / s.boss.max)}%`;
      text(levelLine, `LEVEL ${s.level}`); xpBar.style.width = `${Math.min(100, 100 * s.xp / Math.max(1, s.xpToNext))}%`;
      text(xpLine, `${s.xp} / ${s.xpToNext} XP`);
      text(hp, String(Math.max(0, Math.ceil(s.health)))); text(maxHp, ` / ${s.maxHealth}`); hpBar.style.width = `${Math.max(0, 100 * s.health / s.maxHealth)}%`;
      health.classList.toggle('low', s.health < 30);
      const current = inv?.current ?? null;
      const weapon = current ? owner.registries.get(Weapons, current) : undefined;
      const runtime = player === undefined ? undefined : owner.world.get(player, WeaponRuntime);
      const loaded = weapon && current && weapon.magazineSize !== undefined ? runtime?.loaded[current] ?? 0 : Infinity;
      text(weaponName, weapon ? `${weapon.slot} · ${weapon.name}` : 'UNARMED');
      text(rounds, loaded === Infinity ? '∞' : String(loaded));
      text(reserve, weapon?.ammoType ? `${Math.floor(inv?.ammo[weapon.ammoType] ?? 0)} IN RESERVE` : weapon ? 'NO AMMO NEEDED' : '');
      const reloading = current !== null && runtime?.reload?.weapon === current;
      text(ammoHint, reloading ? `RELOADING ${Math.max(0, runtime!.reload!.completesAt - owner.time.now).toFixed(1)}s` : weapon?.magazineSize !== undefined ? 'R  ·  RELOAD' : '');
      const boonKey = s.boons.map(b => `${b.id}:${b.stacks}`).join(',');
      if (boonKey !== lastBoons) {
        lastBoons = boonKey; bound.replaceChildren();
        for (const boon of s.boons) {
          const box = el('div', 'cinder-relic', bound); box.title = `${boon.name} ×${boon.stacks}`;
          const image = el('img', '', box) as HTMLImageElement; image.src = `assetrizz/${boon.icon}.png`; image.alt = boon.name;
          el('b', '', box, String(boon.stacks));
        }
      }
      const arsenalKey = `${s.arsenal.map(w => `${w.id}:${w.slot}`).join(',')}|${current ?? ''}`;
      if (arsenalKey !== lastArsenal) {
        lastArsenal = arsenalKey; rack.replaceChildren();
        for (const weaponEntry of s.arsenal) {
          const item = el('div', 'cinder-weapon', rack); item.title = `${weaponEntry.slot} · ${weaponEntry.name}`;
          item.classList.toggle('current', weaponEntry.id === current);
          const image = el('img', '', item) as HTMLImageElement; image.src = weaponEntry.icon; image.alt = weaponEntry.name;
          el('b', '', item, String(weaponEntry.slot));
        }
      }
      if (s.depth !== lastDepth) {
        lastDepth = s.depth; text(depthBanner, `DEPTH ${roman} — ${s.depthTitle}`); depthBanner.hidden = false; bannerUntil = owner.time.now + 3;
      }
      if (bannerUntil >= 0 && owner.time.now >= bannerUntil) { depthBanner.hidden = true; bannerUntil = -1; }
      text(pulse, s.cooldown > 0 ? `V  /  EMBER PULSE  ${s.cooldown.toFixed(1)}s` : 'V  /  EMBER PULSE READY'); text(toast, s.message);
      if (s.offer !== lastOffer || choices.hidden !== (s.offers.length === 0)) {
        lastOffer = s.offer;
        choiceList.replaceChildren();
        choices.hidden = s.offers.length === 0;
        text(choiceTitle, s.offers.length ? `Level ${s.level} — choose one` : '');
        s.offers.forEach((choice, index) => {
          const row = el('div', 'cinder-boon', choiceList); row.dataset['kind'] = choice.kind;
          el('kbd', '', row, String(7 + index));
          const image = el('img', '', row) as HTMLImageElement;
          image.src = choice.kind === 'weapon' ? choice.icon : `assetrizz/${choice.icon}.png`; image.alt = '';
          const copy = el('div', 'cinder-boon-copy', row);
          el('strong', '', copy, choice.name);
          el('p', '', copy, choice.kind === 'weapon' ? choice.stats : choice.description);
          el('small', '', row, choice.kind === 'weapon' ? 'JOIN ARSENAL' : 'BIND BOON');
        });
      }
    } });
  } });
} });
