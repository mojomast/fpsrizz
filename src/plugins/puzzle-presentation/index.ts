import { Audio, PushPuzzle, PuzzleResolved, SessionControl, ThemeRole, Ui, definePlugin } from '../../sdk/index.ts';
import type { PuzzleCommand, PuzzleDirection } from '../../sdk/index.ts';
import { Render } from '../../sdk/render.ts';
import { createScene } from './scene.ts';
import { styles } from './styles.ts';

export default definePlugin({
  activate(ctx) {
    const puzzle = ctx.services.get(PushPuzzle), theme = ctx.role(ThemeRole)?.provider;
    const render = ctx.services.tryGet(Render), ui = ctx.services.tryGet(Ui), audio = ctx.services.tryGet(Audio);
    const scene = render ? createScene(ctx, render, puzzle, theme) : undefined;
    const allowed = () => ctx.services.tryGet(SessionControl)?.playing !== false;
    const send = (command: PuzzleCommand) => { if (allowed()) puzzle.enqueue(command); };
    ctx.events.on(PuzzleResolved, ({ cue }) => { if (theme?.sounds[cue]) audio?.play(cue); });
    const root = ui?.mount(ctx, 'hud', 'puzzle-ui');
    let revision = -1;
    let draw = () => {};
    if (ui && root) {
      ui.addStyles(ctx, styles);
      root.innerHTML = `
        <header class="puzzle-head"><div><div class="puzzle-eyebrow">An expedition in chalk & timber</div><h1></h1><p>The sleeping ruins · A 3D escape puzzle</p></div><div class="puzzle-edition">THINK. PUSH. ESCAPE.<br><span data-label="edition"></span></div></header>
        <div class="puzzle-mobile-goal"></div>
        <details class="puzzle-field-guide"><summary>Hint &amp; accessible board</summary><p data-label="field-hint"></p><p>North is up. # wall, . floor, O plate, B boulder, * weighted plate, G golem, P explorer, E exit.</p><pre data-label="board-map" aria-label="Board map"></pre></details>
        <aside class="puzzle-side" aria-label="Chamber objectives">
          <div class="puzzle-eyebrow" data-label="chapter"></div><h2 data-label="chamber"></h2>
          <div class="puzzle-stats"><div><strong data-label="turns">0</strong><small>Steps</small></div><div><strong data-label="pushes">0</strong><small>Pushes</small></div><div><strong data-label="par">10</strong><small>Target</small></div></div>
          <div class="puzzle-seals"><span data-label="plates"></span><span data-label="seals" aria-hidden="true"></span></div>
          <p class="puzzle-goal">Weight the plates with boulders.<br>Escape through the golden gate.</p>
          <div class="puzzle-watch"><img alt=""/><div><strong data-label="beat"></strong><small data-label="watch"></small></div></div>
          <details><summary>Field notes / hint</summary><p data-label="hint"></p></details>
        </aside>
        <p class="puzzle-status" role="status" aria-live="polite"></p>
        <div class="puzzle-toolbar" aria-label="Puzzle controls">
          <div class="puzzle-dpad"><button data-direction="north" aria-label="Move north" title="North · W / ↑">↑</button><button data-direction="west" aria-label="Move west" title="West · A / ←">←</button><button data-direction="south" aria-label="Move south" title="South · S / ↓">↓</button><button data-direction="east" aria-label="Move east" title="East · D / →">→</button></div>
          <div class="puzzle-actions"><button data-command="wait">Wait · Space</button><button data-command="undo">Undo · Z</button><button data-command="restart">Restart · R</button></div>
          <div class="puzzle-camera"><button data-rotate="-1" aria-label="Rotate camera left" title="Rotate · Q">↶</button><span>ORBIT</span><button data-rotate="1" aria-label="Rotate camera right" title="Rotate · E">↷</button></div>
        </div>
        <div class="puzzle-keyboard">WASD / ARROWS · COMPASS DIRECTIONS<br>Q / E · ROTATE VIEW &nbsp; ESC · PAUSE</div>
        <section class="puzzle-result" aria-label="Chamber result" hidden><div class="puzzle-eyebrow" data-label="result-kicker"></div><h2 data-label="result-title"></h2><p data-label="result-copy"></p><div class="result-buttons"><button class="primary" data-command="next">Next chamber →</button><button class="primary" data-command="replay">Play again</button><button data-command="undo">Undo last step</button><button data-command="restart">Retry chamber</button></div></section>
        <p class="puzzle-sr" data-label="board-description"></p>`;
      root.querySelector('h1')!.textContent = puzzle.campaign.name;
      const paintUrl = (key: string) => {
        const painter = theme?.textures[key];
        if (!painter) return '';
        const canvas = document.createElement('canvas'); canvas.width = painter.width; canvas.height = painter.height;
        const g = canvas.getContext('2d'); if (!g) return '';
        painter.paint(g); return canvas.toDataURL();
      };
      const explorerArt = paintUrl('puzzle-explorer'), golemArt = paintUrl('puzzle-golem');
      const label = (key: string, text: string) => { root.querySelector(`[data-label="${key}"]`)!.textContent = text; };
      label('edition', `${puzzle.campaign.chambers.length} CHAMBERS / ONE WAY OUT`);
      draw = () => {
        const s = puzzle.state(), level = puzzle.campaign.chambers[s.chamber]!;
        const plates: boolean[] = [];
        level.rows.forEach((row, y) => [...row].forEach((tile, x) => { if (tile === 'O') plates.push(s.rocks.some(r => r.x === x && r.y === y)); }));
        const count = plates.filter(Boolean).length, last = s.chamber === puzzle.campaign.chambers.length - 1;
        label('chapter', `CHAMBER ${String(s.chamber + 1).padStart(2, '0')} / ${String(puzzle.campaign.chambers.length).padStart(2, '0')}`);
        label('chamber', level.name); label('turns', String(s.turns)); label('pushes', String(s.pushes)); label('par', String(level.par));
        label('plates', `${count} / ${plates.length} SEALS WEIGHTED`); label('seals', plates.map(on => on ? '◆' : '◇').join(''));
        label('beat', s.golems.length ? `${2 - s.turns % 2} ${s.turns % 2 ? 'step' : 'steps'} until they move` : 'The ruins are sleeping');
        label('watch', s.golems.length ? `${s.golems.length} ${s.golems.length === 1 ? 'golem is' : 'golems are'} hunting you` : 'Explore at your own pace');
        label('hint', level.hint);
        label('field-hint', level.hint);
        label('board-map', level.rows.map((row, y) => [...row].map((tile, x) => {
          if (s.player.x === x && s.player.y === y) return 'P';
          if (s.golems.some(p => p.x === x && p.y === y)) return 'G';
          if (s.rocks.some(p => p.x === x && p.y === y)) return tile === 'O' ? '*' : 'B';
          return tile;
        }).join(' ')).join('\n'));
        root.querySelector('.puzzle-watch')!.classList.toggle('imminent', !!s.golems.length && s.turns % 2 === 1);
        const image = root.querySelector<HTMLImageElement>('.puzzle-watch img')!;
        const src = s.golems.length ? golemArt : explorerArt;
        if (src && image.getAttribute('src') !== src) image.src = src;
        image.hidden = !src;
        root.querySelector('.puzzle-status')!.textContent = s.message;
        root.querySelector('.puzzle-mobile-goal')!.textContent = `${s.chamber + 1}. ${level.name} · ${s.turns} steps · ${count}/${plates.length} seals${s.golems.length ? ` · Golems in ${2 - s.turns % 2}` : ''}`;
        root.querySelectorAll<HTMLButtonElement>('[data-command="undo"]').forEach(b => { b.disabled = !s.canUndo; });
        root.querySelectorAll<HTMLButtonElement>('[data-direction],[data-command="wait"]').forEach(b => { b.disabled = s.status !== 'playing'; });
        const result = root.querySelector<HTMLElement>('.puzzle-result')!;
        const wasHidden = result.hidden;
        result.hidden = s.status === 'playing';
        label('result-kicker', s.status === 'caught' ? 'THE WATCHERS FOUND YOU' : last ? 'EXPEDITION COMPLETE' : 'PASSAGE SECURED');
        label('result-title', s.status === 'caught' ? 'One step too close.' : last ? 'The ruins remember.' : 'The gate is yours.');
        label('result-copy', s.status === 'caught' ? 'Every mistake is reversible. Undo the last turn, or try the chamber again.'
          : last ? `All ${puzzle.campaign.chambers.length} chambers escaped in ${s.totalTurns + s.turns} steps. You turned the stones against their keepers.`
            : `${level.name}: ${s.turns} steps, ${s.pushes} pushes. ${s.turns <= level.par ? 'Within the expedition target.' : `Target: ${level.par} steps. Try a tighter route, or continue.`}`);
        result.querySelector<HTMLElement>('[data-command="next"]')!.hidden = s.status !== 'cleared' || last;
        result.querySelector<HTMLElement>('[data-command="replay"]')!.hidden = s.status !== 'cleared' || !last;
        label('board-description', `Explorer column ${s.player.x + 1}, row ${s.player.y + 1}. Boulders: ${s.rocks.map(p => `${p.x + 1},${p.y + 1}`).join('; ')}. Golems: ${s.golems.map(p => `${p.x + 1},${p.y + 1}`).join('; ') || 'none'}. ${count} of ${plates.length} plates weighted. ${count === plates.length ? 'Gate open.' : 'Gate closed.'}`);
        if (wasHidden && !result.hidden && allowed()) result.querySelector<HTMLButtonElement>('button:not([hidden]):not(:disabled)')?.focus({ preventScroll: true });
        if (!wasHidden && result.hidden && root.contains(document.activeElement) && result.contains(document.activeElement)) root.querySelector<HTMLButtonElement>('[data-direction="north"]')?.focus({ preventScroll: true });
      };
      const click = (event: Event) => {
        if (!allowed()) return;
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!button || button.disabled) return;
        if (button.dataset.direction) send({ type: 'move', direction: button.dataset.direction as PuzzleDirection });
        else if (button.dataset.command) send({ type: button.dataset.command } as PuzzleCommand);
        else if (button.dataset.rotate) scene?.rotate(Number(button.dataset.rotate));
      };
      const key = (event: KeyboardEvent) => {
        if (!allowed() || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select'))) return;
        const directions: Record<string, PuzzleDirection> = { KeyW: 'north', ArrowUp: 'north', KeyD: 'east', ArrowRight: 'east', KeyS: 'south', ArrowDown: 'south', KeyA: 'west', ArrowLeft: 'west' };
        if (directions[event.code]) send({ type: 'move', direction: directions[event.code]! });
        else if (event.code === 'KeyZ') send({ type: 'undo' });
        else if (event.code === 'KeyR') send({ type: 'restart' });
        else if (event.code === 'Space') {
          if (target instanceof HTMLButtonElement || target instanceof HTMLElement && target.tagName === 'SUMMARY') return;
          send({ type: 'wait' });
        } else if (event.code === 'KeyQ' || event.code === 'KeyE') scene?.rotate(event.code === 'KeyQ' ? -1 : 1);
        else return;
        event.preventDefault();
      };
      const pointer = (event: PointerEvent) => {
        if (!allowed() || !(event.target instanceof HTMLCanvasElement)) { scene?.hover(undefined); return; }
        const cell = scene?.pick(event.clientX, event.clientY);
        scene?.hover(cell);
        if (event.type !== 'pointerdown' || event.button !== 0 || !cell) return;
        const s = puzzle.state(), dx = cell.x - s.player.x, dy = cell.y - s.player.y;
        if (Math.abs(dx) + Math.abs(dy) === 1) send({ type: 'move', direction: dx === 1 ? 'east' : dx === -1 ? 'west' : dy === 1 ? 'south' : 'north' });
      };
      root.addEventListener('click', click);
      window.addEventListener('keydown', key);
      window.addEventListener('pointerdown', pointer);
      window.addEventListener('pointermove', pointer);
      ctx.scope.add(() => {
        root.removeEventListener('click', click); window.removeEventListener('keydown', key);
        window.removeEventListener('pointerdown', pointer); window.removeEventListener('pointermove', pointer);
      }, 'puzzle-input');
    }
    draw();
    ctx.systems.addFrame({ id: 'puzzle/presentation.frame', update(_alpha, dt) {
      if (revision !== puzzle.revision) { revision = puzzle.revision; scene?.update(puzzle.state()); draw(); }
      scene?.frame(dt);
    } });
  },
});
