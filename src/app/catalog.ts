/**
 * Build-time plugin catalog. Adding a local plugin = add its folder under src/plugins and one entry here
 * (plus listing it in a preset). No runtime logic changes. Manifests are plain JSON so the host can validate the
 * whole graph BEFORE any plugin code is imported; `load` is only called for plugins in a validated selection.
 *
 * Discovery happens when the app is built: a deployed build cannot install new JavaScript. Data-only content packs,
 * however, can be imported at runtime through the creator panel.
 */
import type { CatalogEntry } from '../sdk/index.ts';
import combat from '../plugins/core-combat/manifest.json' with { type: 'json' };
import contentManifest from '../plugins/core-content/manifest.json' with { type: 'json' };
import content from '../plugins/core-content/content.json' with { type: 'json' };
import enemies from '../plugins/core-enemies/manifest.json' with { type: 'json' };
import hud from '../plugins/core-hud/manifest.json' with { type: 'json' };
import modes from '../plugins/core-modes/manifest.json' with { type: 'json' };
import player from '../plugins/core-player/manifest.json' with { type: 'json' };
import presentation from '../plugins/core-presentation/manifest.json' with { type: 'json' };
import world from '../plugins/core-world/manifest.json' with { type: 'json' };
import theme from '../plugins/theme-industrial/manifest.json' with { type: 'json' };
import defaultPreset from '../content/presets/default.json' with { type: 'json' };

export const catalog: CatalogEntry[] = [
  { manifest: world, load: () => import('../plugins/core-world/index.ts') },
  { manifest: combat, load: () => import('../plugins/core-combat/index.ts') },
  { manifest: player, load: () => import('../plugins/core-player/index.ts') },
  { manifest: enemies, load: () => import('../plugins/core-enemies/index.ts') },
  { manifest: modes, load: () => import('../plugins/core-modes/index.ts') },
  { manifest: hud, load: () => import('../plugins/core-hud/index.ts') },
  { manifest: presentation, load: () => import('../plugins/core-presentation/index.ts') },
  { manifest: theme, load: () => import('../plugins/theme-industrial/index.ts') },
  { manifest: contentManifest, content },
];

/** Built-in presets offered by the start screen and creator panel. The first one is the default. */
export const presets: unknown[] = [defaultPreset];
