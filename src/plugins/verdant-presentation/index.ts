import { SessionControl, Ui, Verdant, definePlugin } from '../../sdk/index.ts';
import type { MechanicActionDefinition, VerdantCommand } from '../../sdk/index.ts';
import { Render } from '../../sdk/render.ts';
import { createScene } from './scene.ts';

const styles = `
.verdant-ui { font-family: system-ui, sans-serif; color: #173d32; pointer-events: none; }
.verdant-ui * { box-sizing: border-box; }
.verdant-panel, .verdant-actions { position: absolute; top: 20px; width: 252px; padding: 18px;
  background: rgba(250,250,230,.96); border: 1px solid #9ab99e; border-radius: 16px;
  box-shadow: 0 12px 40px #244c3a33; pointer-events: auto; }
.verdant-panel { left: 20px; }
.verdant-actions { right: 20px; }
.verdant-panel h1 { font: 700 27px Georgia, serif; margin: 4px 0; }
.verdant-kicker { font-size: 10px; letter-spacing: .16em; font-weight: 800; color: #508269; }
.verdant-panel p { font-size: 12px; line-height: 1.35; margin: 9px 0; }
.verdant-stats { display: flex; gap: 5px; }
.verdant-stats span { flex: 1; background: #e2edda; padding: 7px 3px; border-radius: 8px; text-align: center; font-size: 10px; }
.verdant-stats b { display: block; font-size: 18px; }
.verdant-actions h2 { font: 700 18px Georgia, serif; margin: 6px 0; }
.verdant-actions button { width: 100%; margin: 2px 0; padding: 7px; text-align: left; background: #e1eedc;
  border: 1px solid #a5c6a6; border-radius: 8px; color: #234939; cursor: pointer; font-size: 12px; }
.verdant-actions button small { display: block; font-size: 10px; }
.verdant-actions button:hover, .verdant-actions button.selected { background: #42856a; color: white; }
.verdant-actions button:disabled { opacity: .5; }
.verdant-status { margin-top: 10px; background: #173d32; color: #f4f8e6; padding: 10px 12px;
  border-radius: 12px; text-align: center; font-size: 12px; pointer-events: none; }
@media (max-width: 900px) {
  .verdant-panel { top: 6px; left: 6px; right: 6px; width: auto; height: 128px; padding: 8px 10px; }
  .verdant-panel h1 { font-size: 19px; display: inline; margin-right: 10px; }
  .verdant-panel .verdant-kicker { display: inline; font-size: 9px; }
  .verdant-panel .verdant-intro { display: none; }
  .verdant-stats { margin-top: 4px; }
  .verdant-stats span { padding: 3px; }
  .verdant-stats b { display: inline; margin-left: 5px; font-size: 14px; }
  .verdant-panel p { display: inline-block; margin: 4px 10px 0 0; font-size: 11px; }
  .verdant-actions { top: auto; bottom: 6px; left: 6px; right: 6px; width: auto; height: 266px; padding: 8px; }
  .verdant-actions h2 { font-size: 14px; margin: 3px 0; }
  .verdant-actions .verdant-kicker { display: none; }
  .verdant-stations, .verdant-operation-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
  .verdant-actions button { margin: 0; padding: 5px; font-size: 11px; min-height: 31px; }
  .verdant-actions button small { font-size: 9px; line-height: 1.1; }
  .verdant-status { position: static; transform: none; max-width: none; margin-top: 5px; padding: 5px 8px; font-size: 10px; }
}
`;

function actionCaption(definition: MechanicActionDefinition, remaining: number): string {
  const changes = [
    ...Object.entries(definition.spend ?? {}).map(([id, value]) => `−${value} ${id}`),
    ...Object.entries(definition.gain ?? {}).map(([id, value]) => `+${value} ${id}`),
  ];
  if (definition.cooldown) changes.push(remaining > 0 ? `ready in ${remaining} turn${remaining === 1 ? '' : 's'}` : `cooldown ${definition.cooldown}`);
  return changes.join(' · ') || 'Advance one day';
}

export default definePlugin({
  activate(ctx) {
    const game = ctx.services.get(Verdant);
    const render = ctx.services.tryGet(Render), ui = ctx.services.tryGet(Ui);
    const scene = render ? createScene(ctx, render, game) : undefined;
    let selected = game.world.stations[0]!.id;
    const root = ui?.mount(ctx, 'hud', 'verdant-ui');
    let draw = () => {};

    if (ui && root) {
      ui.addStyles(ctx, styles);
      root.innerHTML = `
        <section class="verdant-panel">
          <div class="verdant-kicker">A COLONY RESTORATION STORY</div>
          <h1></h1><p class="verdant-intro"></p>
          <div class="verdant-stats"><span>WATER<b data-value="water"></b></span><span>BIOMASS<b data-value="biomass"></b></span><span>CHARGE<b data-value="charge"></b></span></div>
          <p data-day></p><p data-forecast></p><p data-progress></p>
        </section>
        <section class="verdant-actions">
          <div class="verdant-kicker">FIELD OPERATIONS</div><h2>Choose a station</h2>
          <div class="verdant-stations" data-stations></div>
          <h2>Plan the day</h2><div class="verdant-operation-grid" data-operations></div>
          <div class="verdant-status" role="status" aria-live="polite"></div>
        </section>`;
      root.querySelector('h1')!.textContent = game.world.name;
      root.querySelector('.verdant-intro')!.textContent = `${game.world.stations.length} islands, one living network. Restore every relay before the season ends.`;
      const stationBox = root.querySelector<HTMLElement>('[data-stations]')!;
      for (const station of game.world.stations) {
        const button = document.createElement('button');
        button.dataset.station = station.id;
        stationBox.appendChild(button);
      }
      const operationBox = root.querySelector<HTMLElement>('[data-operations]')!;
      for (const action of game.actionDefinitions) {
        if (!['water', 'biomass', 'convert', 'restore', 'wait'].includes(action.id)) continue;
        const button = document.createElement('button');
        button.dataset.action = action.id;
        const label = document.createElement('strong');
        label.textContent = action.label;
        button.append(label, document.createElement('small'));
        operationBox.appendChild(button);
      }
      const restart = document.createElement('button');
      restart.dataset.restart = '';
      restart.textContent = 'Restart season';
      operationBox.appendChild(restart);

      draw = () => {
        const state = game.state();
        for (const id of ['water', 'biomass', 'charge']) root.querySelector(`[data-value="${id}"]`)!.textContent = String(state.resources[id]);
        root.querySelector('[data-day]')!.textContent = `DAY ${state.turn} / ${state.days} · ${state.status.toUpperCase()}`;
        root.querySelector('[data-forecast]')!.textContent = `FORECAST ${state.forecast}`;
        root.querySelector('[data-progress]')!.textContent = `RELAYS ${state.restored.length} / ${game.world.stations.length}`;
        root.querySelector('.verdant-status')!.textContent = state.message;
        root.querySelectorAll<HTMLButtonElement>('[data-station]').forEach(button => {
          button.classList.toggle('selected', button.dataset.station === selected);
          const station = game.world.stations.find(item => item.id === button.dataset.station);
          button.textContent = `${station?.name ?? ''}${state.restored.includes(button.dataset.station!) ? ' ✓' : ''}`;
        });
        root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
          const definition = game.actionDefinitions.find(item => item.id === button.dataset.action)!;
          button.querySelector('small')!.textContent = actionCaption(definition, state.cooldowns[definition.id] ?? 0);
          button.disabled = state.status !== 'playing';
        });
      };
      const allowed = () => ctx.services.tryGet(SessionControl)?.playing !== false;
      const click = (event: Event) => {
        if (!allowed()) return;
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!button) return;
        if (button.dataset.station) { selected = button.dataset.station; draw(); }
        else if (button.hasAttribute('data-restart')) game.enqueue({ type: 'restart' });
        else if (button.dataset.action) game.enqueue({ type: 'act', action: button.dataset.action, station: selected } as VerdantCommand);
      };
      const pointer = (event: PointerEvent) => {
        if (!allowed() || event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
        const station = scene?.pick(event.clientX, event.clientY);
        if (station) { selected = station; draw(); }
      };
      root.addEventListener('click', click);
      window.addEventListener('pointerdown', pointer);
      ctx.scope.add(() => {
        root.removeEventListener('click', click);
        window.removeEventListener('pointerdown', pointer);
      }, 'verdant-input');
      draw();
    }
    let revision = -1;
    ctx.systems.addFrame({ id: 'verdant/presentation.scene', update() { scene?.fit(); scene?.update(selected); } });
    ctx.systems.addFrame({ id: 'verdant/presentation.ui', update() {
      if (revision !== game.revision) { revision = game.revision; draw(); }
    } });
  },
});
