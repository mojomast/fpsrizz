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
import vehicleRacing from '../plugins/vehicle-racing/manifest.json' with { type: 'json' };
import vehiclePresentation from '../plugins/vehicle-presentation/manifest.json' with { type: 'json' };
import vehicleTrackManifest from '../plugins/vehicle-track/manifest.json' with { type: 'json' };
import vehicleTrackContent from '../plugins/vehicle-track/content.json' with { type: 'json' };
import boardTactics from '../plugins/board-tactics/manifest.json' with { type: 'json' };
import boardPresentation from '../plugins/board-presentation/manifest.json' with { type: 'json' };
import boardMissionManifest from '../plugins/board-mission/manifest.json' with { type: 'json' };
import boardMissionContent from '../plugins/board-mission/content.json' with { type: 'json' };
import storyAdventure from '../plugins/story-adventure/manifest.json' with { type: 'json' };
import storyPresentation from '../plugins/story-presentation/manifest.json' with { type: 'json' };
import storyChapterManifest from '../plugins/story-chapter/manifest.json' with { type: 'json' };
import storyChapterContent from '../plugins/story-chapter/content.json' with { type: 'json' };
import arcadeTheme from '../plugins/theme-arcade/manifest.json' with { type: 'json' };
import boardTheme from '../plugins/theme-board/manifest.json' with { type: 'json' };
import storyTheme from '../plugins/theme-story/manifest.json' with { type: 'json' };
import overheadRacingPreset from '../content/presets/overhead-racing.json' with { type: 'json' };
import turnTacticsPreset from '../content/presets/turn-tactics.json' with { type: 'json' };
import narrativeAdventurePreset from '../content/presets/narrative-adventure.json' with { type: 'json' };
import puzzleRules from '../plugins/puzzle-rules/manifest.json' with { type: 'json' };
import puzzlePresentation from '../plugins/puzzle-presentation/manifest.json' with { type: 'json' };
import puzzleChambers from '../plugins/puzzle-chambers/manifest.json' with { type: 'json' };
import puzzleContent from '../plugins/puzzle-chambers/content.json' with { type: 'json' };
import stonewakePreset from '../content/presets/stonewake.json' with { type: 'json' };
import mechanicResources from '../plugins/mechanics-resources/manifest.json' with { type: 'json' };
import mechanicClock from '../plugins/mechanics-clock/manifest.json' with { type: 'json' };
import mechanicActions from '../plugins/mechanics-actions/manifest.json' with { type: 'json' };
import mechanicObjectives from '../plugins/mechanics-objectives/manifest.json' with { type: 'json' };
import mechanicKits from '../plugins/mechanics-kits/manifest.json' with { type: 'json' };
import mechanicNavigation from '../plugins/mechanics-navigation/manifest.json' with { type: 'json' };
import mechanicSequence from '../plugins/mechanics-sequence/manifest.json' with { type: 'json' };
import skyGame from '../plugins/sky-game/manifest.json' with { type: 'json' };
import skyPresentation from '../plugins/sky-presentation/manifest.json' with { type: 'json' };
import skyPack from '../plugins/sky-content/manifest.json' with { type: 'json' };
import skyContent from '../plugins/sky-content/content.json' with { type: 'json' };
import skyPreset from '../content/presets/sky-salvage.json' with { type: 'json' };
import emberGame from '../plugins/ember-game/manifest.json' with { type: 'json' };
import emberPresentation from '../plugins/ember-presentation/manifest.json' with { type: 'json' };
import emberPack from '../plugins/ember-content/manifest.json' with { type: 'json' };
import emberContent from '../plugins/ember-content/content.json' with { type: 'json' };
import emberPreset from '../content/presets/ember-bastion.json' with { type: 'json' };
import verdantGame from '../plugins/verdant-game/manifest.json' with { type: 'json' };
import verdantPresentation from '../plugins/verdant-presentation/manifest.json' with { type: 'json' };
import verdantPack from '../plugins/verdant-content/manifest.json' with { type: 'json' };
import verdantContent from '../plugins/verdant-content/content.json' with { type: 'json' };
import verdantPreset from '../content/presets/verdant-relay.json' with { type: 'json' };
import cinderGame from '../plugins/cinder-game/manifest.json' with { type: 'json' };
import cinderHud from '../plugins/cinder-hud/manifest.json' with { type: 'json' };
import cinderPack from '../plugins/cinder-content/manifest.json' with { type: 'json' };
import cinderContent from '../plugins/cinder-content/content.json' with { type: 'json' };
import cinderPreset from '../content/presets/cinder-vault.json' with { type: 'json' };
import dungeonGenerator from '../plugins/dungeon-generator/manifest.json' with { type: 'json' };
import mechanicProgression from '../plugins/mechanics-progression/manifest.json' with { type: 'json' };
import mechanicInventory from '../plugins/mechanics-inventory/manifest.json' with { type: 'json' };
import mechanicCrafting from '../plugins/mechanics-crafting/manifest.json' with { type: 'json' };
import presentationCameraModes from '../plugins/presentation-camera-modes/manifest.json' with { type: 'json' };
import presentationPlayerAvatar from '../plugins/presentation-player-avatar/manifest.json' with { type: 'json' };
import platformingMechanic from '../plugins/mechanics-platforming/manifest.json' with { type: 'json' };
import capabilitiesMechanic from '../plugins/mechanics-capabilities/manifest.json' with { type: 'json' };
import roomMapMechanic from '../plugins/mechanics-room-map/manifest.json' with { type: 'json' };
import hollowmereGame from '../plugins/hollowmere-game/manifest.json' with { type: 'json' };
import hollowmerePresentation from '../plugins/hollowmere-presentation/manifest.json' with { type: 'json' };
import hollowmerePack from '../plugins/hollowmere-content/manifest.json' with { type: 'json' };
import hollowmereContent from '../plugins/hollowmere-content/content.json' with { type: 'json' };
import hollowmerePreset from '../content/presets/hollowmere-ascent.json' with { type: 'json' };
import portfolioAtelier from '../plugins/portfolio-atelier-puzzle/manifest.json' with { type: 'json' };
import portfolioAtelierContent from '../plugins/portfolio-atelier-puzzle/content.json' with { type: 'json' };
import portfolioWatch from '../plugins/portfolio-watch-puzzle/manifest.json' with { type: 'json' };
import portfolioWatchContent from '../plugins/portfolio-watch-puzzle/content.json' with { type: 'json' };
import portfolioAtelierPreset from '../content/presets/portfolio-atelier-puzzle.json' with { type: 'json' };
import portfolioWatchPreset from '../content/presets/portfolio-watch-puzzle.json' with { type: 'json' };
import portfolioRacingManifest from '../plugins/portfolio-racing/manifest.json' with { type: 'json' };
import portfolioRacingContent from '../plugins/portfolio-racing/content.json' with { type: 'json' };
import portfolioSaltPreset from '../content/presets/portfolio-salt-racing.json' with { type: 'json' };
import portfolioCopperPreset from '../content/presets/portfolio-copper-racing.json' with { type: 'json' };
import portfolioSkyPack from '../plugins/portfolio-sky-resource/manifest.json' with { type: 'json' };
import portfolioSkyContent from '../plugins/portfolio-sky-resource/content.json' with { type: 'json' };
import portfolioVerdantPack from '../plugins/portfolio-verdant-resource/manifest.json' with { type: 'json' };
import portfolioVerdantContent from '../plugins/portfolio-verdant-resource/content.json' with { type: 'json' };
import portfolioSkyPreset from '../content/presets/portfolio-sky-resource.json' with { type: 'json' };
import portfolioVerdantPreset from '../content/presets/portfolio-verdant-resource.json' with { type: 'json' };
import outcomeRating from '../plugins/mechanics-outcome-rating/manifest.json' with { type: 'json' };
import portfolioBreach from '../plugins/portfolio-breach-tactics/manifest.json' with { type: 'json' };
import portfolioBreachContent from '../plugins/portfolio-breach-tactics/content.json' with { type: 'json' };
import portfolioCrossfire from '../plugins/portfolio-crossfire-tactics/manifest.json' with { type: 'json' };
import portfolioCrossfireContent from '../plugins/portfolio-crossfire-tactics/content.json' with { type: 'json' };
import portfolioBreachPreset from '../content/presets/portfolio-breach-tactics.json' with { type: 'json' };
import portfolioCrossfirePreset from '../content/presets/portfolio-crossfire-tactics.json' with { type: 'json' };
import portfolioArchive from '../plugins/portfolio-archive-adventure/manifest.json' with { type: 'json' };
import portfolioArchiveContent from '../plugins/portfolio-archive-adventure/content.json' with { type: 'json' };
import portfolioOrchard from '../plugins/portfolio-orchard-adventure/manifest.json' with { type: 'json' };
import portfolioOrchardContent from '../plugins/portfolio-orchard-adventure/content.json' with { type: 'json' };
import portfolioArchivePreset from '../content/presets/portfolio-archive-adventure.json' with { type: 'json' };
import portfolioOrchardPreset from '../content/presets/portfolio-orchard-adventure.json' with { type: 'json' };
import portfolioCardsPiles from '../plugins/portfolio-cards-piles/manifest.json' with { type: 'json' };
import portfolioCardsAsh from '../plugins/portfolio-cards-ash/manifest.json' with { type: 'json' };
import portfolioCardsCloud from '../plugins/portfolio-cards-cloud/manifest.json' with { type: 'json' };
import portfolioCardsPresentation from '../plugins/portfolio-cards-presentation/manifest.json' with { type: 'json' };
import portfolioCardsAshPreset from '../content/presets/portfolio-cards-ash.json' with { type: 'json' };
import portfolioCardsCloudPreset from '../content/presets/portfolio-cards-cloud.json' with { type: 'json' };

export const catalog: CatalogEntry[] = [
  { manifest: portfolioAtelier, content: portfolioAtelierContent },
  { manifest: portfolioWatch, content: portfolioWatchContent },
  { manifest: portfolioRacingManifest, content: portfolioRacingContent },
  { manifest: portfolioSkyPack, content: portfolioSkyContent },
  { manifest: portfolioVerdantPack, content: portfolioVerdantContent },
  { manifest: outcomeRating, load: () => import('../plugins/mechanics-outcome-rating/index.ts') },
  { manifest: portfolioBreach, content: portfolioBreachContent },
  { manifest: portfolioCrossfire, content: portfolioCrossfireContent },
  { manifest: portfolioArchive, content: portfolioArchiveContent },
  { manifest: portfolioOrchard, content: portfolioOrchardContent },
  { manifest: portfolioCardsPiles, load: () => import('../plugins/portfolio-cards-piles/index.ts') },
  { manifest: portfolioCardsAsh, load: () => import('../plugins/portfolio-cards-ash/index.ts') },
  { manifest: portfolioCardsCloud, load: () => import('../plugins/portfolio-cards-cloud/index.ts') },
  { manifest: portfolioCardsPresentation, load: () => import('../plugins/portfolio-cards-presentation/index.ts') },
  { manifest: dungeonGenerator, load: () => import('../plugins/dungeon-generator/index.ts') },
  { manifest: cinderGame, load: () => import('../plugins/cinder-game/index.ts') },
  { manifest: cinderHud, load: () => import('../plugins/cinder-hud/index.ts') },
  { manifest: cinderPack, content: cinderContent },
  { manifest: mechanicNavigation, load: () => import('../plugins/mechanics-navigation/index.ts') },
  { manifest: mechanicSequence, load: () => import('../plugins/mechanics-sequence/index.ts') },
  { manifest: mechanicProgression, load: () => import('../plugins/mechanics-progression/index.ts') },
  { manifest: mechanicInventory, load: () => import('../plugins/mechanics-inventory/index.ts') },
  { manifest: mechanicCrafting, load: () => import('../plugins/mechanics-crafting/index.ts') },
  { manifest: presentationCameraModes, load: () => import('../plugins/presentation-camera-modes/index.ts') },
  { manifest: presentationPlayerAvatar, load: () => import('../plugins/presentation-player-avatar/index.ts') },
  { manifest: platformingMechanic, load: () => import('../plugins/mechanics-platforming/index.ts') },
  { manifest: capabilitiesMechanic, load: () => import('../plugins/mechanics-capabilities/index.ts') },
  { manifest: roomMapMechanic, load: () => import('../plugins/mechanics-room-map/index.ts') },
  { manifest: hollowmereGame, load: () => import('../plugins/hollowmere-game/index.ts') },
  { manifest: hollowmerePresentation, load: () => import('../plugins/hollowmere-presentation/index.ts') },
  { manifest: hollowmerePack, content: hollowmereContent },
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
  // Independent game families. Their simulation and content do not depend on the shooter stack.
  { manifest: vehicleRacing, load: () => import('../plugins/vehicle-racing/index.ts') },
  { manifest: vehiclePresentation, load: () => import('../plugins/vehicle-presentation/index.ts') },
  { manifest: vehicleTrackManifest, content: vehicleTrackContent },
  { manifest: boardTactics, load: () => import('../plugins/board-tactics/index.ts') },
  { manifest: boardPresentation, load: () => import('../plugins/board-presentation/index.ts') },
  { manifest: boardMissionManifest, content: boardMissionContent },
  { manifest: storyAdventure, load: () => import('../plugins/story-adventure/index.ts') },
  { manifest: storyPresentation, load: () => import('../plugins/story-presentation/index.ts') },
  { manifest: storyChapterManifest, content: storyChapterContent },
  { manifest: arcadeTheme, load: () => import('../plugins/theme-arcade/index.ts') },
  { manifest: boardTheme, load: () => import('../plugins/theme-board/index.ts') },
  { manifest: storyTheme, load: () => import('../plugins/theme-story/index.ts') },
  { manifest: puzzleRules, load: () => import('../plugins/puzzle-rules/index.ts') },
  { manifest: puzzlePresentation, load: () => import('../plugins/puzzle-presentation/index.ts') },
  { manifest: puzzleChambers, content: puzzleContent },
  // Cross-genre gameplay providers: presets select implementations independently of game consumers.
  { manifest: mechanicResources, load: () => import('../plugins/mechanics-resources/index.ts') },
  { manifest: mechanicClock, load: () => import('../plugins/mechanics-clock/index.ts') },
  { manifest: mechanicActions, load: () => import('../plugins/mechanics-actions/index.ts') },
  { manifest: mechanicObjectives, load: () => import('../plugins/mechanics-objectives/index.ts') },
  { manifest: mechanicKits, load: () => import('../plugins/mechanics-kits/index.ts') },
  { manifest: skyGame, load: () => import('../plugins/sky-game/index.ts') },
  { manifest: skyPresentation, load: () => import('../plugins/sky-presentation/index.ts') },
  { manifest: skyPack, content: skyContent },
  { manifest: emberGame, load: () => import('../plugins/ember-game/index.ts') },
  { manifest: emberPresentation, load: () => import('../plugins/ember-presentation/index.ts') },
  { manifest: emberPack, content: emberContent },
  { manifest: verdantGame, load: () => import('../plugins/verdant-game/index.ts') },
  { manifest: verdantPresentation, load: () => import('../plugins/verdant-presentation/index.ts') },
  { manifest: verdantPack, content: verdantContent },
];

/** Built-in presets offered by the start screen and creator panel. The first one is the default. */
export const presets: unknown[] = [defaultPreset, extendedPreset, annexPreset, survivalPreset, assetrizzPreset, timeTrialPreset, arenaScorePreset, observatoryPreset, blackoutPreset, holdoutPreset, keyDungeonPreset, stealthPreset, roguelitePreset, racingPreset, extractionPreset, tacticalPreset, overheadRacingPreset, turnTacticsPreset, narrativeAdventurePreset, stonewakePreset, skyPreset, emberPreset, verdantPreset, cinderPreset, hollowmerePreset, portfolioAtelierPreset, portfolioWatchPreset, portfolioSaltPreset, portfolioCopperPreset, portfolioSkyPreset, portfolioVerdantPreset, portfolioBreachPreset, portfolioCrossfirePreset, portfolioArchivePreset, portfolioOrchardPreset, portfolioCardsAshPreset, portfolioCardsCloudPreset];
