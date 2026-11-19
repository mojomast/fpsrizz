import { ExperienceRole, SessionControl, Ui, definePlugin, morphChildren } from '@bulkhead/sdk';
import { Hearth } from '../../contracts/hearth-sim.ts';
import type { HearthActivity, HearthCommand, HearthFinish, HearthRoom } from '../../contracts/hearth-sim.ts';

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'common/presentation', {
      name: 'Common Ground', description: 'A cozy, turn-based household.', pointer: 'free',
      controls: [['Click or tap', 'Select residents and actions'], ['Tab / Enter / Space', 'Navigate and activate controls']],
    });
  },
  activate(ctx) {
    const ui = ctx.services.tryGet(Ui), game = ctx.services.tryGet(Hearth);
    if (!ui || !game) return;
    ui.addStyles(ctx, `
.cg{position:absolute;inset:0;overflow:auto;pointer-events:auto;box-sizing:border-box;background:#f2eadb;color:#352d27;font:15px/1.45 system-ui,sans-serif;padding:clamp(14px,3vw,38px)}
.cg *{box-sizing:border-box}.cg button{font:inherit;cursor:pointer}.cg button:focus-visible,.cg a:focus-visible{outline:3px solid #b14729;outline-offset:3px}.cg button:disabled{cursor:not-allowed;opacity:.5}
.cg h1,.cg h2,.cg h3,.cg p{margin:0}.cg h1,.cg h2,.cg h3{font-family:Georgia,serif}.cg h1{font-size:clamp(2.5rem,6vw,5rem);line-height:.95;letter-spacing:-.05em}.cg h2{font-size:1.55rem;line-height:1.15}.cg h3{font-size:1.05rem}.cg small,.cg .muted{color:#66594d}.cg .eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:.7rem;font-weight:800;color:#985039}
.cg .wrap{max-width:1500px;margin:auto}.cg .header{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:22px}.cg .intro{margin-top:10px;max-width:490px;color:#66594d}.cg .topstats{display:flex;gap:8px;flex-wrap:wrap}.cg .stat{background:#fffaf0;border:1px solid #d8cbb6;border-radius:12px;padding:9px 14px;min-width:100px}.cg .stat strong{display:block;font-family:Georgia,serif;font-size:1.25rem}.cg .stat span{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#796658}
.cg .layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(310px,.8fr);gap:18px;align-items:start}.cg .stack{display:grid;gap:18px;min-width:0}.cg .panel{background:#fffaf1;border:1px solid #d9cbb6;border-radius:16px;padding:clamp(16px,2vw,24px);box-shadow:0 5px 18px #6852380c}.cg .panelhead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:14px}.cg .pill{border-radius:99px;background:#e9e0ce;padding:4px 9px;font-size:.72rem;font-weight:700;white-space:nowrap}.cg .house{display:grid;grid-template-columns:1fr 1fr;gap:5px;background:#795b49;border:6px solid #795b49;border-radius:8px;overflow:hidden}.cg .room{position:relative;min-height:165px;padding:12px;overflow:hidden;background:#e7d9c4}.cg .room:nth-child(2){background:#e8dfc8}.cg .room:nth-child(3){background:#d8dfcd}.cg .room:nth-child(4){background:#e9d4c2}.cg .room-label{position:relative;z-index:1;text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:.65rem;color:#614c3f}.cg .room-people{position:relative;z-index:1;font-size:.78rem;font-weight:700;max-width:65%;margin-top:5px}.cg .art{position:absolute;object-fit:contain;max-width:48%;height:105px;right:4px;bottom:1px;mix-blend-mode:multiply}.cg .art.second{right:39%;height:72px;max-width:33%}.cg .room .art.third{height:65px;right:65%;max-width:28%}.cg .house-note{margin-top:10px;font-size:.75rem;color:#796658}
.cg .residents{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.cg .person{border:1px solid #dfd1bc;border-radius:12px;padding:12px;background:#fbf5e9;min-width:0}.cg .person.chosen{border:2px solid #a55b3f;background:#f8e9d8;padding:11px}.cg .select{display:block;text-align:left;width:100%;border:0;padding:0;background:none;color:inherit}.cg .select strong{display:block;font:700 1.2rem Georgia,serif}.cg .select span{font-size:.75rem;color:#6d5d50}.cg .avatar{display:grid;place-items:center;width:36px;height:36px;background:#c97758;color:white;border-radius:50%;font:700 1rem Georgia,serif;margin-bottom:8px}.cg .person:nth-child(2) .avatar{background:#86966e}.cg .person:nth-child(3) .avatar{background:#a685a0}.cg .needs{display:grid;gap:4px;margin:10px 0}.cg .need{font-size:.69rem;display:grid;grid-template-columns:1fr auto;gap:2px 5px}.cg .bar{grid-column:1/-1;height:5px;border-radius:5px;background:#e4d7c4;overflow:hidden}.cg .bar i{display:block;height:100%;background:#a8664c;border-radius:5px}.cg .auto{font-size:.7rem!important;padding:6px!important;width:100%}
.cg .btn{border:1px solid #cfbfa7;border-radius:8px;background:#fffaf1;color:#49392e;padding:8px 10px;text-align:left}.cg .btn:hover:not(:disabled){background:#f1dfca}.cg .btn.primary{background:#91523c;color:white;border-color:#91523c}.cg .btn.primary:hover:not(:disabled){background:#743d2e}.cg .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.cg .actions .btn strong,.cg .actions .btn small{display:block}.cg .actions .btn small{font-size:.7rem;color:#796658}.cg .section-title{margin:17px 0 8px!important;font:700 .75rem system-ui!important;text-transform:uppercase;letter-spacing:.12em;color:#87654f}.cg .notice{background:#f3e4ce;border-left:3px solid #b26749;padding:10px 12px;margin:12px 0;border-radius:0 8px 8px 0}.cg .row{display:flex;gap:7px;flex-wrap:wrap}.cg .row .btn{flex:1}.cg .line{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #eee3d3}.cg .line:last-child{border:0}.cg .project{padding:10px 0;border-bottom:1px solid #eee3d3}.cg .project:last-child{border:0}.cg .project strong{display:block}.cg .project small{display:block;margin-top:3px}.cg details summary{cursor:pointer;font-weight:700}.cg .catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:15px}.cg .item{padding:10px;border:1px solid #e7dac8;border-radius:9px}.cg .item strong,.cg .item small{display:block}.cg .item small{min-height:3em}.cg .item .btn{margin-top:7px;width:100%;font-size:.8rem}.cg .events{margin:0;padding-left:20px;font-size:.82rem}.cg .events li{margin:5px 0}.cg .footer{margin:20px 0 5px;font-size:.75rem;color:#796658}.cg a{color:#79442f}
.cg .build-tools{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.cg .build-tools .btn{font-size:.78rem}.cg .blueprint{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px;padding:7px;background:#765b49;border-radius:10px}.cg .plot{position:relative;aspect-ratio:1;border:1px dashed #b8a48b;border-radius:4px;background:#d8dfc8;color:#4b392c;padding:2px;min-width:0;overflow:hidden}.cg .plot.floor{border:1px solid #b49b7f;background:#dbc09a}.cg .plot.tile{background:#eee3cf}.cg .plot.sage{background:#c2d0b0}.cg .plot.terracotta{background:#d8987b}.cg .plot .object{display:block;font-size:clamp(8px,1vw,12px);line-height:1.05;font-weight:700;overflow-wrap:anywhere}.cg .plot img{display:block;width:70%;height:55%;margin:auto;object-fit:contain;mix-blend-mode:multiply}.cg .plot .room-tag{position:absolute;bottom:1px;right:2px;font-size:8px;text-transform:uppercase;opacity:.7}.cg .build-label{font-weight:700;color:#754b37;font-size:.8rem}.cg .build-summary{font-size:.8rem;color:#66594d;margin:8px 0!important}
@media(max-width:900px){.cg .layout{grid-template-columns:1fr}.cg .header{align-items:start;flex-direction:column}.cg .topstats{width:100%}.cg .stat{flex:1}}
@media(max-width:520px){.cg{padding:12px}.cg .residents{grid-template-columns:1fr}.cg .person{display:grid;grid-template-columns:minmax(110px,1fr) 1.3fr;gap:6px 12px}.cg .needs{margin:0}.cg .auto{grid-column:1/-1}.cg .room{min-height:130px}.cg .art{height:75px}.cg .art.second{height:50px}.cg .room .art.third{height:45px}.cg .catalog{grid-template-columns:1fr}.cg .item small{min-height:0}.cg .stat{min-width:75px;padding:8px}}
`);
    const root = ui.mount(ctx, 'hud', 'common-ground');
    const doc = root.ownerDocument;
    const main = doc.createElement('main'); main.className = 'cg'; root.appendChild(main);
    const live = doc.createElement('div'); live.className = 'wrap'; main.appendChild(live);
    // Each change renders into a detached tree that is then morphed into the live one, so buttons stay the same
    // nodes across turns (clicks and hovers survive Play/Fast time; focus and the open catalog are kept).
    let wrap = doc.createElement('div');
    const make = <K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
      const el = doc.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; parent.appendChild(el); return el;
    };
    const button = (parent: HTMLElement, label: string, command: HearthCommand, detail = '', disabled = false, primary = false) => {
      const b = make(parent, 'button', `btn${primary ? ' primary' : ''}`); b.type = 'button'; b.dataset.command = JSON.stringify(command); b.dataset.key = JSON.stringify(command.type === 'pause' ? { type: 'pause' } : command.type === 'autonomy' ? { type: command.type, resident: command.resident } : command); b.disabled = disabled;
      if (detail) { make(b, 'strong', '', label); make(b, 'small', '', detail); } else b.textContent = label;
      return b;
    };
    let speed = 0, elapsed = 0, mode: 'inspect' | 'build' | 'zone' | 'finish' | 'move' | 'remove' = 'inspect';
    let buildRoom: HearthRoom = 'living room', finish: HearthFinish = 'oak', object = '', rotation: 0 | 1 | 2 | 3 = 0;
    const onClick = (event: Event) => {
      const target = event.target; if (!(target instanceof doc.defaultView!.Element)) return;
      const tool = target.closest<HTMLButtonElement>('button[data-tool]');
      if (tool && main.contains(tool)) { mode = tool.dataset.tool as typeof mode; if (mode !== 'inspect') { speed = 0; elapsed = 0; } revision = -1; return; }
      const setting = target.closest<HTMLButtonElement>('button[data-setting]');
      if (setting && main.contains(setting)) {
        if (setting.dataset.setting === 'room') buildRoom = setting.dataset.value as HearthRoom;
        if (setting.dataset.setting === 'finish') finish = setting.dataset.value as HearthFinish;
        if (setting.dataset.setting === 'object') { object = setting.dataset.value ?? ''; mode = 'move'; }
        if (setting.dataset.setting === 'rotate') rotation = ((rotation + 1) % 4) as typeof rotation;
        revision = -1; return;
      }
      const plot = target.closest<HTMLButtonElement>('button[data-plot]');
      if (plot && main.contains(plot) && ctx.services.tryGet(SessionControl)?.playing !== false) {
        const [x, y] = (plot.dataset.plot ?? '').split(',').map(Number);
        if (x === undefined || y === undefined) return;
        if (mode === 'inspect') {
          const item = game.state().house.placements.find(p => p.x === x && p.y === y);
          if (item) { object = item.object; rotation = item.rotation; mode = 'move'; speed = 0; elapsed = 0; revision = -1; }
          else status.textContent = plot.getAttribute('aria-label') ?? 'Empty ground';
          return;
        }
        const command: HearthCommand | undefined = mode === 'build' || mode === 'zone' ? { type: mode === 'build' ? 'build-floor' : 'zone-floor', x, y, room: buildRoom } : mode === 'finish' ? { type: 'finish-floor', x, y, finish } : mode === 'remove' ? { type: 'remove-floor', x, y } : mode === 'move' && object ? { type: 'place-furniture', x, y, object, rotation } : undefined;
        if (command && !game.enqueue(command)) status.textContent = 'Command queue is full. Please try again.';
        return;
      }
      const speedButton = target.closest<HTMLButtonElement>('button[data-speed]');
      if (speedButton && main.contains(speedButton) && ctx.services.tryGet(SessionControl)?.playing !== false) {
        speed = Number(speedButton.dataset.speed); elapsed = 0; revision = -1; return;
      }
      const b = target.closest<HTMLButtonElement>('button[data-command]'); if (!b || !main.contains(b) || b.disabled || ctx.services.tryGet(SessionControl)?.playing === false) return;
      const command: unknown = JSON.parse(b.dataset.command ?? 'null');
      if (b.dataset.command === '{"type":"restart"}') { speed = 0; elapsed = 0; mode = 'inspect'; object = ''; rotation = 0; }
      if (!game.enqueue(command)) status.textContent = 'Command queue is full. Please try again.';
    };
    main.addEventListener('click', onClick); ctx.scope.add(() => main.removeEventListener('click', onClick), 'common-ui-listener');
    let revision = -1;
    const makeStatus = (): HTMLParagraphElement => { const p = doc.createElement('p'); p.className = 'notice'; p.dataset.key = 'status'; p.setAttribute('role', 'status'); p.setAttribute('aria-live', 'polite'); return p; };
    let status = makeStatus();
    ctx.systems.addFrame({ id: 'common/presentation.frame', update(_alpha, dt) {
      const s = game.state();
      if (speed && !s.paused && ctx.services.tryGet(SessionControl)?.playing !== false) {
        elapsed += Math.max(0, Math.min(dt, .25));
        if (elapsed >= (speed === 1 ? .5 : .15)) { elapsed = 0; game.enqueue({ type: 'act', action: 'wait' }); }
      } else elapsed = 0;
      if (s.revision === revision) return; revision = s.revision;
      const focused = doc.activeElement instanceof doc.defaultView!.HTMLElement && main.contains(doc.activeElement) ? doc.activeElement.dataset.key : undefined;
      const openCatalog = live.querySelector<HTMLDetailsElement>('details')?.open ?? false;
      wrap = doc.createElement('div');
      status = makeStatus();
      const header = make(wrap, 'header', 'header'); const title = make(header, 'div'); make(title, 'p', 'eyebrow', 'A little life, together'); make(title, 'h1', '', game.household.name); make(title, 'p', 'intro', game.household.intro);
      const stats = make(header, 'div', 'topstats');
      const clock = `${String(Math.floor(s.minute / 60)).padStart(2, '0')}:${String(s.minute % 60).padStart(2, '0')}`;
      for (const [label, value] of [['Day / time', `${s.day} · ${clock}`], ['Credits', String(s.money)], ['Debt', String(s.debt)]]) { const stat = make(stats, 'div', 'stat'); make(stat, 'span', '', label); make(stat, 'strong', '', value); }
      const layout = make(wrap, 'div', 'layout'), left = make(layout, 'div', 'stack'), right = make(layout, 'div', 'stack');
      const home = make(left, 'section', 'panel'); const homeHead = make(home, 'div', 'panelhead'); make(homeHead, 'h2', '', 'A place to belong'); make(homeHead, 'span', 'pill', s.paused ? 'Paused' : `Turn ${s.turn}`);
      make(home, 'p', 'build-summary', 'Design your home: choose a tool, then select a square. Building and decorating do not advance household time.');
      const tools = make(home, 'div', 'build-tools'); tools.setAttribute('aria-label', 'House building tools');
      const toolButton = (label: string, value: typeof mode) => { const b = make(tools, 'button', `btn${mode === value ? ' primary' : ''}`, label); b.type = 'button'; b.dataset.tool = value; b.dataset.key = `tool:${value}`; b.setAttribute('aria-pressed', String(mode === value)); };
      toolButton('Inspect', 'inspect'); toolButton('Add floor · 15', 'build'); toolButton('Room zoning', 'zone'); toolButton('Finish · 3', 'finish'); toolButton('Move furniture', 'move'); toolButton('Remove floor · +7', 'remove');
      const options = make(home, 'div', 'build-tools');
      const option = (label: string, setting: string, value: string, active: boolean) => { const b = make(options, 'button', `btn${active ? ' primary' : ''}`, label); b.type = 'button'; b.dataset.setting = setting; b.dataset.value = value; b.dataset.key = `setting:${setting}:${value}`; if (setting !== 'rotate') b.setAttribute('aria-pressed', String(active)); };
      if (mode === 'build' || mode === 'zone') for (const room of ['bedroom', 'kitchen', 'living room', 'bathroom'] as const) option(room, 'room', room, room === buildRoom);
      if (mode === 'finish') for (const color of ['oak', 'tile', 'sage', 'terracotta'] as const) option(color, 'finish', color, color === finish);
      if (mode === 'move') { for (const id of s.furniture) option(game.household.objects.find(item => item.id === id)?.name ?? id, 'object', id, object === id); option(`Rotate · ${rotation * 90}°`, 'rotate', '', false); }
      make(home, 'p', 'build-label', mode === 'build' ? `Add ${buildRoom} floor adjacent to your house · 15 credits` : mode === 'zone' ? `Assign squares to ${buildRoom} · free` : mode === 'finish' ? `Apply ${finish} flooring · 3 credits` : mode === 'move' ? `${object ? `Place ${game.household.objects.find(item => item.id === object)?.name ?? object}` : 'Choose an owned furnishing'} · ${rotation * 90}°` : mode === 'remove' ? 'Remove an empty added floor · recover 7 credits' : 'Select a building tool to edit your home.');
      const house = make(home, 'div', 'blueprint'); house.setAttribute('role', 'group'); house.setAttribute('aria-label', 'House floor plan, 8 columns by 6 rows');
      const art: Record<string, string> = { cot: 'simple-bed', bed: 'bed', daybed: 'bed', stove: 'cooking-pot', range: 'cooking-pot', hotplate: 'cooking-pot', table: 'dining-table', bench: 'wooden-chair', sofa: 'armchair' };
      for (let y = 0; y < s.house.height; y++) for (let x = 0; x < s.house.width; x++) {
        const floor = s.house.tiles.find(t => t.x === x && t.y === y), item = s.house.placements.find(p => p.x === x && p.y === y), definition = game.household.objects.find(o => o.id === item?.object);
        const cell = make(house, 'button', `plot${floor ? ` floor ${floor.finish}` : ''}`); cell.type = 'button'; cell.dataset.plot = `${x},${y}`; cell.dataset.key = `plot:${x},${y}`;
        if (floor) for (const [dx, dy, side] of [[0,-1,'Top'],[1,0,'Right'],[0,1,'Bottom'],[-1,0,'Left']] as const) {
          const neighbor = s.house.tiles.find(t => t.x === x + dx && t.y === y + dy);
          if (!neighbor || neighbor.room !== floor.room) cell.style[`border${side}Width`] = '4px';
        }
        cell.setAttribute('aria-label', `Column ${x + 1}, row ${y + 1}: ${floor ? `${floor.room}, ${floor.finish} floor${floor.original ? ', original' : ', added'}` : 'empty ground'}${definition ? `, ${definition.name}, rotated ${item!.rotation * 90} degrees` : ''}`);
        if (definition && item) { const image = art[item.object]; if (image) { const img = make(cell, 'img'); img.src = `./assetrizz/common-ground-${image}.png`; img.alt = ''; img.style.transform = `rotate(${item.rotation * 90}deg)`; } make(cell, 'span', 'object', definition.name); }
        else if (floor) make(cell, 'span', 'room-tag', floor.room === 'living room' ? 'living' : floor.room);
      }
      make(home, 'p', 'house-note', `Residents: ${s.residents.map(p => `${p.name} · ${p.room}`).join('  /  ')}. Objects occupy one square; select a furnishing to move or rotate it.`);
      const residentsPanel = make(left, 'section', 'panel'); const residentsHead = make(residentsPanel, 'div', 'panelhead'); make(residentsHead, 'h2', '', 'The household'); make(residentsHead, 'span', 'pill', 'Choose a resident');
      const residents = make(residentsPanel, 'div', 'residents');
      for (const person of s.residents) {
        const card = make(residents, 'article', `person${person.id === s.selected ? ' chosen' : ''}`); const select = button(card, '', { type: 'select', resident: person.id }); select.className = 'select'; select.setAttribute('aria-pressed', String(person.id === s.selected));
        make(select, 'span', 'avatar', person.name.slice(0, 1)); make(select, 'strong', '', person.name); make(select, 'span', '', `${person.occupation} · rank ${person.rank}`);
        const needs = make(card, 'div', 'needs');
        for (const [name, value] of Object.entries(person.needs)) { const line = make(needs, 'div', 'need'); make(line, 'span', '', name[0]!.toUpperCase() + name.slice(1)); make(line, 'span', '', `${value}/100`); const bar = make(line, 'div', 'bar'); bar.setAttribute('aria-hidden', 'true'); const fill = make(bar, 'i'); fill.style.width = `${value}%`; }
        make(card, 'p', 'muted', `${person.room} · ${person.activity} · ${person.shifts} shifts · ${person.careerProgress} career progress`);
        const auto = button(card, `Autonomy: ${person.autonomy ? 'on' : 'off'}`, { type: 'autonomy', resident: person.id, enabled: !person.autonomy }); auto.classList.add('auto'); auto.setAttribute('aria-pressed', String(person.autonomy)); auto.setAttribute('aria-label', `${person.name} autonomy ${person.autonomy ? 'on' : 'off'}; toggle`);
      }
      const catalogPanel = make(left, 'section', 'panel'); const details = make(catalogPanel, 'details'); details.open = openCatalog; make(details, 'summary', '', `Furnishing catalog · ${s.furniture.length} owned / ${game.household.objects.length} available`); make(details, 'p', 'muted', 'Buying or selling takes 30 minutes; sales return half price. The best sleep, cooking or hygiene item adds 8 recovery at 70 credits or 12 at 100. Work furniture adds 10 credits per shift; seating and decor improve leisure.');
      const catalog = make(details, 'div', 'catalog');
      for (const object of game.household.objects) { const owned = s.furniture.includes(object.id), item = make(catalog, 'div', 'item'); make(item, 'strong', '', `${object.name} · ${object.category}`); make(item, 'small', '', object.description); button(item, owned ? `Sell · +${Math.floor(object.cost / 2)} credits` : `Buy · ${object.cost} credits`, { type: owned ? 'sell' : 'buy', object: object.id }, '', s.paused); }
      const actionPanel = make(right, 'section', 'panel'); const selected = s.residents.find(p => p.id === s.selected); const actionHead = make(actionPanel, 'div', 'panelhead'); make(actionHead, 'h2', '', selected ? `Time for ${selected.name}` : 'Choose a resident'); make(actionHead, 'span', 'pill', '30 min / action');
      status.textContent = s.message; actionPanel.appendChild(status);
      const session = make(actionPanel, 'div', 'row'); button(session, s.paused ? 'Resume household' : 'Pause household', { type: 'pause', paused: !s.paused }, '', false, true); button(session, 'Restart household', { type: 'restart' });
      make(actionPanel, 'h3', 'section-title', 'Time controls');
      const speeds = make(actionPanel, 'div', 'row');
      for (const [value, label] of [[0, 'Manual'], [1, 'Play'], [2, 'Fast']] as const) {
        const control = make(speeds, 'button', `btn${speed === value ? ' primary' : ''}`, label);
        control.type = 'button'; control.dataset.speed = String(value); control.setAttribute('aria-pressed', String(speed === value));
      }
      make(actionPanel, 'p', 'muted', 'Play and Fast queue a wait turn periodically; pause stops household time.');
      make(actionPanel, 'h3', 'section-title', 'Daily rhythms'); const actions = make(actionPanel, 'div', 'actions');
      const verbs: readonly [HearthActivity, string, string][] = [['sleep', 'Sleep', 'Sleep furniture · energy +30 or more'], ['eat', 'Eat', '5 credits · cooking furniture · nourishment +30 or more'], ['wash', 'Wash', 'Hygiene furniture · comfort +24 or more'], ['work', 'Work', 'Once daily · work furniture adds 10 credits'], ['leisure', 'Leisure', 'Comfort +10 or more · energy +5'], ['wait', 'Wait', 'Let 30 minutes pass']];
      for (const [action, label, detail] of verbs) button(actions, label, { type: 'act', action }, detail, s.paused);
      make(actionPanel, 'h3', 'section-title', 'Make a connection'); const social = make(actionPanel, 'div', 'actions');
      for (const person of s.residents.filter(p => p.id !== s.selected)) { button(social, `Chat with ${person.name}`, { type: 'act', action: 'chat', target: person.id }, 'Relationship +4; strained people argue (−12) · requires score ≥ −20', s.paused); button(social, `Reconcile with ${person.name}`, { type: 'act', action: 'reconcile', target: person.id }, 'Relationship +10 · both need energy and comfort ≥ 20', s.paused); }
      make(actionPanel, 'h3', 'section-title', 'Household affairs'); const affairs = make(actionPanel, 'div', 'actions'); button(affairs, 'Pay debt', { type: 'act', action: 'pay-debt' }, `Pay full balance · ${s.debt} credits`, s.paused); button(affairs, 'Host gathering', { type: 'act', action: 'host' }, '30 credits · day 7+ · two projects', s.paused);
      for (const visitor of game.household.visitors) button(affairs, `Greet ${visitor}`, { type: 'act', action: 'greet', target: visitor }, s.visitors.includes(visitor) ? 'Already greeted' : 'Requires hosted gathering', s.paused || s.visitors.includes(visitor));
      const community = make(right, 'section', 'panel'); make(community, 'h2', '', 'Growing together'); make(community, 'p', 'muted', `Gathering: ${s.gathering} · guests greeted: ${s.visitors.length}/${game.household.visitors.length} · tier ${s.tier}`);
      make(community, 'h3', 'section-title', 'Relationships');
      for (const relation of s.relationships) { const line = make(community, 'div', 'line'); const name = (id: string) => s.residents.find(p => p.id === id)?.name ?? id; make(line, 'span', '', `${name(relation.a)} & ${name(relation.b)}${relation.score >= 30 ? ' · friends (+5 connection on chats)' : ''}`); make(line, 'strong', '', String(relation.score)); }
      make(community, 'h3', 'section-title', 'Neighborhood projects');
      const descriptions: Record<string, string> = { 'welcome-table': 'Own seating and prepare two meals.', 'repair-circle': 'Own work furniture and complete two shifts with the first resident.', 'shared-story': 'Have three conversations across at least two resident pairs.' };
      for (const project of s.projects) { const el = make(community, 'div', 'project'); make(el, 'strong', '', `${project.complete ? '✓ ' : '○ '}${project.id.split('-').map(word => word[0]!.toUpperCase() + word.slice(1)).join(' ')} · ${project.value}/${project.target}`); make(el, 'small', '', descriptions[project.id] ?? 'Household project'); }
      const journal = make(right, 'section', 'panel'); make(journal, 'h2', '', 'House journal'); const list = make(journal, 'ol', 'events'); if (!s.events.length) make(list, 'li', '', 'Your story starts here.'); else for (const event of [...s.events].reverse()) make(list, 'li', '', event);
      const footer = make(wrap, 'p', 'footer', 'Made for a little more togetherness · '); const link = make(footer, 'a', '', 'Furniture art provenance'); link.href = './assetrizz/LICENSE.txt';
      morphChildren(live, wrap);
      status = live.querySelector<HTMLParagraphElement>('[data-key="status"]') ?? status;
      if (focused && !(doc.activeElement instanceof doc.defaultView!.HTMLElement && doc.activeElement.dataset.key === focused)) { const replacement = Array.from(main.querySelectorAll<HTMLElement>('[data-key]')).find(el => el.dataset.key === focused); replacement?.focus({ preventScroll: true }); }
    } });
  },
});
