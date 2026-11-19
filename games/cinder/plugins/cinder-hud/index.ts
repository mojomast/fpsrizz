import { HudRole, Inventory, Player, Transform, Ui, ViewModes, angleDelta, definePlugin } from '@bulkhead/sdk';
import { WeaponRuntime, Weapons } from '../../../shooter/contracts/shooter.ts';
import { Cinder } from '../../contracts/cinder.ts';
import type { CinderMapView } from '../../contracts/cinder.ts';
import { css } from './style.ts';

export default definePlugin({ register(ctx) {
  ctx.provideRole(HudRole, 'cinder/hud', { name: 'Cinder Vault', description: 'Turn-based class/transition/map/pack/forge/dialogue HUD with AP, enemy intent, non-modal boons and magazine-aware weapons.', activate(owner) {
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
    const classSelect = el('section', 'cinder-class-select', root); classSelect.hidden = true;
    el('div', 'cinder-eyebrow', classSelect, 'CHOOSE YOUR ASHBOUND CLASS');
    const classTitle = el('h1', '', classSelect, 'Who enters the vault?');
    el('p', 'cinder-class-sub', classSelect, 'Class mastery and legacy embers persist across deaths. Press 1, 2 or 3.');
    const classCards = el('div', 'cinder-class-cards', classSelect);
    const threatRow = el('div', 'cinder-threat-row', classSelect);
    const classFoot = el('div', 'cinder-class-foot', classSelect);
    const pack = el('section', 'cinder-pack', root); pack.hidden = true;
    const packHead = el('div', 'cinder-pack-head', pack);
    el('div', 'cinder-eyebrow', packHead, 'YOUR PACK');
    const packMeta = el('div', 'cinder-small', packHead);
    const packFilters = el('div', 'cinder-pack-filters', pack);
    const filterSpans = (['all', 'gear', 'items'] as const).map(filter => el('span', 'cinder-pack-filter', packFilters, filter === 'all' ? 'ALL' : filter === 'gear' ? 'GEAR' : 'ITEMS'));
    const packList = el('div', 'cinder-pack-list', pack);
    const packFoot = el('div', 'cinder-pack-foot', pack, '↑ / ↓ select  ·  ENTER use/equip  ·  DEL drop  ·  TAB filter  ·  C craft  ·  I close');
    const automap = el('div', 'cinder-automap', root);
    el('div', 'cinder-eyebrow', automap, 'AUTOMAP');
    const automapCanvas = document.createElement('canvas'); automapCanvas.className = 'cinder-map-canvas'; automap.append(automapCanvas);
    const automapHint = el('div', 'cinder-map-hint', automap, 'M · TACTICAL GRID');
    const npcPrompt = el('div', 'cinder-npc-prompt', root); npcPrompt.hidden = true;
    const viewMode = el('div', 'cinder-viewmode', root, 'O · FIRST PERSON');
    const dialoguePanel = el('section', 'cinder-dialogue', root); dialoguePanel.hidden = true;
    const dialogueImage = document.createElement('img'); dialogueImage.className = 'cinder-dialogue-portrait'; dialogueImage.alt = ''; dialoguePanel.append(dialogueImage);
    const dialogueBody = el('div', 'cinder-dialogue-body', dialoguePanel);
    const dialogueTitle = el('div', 'cinder-eyebrow', dialogueBody);
    const dialogueName = el('h2', '', dialogueBody);
    const dialogueText = el('p', 'cinder-dialogue-text', dialogueBody);
    const dialogueOptions = el('div', 'cinder-dialogue-options', dialogueBody);
    const dialogueFoot = el('div', 'cinder-dialogue-foot', dialogueBody, '1–4 choose  ·  E close');
    const craft = el('section', 'cinder-craft', root); craft.hidden = true;
    const craftHead = el('div', 'cinder-craft-head', craft); el('div', 'cinder-eyebrow', craftHead, 'EMBER FORGE');
    const craftMeta = el('div', 'cinder-small', craftHead);
    const craftList = el('div', 'cinder-craft-list', craft);
    const craftFoot = el('div', 'cinder-craft-foot', craft, '↑ / ↓ select  ·  ENTER craft  ·  C close');
    const gridView = el('section', 'cinder-grid-view', root); gridView.hidden = true;
    const gridHead = el('div', 'cinder-grid-head', gridView);
    const gridTitle = el('h2', '', gridHead, 'TACTICAL GRID');
    const gridInfo = el('div', 'cinder-small', gridHead);
    const gridCanvas = document.createElement('canvas'); gridCanvas.className = 'cinder-grid-canvas'; gridView.append(gridCanvas);
    el('div', 'cinder-grid-legend', gridView, 'GOLD · YOU   TEAL · REACHABLE   RED · ENEMY   BLUE · NPC   GREEN · DESCENT   AMBER · LOOT');
    el('div', 'cinder-grid-foot', gridView, 'M · CLOSE GRID');
    const help = el('section', 'cinder-help', root); help.hidden = true;
    el('div', 'cinder-eyebrow', help, 'FIELD GUIDE');
    const helpTitle = el('h2', '', help, 'The vault is a turn-based descent.');
    const helpText = el('div', 'cinder-help-text', help);
    el('div', 'cinder-help-foot', help, 'H close  ·  O first-person/isometric  ·  M grid  ·  I pack  ·  C forge');
    const transition = el('section', 'cinder-transition', root); transition.hidden = true;
    const transitionLabel = el('div', 'cinder-transition-label', transition);
    const transitionSub = el('div', 'cinder-transition-sub', transition);
    const turn = el('div', 'cinder-turn', root);
    const turnPips = el('div', 'cinder-ap', turn);
    const turnText = el('div', 'cinder-small', turn);
    const threatText = el('div', 'cinder-small', turn);
    const turnHint = el('div', 'cinder-small cinder-turn-hint', turn, 'ENTER END TURN  ·  M GRID  ·  C FORGE');
    const pips: HTMLElement[] = [];
    el('div', 'cinder-cross', root);
    let lastOffer = -1, lastBoons = '', lastArsenal = '', lastDepth = 0, bannerUntil = -1;
    let lastClasses = '', lastPack = '', lastPackCursor = -1, lastPips = -1, lastFilter = '', lastThreat = '', lastHelp = '';
    let lastPhase: string = 'class-select', lastMapKey = '', lastGridKey = '', lastCraftKey = '', lastDialogueKey = '';
    let transitionUntil = -1;
    const showTransition = (label: string, sub: string) => {
      text(transitionLabel, label); text(transitionSub, sub); transition.hidden = false;
      transition.classList.remove('show'); void transition.offsetWidth; transition.classList.add('show');
      transitionUntil = owner.time.now + 0.75;
    };
    const drawMap = (canvas: HTMLCanvasElement, map: CinderMapView, compact: boolean): void => {
      const context = canvas.getContext('2d'); if (!context) return;
      const cell = compact ? Math.max(2, Math.floor(150 / Math.max(map.width, map.height))) : Math.max(4, Math.min(14, Math.floor(620 / Math.max(map.width, map.height))));
      const width = map.width * cell, height = map.height * cell;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = compact ? '#0a0d0a99' : '#0a0d0af2'; context.fillRect(0, 0, width, height);
      const exploredAt = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < map.width && z < map.height && map.explored[z * map.width + x] === '1';
      for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) {
        const index = z * map.width + x, walkable = map.walkable[index] === '1', explored = map.explored[index] === '1';
        if (!explored) {
          if (walkable || !(exploredAt(x - 1, z) || exploredAt(x + 1, z) || exploredAt(x, z - 1) || exploredAt(x, z + 1))) continue;
          context.fillStyle = '#1d211b'; context.fillRect(x * cell, z * cell, cell, cell); continue;
        }
        context.fillStyle = walkable ? (map.reachable[index] === '1' ? '#3d7568' : '#4b4432') : '#151a15';
        context.fillRect(x * cell, z * cell, cell, cell);
        if (!compact && walkable) { context.strokeStyle = '#0c0f0c99'; context.lineWidth = 1; context.strokeRect(x * cell + 0.5, z * cell + 0.5, cell - 1, cell - 1); }
      }
      const dot = (x: number, z: number, color: string, size = 0.55): void => {
        const radius = Math.max(1.5, cell * size);
        context.fillStyle = color; context.beginPath(); context.arc((x + 0.5) * cell, (z + 0.5) * cell, radius, 0, Math.PI * 2); context.fill();
      };
      for (const marker of map.markers) {
        const color = marker.kind === 'boss' ? '#ff9b4f' : marker.kind === 'enemy' ? (marker.intent === 'attack' ? '#ff5e46' : '#bd654f') : marker.kind === 'npc' ? '#8fc5e8' : marker.kind === 'exit' ? '#79dfa0' : '#e5c36d';
        dot(marker.x, marker.z, color, marker.kind === 'boss' ? 0.8 : 0.5);
      }
      dot(map.player.x, map.player.z, '#f4d89a', 0.7);
    };
    owner.systems.addFrame({ id: 'cinder/hud.draw', order: 150, update() {
      const s = game.state();
      root.dataset['phase'] = s.phase;
      const viewModes = owner.services.tryGet(ViewModes);
      const isometric = viewModes?.mode === 'isometric';
      root.dataset['view'] = isometric ? 'isometric' : 'first-person';
      text(viewMode, isometric ? 'O · ISOMETRIC · Z/X ROTATE' : 'O · FIRST PERSON');
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
      text(bossName, s.boss ? `${s.boss.name.toUpperCase()}${s.boss.enraged ? ' · ENRAGED' : ''}` : '');
      boss.hidden = !s.boss; if (s.boss) bossBar.style.width = `${Math.max(0, 100 * s.boss.health / s.boss.max)}%`;
      text(levelLine, `LEVEL ${s.level}${s.className ? ` · ${s.className.toUpperCase()}` : ''}`); xpBar.style.width = `${Math.min(100, 100 * s.xp / Math.max(1, s.xpToNext))}%`;
      text(xpLine, `${s.xp} / ${s.xpToNext} XP${s.masteryRank ? `  ·  MASTERY ${s.masteryRank}` : ''}`);
      const classKey = s.phase === 'class-select' ? `${s.threatId}:${s.highestThreat}:` + s.classes.map(c => `${c.id}:${c.masteryRank}:${c.masteryXp}`).join(',') : '';
      if (s.phase === 'class-select') {
        classSelect.hidden = false;
        if (classKey !== lastClasses) {
          lastClasses = classKey; classCards.replaceChildren();
          s.classes.forEach((entry, index) => {
            const card = el('div', 'cinder-class-card', classCards); card.dataset['class'] = entry.id;
            el('kbd', '', card, String(index + 1));
            el('div', 'cinder-eyebrow', card, entry.epithet);
            el('h2', '', card, entry.name);
            el('p', '', card, entry.description);
            el('div', 'cinder-class-stats', card, `${entry.maxHealth} HEALTH  ·  ${entry.ap} ACTIONS`);
            el('div', 'cinder-class-mastery', card, `MASTERY ${entry.masteryRank} / 5  ·  ${entry.masteryXp}${entry.masteryNext !== null ? ` / ${entry.masteryNext}` : ''} XP`);
          });
          threatRow.replaceChildren();
          el('span', 'cinder-threat-label', threatRow, 'VAULT THREAT · 7 / 8 / 9');
          s.threats.forEach((threat, index) => {
            const option = el('div', 'cinder-threat-option', threatRow);
            option.classList.toggle('selected', threat.id === s.threatId);
            el('kbd', '', option, String(7 + index));
            el('strong', '', option, threat.name.toUpperCase());
            el('p', '', option, threat.description);
          });
          text(classFoot, `LEGACY ${s.legacy} EMBERS  ·  RANK ${s.rank}  ·  RUN ${s.run}  ·  BEST ${s.highestThreat?.toUpperCase() ?? '—'}`);
        }
      } else { classSelect.hidden = true; lastClasses = ''; }
      if (s.phase === 'class-select') { transition.hidden = true; transitionUntil = -1; }
      if (s.phase === 'player' && lastPhase === 'class-select') showTransition('THE VAULT OPENS', s.className ?? 'THE ASHBOUND DESCENT');
      const map = s.map;
      if (map) {
        const mapKey = `${map.width}x${map.height}:${map.explored}:${map.reachable}:${map.player.x},${map.player.z}:${map.markers.map(marker => `${marker.kind}${marker.x},${marker.z}${marker.intent ?? ''}`).join('|')}`;
        if (mapKey !== lastMapKey) { lastMapKey = mapKey; drawMap(automapCanvas, map, true); }
        automap.hidden = s.phase === 'class-select';
        if (s.gridOpen) {
          if (lastGridKey !== mapKey) { lastGridKey = mapKey; drawMap(gridCanvas, map, false); }
          text(gridInfo, `DEPTH ${roman} · ${s.depthTitle.toUpperCase()} · ROUND ${s.round} · ${s.ap} ACTIONS`); gridView.hidden = false;
        } else { gridView.hidden = true; lastGridKey = ''; }
      } else { automap.hidden = true; gridView.hidden = true; }
      npcPrompt.hidden = !s.nearbyNpc || s.overlay !== 'none' || s.phase !== 'player';
      if (s.nearbyNpc) text(npcPrompt, `E  ·  TALK TO ${s.nearbyNpc.name.toUpperCase()}`);
      const dialogueKey = s.dialogue ? `${s.dialogue.npcId}:${s.dialogue.text}:${s.dialogue.options.map(option => `${option.label}:${option.disabled ? 1 : 0}`).join('|')}` : '';
      dialoguePanel.hidden = !s.dialogue;
      if (s.dialogue) {
        if (dialogueKey !== lastDialogueKey) {
          lastDialogueKey = dialogueKey;
          dialogueImage.src = s.dialogue.portrait; dialogueImage.alt = s.dialogue.name;
          text(dialogueTitle, s.dialogue.title); text(dialogueName, s.dialogue.name); text(dialogueText, s.dialogue.text);
          dialogueOptions.replaceChildren();
          s.dialogue.options.forEach((option, index) => {
            const optionNode = el('div', 'cinder-dialogue-option', dialogueOptions);
            optionNode.classList.toggle('disabled', option.disabled === true);
            el('kbd', '', optionNode, String(index + 1));
            const copy = el('div', '', optionNode); el('strong', '', copy, option.label);
            if (option.hint) el('small', '', copy, option.hint);
          });
        }
      } else lastDialogueKey = '';
      help.hidden = !s.helpOpen;
      const helpKey = `${s.helpOpen}:${s.threatName}:${s.className ?? ''}:${s.maxAp}`;
      if (s.helpOpen && helpKey !== lastHelp) {
        lastHelp = helpKey; helpText.replaceChildren();
        text(helpTitle, `${s.className ?? 'The Ashbound'} · ${s.threatName} threat`);
        for (const line of [
          `Every turn begins with ${s.maxAp} actions. One tile, a light attack, reload, pulse, item use or gear swap costs 1; Far Oracle and Ashbell cost 2.`,
          'Enter ends the turn. Click an enemy to attack or a reachable floor tile to spend its path cost in isometric view.',
          'WASD is player-relative in first person and camera-relative in isometric view. Z/X rotate the isometric camera.',
          'I pack · TAB filter · DEL drop · ENTER use/equip · C forge · E talk · M grid · O view · H guide.',
          'Elites gain Warded, Swift, Emberbound or Siphoned behavior. Wardens and the Keeper enrage below half health.',
          `Current threat: ${s.threatName}. Difficulty changes enemy damage/health, elites, healing and rewards.`,
        ]) el('p', '', helpText, line);
      } else if (!s.helpOpen) lastHelp = '';
      craft.hidden = !s.craftingOpen;
      if (s.craftingOpen) {
        const craftKey = `${s.craftingCursor}:${s.embers}:${s.recipes.map(recipe => `${recipe.id}:${recipe.canCraft ? 1 : 0}:${recipe.inputs.map(input => input.have).join(',')}`).join('|')}`;
        if (craftKey !== lastCraftKey) {
          lastCraftKey = craftKey; craftList.replaceChildren();
          text(craftMeta, `${s.embers} RUN EMBERS  ·  ${s.recipes.length} RECIPES`);
          s.recipes.forEach((recipe, index) => {
            const row = el('div', 'cinder-craft-row', craftList);
            row.classList.toggle('selected', index === s.craftingCursor); row.classList.toggle('disabled', !recipe.canCraft);
            const image = el('img', '', row) as HTMLImageElement; image.src = recipe.output.icon; image.alt = recipe.output.name;
            const copy = el('div', 'cinder-craft-copy', row);
            el('strong', '', copy, recipe.name); el('p', '', copy, recipe.description);
            el('small', '', copy, recipe.inputs.map(input => `${input.name} ${input.have}/${input.count}`).join('  ·  '));
            el('div', 'cinder-craft-cost', row, `${recipe.emberCost} EMBERS`);
            if (!recipe.canCraft && recipe.reason) row.title = recipe.reason;
          });
          if (!s.recipes.length) el('p', 'cinder-pack-empty', craftList, 'No recipes are known.');
        }
      } else lastCraftKey = '';
      if (s.depth !== lastDepth) {
        const prior = lastDepth; lastDepth = s.depth; text(depthBanner, `DEPTH ${roman} — ${s.depthTitle}`); depthBanner.hidden = false; bannerUntil = owner.time.now + 3;
        if (prior > 0 && s.phase !== 'class-select') showTransition(`DEPTH ${roman}`, s.depthTitle);
      }
      if (bannerUntil >= 0 && owner.time.now >= bannerUntil) { depthBanner.hidden = true; bannerUntil = -1; }
      if (transitionUntil >= 0 && owner.time.now >= transitionUntil) { transition.hidden = true; transitionUntil = -1; }
      lastPhase = s.phase;
      text(hp, String(Math.max(0, Math.ceil(s.health)))); text(maxHp, ` / ${s.maxHealth}`); hpBar.style.width = `${Math.max(0, 100 * s.health / s.maxHealth)}%`;
      health.classList.toggle('low', s.health < 30);
      const current = inv?.current ?? null;
      const weapon = current ? owner.registries.get(Weapons, current) : undefined;
      const runtime = player === undefined ? undefined : owner.world.get(player, WeaponRuntime);
      const loaded = weapon && current && weapon.magazineSize !== undefined ? runtime?.loaded[current] ?? 0 : Infinity;
      text(weaponName, weapon ? `${weapon.slot} · ${weapon.name}` : 'UNARMED');
      text(rounds, loaded === Infinity ? '∞' : String(loaded));
      text(reserve, weapon?.ammoType ? `${Math.floor(inv?.ammo[weapon.ammoType] ?? 0)} IN RESERVE` : weapon ? 'NO AMMO NEEDED' : '');
      text(ammoHint, weapon?.magazineSize !== undefined ? 'R  ·  RELOAD (1 ACTION)' : '');
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
      text(pulse, s.cooldown > 0 ? `V  /  EMBER PULSE  ${s.cooldown}T` : 'V  /  EMBER PULSE READY'); text(toast, s.message);
      turn.hidden = s.phase === 'class-select' || s.phase === 'victory' || s.phase === 'defeat';
      if (pips.length !== s.maxAp) {
        turnPips.replaceChildren(); pips.length = 0;
        for (let i = 0; i < s.maxAp; i++) { const pip = el('i', 'cinder-ap-pip', turnPips); pips.push(pip); }
      }
      if (lastPips !== s.ap || turn.dataset['phase'] !== s.phase) {
        lastPips = s.ap; turn.dataset['phase'] = s.phase;
        pips.forEach((pip, i) => pip.classList.toggle('on', i < s.ap));
      }
      text(turnText, s.phase === 'enemy' ? `ROUND ${s.round} · ENEMY TURN` : `ROUND ${s.round} · ${s.ap} / ${s.maxAp} ACTIONS · ${s.threatName.toUpperCase()}`);
      text(turnHint, isometric
        ? s.hover ? `${s.hover.kind === 'blocked' ? '✕' : '›'} ${s.hover.label}${s.hover.cost > 0 ? `  ·  ${s.hover.cost} AP` : ''}  ·  ${s.hover.detail}` : 'WASD CAM-RELATIVE  ·  CLICK ATTACK/MOVE  ·  Z/X ROTATE'
        : 'ENTER END TURN  ·  M GRID  ·  C FORGE');
      text(threatText, s.phase === 'enemy' ? 'THE VAULT ANSWERS' : `${s.intents.attacks} ATTACK${s.intents.attacks === 1 ? '' : 'S'}  ·  ${s.intents.advances} ADVANCING${s.intents.elites ? `  ·  ${s.intents.elites} ELITE` : ''}`);
      if (s.inventoryFilter !== lastFilter) {
        lastFilter = s.inventoryFilter;
        filterSpans.forEach((span, index) => span.classList.toggle('selected', ['all', 'gear', 'items'][index] === s.inventoryFilter));
      }
      const packKey = `${s.inventoryFilter}:${s.inventoryOpen}:${s.inventoryCursor}:${s.inventory.map(i => `${i.id}:${i.count}:${i.source}:${i.equipmentSlot ?? ''}`).join(',')}`;
      pack.hidden = !s.inventoryOpen;
      if (s.inventoryOpen && (packKey !== lastPack || lastPackCursor !== s.inventoryCursor)) {
        lastPack = packKey; lastPackCursor = s.inventoryCursor; packList.replaceChildren();
        text(packMeta, `${s.inventory.filter(i => i.source === 'bag').reduce((n, i) => n + i.count, 0)} ITEMS  ·  ${s.inventory.filter(i => i.source === 'bag').length} / ${s.inventoryCapacity} STACKS  ·  ${s.embers} EMBERS`);
        s.inventory.forEach((item, index) => {
          const row = el('div', 'cinder-pack-row', packList); row.dataset['source'] = item.source;
          row.classList.toggle('selected', index === s.inventoryCursor);
          el('div', 'cinder-pack-key', row, index === s.inventoryCursor ? '>' : '');
          const image = el('img', '', row) as HTMLImageElement; image.src = item.icon; image.alt = '';
          const copy = el('div', 'cinder-pack-copy', row);
          el('strong', '', copy, `${item.name}${item.count > 1 ? ` ×${item.count}` : ''}`);
          el('p', '', copy, item.description);
          el('small', '', row, item.source === 'equipment' ? `EQUIPPED · ${item.equipmentSlot?.toUpperCase()} · ENTER UNEQUIP` : item.slot ? `${item.slot.toUpperCase()} · ENTER EQUIP` : 'CONSUMABLE · ENTER USE');
        });
        if (!s.inventory.length) el('p', 'cinder-pack-empty', packList, s.inventoryFilter === 'all' ? 'Your pack is empty.' : `Nothing in this filter.`);
      }
      npcPrompt.hidden = !s.nearbyNpc || s.overlay !== 'none' || s.phase !== 'player';
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
