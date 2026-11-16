import { InputContexts, SessionControl, Silt, Ui, definePlugin } from '../../sdk/index.ts';
import type { SiltCommand, SiltState } from '../../sdk/index.ts';

const css = `
.silt { position:absolute; inset:0; overflow:auto; pointer-events:auto; color:#e9eee6; background:radial-gradient(ellipse at 50% 0,#284a49 0,#142c30 45%,#09181d 100%); font:14px/1.4 system-ui,sans-serif; }
.silt * { box-sizing:border-box } .silt button { font:inherit; color:inherit; cursor:pointer }
.silt-shell { max-width:1500px; margin:auto; padding:24px clamp(14px,3vw,48px) 40px }
.silt-head { display:flex; align-items:end; justify-content:space-between; gap:16px; border-bottom:1px solid #b9c9ae40; padding-bottom:16px; margin-bottom:18px }
.silt-eyebrow,.silt-label { color:#b8d1b2; text-transform:uppercase; letter-spacing:.18em; font-size:10px; font-weight:800 }
.silt h1 { font:normal clamp(30px,4vw,53px)/.95 Georgia,serif; letter-spacing:-.04em; margin:7px 0 }
.silt h2 { font:normal 22px Georgia,serif; margin:4px 0 12px }.silt h3 { font-size:11px; letter-spacing:.13em; text-transform:uppercase; color:#b8d1b2; margin:18px 0 8px }
.silt-sub { color:#a9bdb8; font-size:12px }.silt-head-right { text-align:right; color:#c8d9c9 }
.silt-layout { display:grid; grid-template-columns:minmax(190px,250px) minmax(320px,1fr) minmax(220px,280px); gap:18px; align-items:start }
.silt-panel { background:#102a2ddd; border:1px solid #9dbca444; border-radius:4px; padding:17px; box-shadow:0 15px 45px #0003 }
.silt-stats { display:grid; grid-template-columns:1fr 1fr; gap:7px }.silt-stat { background:#ffffff0b; border:1px solid #ffffff16; padding:9px; color:#a9bdb8; font-size:10px; text-transform:uppercase; letter-spacing:.1em }.silt-stat b { display:block; color:#f0e6ca; font:22px Georgia,serif; letter-spacing:0; margin-top:2px }
.silt-objective { border-left:2px solid #d7b878; padding:3px 0 3px 11px; color:#e8dfc5 }.silt-muted { color:#aabdb7; font-size:12px; line-height:1.5 }
.silt-map { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; aspect-ratio:1; margin:10px 0 }.silt-room { display:grid; place-content:center; text-align:center; background:#ffffff0b; border:1px solid #77958d50; color:#b5cac0; font-size:10px; min-width:0 }.silt-room.current { background:#bcac78; color:#14292a; border-color:#f3d598 }.silt-room.unknown { border-style:dashed }.silt-room.empty { visibility:hidden }
.silt-stage { min-width:0 }.silt-stage-head { display:flex; justify-content:space-between; align-items:end; gap:8px; margin:0 2px 10px }.silt-stage-head h2 { margin:2px 0 }.silt-board-wrap { padding:12px; background:#091b1d; border:1px solid #95a99c66; box-shadow:0 16px 50px #0007 }.silt-board { display:grid; grid-template-columns:repeat(9,1fr); aspect-ratio:1; max-height:65vh; width:min(100%,65vh); margin:auto; background:#132f32 }
.silt-cell { min-width:0; border:1px solid #aac4b317; padding:0; display:grid; place-items:center; position:relative; background:#345451; font-size:clamp(12px,2.3vw,25px); line-height:1 }.silt-cell.wall { background:#1c3332 url('./assetrizz/fantasy-wall-panel.png') center/cover; filter:saturate(.5) brightness(.7) }.silt-cell.water { background:repeating-linear-gradient(165deg,#285e69,#285e69 5px,#346f76 6px,#346f76 7px) }.silt-cell.vent { background:#526259; color:#dfc38a }.silt-cell.door { background:#a18e63; color:#192e2b }.silt-cell.closed { background:#263e3b; color:#708b80 }.silt-cell.target:after { content:''; position:absolute; inset:12%; border:2px dashed #ef9b78; pointer-events:none }.silt-cell.player { color:#fff4ce; text-shadow:0 0 12px #fff4bd }.silt-cell.enemy { color:#ffb097; text-shadow:0 0 10px #d85d45 }.silt-cell.selected { box-shadow:inset 0 0 0 3px #f4d68e }
.silt button:focus-visible { outline:3px solid #f2cd80; outline-offset:2px; z-index:2 }.silt button:hover { filter:brightness(1.2) }.silt-legend { color:#b3c9bf; font-size:11px; margin:10px 2px; line-height:1.6 }.silt-legend b { color:#efd9a5 }
.silt-actions { display:grid; grid-template-columns:1fr 1fr; gap:6px }.silt-actions button,.silt-directions button { border:1px solid #77988b88; background:#294a47; border-radius:3px; padding:9px 6px; text-align:center; font-size:12px }.silt-actions button.primary { background:#c6ad77; color:#172c29; border-color:#e4d29d; font-weight:700 }.silt-actions button.active { box-shadow:inset 0 0 0 2px #efd18a }.silt-actions button:disabled { opacity:.38; cursor:default }.silt-directions { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; max-width:180px; margin:8px auto }.silt-directions button { min-height:37px }.silt-directions .blank { visibility:hidden }
.silt-message { color:#f0dfb5; background:#172f30; border:1px solid #bdac7566; padding:11px; margin-top:15px; min-height:46px }.silt-end { color:#f4d295; font:20px Georgia,serif; margin:10px 0 }.silt-banner { height:80px; background:linear-gradient(90deg,#102a2d 0%,#102a2d77 50%,#102a2d44),url('./assetrizz/cinder-hall.png') center/cover; border:1px solid #b8d1b12b; margin-bottom:14px }
.silt-kit { grid-column:1/-1; min-width:0 }.silt-kit-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:18px }.silt-kit h3 { margin-top:8px }.silt-list { display:grid; gap:8px }.silt-entry { background:#ffffff0b; border:1px solid #ffffff16; padding:9px; overflow-wrap:anywhere }.silt-entry-title { color:#f0e6ca; font-weight:700 }.silt-entry .silt-actions { margin-top:7px }.silt-kit button:disabled { opacity:.45; cursor:default }
@media(max-width:1000px) { .silt-layout { grid-template-columns:minmax(180px,1fr) minmax(320px,2fr) }.silt-controls { grid-column:1/-1 }.silt-controls-inner { display:grid; grid-template-columns:repeat(3,1fr); gap:14px }.silt-controls h3 { margin-top:4px } }
@media(max-width:650px) { .silt-shell { padding:14px 12px 28px }.silt-head { align-items:start }.silt-head-right { font-size:11px }.silt-layout { display:flex; flex-direction:column }.silt-layout>* { width:100% }.silt-stage { order:-1 }.silt-board { width:100%; max-height:none }.silt-panel { padding:13px }.silt-controls-inner { display:block }.silt-banner { display:none }.silt-map { max-width:220px }.silt-cell { font-size:clamp(14px,5vw,24px) } }
`;

export default definePlugin({
  activate(ctx) {
    const game = ctx.services.get(Silt);
    const ui = ctx.services.tryGet(Ui);
    if (!ui) return;
    const root = ui.mount(ctx, 'hud', 'silt');
    ui.addStyles(ctx, css);
    const input = ctx.services.tryGet(InputContexts)?.create(ctx, { priority: 20, bindings: [
      { action: 'north', keys: ['KeyW', 'ArrowUp'] }, { action: 'south', keys: ['KeyS', 'ArrowDown'] },
      { action: 'west', keys: ['KeyA', 'ArrowLeft'] }, { action: 'east', keys: ['KeyD', 'ArrowRight'] },
    ] });
    root.innerHTML = `<main class="silt-shell"><header class="silt-head"><div><div class="silt-eyebrow">Field report / submerged records</div><h1>The Silt Archive</h1><div class="silt-sub">A turn-based expedition beneath the waterline</div></div><div class="silt-head-right"><div data-district></div><div data-turn class="silt-label"></div></div></header>
    <div class="silt-layout"><aside class="silt-panel"><div class="silt-banner" aria-hidden="true"></div><div class="silt-label">Expedition vitals</div><h2>Below the surface</h2><div class="silt-stats"><div class="silt-stat">Health<b data-health></b></div><div class="silt-stat">Air<b data-air></b></div><div class="silt-stat">Charge<b data-charge></b></div><div class="silt-stat">Water level<b data-water></b></div></div><h3>Objective</h3><div class="silt-objective" data-objective></div><h3>District survey</h3><div class="silt-map" data-map aria-label="District map"></div><div class="silt-muted">Solid rooms visited · dashed rooms revealed. Connections listed below.</div><div class="silt-muted" data-connections></div><h3>Field notes</h3><div class="silt-muted">Water rises every 8 turns. Flooded tiles cost air when water is present; at level 4, remaining on one costs air each turn. Vents are markings, with no separate effect.</div></aside>
    <section class="silt-stage" aria-label="Current chamber"><div class="silt-stage-head"><div><div class="silt-label">Current chamber</div><h2 data-room></h2></div><div class="silt-sub">9 × 9 / cardinal movement</div></div><div class="silt-board-wrap"><div class="silt-board" data-board aria-label="Chamber grid"></div></div><div class="silt-legend"><b>◆</b> explorer &nbsp; <b>✦</b> enemy &nbsp; <b>⌑</b> door &nbsp; <b>≈</b> flooded floor &nbsp; <b>⌁</b> vent &nbsp; <b>□</b> enemy target<br>Click an adjacent cell to move, or an enemy to select it. Unconnected doors are dimmed.</div><div class="silt-message" role="status" aria-live="polite" data-message></div><div class="silt-end" data-end></div></section>
    <aside class="silt-panel silt-controls"><div class="silt-label">Expedition controls</div><h2>Make your move</h2><div class="silt-controls-inner"><div><h3>Move · WASD / arrows</h3><div class="silt-directions"><span class="blank"></span><button data-move="north" aria-label="Move north">↑</button><span class="blank"></span><button data-move="west" aria-label="Move west">←</button><button data-command="wait" aria-label="Wait one turn">·</button><button data-move="east" aria-label="Move east">→</button><span class="blank"></span><button data-move="south" aria-label="Move south">↓</button><span class="blank"></span></div><p class="silt-muted">Each key press advances one step. The center button waits a turn.</p><h3>Encounter</h3><div class="silt-muted" data-enemy></div><div class="silt-actions"><button data-attack="strike" class="primary">Strike</button><button data-attack="heavy">Heavy · 2 charge</button><button data-attack="arc">Arc · 3 charge</button><button data-command="brace">Brace · 1 charge</button></div><p class="silt-muted">Strike and heavy require adjacency; arc reaches up to 3 cells in a clear straight line. Successful attacks gain 1 charge. Brace halves the next hit.</p></div>
    <div><h3>Supplies &amp; actions</h3><div class="silt-actions"><button data-use="bandage">Bandage</button><button data-use="air">Air supply</button><button data-command="interact">Interact</button><button data-command="wait">Wait</button><button data-command="descend">Descend</button><button data-command="extract">Extract</button></div><p class="silt-muted">Interact in a fragment room, a cleared optional room, or a cleared passage to pump water. Descend at a lift with both fragments; extract at the entry or a ready lift.</p></div>
    <div><h3>Upgrades</h3><div class="silt-muted" data-upgrades></div><div class="silt-actions"><button data-upgrade="health">Health +4</button><button data-upgrade="air">Air +3</button><button data-upgrade="damage">Damage +1</button></div><h3>Expedition</h3><div class="silt-actions"><button data-command="restart">Restart run</button></div><p class="silt-muted">Restart creates a new expedition. Extracting before recovering the Heart Register ends the run without victory.</p></div></div></aside><section class="silt-panel silt-kit" aria-label="Inventory and workbench"><div class="silt-label">Expedition provisions</div><h2 tabindex="-1" data-kit-heading>Inventory &amp; workbench</h2><div class="silt-kit-grid"><div><h3>Inventory</h3><p class="silt-muted" data-capacity></p><div class="silt-list" data-inventory></div></div><div><h3>Equipment</h3><div class="silt-list" data-equipment></div></div><div><h3>Pump workbench</h3><p class="silt-muted" data-workbench></p><div class="silt-list" data-recipes></div><p class="silt-muted">Crafting also requires room for the output. Crafting, equipping and dropping do not advance a turn.</p></div></div></section></div></main>`;
    const query = (selector: string) => root.querySelector<HTMLElement>(selector)!;
    const board = query('[data-board]');
    const cells: HTMLButtonElement[] = [];
    for (let i = 0; i < 81; i++) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.cell = String(i); board.appendChild(button); cells.push(button);
    }
    let selected = '';
    let last = '';
    const directions: Record<string, readonly [number, number]> = { north: [0,-1], south: [0,1], west: [-1,0], east: [1,0] };
    const allowed = () => ctx.services.tryGet(SessionControl)?.playing !== false;
    const send = (command: SiltCommand) => { if (allowed()) game.enqueue(command); };
    const move = (direction: string) => { const step = directions[direction]; if (step) send({ type:'move', dx:step[0], dy:step[1] }); };
    const itemNames: Record<string, string> = { 'silt/bandage':'Bandage', 'silt/air':'Air supply', 'silt/scrap':'Archive scrap', 'silt/fiber':'Seal fiber', 'silt/cutter':'Cutter', 'silt/conductor':'Conductor', 'silt/diving-suit':'Diving suit', 'silt/plate-suit':'Plate suit' };
    const effects: Record<string, string> = { 'silt/cutter':'+2 attack damage.', 'silt/conductor':'+3 arc damage.', 'silt/diving-suit':'Prevents air loss when entering flooded tiles; level 4 exposure still costs air.', 'silt/plate-suit':'Reduces incoming damage by 1 (minimum 1).' };
    const itemName = (id: string) => itemNames[id] ?? id;
    let kitRevision = '';
    const drawKit = (s: SiltState) => {
      const revision = JSON.stringify([s.inventory, s.recipes, s.workbench, s.status, s.pendingUpgrades]);
      if (revision === kitRevision) return;
      kitRevision = revision;
      const active = document.activeElement instanceof HTMLButtonElement && root.contains(document.activeElement) ? document.activeElement : null;
      const focusKey = active?.dataset.kitKey;
      const blocked = s.status !== 'playing' || s.pendingUpgrades > 0;
      const inventory = query('[data-inventory]'), equipment = query('[data-equipment]'), recipes = query('[data-recipes]');
      inventory.replaceChildren(); equipment.replaceChildren(); recipes.replaceChildren();
      query('[data-capacity]').textContent = `${s.inventory.slots.length} / ${s.inventory.capacity} stacks used${s.pendingUpgrades ? ' · Choose an upgrade before managing items.' : ''}`;
      query('[data-workbench]').textContent = s.workbench ? 'Available at this cleared pump.' : 'Unavailable · clear a passage and interact with its pump.';
      const entry = (parent: HTMLElement, title: string, detail: string) => {
        const row = document.createElement('div'); row.className = 'silt-entry';
        const heading = document.createElement('div'); heading.className = 'silt-entry-title'; heading.textContent = title;
        const description = document.createElement('div'); description.className = 'silt-muted'; description.textContent = detail;
        row.append(heading, description); parent.appendChild(row); return row;
      };
      const action = (row: HTMLElement, label: string, kind: 'equip'|'drop'|'unequip'|'craft', value: string, disabled: boolean) => {
        let actions = row.querySelector<HTMLElement>('.silt-actions');
        if (!actions) { actions = document.createElement('div'); actions.className = 'silt-actions'; row.appendChild(actions); }
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset[kind] = value; button.dataset.kitKey = `${kind}:${value}`; button.disabled = disabled; actions.appendChild(button);
      };
      if (!s.inventory.slots.length) entry(inventory, 'Empty', 'No items carried.');
      // A stack is one occupied slot; combine duplicate item IDs for one set of actions.
      const counts = new Map<string, number>();
      for (const slot of s.inventory.slots) counts.set(slot.item, (counts.get(slot.item) ?? 0) + slot.count);
      for (const [item, count] of counts) {
        const row = entry(inventory, `${itemName(item)} × ${count}`, effects[item] ?? '');
        if (effects[item]) action(row, `Equip ${itemName(item)}`, 'equip', item, blocked);
        action(row, `Drop one ${itemName(item)}`, 'drop', item, blocked);
      }
      for (const slot of ['tool', 'suit'] as const) {
        const item = s.inventory.equipment[slot];
        const row = entry(equipment, `${slot === 'tool' ? 'Tool' : 'Suit'} · ${item ? itemName(item) : 'Empty'}`, item ? (effects[item] ?? '') : 'No item equipped.');
        if (item) action(row, `Unequip ${itemName(item)}`, 'unequip', slot, blocked);
      }
      for (const recipe of s.recipes) {
        const cost = recipe.inputs.map(input => `${itemName(input.item)} × ${input.count}`).join(', ');
        const row = entry(recipes, `${recipe.name} × ${recipe.output.count}`, `Cost: ${cost || 'none'}${recipe.available ? ' · Ingredients available' : ` · ${recipe.reason || 'Unavailable'}`}`);
        action(row, `Craft ${recipe.name}`, 'craft', recipe.id, blocked || !recipe.available);
      }
      if (focusKey) {
        const replacement = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-kit-key]')).find(button => button.dataset.kitKey === focusKey && !button.disabled);
        (replacement ?? query('[data-kit-heading]')).focus({ preventScroll:true });
      }
    };
    const draw = (s: SiltState) => {
      if (!s.enemies.some(e => e.id === selected)) selected = s.enemies[0]?.id ?? '';
      query('[data-district]').textContent = `${String(s.district + 1).padStart(2,'0')} / 03 · ${s.districtName}`;
      query('[data-turn]').textContent = `Turn ${s.turn} · ${s.status}`;
      query('[data-health]').textContent = `${s.health} / ${s.maxHealth}`; query('[data-air]').textContent = `${s.air} / ${s.maxAir}`;
      query('[data-charge]').textContent = `${s.charge} / 6`; query('[data-water]').textContent = `${s.water} / 4`;
      query('[data-objective]').textContent = s.register ? 'Heart Register recovered. Reach an eligible lift or entry and extract.' : `Find both fragments and reach the lift. ${s.fragments} / 2 fragments in this district.`;
      query('[data-room]').textContent = `${s.purpose[0]?.toUpperCase() ?? ''}${s.purpose.slice(1)} · ${s.room}`;
      const exposed = s.conditions.find(condition => condition.target === 'player' && condition.condition === 'exposed');
      query('[data-message]').textContent = `${s.message}${exposed ? ` Exposed: ${exposed.remaining} turns remaining; incoming hits deal +1 damage. Brace clears it.` : ''}`;
      query('[data-end]').textContent = s.status === 'playing' ? '' : `Expedition ${s.status}. Restart to try again.`;
      query('[data-upgrades]').textContent = `Level ${s.progression.level} · XP ${s.progression.xp} / ${s.progression.xpToNext} to next · ${s.progression.totalXp} total XP · ${s.pendingUpgrades} choices pending · damage ${s.damage} · discoveries ${s.discoveries}`;
      drawKit(s);
      const enemy = s.enemies.find(e => e.id === selected);
      query('[data-enemy]').textContent = enemy ? `Selected ${enemy.id} · ${enemy.health} health · ${enemy.intent}. Target: column ${enemy.target.x + 1}, row ${enemy.target.y + 1}.` : 'No enemy in this chamber.';
      const here = s.rooms.find(r => r.id === s.room);
      query('[data-connections]').textContent = here ? `Current room exits: ${here.neighbors.map(id => { const r = s.rooms.find(item => item.id === id); return r ? `${r.x < here.x ? 'west' : r.x > here.x ? 'east' : r.y < here.y ? 'north' : 'south'} (${id})` : id; }).join(', ')}.` : '';
      const map = query('[data-map]'); map.replaceChildren();
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const room = s.rooms.find(r => r.x === x && r.y === y); const tile = document.createElement('div');
        tile.className = `silt-room ${!room ? 'empty' : room.id === s.room ? 'current' : room.visited ? '' : 'unknown'}`;
        tile.textContent = room ? `${room.id === s.room ? '● ' : ''}${room.visited ? room.purpose : '?'} · ${room.id.replace('room-', '')}` : '';
        if (room) tile.setAttribute('aria-label', `${room.id}, ${room.visited ? room.purpose : 'unvisited'}, ${room.id === s.room ? 'current room' : 'revealed'}`);
        map.appendChild(tile);
      }
      cells.forEach((cell, i) => {
        const x = i % 9, y = Math.floor(i / 9), type = s.rows[y]?.[x] ?? '#';
        const occupant = s.enemies.find(e => e.x === x && e.y === y), player = s.x === x && s.y === y;
        const target = s.enemies.some(e => {
          // Newer authorities can expose an entire telegraphed area; retain
          // compatibility with the original single-target state contract.
          const threat = (e as typeof e & { readonly threat?: readonly { readonly x: number; readonly y: number }[] }).threat;
          return threat ? threat.some(p => p.x === x && p.y === y) : e.target.x === x && e.target.y === y;
        });
        const linked = type !== 'D' || Boolean(here && here.neighbors.some(id => { const r = s.rooms.find(item => item.id === id); return r && r.x === here.x + (x === 0 ? -1 : x === 8 ? 1 : 0) && r.y === here.y + (y === 0 ? -1 : y === 8 ? 1 : 0); }));
        const terrain = type === '#' ? 'wall' : type === '~' ? 'water' : type === '^' ? 'vent' : type === 'D' ? 'door' : 'floor';
        cell.className = `silt-cell ${terrain} ${!linked ? 'closed' : ''} ${target ? 'target' : ''} ${player ? 'player' : ''} ${occupant ? 'enemy' : ''} ${occupant?.id === selected && occupant ? 'selected' : ''}`;
        cell.textContent = player ? '◆' : occupant ? '✦' : type === 'D' ? '⌑' : type === '~' ? '≈' : type === '^' ? '⌁' : '';
        cell.setAttribute('aria-label', `Column ${x + 1}, row ${y + 1}: ${terrain}${type === 'D' && !linked ? ', no exit' : ''}${player ? ', explorer' : ''}${occupant ? `, enemy ${occupant.id}, health ${occupant.health}` : ''}${target ? ', enemy target' : ''}`);
      });
      root.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(button => { button.disabled = s.pendingUpgrades === 0 || s.status !== 'playing'; });
      root.querySelectorAll<HTMLButtonElement>('[data-attack]').forEach(button => { button.disabled = !enemy || s.status !== 'playing'; });
      root.querySelector<HTMLButtonElement>('[data-use="bandage"]')!.textContent = `Bandage · ${s.bandages}`;
      root.querySelector<HTMLButtonElement>('[data-use="air"]')!.textContent = `Air supply · ${s.airSupplies}`;
    };
    const click = (event: Event) => {
      if (!allowed()) return;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || !root.contains(button)) return;
      const s = game.state();
      if (button.dataset.cell !== undefined) {
        const index = Number(button.dataset.cell), x = index % 9, y = Math.floor(index / 9), enemy = s.enemies.find(e => e.x === x && e.y === y);
        if (enemy) { selected = enemy.id; draw(s); }
        else if (Math.abs(x - s.x) + Math.abs(y - s.y) === 1) send({ type:'move', dx:x-s.x, dy:y-s.y });
      } else if (button.dataset.move) move(button.dataset.move);
      else if (button.dataset.attack && selected) send({ type:'attack', enemy:selected, style:button.dataset.attack as 'strike'|'heavy'|'arc' });
      else if (button.dataset.use) send({ type:'use', item:button.dataset.use as 'bandage'|'air' });
      else if (button.dataset.equip) send({ type:'equip', item:button.dataset.equip });
      else if (button.dataset.drop) send({ type:'drop', item:button.dataset.drop });
      else if (button.dataset.unequip === 'tool' || button.dataset.unequip === 'suit') send({ type:'unequip', slot:button.dataset.unequip });
      else if (button.dataset.craft) send({ type:'craft', recipe:button.dataset.craft });
      else if (button.dataset.upgrade) send({ type:'upgrade', upgrade:button.dataset.upgrade as 'health'|'air'|'damage' });
      else if (button.dataset.command) send({ type:button.dataset.command as 'wait'|'interact'|'extract'|'descend'|'restart'|'brace' });
    };
    // The host deliberately leaves native controls out of input contexts. Route
    // movement while a grid/control button has focus without stealing Enter/Space.
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || !(event.target instanceof HTMLElement) || !event.target.closest('button')) return;
      const keys: Record<string, string> = { KeyW:'north', ArrowUp:'north', KeyS:'south', ArrowDown:'south', KeyA:'west', ArrowLeft:'west', KeyD:'east', ArrowRight:'east' };
      const direction = keys[event.code]; if (direction && allowed()) { event.preventDefault(); move(direction); }
    };
    root.addEventListener('click', click); root.addEventListener('keydown', keydown);
    ctx.scope.add(() => { root.removeEventListener('click', click); root.removeEventListener('keydown', keydown); }, 'silt-ui-input');
    ctx.systems.add({ id:'silt/presentation.input', phase:'input', update() { if (!allowed() || !input) return; for (const direction of Object.keys(directions)) if (input.tick.pressed(direction)) move(direction); } });
    ctx.systems.addFrame({ id:'silt/presentation.ui', update() { const state = game.state(), revision = JSON.stringify(state); if (revision !== last) { last = revision; draw(state); } } });
    draw(game.state());
  },
});
