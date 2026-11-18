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
import overheadRacingPreset from '../../games/racing/presets/overhead-racing.json' with { type: 'json' };
import turnTacticsPreset from '../../games/tactics/presets/turn-tactics.json' with { type: 'json' };
import narrativeAdventurePreset from '../content/presets/narrative-adventure.json' with { type: 'json' };
import stonewakePreset from '../content/presets/stonewake.json' with { type: 'json' };
import skyPreset from '../../games/sky/presets/sky-salvage.json' with { type: 'json' };
import emberPreset from '../../games/ember/presets/ember-bastion.json' with { type: 'json' };
import verdantPreset from '../../games/verdant/presets/verdant-relay.json' with { type: 'json' };
import cinderPreset from '../../games/cinder/presets/cinder-vault.json' with { type: 'json' };
import hollowmerePreset from '../../games/hollowmere/presets/hollowmere-ascent.json' with { type: 'json' };
import portfolioAtelierPreset from '../content/presets/portfolio-atelier-puzzle.json' with { type: 'json' };
import portfolioWatchPreset from '../content/presets/portfolio-watch-puzzle.json' with { type: 'json' };
import portfolioSaltPreset from '../../games/racing/presets/portfolio-salt-racing.json' with { type: 'json' };
import portfolioCopperPreset from '../../games/racing/presets/portfolio-copper-racing.json' with { type: 'json' };
import portfolioSkyPreset from '../content/presets/portfolio-sky-resource.json' with { type: 'json' };
import portfolioVerdantPreset from '../content/presets/portfolio-verdant-resource.json' with { type: 'json' };
import portfolioBreachPreset from '../../games/tactics/presets/portfolio-breach-tactics.json' with { type: 'json' };
import portfolioCrossfirePreset from '../../games/tactics/presets/portfolio-crossfire-tactics.json' with { type: 'json' };
import portfolioArchivePreset from '../content/presets/portfolio-archive-adventure.json' with { type: 'json' };
import portfolioOrchardPreset from '../content/presets/portfolio-orchard-adventure.json' with { type: 'json' };
import portfolioCardsAshPreset from '../content/presets/portfolio-cards-ash.json' with { type: 'json' };
import portfolioCardsCloudPreset from '../content/presets/portfolio-cards-cloud.json' with { type: 'json' };
import commonGroundPreset from '../../games/expeditions/presets/common-ground.json' with { type: 'json' };
import saltPreset from '../../games/expeditions/presets/salt-ledger.json' with { type: 'json' };
import siltPreset from '../../games/expeditions/presets/silt-archive.json' with { type: 'json' };

/** Built-in presets offered by the start screen and creator panel. The first one is the default. */
export const presets: unknown[] = [defaultPreset, extendedPreset, annexPreset, survivalPreset, assetrizzPreset, timeTrialPreset, arenaScorePreset, observatoryPreset, blackoutPreset, holdoutPreset, keyDungeonPreset, stealthPreset, roguelitePreset, racingPreset, extractionPreset, tacticalPreset, overheadRacingPreset, turnTacticsPreset, narrativeAdventurePreset, stonewakePreset, skyPreset, emberPreset, verdantPreset, cinderPreset, hollowmerePreset, portfolioAtelierPreset, portfolioWatchPreset, portfolioSaltPreset, portfolioCopperPreset, portfolioSkyPreset, portfolioVerdantPreset, portfolioBreachPreset, portfolioCrossfirePreset, portfolioArchivePreset, portfolioOrchardPreset, portfolioCardsAshPreset, portfolioCardsCloudPreset, commonGroundPreset, saltPreset, siltPreset];
