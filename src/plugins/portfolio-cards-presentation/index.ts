import { PortfolioCards, Ui, definePlugin } from '../../sdk/index.ts';

const styles = `
.cards-screen { position:absolute; inset:0; overflow:auto; pointer-events:auto; color:#f5ebd7; background:radial-gradient(ellipse at 80% 0%,#435a72,#161b2e 55%,#0b101d); font-family:system-ui,sans-serif; }
.cards-screen[data-game="ash"] { background:linear-gradient(110deg,#120f17f5,#281e29e8), url('./assetrizz/hollow-bg-archive.png') center / cover fixed; }
.cards-screen[data-game="cloud"] { background:linear-gradient(110deg,#101b2af5,#273d55db), url('./assetrizz/hollow-bg-forest.png') center / cover fixed; }
.cards-wrap { max-width:960px; margin:auto; padding:clamp(20px,5vw,56px); }
.cards-kicker { text-transform:uppercase; letter-spacing:.24em; font-size:11px; color:#eabf82; }
.cards-screen h1 { font: 700 clamp(36px,7vw,68px) Georgia,serif; margin:8px 0 14px; }
.cards-instructions { max-width:700px; line-height:1.55; color:#e1d8cc; }
.cards-summary { border-block:1px solid #c29d6d; padding:16px 0; margin:22px 0; font-weight:700; line-height:1.6; }
.cards-hand { display:grid; grid-template-columns:repeat(auto-fit,minmax(165px,1fr)); gap:14px; }
.cards-card { border:1px solid #d3b189; border-radius:14px; padding:16px; background:linear-gradient(145deg,#f6e9cf,#d8c3a1); color:#302b32; box-shadow:0 8px 20px #0004; }
.cards-emblem { display:grid; place-items:center; height:75px; margin-bottom:12px; border:1px solid #947b67; border-radius:7px; background:radial-gradient(circle,#edd4a8 0 25%,transparent 26%), repeating-radial-gradient(circle,#907c6940 0 1px,transparent 2px 12px),#c2aa88; font:36px Georgia,serif; color:#59475a; }
.cards-card[data-suit="sun"] .cards-emblem { color:#a65c25; } .cards-card[data-suit="wind"] .cards-emblem { color:#326477; } .cards-card[data-suit="rain"] .cards-emblem { color:#425c91; }
.cards-card[data-suit="ember"] .cards-emblem { background: center / contain no-repeat url('./assetrizz/hollow-icon-sigil-ember.png'), #c2aa88; font-size:0; }
.cards-card[data-suit="ink"] .cards-emblem { background: center / contain no-repeat url('./assetrizz/hollow-icon-lore.png'), #c2aa88; font-size:0; }
.cards-card h3 { text-transform:capitalize; font:700 23px Georgia,serif; margin:0 0 14px; }
.cards-screen button { display:block; width:100%; border:1px solid #6b5260; border-radius:7px; background:#433e51; color:white; padding:10px; margin:7px 0; cursor:pointer; text-align:left; font-weight:600; }
.cards-screen button:hover, .cards-screen button:focus-visible { background:#a06549; outline:3px solid #ffdc93; }
.cards-screen button:disabled { opacity:.5; cursor:default; }
.cards-detail { display:block; margin-top:4px; font-size:12px; line-height:1.35; font-weight:400; color:#f3dfc6; }
.cards-message { margin:24px 0; padding:18px; background:#ffffff12; border-left:4px solid #eabf82; line-height:1.5; }
.cards-restart { max-width:200px; } @media(max-width:480px) { .cards-hand { grid-template-columns:1fr; } .cards-wrap { padding:18px; } }
`;
export default definePlugin({ activate(ctx) {
  const game = ctx.services.get(PortfolioCards), ui = ctx.services.tryGet(Ui);
  if (!ui) return;
  const root = ui.mount(ctx, 'hud', 'cards-screen'); ui.addStyles(ctx, styles);
  root.innerHTML = '<main class="cards-wrap"><div class="cards-kicker">A small game of considered choices</div><h1></h1><p class="cards-instructions"></p><div class="cards-summary"></div><h2>Your hand</h2><div class="cards-hand"></div><div class="cards-message" role="status" aria-live="polite"></div><button class="cards-restart" data-command="restart">Restart game</button></main>';
  const draw = () => {
    const state = game.state();
    root.dataset.game = state.title === 'Ash & Ink' ? 'ash' : 'cloud';
    root.querySelector('h1')!.textContent = state.title;
    root.querySelector('.cards-instructions')!.textContent = state.instructions;
    root.querySelector('.cards-summary')!.textContent = `${state.summary} · ${state.status.toUpperCase()}`;
    root.querySelector('.cards-message')!.textContent = state.message;
    const hand = root.querySelector<HTMLElement>('.cards-hand')!;
    const oldButtons = [...hand.querySelectorAll<HTMLButtonElement>('button')];
    const focusedIndex = oldButtons.findIndex(button => button === document.activeElement);
    const focusedCommand = focusedIndex >= 0 ? oldButtons[focusedIndex]?.dataset.command : undefined;
    hand.replaceChildren();
    for (const card of state.hand) {
      const panel = document.createElement('section'); panel.className = 'cards-card';
      const suit = card.split('-')[0] ?? ''; panel.dataset.suit = suit;
      const emblem = document.createElement('div'); emblem.className = 'cards-emblem'; emblem.setAttribute('aria-hidden', 'true');
      emblem.textContent = ({ ash: '✦', ink: '✒', ember: '✺', sun: '☼', wind: '≋', rain: '☂' } as Record<string, string>)[suit] ?? '◇'; panel.appendChild(emblem);
      const heading = document.createElement('h3'); heading.textContent = card.replace('-', ' · '); panel.appendChild(heading);
      for (const action of state.actions.filter(a => a.id.endsWith(`:${card}`))) {
        const button = document.createElement('button'); button.dataset.command = action.id; button.textContent = action.label; button.disabled = state.status !== 'playing';
        const detail = document.createElement('span'); detail.className = 'cards-detail'; detail.textContent = action.detail; button.appendChild(detail); panel.appendChild(button);
      }
      hand.appendChild(panel);
    }
    if (focusedIndex >= 0) {
      const buttons = [...hand.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const target = buttons.find(button => button.dataset.command === focusedCommand)
        ?? buttons[Math.min(focusedIndex, buttons.length - 1)]
        ?? root.querySelector<HTMLButtonElement>('.cards-restart');
      target?.focus({ preventScroll: true });
    }
  };
  const click = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-command]');
    if (button?.dataset.command) game.enqueue(button.dataset.command);
  };
  root.addEventListener('click', click); ctx.scope.add(() => root.removeEventListener('click', click), 'portfolio-cards-input');
  let revision = -1;
  ctx.systems.addFrame({ id: 'portfolio-cards/presentation.ui', update() { const next = game.state().revision; if (next !== revision) { revision = next; draw(); } } });
} });
