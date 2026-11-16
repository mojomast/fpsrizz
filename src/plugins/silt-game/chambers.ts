import { isObject, vArray, vString } from '../../sdk/index.ts';
import type { Reporter, SiltChamberTemplate } from '../../sdk/index.ts';

/** Validate socket geometry and ensure doors remain connected on dry ground at every tide. */
export function loadChamber(data: unknown, r: Reporter): SiltChamberTemplate | undefined {
  if (!isObject(data)) return r.error('expected a chamber object');
  for (const key of Object.keys(data)) if (key !== 'name' && key !== 'rows') r.at(key).error('unknown property');
  const name = vString(data.name, r.at('name'), { nonEmpty: true, max: 80 });
  const raw = vArray(data.rows, r.at('rows'), { min: 9, max: 9 });
  const rows: string[] = [];
  raw?.forEach((value, y) => {
    const row = vString(value, r.at('rows').at(y), { max: 9 });
    if (row === undefined) return;
    if (row.length !== 9 || !/^[#. ~^D]+$/.test(row) || row.includes(' ')) r.at('rows').at(y).error('expected nine cells using #, ., ~, ^ and D');
    rows.push(row);
  });
  if (rows.length === 9 && rows.every(row => row.length === 9)) {
    const doors: [number, number][] = [];
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const cell = rows[y]![x];
      const edge = x === 0 || x === 8 || y === 0 || y === 8;
      const socket = (x === 4 && (y === 0 || y === 8)) || (y === 4 && (x === 0 || x === 8));
      if (cell === 'D') {
        if (!socket) r.at('rows').at(y).error('doors must be at cardinal edge sockets');
        else doors.push([x, y]);
      } else if (edge && cell !== '#') r.at('rows').at(y).error('boundary cells must be walls except at door sockets');
    }
    if (!doors.length) r.at('rows').error('include at least one door socket');
    if (doors[0]) {
      const pending: [number, number][] = [doors[0]], seen = new Set<string>();
      for (let i = 0; i < pending.length; i++) {
        const [x, y] = pending[i]!;
        const key = `${x},${y}`, cell = rows[y]?.[x];
        if (seen.has(key) || cell === undefined || cell === '#' || cell === '~' || cell === '^') continue;
        seen.add(key);
        pending.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      if (doors.some(([x, y]) => !seen.has(`${x},${y}`))) r.at('rows').error('all doors must connect by dry, vent-free floor');
    }
  }
  if (r.failed || !name || rows.length !== 9) return;
  return Object.freeze({ name, rows: Object.freeze(rows) });
}
