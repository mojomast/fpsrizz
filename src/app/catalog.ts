/**
 * Build-time plugin catalog. Adding a local plugin = add its folder (manifest.json plus index.ts or content.json)
 * under src/plugins (or games/<family>/plugins) and list it in a preset. `scripts/gen-catalog.mjs` discovers every
 * folder and writes catalog.generated.ts; dev, build and check keep it fresh. Manifests are plain JSON so the host
 * can validate the whole graph BEFORE any plugin code is imported; `load` is only called for plugins in a validated
 * selection.
 *
 * Discovery happens when the app is built: a deployed build cannot install new JavaScript. Data-only content packs,
 * however, can be imported at runtime through the creator panel.
 */
export { catalog } from './catalog.generated.ts';
import annexPreset from '../../games/shooter/presets/annex.json' with { type: 'json' };
import defaultPreset from '../../games/shooter/presets/default.json' with { type: 'json' };
import extendedPreset from '../../games/shooter/presets/extended.json' with { type: 'json' };
import survivalPreset from '../../games/shooter/presets/survival.json' with { type: 'json' };
import assetrizzPreset from '../../games/shooter/presets/assetrizz.json' with { type: 'json' };
import timeTrialPreset from '../../games/shooter/presets/time-trial.json' with { type: 'json' };
import arenaScorePreset from '../../games/shooter/presets/arena-score.json' with { type: 'json' };
import observatoryPreset from '../../games/shooter/presets/observatory.json' with { type: 'json' };
import blackoutPreset from '../../games/shooter/presets/blackout.json' with { type: 'json' };
import holdoutPreset from '../../games/shooter/presets/holdout.json' with { type: 'json' };
import keyDungeonPreset from '../../games/shooter/presets/key-dungeon.json' with { type: 'json' };
import stealthPreset from '../../games/shooter/presets/stealth.json' with { type: 'json' };
import roguelitePreset from '../../games/shooter/presets/roguelite.json' with { type: 'json' };
import racingPreset from '../../games/shooter/presets/racing.json' with { type: 'json' };
import extractionPreset from '../../games/shooter/presets/extraction.json' with { type: 'json' };
import tacticalPreset from '../../games/shooter/presets/tactical.json' with { type: 'json' };
import overheadRacingPreset from '../../games/racing/presets/overhead-racing.json' with { type: 'json' };
import turnTacticsPreset from '../../games/tactics/presets/turn-tactics.json' with { type: 'json' };
import narrativeAdventurePreset from '../../games/adventure/presets/narrative-adventure.json' with { type: 'json' };
import stonewakePreset from '../../games/puzzles/presets/stonewake.json' with { type: 'json' };
import skyPreset from '../../games/sky/presets/sky-salvage.json' with { type: 'json' };
import emberPreset from '../../games/ember/presets/ember-bastion.json' with { type: 'json' };
import verdantPreset from '../../games/verdant/presets/verdant-relay.json' with { type: 'json' };
import cinderPreset from '../../games/cinder/presets/cinder-vault.json' with { type: 'json' };
import hollowmerePreset from '../../games/hollowmere/presets/hollowmere-ascent.json' with { type: 'json' };
import portfolioAtelierPreset from '../../games/puzzles/presets/portfolio-atelier-puzzle.json' with { type: 'json' };
import portfolioWatchPreset from '../../games/puzzles/presets/portfolio-watch-puzzle.json' with { type: 'json' };
import portfolioSaltPreset from '../../games/racing/presets/portfolio-salt-racing.json' with { type: 'json' };
import portfolioCopperPreset from '../../games/racing/presets/portfolio-copper-racing.json' with { type: 'json' };
import portfolioSkyPreset from '../../games/sky/presets/portfolio-sky-resource.json' with { type: 'json' };
import portfolioVerdantPreset from '../../games/verdant/presets/portfolio-verdant-resource.json' with { type: 'json' };
import portfolioBreachPreset from '../../games/tactics/presets/portfolio-breach-tactics.json' with { type: 'json' };
import portfolioCrossfirePreset from '../../games/tactics/presets/portfolio-crossfire-tactics.json' with { type: 'json' };
import portfolioArchivePreset from '../../games/adventure/presets/portfolio-archive-adventure.json' with { type: 'json' };
import portfolioOrchardPreset from '../../games/adventure/presets/portfolio-orchard-adventure.json' with { type: 'json' };
import portfolioCardsAshPreset from '../../games/puzzles/presets/portfolio-cards-ash.json' with { type: 'json' };
import portfolioCardsCloudPreset from '../../games/puzzles/presets/portfolio-cards-cloud.json' with { type: 'json' };
import commonGroundPreset from '../../games/expeditions/presets/common-ground.json' with { type: 'json' };
import saltPreset from '../../games/expeditions/presets/salt-ledger.json' with { type: 'json' };
import siltPreset from '../../games/expeditions/presets/silt-archive.json' with { type: 'json' };
import sandboxPreset from '../../games/sandbox/presets/physics-sandbox.json' with { type: 'json' };

/** Built-in presets offered by the start screen and creator panel. The first one is the default. */
export const presets: unknown[] = [defaultPreset, extendedPreset, annexPreset, survivalPreset, assetrizzPreset, timeTrialPreset, arenaScorePreset, observatoryPreset, blackoutPreset, holdoutPreset, keyDungeonPreset, stealthPreset, roguelitePreset, racingPreset, extractionPreset, tacticalPreset, overheadRacingPreset, turnTacticsPreset, narrativeAdventurePreset, stonewakePreset, skyPreset, emberPreset, verdantPreset, cinderPreset, hollowmerePreset, portfolioAtelierPreset, portfolioWatchPreset, portfolioSaltPreset, portfolioCopperPreset, portfolioSkyPreset, portfolioVerdantPreset, portfolioBreachPreset, portfolioCrossfirePreset, portfolioArchivePreset, portfolioOrchardPreset, portfolioCardsAshPreset, portfolioCardsCloudPreset, commonGroundPreset, saltPreset, siltPreset, sandboxPreset];
