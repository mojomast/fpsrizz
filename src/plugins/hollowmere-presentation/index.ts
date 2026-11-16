import type { MetroState, Painter, SessionContext } from '../../sdk/index.ts';
import { HudRole, Metroidvania, Profile, SessionControl, ThemeRole, Ui, definePlugin } from '../../sdk/index.ts';
import { styles } from './styles.ts';
import { drawScreenEffects, projectWorld } from './effects.ts';

const SPRITES: Readonly<Record<string, string>> = Object.freeze({
  grunt: 'enemy-grunt', spitter: 'enemy-spitter', spider: 'enemy-spider',
  skeleton: 'enemy-skeleton', ghost: 'enemy-ghost', golem: 'enemy-golem', bat: 'enemy-bat',
});
const REGION_TEXTURE: Readonly<Record<string, Readonly<{ wall: string; floor: string; edge: string }>>> = Object.freeze({
  moss: { wall: 'wall-brick', floor: 'floor-grass', edge: 'floor-wood' },
  root: { wall: 'wall-tech', floor: 'floor-concrete', edge: 'floor-wood' },
  archive: { wall: 'wall-panel', floor: 'floor-cobble', edge: 'floor-plate' },
  keep: { wall: 'wall-brick', floor: 'floor-wood', edge: 'floor-cobble' },
  throne: { wall: 'wall-panel', floor: 'floor-cobble', edge: 'floor-plate' },
});
const OPTIONS_KEY = 'hollowmere/options.v1';

type Options = { shake: boolean; damage: boolean; hints: boolean; reduceFlashes: boolean };
const defaultOptions: Options = { shake: true, damage: true, hints: true, reduceFlashes: false };
const optionRows: readonly (readonly [keyof Options, string])[] = [
  ['shake', 'Screen shake'], ['damage', 'Damage numbers'], ['hints', 'Control hints'], ['reduceFlashes', 'Reduce flashes'],
];

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.append(node);
  return node;
}
function setText(node: HTMLElement, text: string): void { if (node.textContent !== text) node.textContent = text; }
function rect(x: number, y: number, w: number, h: number) { return { x, y, w, h }; }

export default definePlugin({
  register(ctx) {
    ctx.provideRole(HudRole, 'hollowmere/hud', {
      name: 'Hollowmere field journal',
      description: 'Canvas-rendered Assetrizz rooms and a tabbed pause journal for map, inventory, capabilities, stats and options.',
      activate(owner) { mount(owner); },
    });
  },
});

function mount(ctx: SessionContext): void {
  const ui = ctx.services.tryGet(Ui);
  const game = ctx.services.tryGet(Metroidvania);
  if (!ui || !game) return;
  const theme = ctx.role(ThemeRole)?.provider;
  const profile = ctx.services.tryGet(Profile);
  const control = ctx.services.tryGet(SessionControl);
  ui.addStyles(ctx, styles);
  const root = ui.mount(ctx, 'hud', 'hollowmere-ui');
  const doc = root.ownerDocument;
  const canvas = element('canvas', 'hollowmere-canvas', root);
  const vignette = element('div', 'hollowmere-vignette', root);
  const hud = element('div', 'hollowmere-hud', root);
  const brand = element('div', 'hm-brand', hud); element('strong', '', brand, 'HOLLOWMERE'); element('span', '', brand, 'THE LANTERN BELOW');
  const status = element('div', 'hm-status', hud);
  const healthLabel = element('div', 'hm-label', status, 'VITALITY');
  const healthBar = element('div', 'hm-bar', status); const healthFill = element('i', '', healthBar);
  const healthText = element('div', 'hm-hp', status);
  const focusLabel = element('div', 'hm-label', status, 'LANTERN FOCUS');
  const focusBar = element('div', 'hm-bar focus', status); const focusFill = element('i', '', focusBar);
  const focusText = element('div', 'hm-hp', status);
  const right = element('div', 'hm-right', hud);
  const emberText = element('strong', '', right);
  const itemText = element('div', '', right);
  const sigils = element('div', 'hm-sigils', right);
  const roomBlock = element('div', 'hm-room', hud);
  const regionLine = element('small', '', roomBlock);
  const roomName = element('strong', '', roomBlock);
  const roomSub = element('small', '', roomBlock);
  const boss = element('div', 'hm-boss', hud);
  const bossName = element('div', 'hm-boss-name', boss);
  const bossBar = element('div', 'hm-bar', boss); const bossFill = element('i', '', bossBar);
  const toast = element('div', 'hm-toast', hud);
  const prompt = element('div', 'hm-prompt', hud);
  const controls = element('div', 'hm-controls', hud);
  controls.innerHTML = '<b>A/D</b> MOVE &nbsp; <b>SPACE</b> JUMP &nbsp; <b>J</b> SABER &nbsp; <b>K</b> DASH &nbsp; <b>L</b> BOLT<br><b>E</b> INTERACT &nbsp; <b>ESC/P</b> JOURNAL &nbsp; <b>M</b> MAP &nbsp; <b>W/S</b> AIM';
  const dialogue = element('section', 'hm-dialogue', root);
  const pause = element('section', 'hm-pause', root);
  element('div', 'hm-pause-bg', pause);
  const pauseShell = element('div', 'hm-pause-shell', pause);
  const pauseHead = element('div', 'hm-pause-head', pauseShell);
  const pauseTitle = element('div', '', pauseHead);
  element('div', 'hm-kicker', pauseTitle, 'FIELD JOURNAL · THE LANTERN BELOW');
  element('h1', '', pauseTitle, 'Hollowmere');
  const pauseInfo = element('aside', '', pauseHead);
  const tabsEl = element('div', 'hm-tabs', pauseShell);
  const tabs = ['MAP', 'INVENTORY', 'CAPABILITIES', 'STATS', 'OPTIONS'].map((label, index) => {
    const button = element('button', 'hm-tab', tabsEl, `${index + 1}  ${label}`);
    button.type = 'button';
    button.dataset['tab'] = String(index);
    return button;
  });
  const panel = element('div', 'hm-panel', pauseShell);
  const mapWrap = element('div', 'hm-map-wrap', panel);
  const mapCanvas = element('canvas', 'hm-map-canvas', mapWrap);
  const mapLegend = element('div', 'hm-legend', panel);
  mapLegend.innerHTML = '<span><i></i>CURRENT</span><span><i style="background:#77906f"></i>VISITED</span><span><i style="background:#39483b"></i>KNOWN EDGE</span><span><i style="background:#26332b"></i>UNEXPLORED</span>';
  const inventoryPanel = element('div', '', panel); inventoryPanel.hidden = true;
  const inventoryHead = element('div', 'hm-panel-head', inventoryPanel); element('h2', '', inventoryHead, 'Satchel'); const inventoryMeta = element('small', '', inventoryHead);
  const inventoryList = element('div', 'hm-list', inventoryPanel);
  const capabilitiesPanel = element('div', '', panel); capabilitiesPanel.hidden = true;
  const capHead = element('div', 'hm-panel-head', capabilitiesPanel); element('h2', '', capHead, 'Lantern capabilities'); element('small', '', capHead, 'WHAT THE DARK HAS TAUGHT YOU');
  const capGrid = element('div', 'hm-cap-grid', capabilitiesPanel);
  const statsPanel = element('div', '', panel); statsPanel.hidden = true;
  const statsHead = element('div', 'hm-panel-head', statsPanel); element('h2', '', statsHead, 'The descent so far'); const statsMeta = element('small', '', statsHead);
  const statsGrid = element('div', 'hm-stats', statsPanel);
  const optionsPanel = element('div', '', panel); optionsPanel.hidden = true;
  const optionsHead = element('div', 'hm-panel-head', optionsPanel); element('h2', '', optionsHead, 'Options'); element('small', '', optionsHead, 'PERSISTS LOCALLY');
  const optionsList = element('div', 'hm-options', optionsPanel);
  const optionsFoot = element('div', 'hm-pause-foot', pauseShell);
  optionsFoot.innerHTML = '<span><kbd>↑ ↓</kbd> SELECT &nbsp; <kbd>ENTER</kbd> USE/TOGGLE &nbsp; <kbd>TAB</kbd> TAB &nbsp; <kbd>1–5</kbd> DIRECT</span><span><kbd>ESC / P</kbd> RETURN TO THE DARK</span>';
  const pauseMobile = element('div', 'hm-pause-mobile', pauseShell);
  pauseMobile.textContent = 'TAP A TAB · TAP AN ITEM TO USE · THE WORLD IS PAUSED';
  // The panel body stays visible; only its tab-specific child panels are swapped.
  panel.hidden = false;
  mapWrap.hidden = false;
  inventoryPanel.hidden = true; capabilitiesPanel.hidden = true; statsPanel.hidden = true; optionsPanel.hidden = true;
  const imageCache = new Map<string, HTMLImageElement>();
  const painterCache = new Map<string, HTMLCanvasElement>();
  const tintCache = new Map<string, HTMLCanvasElement>();
  const images = (source: string): HTMLImageElement => {
    let image = imageCache.get(source);
    if (!image) { image = doc.createElement('img'); image.decoding = 'async'; image.src = source; imageCache.set(source, image); }
    return image;
  };
  const painter = (key: string): HTMLCanvasElement | undefined => {
    const definition: Painter | undefined = theme?.textures[key];
    if (!definition) return undefined;
    let cached = painterCache.get(key);
    if (!cached) {
      cached = doc.createElement('canvas'); cached.width = definition.width; cached.height = 64;
      const context = cached.getContext('2d'); if (!context) return undefined;
      definition.paint(context); painterCache.set(key, cached);
    }
    return cached;
  };
  const frame = (key: string, frameIndex: number, tint?: string): HTMLCanvasElement | undefined => {
    const strip = painter(key); if (!strip) return undefined;
    if (!tint) return strip;
    const cacheKey = `${key}:${frameIndex}:${tint}`; let cached = tintCache.get(cacheKey);
    if (!cached) {
      cached = doc.createElement('canvas'); cached.width = 64; cached.height = 64;
      const context = cached.getContext('2d'); if (!context) return undefined;
      context.drawImage(strip, frameIndex * 64, 0, 64, 64, 0, 0, 64, 64);
      context.globalCompositeOperation = 'source-atop'; context.fillStyle = tint; context.globalAlpha = .32;
      context.fillRect(0, 0, 64, 64); tintCache.set(cacheKey, cached);
    }
    return cached;
  };
  let lastState = game.state();
  let cameraX = 0, cameraY = 0, cameraRoom = '';
  let shake = 0, hitFlash = 0, lastMessage = '', messageUntil = 0;
  let pauseOpen = false, pauseTab = 0, itemCursor = 0, optionCursor = 0;
  let lastPauseRevision = -1;
  let options = loadOptions();
  const prefersReducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvasContext = canvas.getContext('2d');
  const resize = (): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvasContext) canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  window.addEventListener('resize', resize);
  ctx.scope.add(() => window.removeEventListener('resize', resize), 'hollowmere-resize');
  resize();

  function loadOptions(): Options {
    try {
      const saved = profile?.load();
      const raw = saved?.ok && typeof saved.value?.values[OPTIONS_KEY] === 'string' ? saved.value.values[OPTIONS_KEY] as string : '';
      const parsed: unknown = raw ? JSON.parse(raw) : undefined;
      if (parsed && typeof parsed === 'object') {
        const value = parsed as Record<string, unknown>;
        return {
          shake: typeof value['shake'] === 'boolean' ? value['shake'] : defaultOptions.shake,
          damage: typeof value['damage'] === 'boolean' ? value['damage'] : defaultOptions.damage,
          hints: typeof value['hints'] === 'boolean' ? value['hints'] : defaultOptions.hints,
          reduceFlashes: typeof value['reduceFlashes'] === 'boolean' ? value['reduceFlashes'] : defaultOptions.reduceFlashes,
        };
      }
    } catch { /* session-only options */ }
    return { ...defaultOptions };
  }
  const saveOptions = (): void => {
    try {
      const current = profile?.load();
      if (!profile || !current?.ok) return;
      const values = { ...(current.value?.values ?? {}), [OPTIONS_KEY]: JSON.stringify(options) } as Record<string, string | number | boolean>;
      profile.save({ values });
    } catch { /* options remain in memory */ }
  };
  const send = (command: Parameters<typeof game.enqueue>[0]): void => {
    if (control?.playing !== false) game.enqueue(command);
  };
  const openPause = (tab = pauseTab): void => {
    if (lastState.status !== 'playing') return;
    pauseOpen = true; pauseTab = tab; lastPauseRevision = -1;
    send({ type: 'set-paused', paused: true });
    pause.classList.add('show');
    renderPause(lastState);
  };
  const closePause = (): void => {
    if (!pauseOpen) return;
    pauseOpen = false; pause.classList.remove('show');
    send({ type: 'set-paused', paused: false });
  };
  const chooseTab = (index: number): void => {
    pauseTab = (index + 5) % 5; renderPause(lastState);
  };
  const mapLabel = (roomId: string, name: string): string => {
    const short: Record<string, string> = {
      'moss-gate': 'Mossgate', 'moss-hall': 'Long Moss', 'moss-well': 'Windroot', 'thorn-gallery': 'Thorn Gallery',
      'root-crossing': 'Crossing', 'root-shrine': 'Shrine', 'root-depths': 'Depths', burrow: 'Burrow',
      'archive-stair': 'Stair', 'archive-vault': 'Vault', 'keep-bridge': 'Bridge', 'hollow-throne': 'Throne',
    };
    return short[roomId] ?? name.split(' ').slice(0, 2).join(' ');
  };
  const drawMap = (state: MetroState): void => {
    const context = mapCanvas.getContext('2d'); if (!context) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = mapCanvas.clientWidth || 620, height = mapCanvas.clientHeight || 390;
    mapCanvas.width = Math.max(1, Math.floor(width * dpr)); mapCanvas.height = Math.max(1, Math.floor(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#08110c'; context.fillRect(0, 0, width, height);
    const wash = context.createRadialGradient(width * .5, height * .45, 10, width * .5, height * .45, Math.max(width, height) * .7);
    wash.addColorStop(0, '#18302033'); wash.addColorStop(1, '#030906ff');
    context.fillStyle = wash; context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(202,184,128,.055)'; context.lineWidth = 1;
    for (let gx = 22; gx < width; gx += 42) { context.beginPath(); context.moveTo(gx, 0); context.lineTo(gx, height); context.stroke(); }
    for (let gy = 22; gy < height; gy += 42) { context.beginPath(); context.moveTo(0, gy); context.lineTo(width, gy); context.stroke(); }
    const map = state.map;
    const rooms = map.rooms;
    const minX = Math.min(...rooms.map(room => room.x)), minY = Math.min(...rooms.map(room => room.y));
    const maxX = Math.max(...rooms.map(room => room.x + room.w)), maxY = Math.max(...rooms.map(room => room.y + room.h));
    const padding = 26;
    const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY));
    const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (height - (maxY - minY) * scale) / 2 - minY * scale;
    const roomById = new Map(rooms.map(room => [room.id, room]));
    for (const [index, link] of map.links.entries()) {
      const from = roomById.get(link.from), to = roomById.get(link.to);
      if (!from || !to || (!from.revealed && !to.revealed)) continue;
      context.strokeStyle = from.visited || to.visited ? '#8daa84a8' : '#53694f55';
      context.lineWidth = Math.max(1, scale * .11);
      context.beginPath();
      context.moveTo(ox + (from.x + from.w / 2) * scale, oy + (from.y + from.h / 2) * scale);
      context.lineTo(ox + (to.x + to.w / 2) * scale, oy + (to.y + to.h / 2) * scale);
      context.stroke();
      void index;
    }
    for (const room of rooms) {
      const x = ox + room.x * scale, y = oy + room.y * scale, w = room.w * scale, h = room.h * scale;
      const regionColor = game.world.regions.find(entry => entry.id === room.region)?.color ?? '#7ca36a';
      context.fillStyle = room.current ? '#c7b06c' : room.visited ? regionColor : room.revealed ? '#273d31' : '#15221a';
      context.globalAlpha = room.current ? .9 : room.visited ? .56 : room.revealed ? .7 : .9;
      context.fillRect(x, y, w, h);
      context.globalAlpha = 1;
      context.strokeStyle = room.current ? '#f1dda1' : room.visited ? '#85a77c' : '#3a503c';
      context.lineWidth = room.current ? 2 : 1;
      context.strokeRect(x + .5, y + .5, w - 1, h - 1);
      if (room.revealed && w >= 30) {
        context.save();
        context.beginPath(); context.rect(x + 2, y + 2, Math.max(1, w - 4), Math.max(1, h - 4)); context.clip();
        context.fillStyle = room.current ? '#1d2415' : '#d4c79c';
        context.font = `${Math.max(6, Math.min(10, scale * 1.05))}px ui-monospace, monospace`;
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(mapLabel(room.id, room.name), x + w / 2, y + h / 2);
        context.restore();
      }
      if (room.current) { context.fillStyle = '#16200f'; context.beginPath(); context.arc(x + w - 8, y + 8, 4, 0, Math.PI * 2); context.fill(); }
    }
    context.fillStyle = '#9bad91'; context.font = '9px ui-monospace, monospace'; context.textAlign = 'left'; context.textBaseline = 'bottom';
    context.fillText(`${state.regionName.toUpperCase()} · ${state.roomName.toUpperCase()}`, 10, height - 8);
  };
  const renderList = (state: MetroState): void => {
    setText(inventoryMeta, `${state.stats.embers} EMBERS · ${state.stats.sigils} / 3 SUN SIGILS`);
    inventoryList.replaceChildren();
    if (!state.inventory.length) element('div', 'hm-item', inventoryList, 'The satchel is empty.').style.cursor = 'default';
    state.inventory.forEach((item, index) => {
      const row = element('div', 'hm-item', inventoryList);
      if (index === itemCursor) row.classList.add('selected');
      const icon = element('img', '', row) as HTMLImageElement; icon.src = item.icon; icon.alt = '';
      const copy = element('div', '', row); element('strong', '', copy, item.name); element('small', '', copy, item.description);
      element('div', 'hm-count', row, `×${item.count}`);
      row.addEventListener('click', () => { itemCursor = index; useSelectedItem(); });
    });
  };
  const useSelectedItem = (): void => {
    if (!lastState.inventory[itemCursor]) return;
    send({ type: 'use-item', index: itemCursor });
    lastPauseRevision = -1;
  };
  const renderCapabilities = (state: MetroState): void => {
    capGrid.replaceChildren();
    for (const ability of state.abilities) {
      const card = element('div', `hm-cap${ability.unlocked ? '' : ' locked'}`, capGrid);
      const icon = element('img', '', card) as HTMLImageElement; icon.src = worldAbilityIcon(ability.id); icon.alt = '';
      const copy = element('div', '', card); element('strong', '', copy, ability.label); element('small', '', copy, ability.description);
      const control = element('small', '', copy, `${ability.unlocked ? 'UNLOCKED' : 'SEALED'} · ${ability.kind.toUpperCase()}`);
      void control;
    }
  };
  const renderStats = (state: MetroState): void => {
    const s = state.stats;
    setText(statsMeta, `${s.completion}% COMPLETE · ${s.sigils} / 3 SUN SIGILS`);
    statsGrid.replaceChildren();
    for (const [label, value] of [
      ['COMPLETION', `${s.completion}%`], ['ROOMS VISITED', `${s.roomsVisited} / ${state.map.rooms.length}`], ['ROOMS KNOWN', String(s.roomsKnown)],
      ['ENEMIES FELLED', String(s.kills)], ['DEATHS', String(s.deaths)], ['SWORD', `+${s.swordLevel}`],
      ['EMBER SHARDS', String(s.embers)], ['TIME IN THE DARK', `${Math.floor(s.playTime / 60)}:${String(s.playTime % 60).padStart(2, '0')}`],
    ] as const) { const card = element('div', 'hm-stat', statsGrid); element('b', '', card, value); element('span', '', card, label); }
  };
  const renderOptions = (): void => {
    optionsList.replaceChildren();
    optionRows.forEach(([key, label], index) => {
      const row = element('div', `hm-option${index === optionCursor ? ' selected' : ''}`, optionsList);
      element('span', '', row, label); element('b', '', row, options[key] ? 'ON' : 'OFF');
      row.addEventListener('click', () => { optionCursor = index; toggleOption(); });
    });
  };
  const toggleOption = (): void => {
    const row = optionRows[optionCursor]; if (!row) return;
    options = { ...options, [row[0]]: !options[row[0]] }; saveOptions(); renderOptions();
  };
  const renderPause = (state: MetroState): void => {
    if (!pauseOpen) return;
    lastPauseRevision = state.revision;
    setText(pauseInfo, `${state.regionName}\n${state.roomName}\n`);
    tabs.forEach((tab, index) => tab.classList.toggle('selected', index === pauseTab));
    panel.hidden = false;
    mapWrap.hidden = pauseTab !== 0;
    mapLegend.hidden = pauseTab !== 0;
    inventoryPanel.hidden = pauseTab !== 1;
    capabilitiesPanel.hidden = pauseTab !== 2;
    statsPanel.hidden = pauseTab !== 3;
    optionsPanel.hidden = pauseTab !== 4;
    if (pauseTab === 0) drawMap(state);
    else if (pauseTab === 1) renderList(state);
    else if (pauseTab === 2) renderCapabilities(state);
    else if (pauseTab === 3) renderStats(state);
    else renderOptions();
  };
  const worldAbilityIcon = (ability: string): string => {
    const match = game.world.abilities.find(entry => entry.id === ability);
    return match?.icon ?? 'assetrizz/hollow-icon-lantern.png';
  };
  const renderDialogue = (state: MetroState): void => {
    const active = state.dialogue;
    dialogue.classList.toggle('show', !!active);
    if (!active) return;
    dialogue.replaceChildren();
    const image = element('img', 'hm-portrait', dialogue) as HTMLImageElement; image.src = active.portrait; image.alt = '';
    const copy = element('div', '', dialogue);
    element('div', 'hm-kicker', copy, active.title); element('h2', '', copy, active.name); element('p', '', copy, active.text);
    const optionsEl = element('div', 'hm-dialogue-options', copy);
    active.options.forEach((option, index) => {
      const button = element('button', `hm-dialogue-option${option.disabled ? ' disabled' : ''}`, optionsEl) as HTMLButtonElement;
      button.type = 'button';
      const key = element('kbd', '', button, String(index + 1));
      void key; button.append(doc.createTextNode(option.label));
      if (option.hint) element('small', '', button, option.hint);
      button.disabled = option.disabled === true;
      button.addEventListener('click', () => { if (!option.disabled) send({ type: 'dialogue-choice', index }); });
    });
  };

  const drawBackground = (ctx2: CanvasRenderingContext2D, state: MetroState, width: number, height: number): void => {
    const region = game.world.regions.find(entry => entry.name === state.regionName);
    const image = region ? images(region.background) : undefined;
    if (image?.complete && image.naturalWidth > 0) {
      const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
      ctx2.drawImage(image, (width - w) / 2 - cameraX * 2, (height - h) / 2 - cameraY * 2, w, h);
      ctx2.fillStyle = '#07100b'; ctx2.globalAlpha = .58; ctx2.fillRect(0, 0, width, height); ctx2.globalAlpha = 1;
    } else {
      const gradient = ctx2.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, state.status === 'paused' ? '#152018' : '#1a2b20'); gradient.addColorStop(1, '#060a08');
      ctx2.fillStyle = gradient; ctx2.fillRect(0, 0, width, height);
    }
  };
  const drawSprite = (ctx2: CanvasRenderingContext2D, key: string, frameIndex: number, x: number, y: number, w: number, h: number, flip: boolean, tint?: string): void => {
    const texture = frame(key, frameIndex, tint); if (!texture) return;
    ctx2.save();
    if (flip) { ctx2.translate(x + w, y); ctx2.scale(-1, 1); ctx2.drawImage(texture, 0, 0, 64, 64, 0, 0, w, h); }
    else ctx2.drawImage(texture, 0, 0, 64, 64, x, y, w, h);
    ctx2.restore();
  };
  const drawWorld = (state: MetroState, dt: number): void => {
    if (!canvasContext) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const room = game.world.rooms.find(entry => entry.id === state.roomId);
    if (!room) return;
    if (cameraRoom !== room.id) { cameraRoom = room.id; cameraX = Math.max(0, playerCameraTarget(state, width, height).x); cameraY = Math.max(0, playerCameraTarget(state, width, height).y); }
    drawBackground(canvasContext, state, width, height);
    const scale = Math.max(width / 29, height / 17);
    const viewW = width / scale, viewH = height / scale;
    const target = playerCameraTarget(state, width, height);
    const roomW = room.rows[0]?.length ?? 40, roomH = room.rows.length;
    const maxX = Math.max(0, roomW - viewW), maxY = Math.max(0, roomH - viewH);
    const desiredX = clampState(target.x, 0, maxX), desiredY = clampState(target.y, 0, maxY);
    cameraX += (desiredX - cameraX) * Math.min(1, dt * 8);
    cameraY += (desiredY - cameraY) * Math.min(1, dt * 8);
    if (options.shake && shake > 0) { cameraX += Math.sin(state.stats.playTime * 90) * shake; cameraY += Math.cos(state.stats.playTime * 73) * shake * .6; shake = Math.max(0, shake - dt * 1.5); }
    canvasContext.save();
    canvasContext.translate(width / 2, height / 2);
    canvasContext.scale(scale, scale);
    canvasContext.translate(-(cameraX + viewW / 2), -(cameraY + viewH / 2));
    const texture = REGION_TEXTURE[room.tileset] ?? REGION_TEXTURE['moss']!;
    const wall = painter(texture.wall), floor = painter(texture.floor), edge = painter(texture.edge);
    for (let y = 0; y < room.rows.length; y++) for (let x = 0; x < (room.rows[y]?.length ?? 0); x++) {
      const tile = room.rows[y]![x];
      if (tile === '.') continue;
      if (tile === '#') {
        const source = y >= 17 ? floor : wall;
        if (source) {
          const variation = .68 + ((x * 17 + y * 29) % 5) * .024;
          canvasContext.globalAlpha = variation;
          canvasContext.drawImage(source, 0, 0, 64, 64, x, y, 1.02, 1.02);
          canvasContext.globalAlpha = 1;
          canvasContext.fillStyle = 'rgba(4,11,7,.29)'; canvasContext.fillRect(x, y, 1.02, 1.02);
          if (y > 0 && room.rows[y - 1]?.[x] !== '#') {
            canvasContext.fillStyle = 'rgba(229,207,154,.3)'; canvasContext.fillRect(x, y, 1.02, .065);
            if ((x * 7 + y * 11) % 7 === 0) { canvasContext.strokeStyle = 'rgba(58,84,48,.6)'; canvasContext.lineWidth = .035; canvasContext.beginPath(); canvasContext.moveTo(x + .16, y + .01); canvasContext.lineTo(x + .26, y - .18); canvasContext.moveTo(x + .5, y + .01); canvasContext.lineTo(x + .47, y - .14); canvasContext.stroke(); }
          }
        }
      } else if (tile === '=') {
        if (edge) canvasContext.drawImage(edge, 0, 0, 64, 64, x, y + 0.66, 1.02, 0.38);
      } else if (tile === '^') {
        canvasContext.fillStyle = '#c6ad73';
        canvasContext.beginPath(); canvasContext.moveTo(x + .12, y + 1); canvasContext.lineTo(x + .5, y + .2); canvasContext.lineTo(x + .88, y + 1); canvasContext.fill();
      }
    }
    // Background props are intentionally painterly and cheap; they use the region palette rather than more sprites.
    const regionColor = state.regionColor;
    for (const prop of room.props) {
      if (prop.kind === 'arch') {
        canvasContext.strokeStyle = '#b8a36a88'; canvasContext.lineWidth = .18;
        canvasContext.beginPath(); canvasContext.arc(prop.x + (prop.w ?? 2) / 2, prop.y + (prop.h ?? 4), (prop.w ?? 2) / 2, Math.PI, Math.PI * 2); canvasContext.stroke();
      } else if (prop.kind === 'root') {
        canvasContext.strokeStyle = '#6d5f4488'; canvasContext.lineWidth = .22;
        canvasContext.beginPath(); canvasContext.moveTo(prop.x, prop.y + (prop.h ?? 4));
        canvasContext.bezierCurveTo(prop.x - .5, prop.y + (prop.h ?? 4) * .6, prop.x + (prop.w ?? 2), prop.y + (prop.h ?? 4) * .4, prop.x + (prop.w ?? 2) / 2, prop.y); canvasContext.stroke();
      } else if (prop.kind === 'torch' || prop.kind === 'crystal') {
        canvasContext.fillStyle = prop.kind === 'torch' ? '#d8a45555' : '#81c1aa55';
        canvasContext.beginPath(); canvasContext.arc(prop.x + .5, prop.y + .5, 1.1, 0, Math.PI * 2); canvasContext.fill();
        if (prop.kind === 'torch') { canvasContext.fillStyle = '#f1c36d'; canvasContext.fillRect(prop.x + .38, prop.y + .3, .16, .5); }
        else { canvasContext.fillStyle = '#a5e2c1'; canvasContext.beginPath(); canvasContext.moveTo(prop.x + .5, prop.y); canvasContext.lineTo(prop.x + 1, prop.y + .5); canvasContext.lineTo(prop.x + .5, prop.y + 1); canvasContext.lineTo(prop.x, prop.y + .5); canvasContext.fill(); }
      } else if (prop.kind === 'banner') {
        canvasContext.fillStyle = regionColor; canvasContext.globalAlpha = .5; canvasContext.fillRect(prop.x + .15, prop.y, .7, prop.h ?? 3); canvasContext.globalAlpha = 1;
      } else if (prop.kind === 'statue') {
        canvasContext.fillStyle = '#625a4688'; canvasContext.fillRect(prop.x + .2, prop.y + .5, .8, 2.5); canvasContext.beginPath(); canvasContext.arc(prop.x + .6, prop.y + .35, .35, 0, Math.PI * 2); canvasContext.fill();
      } else if (prop.kind === 'rune') {
        canvasContext.strokeStyle = '#d4c17b99'; canvasContext.lineWidth = .08; canvasContext.beginPath(); canvasContext.arc(prop.x + .5, prop.y + .5, .6, 0, Math.PI * 2); canvasContext.stroke();
      }
    }
    for (const door of room.doors) {
      const locked = (door.requires && !state.abilities.some(ability => ability.id === door.requires && ability.unlocked)) || (door.requiresItems?.some(item => !state.inventory.some(entry => entry.id === item)));
      const doorGlow = canvasContext.createLinearGradient(door.x, door.y, door.x, door.y + door.h);
      doorGlow.addColorStop(0, locked ? '#120e0bee' : '#d8c17b44'); doorGlow.addColorStop(.6, locked ? '#1c1711dd' : `${regionColor}55`); doorGlow.addColorStop(1, locked ? '#080705ee' : '#e8d69b22');
      canvasContext.fillStyle = doorGlow; canvasContext.fillRect(door.x, door.y, door.w, door.h);
      canvasContext.strokeStyle = locked ? '#8c6d4d' : '#e0ca8c'; canvasContext.lineWidth = .1; canvasContext.strokeRect(door.x + .08, door.y + .08, door.w - .16, door.h - .16);
      canvasContext.strokeStyle = locked ? '#5f4a36' : '#f4e6b0aa'; canvasContext.lineWidth = .04; canvasContext.strokeRect(door.x + .2, door.y + .2, door.w - .4, door.h - .4);
      canvasContext.strokeStyle = locked ? '#7e5d43' : '#e2c98a'; canvasContext.lineWidth = .07;
      canvasContext.beginPath(); canvasContext.arc(door.x + door.w / 2, door.y + .08, door.w * .4, Math.PI, 0); canvasContext.stroke();
      canvasContext.beginPath();
      canvasContext.moveTo(door.x + door.w / 2, door.y + door.h * .26);
      canvasContext.lineTo(door.x + door.w / 2, door.y + door.h * .74);
      canvasContext.strokeStyle = locked ? '#c9a473' : '#f1dda1';
      canvasContext.lineWidth = .07;
      canvasContext.stroke();
      void door;
    }
    for (const checkpoint of room.checkpoints) {
      const active = state.checkpoints.some(entry => entry.id === checkpoint.id && entry.activated);
      const glow = canvasContext.createRadialGradient(checkpoint.x + .31, checkpoint.y + .25, 0, checkpoint.x + .31, checkpoint.y + .25, 1.2);
      glow.addColorStop(0, active ? '#d8efb766' : '#d7d7a044'); glow.addColorStop(1, '#00000000');
      canvasContext.fillStyle = glow; canvasContext.beginPath(); canvasContext.arc(checkpoint.x + .31, checkpoint.y + .25, 1.2, 0, Math.PI * 2); canvasContext.fill();
      canvasContext.fillStyle = active ? '#a6cea2' : '#748067'; canvasContext.fillRect(checkpoint.x + .25, checkpoint.y + .1, .12, 1.8);
      const lantern = images('assetrizz/hollow-icon-lantern.png');
      if (lantern.complete) canvasContext.drawImage(lantern, checkpoint.x - .08, checkpoint.y - .72, .8, .8);
      else { canvasContext.beginPath(); canvasContext.arc(checkpoint.x + .31, checkpoint.y - .05, .22, 0, Math.PI * 2); canvasContext.fill(); }
    }
    for (const npc of room.npcs) {
      const key = npc.role === 'smith' ? 'npc-smith' : 'npc-cartographer';
      canvasContext.fillStyle = 'rgba(2,7,4,.34)'; canvasContext.beginPath(); canvasContext.ellipse(npc.x + .3, npc.y + 2.01, .7, .11, 0, 0, Math.PI * 2); canvasContext.fill();
      drawSprite(canvasContext, key, 0, npc.x - .55, npc.y - .2, 1.7, 2.1, false);
    }
    for (const pickup of state.pickups) {
      const x = pickup.x, y = pickup.y + Math.sin(state.stats.playTime * 3 + x) * .09;
      const image = images(pickup.icon);
      if (image.complete) canvasContext.drawImage(image, x - .12, y - .12, .75, .75);
      else { canvasContext.fillStyle = '#e3c979'; canvasContext.beginPath(); canvasContext.arc(x + .3, y + .3, .22, 0, Math.PI * 2); canvasContext.fill(); }
      canvasContext.fillStyle = '#e7d69b33'; canvasContext.beginPath(); canvasContext.arc(x + .3, y + .3, .65, 0, Math.PI * 2); canvasContext.fill();
    }
    for (const enemy of state.enemies) {
      const texture = SPRITES[enemy.type === 'hollow-king' ? 'golem' : (game.world.enemies.find(entry => entry.id === enemy.type)?.sprite ?? 'grunt')] ?? 'enemy-grunt';
      const frameIndex = enemy.state === 'hurt' ? 3 : enemy.state === 'windup' || enemy.state === 'attack' ? 2 : enemy.state === 'chase' ? 1 : 0;
      const tint = game.world.enemies.find(entry => entry.id === enemy.type)?.tint;
      if (enemy.state === 'windup') {
        const cx = enemy.x + enemy.w / 2, cy = enemy.y + enemy.h / 2;
        canvasContext.save();
        canvasContext.strokeStyle = enemy.boss ? '#e7a07b' : '#ff8b6d'; canvasContext.lineWidth = enemy.boss ? .1 : .07;
        canvasContext.globalAlpha = .42;
        canvasContext.beginPath(); canvasContext.arc(cx, cy, enemy.w * .78, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * enemy.windup); canvasContext.stroke();
        canvasContext.globalAlpha = .1; canvasContext.fillStyle = enemy.boss ? '#e7a07b' : '#ff8b6d';
        canvasContext.beginPath(); canvasContext.arc(cx, cy, enemy.w * .78, 0, Math.PI * 2); canvasContext.fill();
        canvasContext.globalAlpha = .24;
        canvasContext.beginPath(); canvasContext.moveTo(cx, cy); canvasContext.lineTo(cx + Math.cos(-Math.PI / 2) * enemy.w * 1.25, cy + Math.sin(-Math.PI / 2) * enemy.w * 1.25); canvasContext.lineTo(cx + Math.cos(-Math.PI / 2 + Math.PI * 2 * enemy.windup) * enemy.w * 1.25, cy + Math.sin(-Math.PI / 2 + Math.PI * 2 * enemy.windup) * enemy.w * 1.25); canvasContext.closePath(); canvasContext.fill();
        canvasContext.restore();
      }
      canvasContext.fillStyle = 'rgba(2,7,4,.32)'; canvasContext.beginPath(); canvasContext.ellipse(enemy.x + enemy.w / 2, enemy.y + enemy.h, enemy.w * .58, .1, 0, 0, Math.PI * 2); canvasContext.fill();
      drawSprite(canvasContext, texture, frameIndex, enemy.x, enemy.y, enemy.w * (enemy.boss ? 1.15 : 1), enemy.h * (enemy.boss ? 1.25 : 1), enemy.facing === -1, tint);
      if (enemy.boss || enemy.elite) {
        canvasContext.fillStyle = '#1a100ddd'; canvasContext.fillRect(enemy.x, enemy.y - .24, enemy.w, .09);
        canvasContext.fillStyle = enemy.boss ? '#d59a6a' : '#d8bd71'; canvasContext.fillRect(enemy.x, enemy.y - .24, enemy.w * clampState(enemy.health / enemy.maxHealth, 0, 1), .09);
      }
    }
    const playerFrame = state.player.attack.kind !== 'none' ? 2 : Math.abs(state.player.vx) > .2 ? 1 : 0;
    const blink = state.player.invulnerable > 0 && !options.reduceFlashes && !prefersReducedMotion && Math.floor(state.stats.playTime * 6) % 2 === 0;
    canvasContext.fillStyle = 'rgba(2,7,4,.36)'; canvasContext.beginPath(); canvasContext.ellipse(state.player.x + state.player.w / 2, state.player.y + state.player.h, .46, .1, 0, 0, Math.PI * 2); canvasContext.fill();
    canvasContext.save(); if (blink) canvasContext.globalAlpha = .68;
    drawSprite(canvasContext, 'player-knight', playerFrame, state.player.x - .45, state.player.y - .48, 1.7, 2.35, state.player.facing === -1);
    canvasContext.restore();
    if (state.player.invulnerable > 0) {
      canvasContext.strokeStyle = 'rgba(213,238,183,.55)'; canvasContext.lineWidth = .045;
      canvasContext.beginPath(); canvasContext.arc(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2, .85, 0, Math.PI * 2); canvasContext.stroke();
    }
    canvasContext.restore();
    // Everything below is screen-space: the camera transform must never scale typography or HUD feedback.
    const projection = { width, height, scale, cameraX, cameraY };
    const haze = canvasContext.createLinearGradient(0, height * .48, 0, height);
    haze.addColorStop(0, '#07100b00'); haze.addColorStop(1, '#07100b88');
    canvasContext.fillStyle = haze; canvasContext.fillRect(0, height * .48, width, height * .52);
    for (const projectile of state.projectiles) {
      const p = projectWorld(projection, projectile.x, projectile.y);
      canvasContext.save();
      canvasContext.shadowBlur = 14; canvasContext.shadowColor = projectile.kind === 'bolt' ? '#f4d88d' : '#df806d';
      canvasContext.fillStyle = projectile.kind === 'bolt' ? '#f0d28b' : '#c8786d';
      canvasContext.beginPath(); canvasContext.arc(p.x, p.y, projectile.kind === 'bolt' ? 4 : 3, 0, Math.PI * 2); canvasContext.fill();
      canvasContext.globalAlpha = .22; canvasContext.beginPath(); canvasContext.arc(p.x, p.y, 12, 0, Math.PI * 2); canvasContext.fill(); canvasContext.restore();
    }
    drawScreenEffects(canvasContext, state.effects, projection, {
      showDamage: options.damage,
      reduceFlashes: options.reduceFlashes || prefersReducedMotion,
      reducedMotion: prefersReducedMotion,
      time: state.stats.playTime,
      health: { health: state.player.health, maxHealth: state.player.maxHealth, hitFlash },
      attack: state.player.attack.kind === 'none' ? undefined : {
        kind: state.player.attack.kind, progress: state.player.attack.progress,
        x: state.player.x + state.player.w / 2, y: state.player.y + 1, facing: state.player.facing,
      },
    });
    hitFlash = Math.max(0, hitFlash - dt * 2.8);
    // Tiny drifting motes add depth without becoming gameplay noise.
    if (!options.reduceFlashes && !prefersReducedMotion) {
      canvasContext.save();
      for (let i = 0; i < 18; i++) {
        const phase = state.stats.playTime * (.12 + (i % 4) * .03);
        const px = ((i * 173 + Math.sin(phase + i) * 50 + state.stats.playTime * (4 + i % 5)) % (width + 80)) - 40;
        const py = ((i * 97 + Math.cos(phase * .8 + i) * 35 - state.stats.playTime * (2 + i % 3)) % (height + 80)) - 40;
        canvasContext.globalAlpha = .16 + (i % 4) * .035; canvasContext.fillStyle = i % 3 === 0 ? '#f2dc9c' : '#c7d8a5';
        canvasContext.beginPath(); canvasContext.arc(px, py, 1.1 + (i % 3) * .6, 0, Math.PI * 2); canvasContext.fill();
      }
      canvasContext.restore();
    }
  };
  const playerCameraTarget = (state: MetroState, width: number, height: number): { x: number; y: number } => {
    const room = game.world.rooms.find(entry => entry.id === state.roomId);
    const scale = Math.max(width / 29, height / 17);
    const viewW = width / scale, viewH = height / scale;
    const roomW = room?.rows[0]?.length ?? 40, roomH = room?.rows.length ?? 22;
    return { x: clampState(state.player.x - viewW / 2, 0, Math.max(0, roomW - viewW)), y: clampState(state.player.y - viewH / 2, 0, Math.max(0, roomH - viewH)) };
  };
  const clampState = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
  const drawHud = (state: MetroState): void => {
    setText(healthText, `${state.player.health} / ${state.player.maxHealth}`);
    healthFill.style.width = `${clampState(100 * state.player.health / Math.max(1, state.player.maxHealth), 0, 100)}%`;
    setText(focusText, `${Math.floor(state.player.focus)} / ${state.player.maxFocus}`);
    focusFill.style.width = `${clampState(100 * state.player.focus / Math.max(1, state.player.maxFocus), 0, 100)}%`;
    setText(emberText, `${state.stats.embers} ✦`);
    setText(itemText, `${state.stats.sigils} / 3 SUN SIGILS`);
    sigils.replaceChildren();
    for (const id of ['hollowmere/sun-sigil-moss', 'hollowmere/sun-sigil-tide', 'hollowmere/sun-sigil-ember']) {
      const mark = element('span', `hm-sigil${state.stats.sigilIds.includes(id) ? ' on' : ''}`, sigils, '✦'); void mark;
    }
    setText(regionLine, state.regionName.toUpperCase());
    setText(roomName, state.roomName);
    setText(roomSub, `${state.map.rooms.filter(room => room.visited).length} / ${state.map.rooms.length} ROOMS · ${state.stats.completion}% COMPLETE`);
    boss.classList.toggle('show', !!state.boss);
    if (state.boss) { setText(bossName, `${state.boss.name.toUpperCase()} · PHASE ${state.boss.phase}`); bossFill.style.width = `${clampState(100 * state.boss.health / Math.max(1, state.boss.max), 0, 100)}%`; }
    const nearCheckpoint = game.world.rooms.find(room => room.id === state.roomId)?.checkpoints.find(entry => distanceFrom(entry.x, entry.y, state.player.x, state.player.y) < 1.6);
    const nearNpc = game.world.rooms.find(room => room.id === state.roomId)?.npcs.find(entry => distanceFrom(entry.x, entry.y, state.player.x, state.player.y) < 2);
    prompt.classList.toggle('show', !!nearCheckpoint || !!nearNpc);
    if (nearCheckpoint) setText(prompt, `E · REST AT ${nearCheckpoint.name.toUpperCase()}`);
    else if (nearNpc) setText(prompt, `E · SPEAK WITH ${nearNpc.name.toUpperCase()}`);
    controls.hidden = !options.hints;
    if (lastMessage !== state.message) { lastMessage = state.message; messageUntil = state.stats.playTime + 4.5; }
    toast.classList.toggle('show', state.message.length > 0 && state.stats.playTime < messageUntil);
    setText(toast, state.message);
    root.dataset['status'] = state.status;
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (control?.playing === false) return;
    const state = game.state();
    if (state.status === 'victory') return;
    if (state.dialogue && !pauseOpen) {
      if (event.code === 'Escape' || event.code === 'KeyE') { event.preventDefault(); event.stopImmediatePropagation(); send({ type: 'dialogue-close' }); return; }
      if (/^Digit[1-3]$/.test(event.code)) { event.preventDefault(); event.stopImmediatePropagation(); send({ type: 'dialogue-choice', index: Number(event.code.slice(5)) - 1 }); return; }
    }
    if (pauseOpen) {
      if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); event.stopImmediatePropagation(); closePause(); return; }
      if (event.code === 'Tab' || event.code === 'ArrowRight') { event.preventDefault(); event.stopImmediatePropagation(); chooseTab(pauseTab + 1); return; }
      if (event.code === 'ArrowLeft') { event.preventDefault(); event.stopImmediatePropagation(); chooseTab(pauseTab - 1); return; }
      if (/^Digit[1-5]$/.test(event.code)) { event.preventDefault(); event.stopImmediatePropagation(); chooseTab(Number(event.code.slice(5)) - 1); return; }
      if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (pauseTab === 1 && state.inventory.length) itemCursor = (itemCursor + (event.code === 'ArrowDown' ? 1 : -1) + state.inventory.length) % state.inventory.length;
        if (pauseTab === 4) optionCursor = (optionCursor + (event.code === 'ArrowDown' ? 1 : -1) + optionRows.length) % optionRows.length;
        renderPause(state); return;
      }
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (pauseTab === 1) useSelectedItem();
        else if (pauseTab === 4) toggleOption();
        return;
      }
      return;
    }
    if (state.status === 'playing' && (event.code === 'Escape' || event.code === 'KeyP')) { event.preventDefault(); event.stopImmediatePropagation(); openPause(); return; }
    if (state.status === 'playing' && event.code === 'KeyM') { event.preventDefault(); event.stopImmediatePropagation(); openPause(0); return; }
  };
  window.addEventListener('keydown', onKey, { capture: true });
  ctx.scope.add(() => window.removeEventListener('keydown', onKey, { capture: true }), 'hollowmere-input');
  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const tab = target?.closest<HTMLElement>('[data-tab]');
    if (tab?.dataset['tab']) { chooseTab(Number(tab.dataset['tab'])); return; }
  };
  root.addEventListener('click', onClick);
  ctx.scope.add(() => root.removeEventListener('click', onClick), 'hollowmere-click');
  const distanceFrom = (x1: number, y1: number, x2: number, y2: number): number => Math.hypot(x1 - x2, y1 - y2);
  ctx.systems.addFrame({
    id: 'hollowmere/presentation', update(alpha, dt) {
      const state = game.state();
      lastState = state;
      const previousHealth = drawHudHealth;
      drawHudHealth = state.player.health;
      if (previousHealth !== undefined && state.player.health < previousHealth) { if (options.shake) shake = .2; hitFlash = .55; }
      drawWorld(state, dt);
      drawHud(state);
      renderDialogue(state);
      if (state.status === 'paused' && !pauseOpen) { pauseOpen = true; pause.classList.add('show'); }
      if (pauseOpen && state.status === 'playing') { pauseOpen = false; pause.classList.remove('show'); }
      if (pauseOpen && lastPauseRevision !== state.revision && state.status === 'paused') renderPause(state);
      if (state.status === 'dying') { pauseOpen = false; pause.classList.remove('show'); }
      void alpha;
    },
  });
  let drawHudHealth: number | undefined;
  // Keep one reusable toast/prompt state for screen readers and avoid constant DOM churn.
  setText(pauseInfo, 'THE LANTERN BELOW');
  resize();
  drawWorld(game.state(), 1 / 60);
  drawHud(game.state());
  renderPause(game.state());
}
