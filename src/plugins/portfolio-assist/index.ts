import { PortfolioCards, PushPuzzle, SessionControl, Ui, definePlugin, hintMechanic } from '../../sdk/index.ts';

const styles = `.portfolio-assist { position:fixed; right:1rem; bottom:1rem; z-index:40; max-width:min(22rem,calc(100vw - 2rem)); pointer-events:auto; font: 14px/1.45 system-ui,sans-serif; color:#fff; }
.portfolio-assist section { background:#18202cf2; border:1px solid #e5c98a; border-radius:.6rem; padding:.7rem; box-shadow:0 3px 18px #0008; }
.portfolio-assist button { color:#fff; background:#354556; border:1px solid #f0d69c; border-radius:.35rem; padding:.5rem .75rem; cursor:pointer; }
.portfolio-assist button:focus-visible { outline:3px solid #fff; outline-offset:2px; }
.portfolio-assist p { margin:.6rem 0 0; }`;

export default definePlugin({ activate(ctx) {
  const ui = ctx.services.tryGet(Ui);
  if (!ui) return;
  const ledger = hintMechanic(ctx).create(ctx, 'assist', [{ id: 'current', levels: 2 }]);
  const root = ui.mount(ctx, 'hud', 'portfolio-assist');
  ui.addStyles(ctx, styles);
  root.innerHTML = '<section aria-label="Optional assistance"><button type="button">Show a hint</button><p role="status" aria-live="polite"></p></section>';
  const button = root.querySelector<HTMLButtonElement>('button')!, output = root.querySelector<HTMLElement>('p')!;
  let key = '', hints: string[] = [];
  const refresh = () => {
    const puzzle = ctx.services.tryGet(PushPuzzle), cards = ctx.services.tryGet(PortfolioCards);
    let next = '', options: string[] = [];
    if (puzzle) {
      const state = puzzle.state(), chamber = puzzle.campaign.chambers[state.chamber];
      if (chamber && state.status === 'playing') {
        next = `puzzle:${state.chamber}:${state.revision}`;
        let plates = 0, weighted = 0;
        chamber.rows.forEach((row, y) => [...row].forEach((tile, x) => { if (tile === 'O') { plates++; if (state.rocks.some(rock => rock.x === x && rock.y === y)) weighted++; } }));
        options = [plates > weighted ? `${weighted} of ${plates} plates are weighted. Consider where a boulder can be pushed from.` : 'All plates are weighted. Look for the exit.', chamber.hint];
      }
    } else if (cards) {
      const state = cards.state();
      if (state.status === 'playing' && state.hand.length) {
        next = `cards:${state.revision}`;
        const match = /next (ash|ink|ember)/i.exec(state.summary)?.[1];
        const card = match && state.hand.find(item => item.startsWith(`${match}-`));
        const storm = /storm (\d+)\/4/i.exec(state.summary);
        const detail = match ? (card ? `The ${card} card matches the next ${match} seal.` : `No ${match} card is in your hand; compare the transcribe and restore options.`)
          : storm && Number(storm[1]) >= 2 ? 'The storm is building. Shelter reduces it by sacrificing a card.'
          : 'Compare each card’s survey detail with the remaining island marks and storm limit.';
        options = [`Your hand has ${state.hand.length} cards. ${state.summary}`, detail];
      }
    }
    if (next !== key) {
      if (key && !ledger.reset('current').ok) { root.hidden = true; return; }
      key = next; output.textContent = '';
    }
    hints = options;
    root.hidden = !key;
    button.disabled = !key || ctx.services.tryGet(SessionControl)?.playing === false || ledger.level('current') >= hints.length;
    button.textContent = ledger.level('current') ? 'Show another hint' : 'Show a hint';
  };
  const click = () => { refresh(); if (!button.disabled && ledger.reveal('current').ok) { output.textContent = hints[ledger.level('current') - 1] ?? ''; refresh(); } };
  button.addEventListener('click', click); ctx.scope.add(() => button.removeEventListener('click', click), 'portfolio-assist-input');
  refresh();
  ctx.systems.addFrame({ id: 'portfolio/assist.refresh', update: refresh });
} });
