import type { NavigationNode, NavigationProvider } from '../../../../src/sdk/index.ts';
import type { PuzzleBoard, PuzzleCell, PuzzleChamber, PuzzleDirection } from '../../contracts/puzzle.ts';

export function same(a: PuzzleCell, b: PuzzleCell): boolean { return a.x === b.x && a.y === b.y; }
export function copyBoard(board: PuzzleBoard): PuzzleBoard {
  return { ...board, player: { ...board.player }, rocks: board.rocks.map(p => ({ ...p })), golems: board.golems.map(p => ({ ...p })) };
}
export function initialBoard(level: PuzzleChamber): PuzzleBoard {
  return copyBoard({ player: level.start, rocks: [...level.rocks], golems: [...level.golems], turns: 0, pushes: 0, status: 'playing' });
}
export function gateOpen(level: PuzzleChamber, board: PuzzleBoard): boolean {
  return level.rows.every((row, y) => [...row].every((tile, x) => tile !== 'O' || board.rocks.some(p => p.x === x && p.y === y)));
}
function delta(direction: PuzzleDirection): PuzzleCell {
  return direction === 'north' ? { x: 0, y: -1 } : direction === 'south' ? { x: 0, y: 1 }
    : direction === 'east' ? { x: 1, y: 0 } : { x: -1, y: 0 };
}
function neighbors(p: PuzzleCell): PuzzleCell[] {
  return [{ x: p.x, y: p.y - 1 }, { x: p.x - 1, y: p.y }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }];
}
function walkable(level: PuzzleChamber, p: PuzzleCell): boolean {
  const tile = level.rows[p.y]?.[p.x];
  return tile !== undefined && tile !== '#';
}
/** Deterministic shortest path, with other golems and rocks occupying cells. */
function chase(level: PuzzleChamber, board: PuzzleBoard, index: number, navigation: NavigationProvider): PuzzleCell {
  const start = board.golems[index]!;
  const cells = new Map<string, PuzzleCell>();
  for (let y = 0; y < level.rows.length; y++) {
    for (let x = 0; x < level.rows[y]!.length; x++) {
      const p = { x, y };
      if (same(p, start) || (walkable(level, p) && level.rows[y]![x] !== 'E'
        && !board.rocks.some(rock => same(rock, p)) && !board.golems.some((g, n) => n !== index && same(g, p))))
        cells.set(`${x},${y}`, p);
    }
  }
  const nodes: NavigationNode[] = [...cells].map(([id, cell]) => ({
    id, neighbors: neighbors(cell).map(p => `${p.x},${p.y}`).filter(key => cells.has(key)),
  }));
  const target = `${board.player.x},${board.player.y}`;
  const visit = navigation.search(nodes, `${start.x},${start.y}`).find(p => p.node === target);
  return visit ? cells.get(visit.firstStep)! : start;
}
export type TurnResult = { board: PuzzleBoard; pushed: boolean; opened: boolean } | { reason: string };
/** null waits one beat. A rejected move never spends a turn or wakes a golem. */
export function takeTurn(level: PuzzleChamber, before: PuzzleBoard, direction: PuzzleDirection | null, navigation: NavigationProvider): TurnResult {
  if (before.status !== 'playing') return { reason: 'Undo a turn or restart the chamber to continue.' };
  const board = copyBoard(before);
  let pushed = false;
  if (direction) {
    const d = delta(direction), to = { x: board.player.x + d.x, y: board.player.y + d.y };
    if (!walkable(level, to)) return { reason: 'Stone wall. Try another route.' };
    if (level.rows[to.y]![to.x] === 'E' && !gateOpen(level, board)) return { reason: 'The gate needs a boulder on every pressure plate.' };
    const rock = board.rocks.findIndex(p => same(p, to));
    if (rock !== -1) {
      const beyond = { x: to.x + d.x, y: to.y + d.y };
      if (!walkable(level, beyond) || level.rows[beyond.y]![beyond.x] === 'E'
        || board.rocks.some(p => same(p, beyond)) || board.golems.some(p => same(p, beyond)))
        return { reason: 'The boulder needs a clear cell behind it. Stones cannot enter the gate.' };
      board.rocks[rock] = beyond;
      board.pushes++;
      pushed = true;
    }
    board.player = to;
  }
  board.turns++;
  const opened = !gateOpen(level, before) && gateOpen(level, board);
  if (level.rows[board.player.y]![board.player.x] === 'E' && gateOpen(level, board)) board.status = 'cleared';
  else if (board.golems.some(p => same(p, board.player))) board.status = 'caught';
  else if (board.turns % 2 === 0) {
    for (let i = 0; i < board.golems.length; i++) {
      board.golems[i] = chase(level, board, i, navigation);
      if (same(board.golems[i]!, board.player)) { board.status = 'caught'; break; }
    }
  }
  return { board, pushed, opened };
}
