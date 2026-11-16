import type { SiltChamberTemplate } from '../../sdk/index.ts';

/** Room identities are stable for a given random stream and do not depend on object iteration order. */
export interface DistrictRoom {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly purpose: 'entry' | 'passage' | 'fragment' | 'boss' | 'lift' | 'optional';
  readonly template: SiltChamberTemplate;
  readonly neighbors: readonly string[];
}

/**
 * A nine-room bounded layout. The six-room backbone carries the required objectives;
 * three optional rooms attach to it or to earlier optional rooms. Geometry and encounter policy are separate.
 * Templates must expose all four cardinal sockets; the chamber loader validates dry paths.
 */
export function assembleDistrict(templates: readonly SiltChamberTemplate[], random: () => number): readonly DistrictRoom[] {
  if (!templates.length || templates.some(t => t.rows.length !== 9 ||
      t.rows[0]?.[4] !== 'D' || t.rows[8]?.[4] !== 'D' || t.rows[4]?.[0] !== 'D' || t.rows[4]?.[8] !== 'D')) {
    throw new TypeError('district assembly requires validated four-socket chambers');
  }
  const pick = (max: number) => {
    const n = random();
    if (!Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('random source must return a number in [0, 1)');
    return Math.floor(n * max);
  };
  const transform = pick(8);
  const point = (x: number, y: number): [number, number] => {
    if (transform >= 4) x = 2 - x;
    for (let i = 0; i < transform % 4; i++) [x, y] = [2 - y, x];
    return [x, y];
  };
  const positions: [number, number][] = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2]];
  const purposes: DistrictRoom['purpose'][] = ['entry', 'passage', 'fragment', 'passage', 'boss', 'lift', 'optional', 'optional', 'optional'];
  const edges: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]];
  // Each new branch attaches to an already reachable adjacent node. This varies the
  // topology without retries or reliance on an unverified fallback.
  edges.push(pick(2) === 0 ? [4, 7] : [6, 7]);
  edges.push(pick(2) === 0 ? [3, 8] : [7, 8]);
  // Optionally add one geometrically valid loop.
  if (pick(2) === 1) {
    const candidates: [number, number][] = [[4, 7], [6, 7], [3, 8], [7, 8]];
    const unused = candidates.filter(([a, b]) => !edges.some(([c, d]) => a === c && b === d));
    edges.push(unused[pick(unused.length)]!);
  }
  const neighbors = positions.map(() => [] as string[]);
  for (const [a, b] of edges) { neighbors[a]!.push(`room-${b}`); neighbors[b]!.push(`room-${a}`); }
  return positions.map(([x, y], i) => {
    const [tx, ty] = point(x, y);
    return { id: `room-${i}`, x: tx, y: ty, purpose: purposes[i]!, template: templates[pick(templates.length)]!, neighbors: neighbors[i]! };
  });
}
