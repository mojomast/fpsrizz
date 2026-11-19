import { Audio, SessionControl, ThemeRole, Ui, definePlugin } from '@bulkhead/sdk';
import { Tactics, TacticsResolved } from '../../contracts/tactics.ts';
import { Render, THREE } from '@bulkhead/sdk/render.ts';

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export default definePlugin({
  activate(ctx) {
    const tactics = ctx.services.get(Tactics);
    const ui = ctx.services.tryGet(Ui);
    const render = ctx.services.tryGet(Render);
    const theme = ctx.role(ThemeRole)?.provider;
    const audio = ctx.services.tryGet(Audio);
    const sound = (key: string) => {
      if (theme?.sounds[key]) audio?.play(key);
    };
    ctx.events.on(TacticsResolved, (event) => sound(event.cue));
    if (render) {
      const root = render.createRoot(ctx, 'world');
      const rows = tactics.state.mission.rows;
      const width = rows[0]!.length;
      const height = rows.length;
      const camera = new THREE.OrthographicCamera(-7, 7, 6, -6, 0.1, 100);
      camera.position.set(width / 2, 14, height / 2);
      camera.up.set(0, 0, -1);
      camera.lookAt(width / 2, 0, height / 2);
      render.setWorldCamera(ctx, camera);
      render.setEnvironment({ background: 0x101a24, fog: null });
      // The interactive board lives in the DOM; this is a surrounding tabletop, not a second grid.
      const geo = render.own(ctx, new THREE.BoxGeometry(24, 0.3, 24));
      const material = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0x283932 }));
      const table = new THREE.Mesh(geo, material);
      table.position.set(width / 2, -0.3, height / 2);
      root.add(table);
    }
    if (!ui) return;
    ui.addStyles(
      ctx,
      `
.tactics-ui {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #eaf5ee;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px;
  box-sizing: border-box;
}
.tactics-ui * {
  box-sizing: border-box;
}
.tactics-head {
  width: min(1040px, 100%);
  display: flex;
  justify-content: space-between;
  align-items: start;
  text-shadow: 0 2px 8px #000;
}
.tactics-kicker {
  color: #75e6b6;
  letter-spacing: 0.22em;
  font-size: 11px;
  font-weight: 800;
}
.tactics-head h1 {
  font-size: clamp(22px, 3vw, 38px);
  margin: 4px 0;
}
.tactics-turn {
  background: #101f2be8;
  padding: 12px 18px;
  border: 1px solid #4b6a72;
  border-radius: 8px;
}
.tactics-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  width: 100%;
  min-height: 0;
}
.tactics-grid {
  display: grid;
  gap: 3px;
  pointer-events: auto;
  background: #0e202ad9;
  padding: 8px;
  border: 1px solid #6a8e8b;
  border-radius: 10px;
  box-shadow: 0 20px 60px #0008;
}
.tactics-cell {
  width: clamp(30px, 6.2vw, 63px);
  height: clamp(30px, 6.2vw, 63px);
  border: 1px solid #5e807c;
  background: #263d42d9;
  color: #dceee5;
  border-radius: 4px;
  font-weight: 800;
  cursor: pointer;
}
.tactics-cell:hover,
.tactics-cell:focus-visible {
  outline: 2px solid #f2d692;
  outline-offset: 1px;
}
.tactics-cell.wall {
  background: #394b54;
}
.tactics-cell.cover {
  background: #665b45;
}
.tactics-cell.reachable {
  border-color: #69dbab;
  background: #30584d;
}
.tactics-cell.squad {
  color: #96ffd0;
  background: #20604d;
}
.tactics-cell.enemy {
  color: #ffd4c5;
  background: #743c39;
}
.tactics-cell.selected {
  box-shadow: inset 0 0 0 3px #aaffdb;
}
.tactics-side {
  pointer-events: auto;
  width: 250px;
  max-height: 100%;
  overflow-y: auto;
  background: #101e29ef;
  border: 1px solid #42645f;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 15px 40px #0007;
}
.tactics-side h2 {
  margin: 2px 0 8px;
  font-size: 21px;
}
.tactics-side p {
  font-size: 13px;
  line-height: 1.5;
  color: #bdd0c8;
}
.tactics-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tactics-actions button {
  background: #263f45;
  color: #eafff3;
  border: 1px solid #648a7c;
  border-radius: 5px;
  padding: 9px 12px;
  cursor: pointer;
  font-weight: 700;
}
.tactics-actions button.active {
  background: #a0eec6;
  color: #102d25;
}
.tactics-status {
  color: #f0d795 !important;
  min-height: 42px;
}
.tactics-footer {
  font-size: 12px;
  color: #c5d9cf;
  text-align: center;
  text-shadow: 0 2px 5px #000;
}
@media (max-width: 700px) {
  .tactics-main {
    flex-direction: column;
    gap: 8px;
  }
  .tactics-side {
    width: min(100%, 500px);
    padding: 10px;
  }
  .tactics-side p {
    margin: 4px 0;
  }
  .tactics-ui {
    padding: 8px;
  }
  .tactics-footer {
    display: none;
  }
}
`,
    );
    const root = ui.mount(ctx, 'hud', 'tactics-ui');
    let selected = tactics.state.units.find((u) => u.team === 'squad')?.id ?? '';
    let mode: 'move' | 'attack' = 'move';
    let cursor = { x: 0, y: 0 };
    let serial = 0;
    let hover = '';
    let lastRevision = -1;
    const art = (key: string): string => {
      const painter = theme?.textures[key];
      if (!painter) return '';
      const canvas = document.createElement('canvas');
      canvas.width = painter.width;
      canvas.height = painter.height;
      const context = canvas.getContext('2d');
      if (!context) return '';
      painter.paint(context);
      return canvas.toDataURL();
    };
    const groundArt = art('tactics-ground'),
      coverArt = art('tactics-cover'),
      unitArt = art('tactics-unit'),
      enemyArt = art('tactics-enemy');
    ui.addStyles(
      ctx,
      `
.tactics-cell {
  position: relative;
  background-image: url("${groundArt}");
  background-size: cover;
  background-color: #715e42;
}
.tactics-cell.wall {
  background-image:
    linear-gradient(#233039a8, #233039a8), url("${groundArt}");
}
.tactics-cell.cover {
  background-image: url("${coverArt}"), url("${groundArt}");
  background-size: contain, cover;
  background-repeat: no-repeat;
}
.tactics-cell.reachable {
  box-shadow: inset 0 0 0 3px #69dbab;
}
.tactics-cell.squad,
.tactics-cell.enemy {
  background-image: url("${groundArt}");
  background-size: cover;
}
.tactics-cell .piece {
  position: absolute;
  inset: 0;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: none;
}
.tactics-cell .piece.squad {
  background-image: url("${unitArt}");
}
.tactics-cell .piece.enemy {
  background-image: url("${enemyArt}");
}
.tactics-cell .badge {
  position: absolute;
  bottom: 1px;
  right: 1px;
  background: #102a25;
  color: #b8ffdb;
  border: 1px solid #9ef8c8;
  border-radius: 3px;
  padding: 1px 3px;
  font-size: 10px;
  line-height: 1;
}
.tactics-cell .terrain-badge {
  position: absolute;
  top: 1px;
  left: 1px;
  padding: 1px 3px;
  border-radius: 3px;
  background: #332916eF;
  color: #ffdf91;
  font-size: 10px;
  line-height: 1.2;
  pointer-events: none;
}
.tactics-cell .cost-badge {
  position: absolute;
  bottom: 1px;
  right: 1px;
  color: #d8ffeb;
  background: #143e31;
  padding: 1px 3px;
  font-size: 10px;
  pointer-events: none;
}
.tactics-roster { display: grid; gap: 4px; margin: 10px 0; }
.tactics-roster button {
  text-align: left; color: #f7e4d8; background: #482c2c;
  border: 1px solid #875f57; border-radius: 4px; padding: 6px; cursor: pointer;
}
.tactics-roster button[aria-pressed="true"] { outline: 2px solid #ffd293; }
.tactics-legend { font-size: 11px !important; }
.tactics-cell.enemy .badge {
  background: #612d2d;
  color: #fff0de;
  border-color: #ffc4a8;
}
.tactics-cell.selected {
  outline: 3px solid #aaffdb;
  outline-offset: -3px;
}
`,
    );
    ui.addStyles(
      ctx,
      `
.tactics-cell.reachable {
  background-image: url("${groundArt}");
}
.tactics-cell.cover.reachable,
.tactics-cell.cover.squad,
.tactics-cell.cover.enemy {
  background-image: url("${coverArt}"), url("${groundArt}");
  background-size: contain, cover;
}
`,
    );
    const allowed = () => ctx.services.tryGet(SessionControl)?.playing !== false;
    const command = (
      c:
        | { type: 'move'; unit: string; x: number; y: number }
        | { type: 'attack'; unit: string; target: string }
        | { type: 'end-turn' },
    ) => {
      if (!allowed()) return;
      tactics.enqueue({ ...c, id: `ui-${++serial}` });
    };
    const draw = () => {
      const focused =
        document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
          ? document.activeElement
          : null;
      const focusCell = focused?.dataset.cell;
      const focusAction = focused?.dataset.action;
      const focusTarget = focused?.dataset.target;
      const s = tactics.state;
      const unit = s.units.find((u) => u.id === selected && u.hp > 0);
      const reachable = mode === 'move' ? tactics.reachable(selected) : [];
      const target = s.units.find((u) => u.id === hover && u.hp > 0);
      const f = target && unit && target.team === 'enemy' ? tactics.forecast(unit.id, target.id) : null;
      const cells = s.mission.rows
        .flatMap((row, y) =>
          [...row].map((tile, x) => {
            const u = s.units.find((v) => v.hp > 0 && v.x === x && v.y === y);
            const reach = reachable.find((p) => p.x === x && p.y === y);
            const classes = [
              'tactics-cell',
              tile === '#' ? 'wall' : tile === 'C' ? 'cover' : '',
              reach && mode === 'move' ? 'reachable' : '',
              u?.team ?? '',
              u?.id === selected ? 'selected' : '',
            ].join(' ');
            const label = escapeHtml(
              u
                ? `${u.name}, ${u.team}, ${u.hp} health, ${u.ap} AP${tile === 'C' ? ', in cover' : ''}`
                : tile === '#'
                  ? 'Wall'
                  : tile === 'C'
                    ? 'Cover'
                    : 'Floor',
            );
            return `<button class="${classes}" data-cell="${x},${y}" aria-label="${label}, column ${x + 1}, row ${y + 1}${reach ? `, move ${reach.cost} AP` : ''}" title="${label}${reach ? ` · ${reach.cost} AP` : ''}">${u ? `<span class="piece ${u.team}"></span><span class="badge">${u.team === 'squad' ? '◆' : '▲'} ${u.hp}</span>` : tile === '#' ? '▨' : ''}${tile === 'C' ? '<span class="terrain-badge" aria-hidden="true">C</span>' : ''}${reach ? `<span class="cost-badge" aria-hidden="true">${reach.cost} AP</span>` : ''}</button>`;
          }),
        )
        .join('');
      const enemies = s.units.filter(u => u.team === 'enemy' && u.hp > 0);
      const roster = enemies.map(enemy => {
        const shot = unit ? tactics.forecast(unit.id, enemy.id) : null;
        return `<button data-target="${escapeHtml(enemy.id)}" aria-pressed="${enemy.id === hover}" title="Inspect forecast">${escapeHtml(enemy.name)} · ${enemy.hp} HP · ${escapeHtml(shot ? (shot.legal ? `${shot.damage} dmg` : shot.reason) : 'select squad')}</button>`;
      }).join('');
      root.innerHTML = `<header class="tactics-head"><div><div class="tactics-kicker">TACTICAL OPERATIONS / 01</div><h1>${escapeHtml(s.mission.name)}</h1></div><div class="tactics-turn">TURN <strong>${s.turn}</strong> · ${s.outcome.toUpperCase()}</div></header><main class="tactics-main"><div class="tactics-grid" role="grid" aria-label="Tactical board" style="grid-template-columns:repeat(${s.mission.rows[0]!.length},1fr)">${cells}</div><aside class="tactics-side"><div class="tactics-kicker">SQUAD / SELECTED</div><h2>${escapeHtml(unit?.name ?? 'No unit selected')}</h2><p>${unit ? `${unit.hp} HP &nbsp; / &nbsp; ${unit.ap} AP` : 'Select a living squad member.'}</p><div class="tactics-actions"><button data-action="move" aria-pressed="${mode === 'move'}" class="${mode === 'move' ? 'active' : ''}">Move · M</button><button data-action="attack" aria-pressed="${mode === 'attack'}" class="${mode === 'attack' ? 'active' : ''}">Attack · A</button><button data-action="end">End turn · E</button></div><p class="tactics-legend">C = cover (1 damage); open ground takes 2. Move costs 1 AP per 3 steps. Attacks cost 1 AP, range 7.</p><div class="tactics-kicker">HOSTILES / ${enemies.length} REMAINING</div><div class="tactics-roster" aria-label="Enemy forecasts">${roster}</div><p class="tactics-status" data-testid="tactics-forecast" aria-live="polite">${escapeHtml(f ? `${target!.name}: ${f.reason}${f.legal ? ` · ${f.damage} damage / 1 AP` : ''}` : s.message)}</p><p>Focus or hover an enemy to inspect. In attack mode, click its board cell to fire.</p></aside></main><footer class="tactics-footer">ARROWS navigate cells &nbsp;·&nbsp; ENTER selects &nbsp;·&nbsp; M move &nbsp;·&nbsp; A attack &nbsp;·&nbsp; E end turn</footer>`;
      lastRevision = s.revision;
      if (focusCell) root.querySelector<HTMLElement>(`[data-cell="${focusCell}"]`)?.focus({ preventScroll: true });
      else if (focusAction)
        root.querySelector<HTMLElement>(`[data-action="${focusAction}"]`)?.focus({ preventScroll: true });
      else if (focusTarget)
        [...root.querySelectorAll<HTMLElement>('[data-target]')].find(el => el.dataset.target === focusTarget)?.focus({ preventScroll: true });
    };
    const cell = (x: number, y: number) => {
      const u = tactics.state.units.find((v) => v.hp > 0 && v.x === x && v.y === y);
      if (u?.team === 'squad') {
        selected = u.id;
        sound('tactics-select');
      } else if (u?.team === 'enemy' && mode === 'attack') {
        command({ type: 'attack', unit: selected, target: u.id });
      } else if (!u && mode === 'move') {
        command({ type: 'move', unit: selected, x, y });
      }
      draw();
    };
    const click = (e: Event) => {
      if (!allowed()) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell],[data-action],[data-target]');
      if (!el) return;
      if (el.dataset.cell) {
        const [x, y] = el.dataset.cell.split(',').map(Number);
        if (x !== undefined && y !== undefined) {
          cursor = { x, y };
          cell(x, y);
        }
      } else if (el.dataset.target) {
        hover = el.dataset.target;
        draw();
      } else if (el.dataset.action === 'end') command({ type: 'end-turn' });
      else if (el.dataset.action === 'move' || el.dataset.action === 'attack') {
        mode = el.dataset.action;
        draw();
      }
    };
    const over = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell],[data-target]');
      if (!el) return;
      const [x, y] = (el.dataset.cell ?? '').split(',').map(Number);
      const id = el.dataset.target ?? tactics.state.units.find((u) => u.x === x && u.y === y && u.team === 'enemy' && u.hp > 0)?.id ?? '';
      if (id !== hover) {
        hover = id;
        draw();
      }
    };
    const key = (e: KeyboardEvent) => {
      if (!allowed() || e.repeat) return;
      const focusedCell =
        document.activeElement instanceof HTMLElement ? document.activeElement.dataset.cell : undefined;
      if (focusedCell) {
        const [x, y] = focusedCell.split(',').map(Number);
        if (x !== undefined && y !== undefined) cursor = { x, y };
      }
      if (e.key === 'm' || e.key === 'M') mode = 'move';
      else if (e.key === 'a' || e.key === 'A') mode = 'attack';
      else if (e.key === 'e' || e.key === 'E') command({ type: 'end-turn' });
      else if (e.key === 'ArrowLeft') cursor.x = Math.max(0, cursor.x - 1);
      else if (e.key === 'ArrowRight') cursor.x = Math.min(tactics.state.mission.rows[0]!.length - 1, cursor.x + 1);
      else if (e.key === 'ArrowUp') cursor.y = Math.max(0, cursor.y - 1);
      else if (e.key === 'ArrowDown') cursor.y = Math.min(tactics.state.mission.rows.length - 1, cursor.y + 1);
      else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) cell(cursor.x, cursor.y);
      else return;
      e.preventDefault();
      draw();
      root.querySelector<HTMLElement>(`[data-cell="${cursor.x},${cursor.y}"]`)?.focus();
    };
    root.addEventListener('click', click);
    root.addEventListener('mouseover', over);
    root.addEventListener('focusin', over);
    window.addEventListener('keydown', key);
    ctx.scope.add(() => {
      root.removeEventListener('click', click);
      root.removeEventListener('mouseover', over);
      root.removeEventListener('focusin', over);
      window.removeEventListener('keydown', key);
    }, 'board-input');
    draw();
    ctx.systems.addFrame({
      id: 'board/presentation.hud',
      update() {
        if (lastRevision !== tactics.state.revision) draw();
      },
    });
  },
});
