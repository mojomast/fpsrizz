// __TITLE__: a sliding-tile puzzle drawn with the DOM UI service (no 3D). Rules and UI live in one plugin.
import { ExperienceRole, Flow, Input, SessionControl, Ui, definePlugin, defineService, morphChildren, registerStandardControls } from '@bulkhead/sdk';

const NS = '__NS__';
const SIZE = 3, SHUFFLE_MOVES = 80;
export interface GameState {
  /** Row-major tiles; 0 is the gap. Solved = 1..8 then 0. */
  tiles: number[];
  moves: number;
  won: boolean;
  /** Gap moves used by the shuffle (replaying them backwards solves the board; handy for tests and hints). */
  readonly shuffle: readonly number[];
  /** Queues a tile click (applied on the next tick, so it is deterministic and replayable). */
  click(index: number): void;
}
export const Game = defineService<GameState>(`${NS}/state`);

const neighbours = (i: number): number[] => {
  const r = Math.floor(i / SIZE), c = i % SIZE, out: number[] = [];
  if (r > 0) out.push(i - SIZE); if (r < SIZE - 1) out.push(i + SIZE); if (c > 0) out.push(i - 1); if (c < SIZE - 1) out.push(i + 1);
  return out;
};
const solved = (t: readonly number[]): boolean => t.every((v, i) => v === (i === t.length - 1 ? 0 : i + 1));

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, `${NS}/game`, {
      name: '__TITLE__', description: 'Slide the tiles back into order.', pointer: 'free',
      controls: [['Click a tile', 'Slide it into the gap'], ['Arrows / WASD / D-pad', 'Slide a tile in that direction']],
    });
    registerStandardControls(ctx, NS);
  },
  activate(ctx) {
    const tiles = Array.from({ length: SIZE * SIZE }, (_, i) => (i === SIZE * SIZE - 1 ? 0 : i + 1));
    // Shuffle by random legal moves from the solved board: always solvable, and the same seed gives the same board.
    const shuffle: number[] = [];
    let gap = tiles.length - 1, prev = -1;
    for (let n = 0; n < SHUFFLE_MOVES; n++) {
      const options = neighbours(gap).filter((i) => i !== prev);
      const next = options[ctx.rng.int(0, options.length)]!;
      [tiles[gap], tiles[next]] = [tiles[next]!, tiles[gap]!];
      shuffle.push(gap);
      prev = gap; gap = next;
    }
    const queue: number[] = [];
    const state: GameState = { tiles, moves: 0, won: false, shuffle, click: (i) => { queue.push(i); } };
    ctx.services.provide(Game, state);
    ctx.persist({ save: () => ({ tiles: [...state.tiles], moves: state.moves, won: state.won }), load: (d) => { const v = d as { tiles: number[]; moves: number; won: boolean }; state.tiles.splice(0, state.tiles.length, ...v.tiles); state.moves = v.moves; state.won = v.won; } });

    const slide = (i: number): void => {
      const g = state.tiles.indexOf(0);
      if (state.won || !neighbours(g).includes(i)) return;
      [state.tiles[g], state.tiles[i]] = [state.tiles[i]!, 0];
      state.moves++;
      if (solved(state.tiles)) {
        state.won = true;
        ctx.services.tryGet(Flow)?.end({ outcome: 'victory', title: 'Solved!', detail: `${state.moves} moves.`, stats: [['Moves', String(state.moves)], ['Time', `${ctx.time.now.toFixed(1)} s`]] });
      }
    };
    ctx.systems.add({ id: `${NS}/rules`, phase: 'control', update: () => {
      for (const i of queue.splice(0)) slide(i);
      const input = ctx.services.tryGet(Input)?.tick;
      if (!input) return;
      // A direction slides the tile on the opposite side of the gap into it (like pushing that tile).
      const g = state.tiles.indexOf(0), r = Math.floor(g / SIZE), c = g % SIZE;
      if (input.pressed(`${NS}/forward`) && r < SIZE - 1) slide(g + SIZE);
      else if (input.pressed(`${NS}/back`) && r > 0) slide(g - SIZE);
      else if (input.pressed(`${NS}/left`) && c < SIZE - 1) slide(g + 1);
      else if (input.pressed(`${NS}/right`) && c > 0) slide(g - 1);
    } });

    // ---- UI (skipped headless) ----
    const ui = ctx.services.tryGet(Ui);
    if (!ui) return;
    const cls = NS.replace(/\W/g, '-');
    ui.addStyles(ctx, `.${cls}{position:absolute;inset:0;display:grid;place-items:center;pointer-events:auto;background:#1e2430;font:600 16px system-ui;color:#eef}
.${cls} .board{display:grid;grid-template-columns:repeat(${SIZE},min(22vw,110px));gap:8px}
.${cls} button{aspect-ratio:1;border:0;border-radius:12px;font:700 clamp(20px,5vw,40px) system-ui;background:#e8d9b5;color:#3a2f22;cursor:pointer}
.${cls} button.gap{visibility:hidden}.${cls} p{text-align:center;margin:12px 0 0}`);
    const root = ui.mount(ctx, 'hud', cls);
    root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.('button[data-i]');
      if (b && ctx.services.tryGet(SessionControl)?.playing !== false) state.click(Number((b as HTMLElement).dataset.i));
    });
    ctx.systems.addFrame({ id: `${NS}/ui`, order: 300, update: () => {
      const doc = root.ownerDocument, next = doc.createElement('div'), wrap = doc.createElement('div'), board = doc.createElement('div');
      board.className = 'board';
      state.tiles.forEach((v, i) => {
        const b = doc.createElement('button');
        b.type = 'button'; b.dataset.i = String(i); b.dataset.key = `tile-${v}`;
        b.textContent = v ? String(v) : ''; if (!v) b.className = 'gap';
        b.setAttribute('aria-label', v ? `Tile ${v}` : 'Gap');
        board.appendChild(b);
      });
      const info = doc.createElement('p'); info.textContent = state.won ? `Solved in ${state.moves} moves` : `Moves: ${state.moves}`;
      wrap.append(board, info); next.appendChild(wrap);
      morphChildren(root, next); // keeps the buttons; only text/attributes change
    } });
  },
});
