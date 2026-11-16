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
import assetrizzTheme from '../plugins/theme-assetrizz/manifest.json' with { type: 'json' };
import exampleHud from '../plugins/example-hud/manifest.json' with { type: 'json' };
import examplePackManifest from '../plugins/example-pack/manifest.json' with { type: 'json' };
import examplePack from '../plugins/example-pack/content.json' with { type: 'json' };
import exampleRicochet from '../plugins/example-ricochet/manifest.json' with { type: 'json' };
import exampleSurvival from '../plugins/example-survival/manifest.json' with { type: 'json' };
import exampleTimeTrial from '../plugins/example-time-trial/manifest.json' with { type: 'json' };
import exampleArena from '../plugins/example-arena/manifest.json' with { type: 'json' };
import exampleWard from '../plugins/example-ward/manifest.json' with { type: 'json' };
import exampleDash from '../plugins/example-dash-controller/manifest.json' with { type: 'json' };
import exampleKeys from '../plugins/example-keys/manifest.json' with { type: 'json' };
import exampleHoldout from '../plugins/example-holdout/manifest.json' with { type: 'json' };
import exampleStealth from '../plugins/example-stealth/manifest.json' with { type: 'json' };
import exampleRacing from '../plugins/example-racing/manifest.json' with { type: 'json' };
import exampleRoguelite from '../plugins/example-roguelite/manifest.json' with { type: 'json' };
import exampleEscape from '../plugins/example-escape/manifest.json' with { type: 'json' };
import exampleExtraction from '../plugins/example-extraction/manifest.json' with { type: 'json' };
import extractionMapManifest from '../plugins/example-extraction-map/manifest.json' with { type: 'json' };
import extractionMapContent from '../plugins/example-extraction-map/content.json' with { type: 'json' };
import tacticalManifest from '../plugins/example-tactical-pack/manifest.json' with { type: 'json' };
import tacticalContent from '../plugins/example-tactical-pack/content.json' with { type: 'json' };
import raceTrackManifest from '../plugins/example-race-track/manifest.json' with { type: 'json' };
import raceTrackContent from '../plugins/example-race-track/content.json' with { type: 'json' };
import adventureManifest from '../plugins/example-adventure-pack/manifest.json' with { type: 'json' };
import adventureContent from '../plugins/example-adventure-pack/content.json' with { type: 'json' };
import keyDungeonManifest from '../plugins/example-key-dungeon/manifest.json' with { type: 'json' };
import keyDungeonContent from '../plugins/example-key-dungeon/content.json' with { type: 'json' };
import stealthMapManifest from '../plugins/example-stealth-map/manifest.json' with { type: 'json' };
import stealthMapContent from '../plugins/example-stealth-map/content.json' with { type: 'json' };
import annexPreset from '../content/presets/annex.json' with { type: 'json' };
import defaultPreset from '../content/presets/default.json' with { type: 'json' };
import extendedPreset from '../content/presets/extended.json' with { type: 'json' };
import survivalPreset from '../content/presets/survival.json' with { type: 'json' };
import assetrizzPreset from '../content/presets/assetrizz.json' with { type: 'json' };
import timeTrialPreset from '../content/presets/time-trial.json' with { type: 'json' };
import arenaScorePreset from '../content/presets/arena-score.json' with { type: 'json' };
import observatoryPreset from '../content/presets/observatory.json' with { type: 'json' };
import blackoutPreset from '../content/presets/blackout.json' with { type: 'json' };
import holdoutPreset from '../content/presets/holdout.json' with { type: 'json' };
import keyDungeonPreset from '../content/presets/key-dungeon.json' with { type: 'json' };
import stealthPreset from '../content/presets/stealth.json' with { type: 'json' };
import roguelitePreset from '../content/presets/roguelite.json' with { type: 'json' };
import racingPreset from '../content/presets/racing.json' with { type: 'json' };
import extractionPreset from '../content/presets/extraction.json' with { type: 'json' };
import tacticalPreset from '../content/presets/tactical.json' with { type: 'json' };

export const catalog: CatalogEntry[] = [
  { manifest: world, load: () => import('../plugins/core-world/index.ts') },
  { manifest: combat, load: () => import('../plugins/core-combat/index.ts') },
  { manifest: player, load: () => import('../plugins/core-player/index.ts') },
  { manifest: enemies, load: () => import('../plugins/core-enemies/index.ts') },
  { manifest: modes, load: () => import('../plugins/core-modes/index.ts') },
  { manifest: hud, load: () => import('../plugins/core-hud/index.ts') },
  { manifest: presentation, load: () => import('../plugins/core-presentation/index.ts') },
  { manifest: theme, load: () => import('../plugins/theme-industrial/index.ts') },
  { manifest: assetrizzTheme, load: () => import('../plugins/theme-assetrizz/index.ts') },
  { manifest: contentManifest, content },
  // Optional extensions (the four modularity demonstrations). Enabled only by presets that list them.
  { manifest: examplePackManifest, content: examplePack },
  { manifest: exampleRicochet, load: () => import('../plugins/example-ricochet/index.ts') },
  { manifest: exampleHud, load: () => import('../plugins/example-hud/index.ts') },
  { manifest: exampleSurvival, load: () => import('../plugins/example-survival/index.ts') },
  { manifest: exampleTimeTrial, load: () => import('../plugins/example-time-trial/index.ts') },
  { manifest: exampleArena, load: () => import('../plugins/example-arena/index.ts') },
  { manifest: exampleWard, load: () => import('../plugins/example-ward/index.ts') },
  { manifest: exampleDash, load: () => import('../plugins/example-dash-controller/index.ts') },
  { manifest: exampleKeys, load: () => import('../plugins/example-keys/index.ts') },
  { manifest: exampleHoldout, load: () => import('../plugins/example-holdout/index.ts') },
  { manifest: exampleStealth, load: () => import('../plugins/example-stealth/index.ts') },
  { manifest: exampleRacing, load: () => import('../plugins/example-racing/index.ts') },
  { manifest: exampleRoguelite, load: () => import('../plugins/example-roguelite/index.ts') },
  { manifest: exampleEscape, load: () => import('../plugins/example-escape/index.ts') },
  { manifest: exampleExtraction, load: () => import('../plugins/example-extraction/index.ts') },
  { manifest: extractionMapManifest, content: extractionMapContent },
  { manifest: tacticalManifest, content: tacticalContent },
  { manifest: raceTrackManifest, content: raceTrackContent },
  { manifest: adventureManifest, content: adventureContent },
  { manifest: keyDungeonManifest, content: keyDungeonContent },
  { manifest: stealthMapManifest, content: stealthMapContent },
];

/** Built-in presets offered by the start screen and creator panel. The first one is the default. */
export const presets: unknown[] = [defaultPreset, extendedPreset, annexPreset, survivalPreset, assetrizzPreset, timeTrialPreset, arenaScorePreset, observatoryPreset, blackoutPreset, holdoutPreset, keyDungeonPreset, stealthPreset, roguelitePreset, racingPreset, extractionPreset, tacticalPreset];
