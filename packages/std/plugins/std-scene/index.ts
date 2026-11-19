// std/scene (P2.4): registers the "prefab", "scene", "tiled-map" and "ldtk-level" content kinds and cross-checks
// prefab references once every pack is loaded. Spawning is a plain SDK function (spawnScene), so any plugin can use it.
import { ScenePrefabs, Scenes, checkSceneReferences, definePlugin, importLdtk, importTiled, isObject, validatePrefab, validateScene } from '@bulkhead/sdk';
import type { ContentLoadContext, Json, LevelImportResult } from '@bulkhead/sdk';

const KEYS = ['cellSize', 'plane', 'elevation'];
/** Shared option checks for the level kinds; returns the import options or undefined after reporting. */
function levelOptions(data: Json, c: ContentLoadContext, source: string, tables: string[]): Record<string, unknown> | undefined {
  if (!isObject(data) || Array.isArray(data)) return c.r.error(`expected { ${source}, ${[...KEYS, ...tables].join(', ')} }`);
  for (const k of Object.keys(data)) if (![source, ...KEYS, ...tables, 'includeHidden', 'level'].includes(k)) c.r.at(k).error('unknown field');
  if (!isObject(data[source])) return c.r.at(source).error(`expected the editor's JSON export inline`);
  if (data.cellSize !== undefined && !(typeof data.cellSize === 'number' && data.cellSize > 0)) c.r.at('cellSize').error('expected a positive number of metres');
  if (data.plane !== undefined && data.plane !== 'xz' && data.plane !== 'xy') c.r.at('plane').error('expected "xz" (top-down) or "xy" (side-on)');
  for (const t of tables) {
    const v = data[t];
    if (v !== undefined && (!isObject(v) || Object.values(v).some((p) => typeof p !== 'string'))) c.r.at(t).error('expected an object of key -> prefab id');
  }
  return c.r.failed ? undefined : (data as Record<string, unknown>);
}
const registerLevel = (c: ContentLoadContext, res: LevelImportResult): void => {
  for (const e of res.errors) c.r.error(e);
  if (!c.r.failed) c.register(Scenes, c.id, res.scene);
};

export default definePlugin({
  register(ctx) {
    ctx.contentKind('prefab', {
      description: 'A reusable component bag: { extends?, components: { <component id or alias>: data }, children? }.',
      load(data, c) { const p = validatePrefab(data, c.r); if (p && !c.r.failed) c.register(ScenePrefabs, c.id, p); },
    });
    ctx.contentKind('scene', {
      description: 'An entity tree: { nodes: [{ prefab?, name?, transform?, overrides?, props?, children? }] }.',
      load(data, c) { const s = validateScene(data, c.r); if (s && !c.r.failed) c.register(Scenes, c.id, s); },
    });
    ctx.contentKind('tiled-map', {
      description: 'A Tiled JSON map imported as a scene: { map, cellSize?, plane?, tiles?, objects? } (see level-import.ts).',
      load(data, c) {
        const o = levelOptions(data, c, 'map', ['tiles', 'objects']);
        if (o) registerLevel(c, importTiled(o.map, o));
      },
    });
    ctx.contentKind('ldtk-level', {
      description: 'An LDtk project imported as a scene: { project, level?, cellSize?, plane?, entities?, intGrid?, tiles? }.',
      load(data, c) {
        const o = levelOptions(data, c, 'project', ['entities', 'intGrid', 'tiles']);
        if (o) registerLevel(c, importLdtk(o.project, o));
      },
    });
    ctx.addValidator((v) => checkSceneReferences(v.registries, (where) => v.reporter(where)));
  },
});
