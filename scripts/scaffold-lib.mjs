// Game scaffolding shared by `bulkhead create` and packages/create-bulkhead (P2.3).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export const TEMPLATES = {
  blank: 'An empty SDK 3 scene: ground, a spinning cube, lights and a camera.',
  platformer: 'Side-on platformer: character controller, jumping, coins (sensors), fall respawn.',
  topdown: 'Top-down arena: walk, collect gems, avoid patrolling hazards, three lives.',
  fps: 'First-person: mouse look, character controller, hitscan raycasts against targets.',
  puzzle: 'DOM sliding-tile puzzle: solvable shuffle from the seed, click or arrow keys.',
  cards: 'DOM memory card game: seeded shuffle, flip two, match all pairs.',
};

const NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** Rewrites relative imports / $schema refs so they keep pointing at the same engine files from the new location. */
function relink(text, fromFile, toFile, templateRoot) {
  const fix = (spec) => {
    const abs = resolve(dirname(fromFile), spec);
    if (abs === templateRoot || abs.startsWith(templateRoot + sep)) return spec; // inside the template: unchanged
    let rel = relative(dirname(toFile), abs).split(sep).join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return rel;
  };
  return text
    .replace(/((?:from|import)\s*\(?\s*)'(\.\.?\/[^']+)'/g, (_m, pre, spec) => `${pre}'${fix(spec)}'`)
    .replace(/("\$schema"\s*:\s*)"(\.\.?\/[^"]+)"/g, (_m, pre, spec) => `${pre}"${fix(spec)}"`);
}

/**
 * Copies templates/games/<template> into <engineRoot>/<gamesDir>/<name>, replacing __NS__ / __TITLE__ and fixing
 * relative paths. Returns the created files (repo-relative to engineRoot).
 */
export function scaffoldGame({ engineRoot, name, template = 'blank', title, gamesDir = 'games' }) {
  if (!NAME.test(name)) throw new Error(`game name "${name}" must be lowercase letters, digits and "-" (it becomes the "${name}/..." id namespace)`);
  if (!(template in TEMPLATES)) throw new Error(`unknown template "${template}"; choose one of: ${Object.keys(TEMPLATES).join(', ')}`);
  const src = resolve(engineRoot, 'templates/games', template);
  const dest = resolve(engineRoot, gamesDir, name);
  if (existsSync(dest)) throw new Error(`${relative(engineRoot, dest)} already exists`);
  const display = title ?? name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const created = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const from = join(dir, entry);
      if (statSync(from).isDirectory()) { walk(from); continue; }
      const to = join(dest, relative(src, from));
      mkdirSync(dirname(to), { recursive: true });
      if (/\.(ts|json|md|mjs)$/.test(entry)) {
        let text = readFileSync(from, 'utf8');
        text = relink(text, from, to, src).replaceAll('__NS__', name).replaceAll('__TITLE__', display).replaceAll('__TEMPLATE__', template);
        writeFileSync(to, text);
      } else cpSync(from, to);
      created.push(relative(engineRoot, to).split(sep).join('/'));
    }
  };
  walk(src);
  return created.sort();
}
