import { SessionControl, Ui, definePlugin } from '../../../../src/sdk/index.ts';
import { Ember } from '../../contracts/ember.ts';
import type { EmberActionView } from '../../contracts/ember.ts';
import { Render } from '../../../../src/sdk/render.ts';
import { createScene } from './scene.ts';
import { styles } from './styles.ts';

export default definePlugin({
  activate(ctx) {
    const game = ctx.services.get(Ember), render = ctx.services.tryGet(Render), ui = ctx.services.tryGet(Ui);
    const allowed = () => ctx.services.tryGet(SessionControl)?.playing !== false;
    const root = ui?.mount(ctx, 'hud', 'ember-ui');
    const scene = render ? createScene(ctx, render, game, () => root) : undefined;
    let draw = () => {};
    if (root && ui) {
      ui.addStyles(ctx, styles);
      root.innerHTML = `<header class="ember-head"><div class="ember-kicker">THE LAST FORGE / TOWER DEFENSE</div><h1>EMBER BASTION</h1><small>Build. Defend. Endure.</small></header>
        <aside class="ember-panel"><div class="ember-kicker">BASTION STATUS</div><p class="ember-stats"></p><p class="ember-wave"></p>
        <p class="ember-message" role="status"></p><small>Click a glowing pad or use the numbered buttons. Towers aim automatically.</small></aside>
        <nav class="ember-actions" aria-label="Defense controls"><span class="ember-pads"></span><button data-action="launch">Launch wave</button>
        <button data-action="repair">Repair</button><button data-action="pulse">Pulse</button></nav>
        <section class="ember-result" hidden><h2></h2><p></p><button data-action="replay">Play again</button></section>`;
      const pads = root.querySelector('.ember-pads')!;
      game.config.pads.forEach((_, i) => {
        const button = document.createElement('button');
        button.dataset['pad'] = String(i); pads.appendChild(button);
      });
      const click = (ev: Event) => {
        if (!allowed()) return;
        const button = (ev.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!button || button.disabled) return;
        if (button.dataset['pad'] !== undefined) game.enqueue({ type: 'build', pad: Number(button.dataset['pad']) });
        else {
          const action = button.dataset['action'];
          if (action === 'launch' || action === 'repair' || action === 'pulse' || action === 'replay') game.enqueue({ type: action });
        }
      };
      root.addEventListener('click', click);
      ctx.scope.add(() => root.removeEventListener('click', click), 'ember-ui');
      const cost = (action: EmberActionView | undefined) => {
        const entries = Object.entries(action?.definition.spend ?? {}).filter(([, amount]) => amount > 0);
        return entries.length ? entries.map(([id, amount]) => `${amount} ${id}`).join(', ') : 'free';
      };
      draw = () => {
        const state = game.state();
        const action = (id: string) => state.actions.find(a => a.definition.id === id);
        const build = action('build'), repair = action('repair'), pulse = action('pulse');
        root.querySelector('.ember-stats')!.textContent = `${state.scrap} SCRAP  ·  ${state.integrity} CORE`;
        root.querySelector('.ember-wave')!.textContent = `WAVE ${Math.min(state.wave + 1, game.config.waves.length)} / ${game.config.waves.length} · ${state.status.toUpperCase()}`;
        root.querySelector('.ember-message')!.textContent = state.message;
        root.querySelectorAll<HTMLButtonElement>('[data-pad]').forEach(button => {
          const index = Number(button.dataset['pad']), label = `Pad ${index + 1} · ${cost(build)}`;
          button.textContent = label;
          button.setAttribute('aria-label', `Build tower on pad ${index + 1}, ${cost(build)}`);
          button.disabled = state.towers.includes(index) || !build?.available || state.status === 'won' || state.status === 'lost';
        });
        root.querySelector<HTMLButtonElement>('[data-action="launch"]')!.disabled = state.status !== 'build';
        for (const [id, view] of [['repair', repair], ['pulse', pulse]] as const) {
          const button = root.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
          const remaining = view?.remaining ?? 0;
          button.textContent = `${id === 'repair' ? 'Repair' : 'Pulse'} · ${cost(view)}${remaining > 0 ? ` · ${remaining.toFixed(1)}s` : ''}`;
          button.disabled = !view?.available || state.status === 'won' || state.status === 'lost' || (id === 'pulse' && !state.enemies.length);
          button.title = remaining > 0 ? `Cooldown: ${remaining.toFixed(1)} seconds` : view?.reason ?? '';
        }
        const result = root.querySelector<HTMLElement>('.ember-result')!;
        result.hidden = state.status !== 'won' && state.status !== 'lost';
        result.querySelector('h2')!.textContent = state.status === 'won' ? 'BASTION HOLDS' : 'THE CORE HAS FALLEN';
        result.querySelector('p')!.textContent = state.message;
      };
    }
    let revision = -1, previousAllowed = allowed();
    ctx.systems.addFrame({ id: 'ember/presentation.frame', update() {
      const changed = revision !== game.revision, ingress = allowed();
      if (changed) { revision = game.revision; scene?.update(); }
      // SessionControl can change without a simulation revision when a menu opens or closes.
      if (changed || ingress !== previousAllowed) draw();
      previousAllowed = ingress;
      scene?.fit();
    } });
    scene?.update(); draw(); scene?.fit();
  },
});
