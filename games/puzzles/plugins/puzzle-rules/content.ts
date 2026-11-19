import { isObject, vArray, vNumber, vString } from '../../../../src/sdk/index.ts';
import type { Reporter } from '../../../../src/sdk/index.ts';
import type { PuzzleCampaign, PuzzleCell, PuzzleChamber } from '../../contracts/puzzle.ts';

function keys(data: Record<string, unknown>, allowed: readonly string[], r: Reporter): void {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) r.at(key).error('unknown property');
}
function chamber(data: unknown, r: Reporter): PuzzleChamber | undefined {
  if (!isObject(data)) return r.error('expected a chamber object');
  keys(data, ['name', 'hint', 'par', 'rows'], r);
  const name = vString(data.name, r.at('name'), { max: 60 });
  const hint = vString(data.hint, r.at('hint'), { max: 300 });
  const par = vNumber(data.par, r.at('par'), { min: 1, max: 1000, int: true });
  const raw = vArray(data.rows, r.at('rows'), { min: 5, max: 16 });
  const rows: string[] = [], starts: PuzzleCell[] = [], rocks: PuzzleCell[] = [], golems: PuzzleCell[] = [], plates: PuzzleCell[] = [], exits: PuzzleCell[] = [];
  raw?.forEach((value, y) => {
    const row = vString(value, r.at('rows').at(y), { max: 16 });
    if (!row) return;
    if (row.length < 5) r.at('rows').at(y).error('rows need at least 5 cells');
    if (!/^[#.PBOGE]+$/.test(row)) r.at('rows').at(y).error('use # wall, . floor, P explorer, B boulder, O plate, G golem, E exit');
    for (let x = 0; x < row.length; x++) {
      const p = Object.freeze({ x, y });
      if (row[x] === 'P') starts.push(p);
      if (row[x] === 'B') rocks.push(p);
      if (row[x] === 'G') golems.push(p);
      if (row[x] === 'O') plates.push(p);
      if (row[x] === 'E') exits.push(p);
    }
    rows.push(row.replace(/[PBG]/g, '.'));
  });
  if (rows.some(row => row.length !== rows[0]?.length)) r.at('rows').error('all rows must have the same width');
  if (starts.length !== 1) r.at('rows').error('include exactly one explorer P');
  if (exits.length !== 1) r.at('rows').error('include exactly one exit E');
  if (plates.length < 1 || plates.length > 8) r.at('rows').error('include between 1 and 8 pressure plates O');
  if (rocks.length < plates.length || rocks.length > 12) r.at('rows').error('include at least one boulder B per plate, and at most 12 boulders');
  if (golems.length > 4) r.at('rows').error('use at most 4 golems G');
  if (rows.length && (rows[0]!.includes('.') || rows.at(-1)!.includes('.') || rows.some(row => row[0] !== '#' || row.at(-1) !== '#')
    || [...rows[0]!, ...rows.at(-1)!].some(c => c !== '#'))) r.at('rows').error('surround the chamber with # walls');
  // Catch unreachable authored objectives; pushing feasibility is verified by each authored chamber's playthrough.
  if (starts.length === 1 && rows.length === raw?.length) {
    const todo = [starts[0]!], visited = new Set<string>();
    for (let i = 0; i < todo.length; i++) {
      const p = todo[i]!, key = `${p.x},${p.y}`;
      if (visited.has(key) || rows[p.y]?.[p.x] === undefined || rows[p.y]![p.x] === '#') continue;
      visited.add(key);
      todo.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
    }
    if ([...plates, ...exits, ...rocks, ...golems].some(p => !visited.has(`${p.x},${p.y}`))) r.at('rows').error('all pieces, plates and the exit must connect to the explorer through floor');
  }
  if (r.failed || !name || !hint || par === undefined || !starts[0]) return;
  return Object.freeze({ name, hint, par, rows: Object.freeze(rows), start: starts[0], rocks: Object.freeze(rocks), golems: Object.freeze(golems) });
}
export function loadCampaign(data: unknown, r: Reporter): PuzzleCampaign | undefined {
  if (!isObject(data)) return r.error('expected a puzzle campaign object');
  keys(data, ['name', 'chambers'], r);
  const name = vString(data.name, r.at('name'), { max: 80 });
  const raw = vArray(data.chambers, r.at('chambers'), { min: 1, max: 16 });
  const chambers = raw?.map((value, i) => chamber(value, r.at('chambers').at(i)));
  if (r.failed || !name || !chambers || chambers.some(c => !c)) return;
  return Object.freeze({ name, chambers: Object.freeze(chambers as PuzzleChamber[]) });
}
