// Micro-benchmark for EntityStore: manual two-component join versus a cached query. Usage: npm run bench:ecs
import { EntityStore } from '@bulkhead/kernel/ecs.ts';
import type { ComponentToken } from '@bulkhead/kernel/ecs.ts';

const pos: ComponentToken<{ x: number; y: number }> = { id: 'b/pos' };
const vel: ComponentToken<{ dx: number; dy: number }> = { id: 'b/vel' };
const tag: ComponentToken<true> = { id: 'b/tag' };

function run(n: number): void {
  const w = new EntityStore();
  for (let i = 0; i < n; i++) {
    const e = w.create('bench');
    w.add(e, pos, { x: i, y: 0 });
    if (i % 2 === 0) w.add(e, vel, { dx: 1, dy: 1 });
    if (i % 10 === 0) w.add(e, tag, true);
  }
  const q = w.query({ with: [pos, vel], without: [tag] });
  const time = (label: string, fn: () => void): void => {
    for (let i = 0; i < 20; i++) fn();
    const t0 = performance.now(); const reps = 200;
    for (let i = 0; i < reps; i++) fn();
    console.log(`  ${label.padEnd(26)} ${(((performance.now() - t0) / reps) * 1000).toFixed(1).padStart(8)} µs/pass`);
  };
  console.log(`${n} entities (${q.size} match pos+vel, not tag)`);
  time('manual join (each + get)', () => w.each(pos, (id, p) => { if (w.has(id, tag)) return; const v = w.get(id, vel); if (v) { p.x += v.dx; } }));
  time('query.each + get', () => q.each((id) => { const p = w.get(id, pos)!, v = w.get(id, vel)!; p.x += v.dx; }));
}
for (const n of [1000, 10000, 50000]) run(n);
