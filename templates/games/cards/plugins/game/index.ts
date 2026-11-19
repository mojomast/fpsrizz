// __TITLE__: a memory card game drawn with the DOM UI service (no 3D). Rules and UI live in one plugin.
import { ExperienceRole, Flow, SessionControl, Ui, definePlugin, defineService, morphChildren } from '@bulkhead/sdk';

const NS = '__NS__';
const PAIRS = 8, HIDE_AFTER = 0.8;
const FACES = ['★', '♥', '♣', '♦', '☀', '☂', '♪', '✿', '☘', '⚑'];
export interface Card { face: number; up: boolean; matched: boolean }
export interface GameState {
  cards: Card[];
  moves: number;
  matched: number;
  won: boolean;
  /** Queues a card flip (applied on the next tick, so runs are deterministic and replayable). */
  flip(index: number): void;
}
export const Game = defineService<GameState>(`${NS}/state`);

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, `${NS}/game`, { name: '__TITLE__', description: 'Find every pair.', pointer: 'free', controls: [['Click / tap a card', 'Flip it']] });
  },
  activate(ctx) {
    // Seeded Fisher-Yates shuffle: the preset seed decides the layout.
    const faces = Array.from({ length: PAIRS * 2 }, (_, i) => i % PAIRS);
    for (let i = faces.length - 1; i > 0; i--) { const j = ctx.rng.int(0, i + 1); [faces[i], faces[j]] = [faces[j]!, faces[i]!]; }
    const queue: number[] = [];
    const state: GameState = { cards: faces.map((face) => ({ face, up: false, matched: false })), moves: 0, matched: 0, won: false, flip: (i) => { queue.push(i); } };
    ctx.services.provide(Game, state);
    let open: number[] = [], hideAt = -1;
    ctx.persist({
      save: () => ({ cards: state.cards.map((c) => ({ ...c })), moves: state.moves, matched: state.matched, won: state.won, open, hideAt }),
      load: (d) => { const v = d as unknown as { cards: Card[]; moves: number; matched: number; won: boolean; open: number[]; hideAt: number }; state.cards.splice(0, state.cards.length, ...v.cards); Object.assign(state, { moves: v.moves, matched: v.matched, won: v.won }); open = v.open; hideAt = v.hideAt; },
    });
    ctx.systems.add({ id: `${NS}/rules`, phase: 'control', update: () => {
      if (hideAt >= 0 && ctx.time.now >= hideAt) { for (const i of open) state.cards[i]!.up = false; open = []; hideAt = -1; }
      for (const i of queue.splice(0)) {
        const card = state.cards[i];
        if (!card || card.up || card.matched || open.length === 2 || state.won) continue;
        card.up = true; open.push(i);
        if (open.length < 2) continue;
        state.moves++;
        const [a, b] = open.map((k) => state.cards[k]!) as [Card, Card];
        if (a.face === b.face) {
          a.matched = b.matched = true; open = []; state.matched++;
          if (state.matched === PAIRS) {
            state.won = true;
            ctx.services.tryGet(Flow)?.end({ outcome: 'victory', title: 'All pairs found', detail: `${state.moves} moves.`, stats: [['Moves', String(state.moves)], ['Time', `${ctx.time.now.toFixed(1)} s`]] });
          }
        } else hideAt = ctx.time.now + HIDE_AFTER;
      }
    } });

    // ---- UI (skipped headless) ----
    const ui = ctx.services.tryGet(Ui);
    if (!ui) return;
    const cls = NS.replace(/\W/g, '-');
    ui.addStyles(ctx, `.${cls}{position:absolute;inset:0;display:grid;place-items:center;pointer-events:auto;background:#183028;font:600 16px system-ui;color:#eef}
.${cls} .table{display:grid;grid-template-columns:repeat(4,min(20vw,96px));gap:10px}
.${cls} button{aspect-ratio:3/4;border:0;border-radius:10px;font:700 clamp(22px,6vw,44px) system-ui;cursor:pointer;background:#2d6a5a;color:#fff;box-shadow:0 3px 0 #0006}
.${cls} button.up{background:#f4ecd8;color:#7a3020}.${cls} button.matched{opacity:.45;cursor:default}.${cls} p{text-align:center}`);
    const root = ui.mount(ctx, 'hud', cls);
    root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.('button[data-i]');
      if (b && ctx.services.tryGet(SessionControl)?.playing !== false) state.flip(Number((b as HTMLElement).dataset.i));
    });
    ctx.systems.addFrame({ id: `${NS}/ui`, order: 300, update: () => {
      const doc = root.ownerDocument, next = doc.createElement('div'), wrap = doc.createElement('div'), table = doc.createElement('div');
      table.className = 'table';
      state.cards.forEach((c, i) => {
        const b = doc.createElement('button');
        b.type = 'button'; b.dataset.i = String(i); b.dataset.key = `card-${i}`;
        b.className = c.matched ? 'up matched' : c.up ? 'up' : '';
        b.textContent = c.up || c.matched ? FACES[c.face]! : '';
        b.setAttribute('aria-label', c.up || c.matched ? `Card ${i + 1}: ${FACES[c.face]}` : `Card ${i + 1}: face down`);
        table.appendChild(b);
      });
      const info = doc.createElement('p'); info.textContent = `Pairs ${state.matched}/${PAIRS} · Moves ${state.moves}`;
      wrap.append(table, info); next.appendChild(wrap);
      morphChildren(root, next);
    } });
  },
});
