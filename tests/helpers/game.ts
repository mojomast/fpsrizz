/** Headless game harness: the real gameplay plugins on the real host, with fake platform services. No DOM, no WebGL. */
import { PluginHost } from '../../src/kernel/host.ts';
import type { CatalogEntry, Session } from '../../src/kernel/host.ts';
import { createFlow } from '../../src/platform/flow.ts';
import { createInputCore } from '../../src/platform/input.ts';
import type { InputCore } from '../../src/platform/input.ts';
import { Flow, FlowEnded, Input, PHASES, SDK_COMPAT, SDK_VERSION } from '../../src/sdk/index.ts';
import combat from '../../games/shooter/plugins/core-combat/manifest.json' with { type: 'json' };
import contentManifest from '../../games/shooter/plugins/core-content/manifest.json' with { type: 'json' };
import content from '../../games/shooter/plugins/core-content/content.json' with { type: 'json' };
import enemies from '../../games/shooter/plugins/core-enemies/manifest.json' with { type: 'json' };
import modes from '../../games/shooter/plugins/core-modes/manifest.json' with { type: 'json' };
import player from '../../games/shooter/plugins/core-player/manifest.json' with { type: 'json' };
import world from '../../games/shooter/plugins/core-world/manifest.json' with { type: 'json' };

export const coreCatalog = (): CatalogEntry[] => [
  { manifest: world, load: () => import('../../games/shooter/plugins/core-world/index.ts') },
  { manifest: combat, load: () => import('../../games/shooter/plugins/core-combat/index.ts') },
  { manifest: player, load: () => import('../../games/shooter/plugins/core-player/index.ts') },
  { manifest: enemies, load: () => import('../../games/shooter/plugins/core-enemies/index.ts') },
  { manifest: modes, load: () => import('../../games/shooter/plugins/core-modes/index.ts') },
  { manifest: contentManifest, content },
];

export const headlessPreset = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 1,
  id: 'test/headless',
  name: 'Headless',
  plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content'],
  roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'core/objective' },
  options: { map: 'core/arena' },
  seed: 7,
  ...over,
});

export interface HeadlessGame {
  host: PluginHost;
  input: InputCore;
  session(): Session;
  /** Runs n fixed ticks. */
  ticks(n: number): void;
}

export function createHeadlessGame(extraCatalog: CatalogEntry[] = []): HeadlessGame {
  const input = createInputCore();
  const host = new PluginHost({
    sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT,
    phases: PHASES,
    installHostServices(session, scope) {
      session.services.provide(Input, input.service, 'host', scope);
      session.services.provide(Flow, createFlow((r) => session.events.emit(FlowEnded, r), () => session.scheduler.time), 'host', scope);
      session.addBeforeTick(() => input.beginTick(), scope);
      scope.add(() => input.clear(), 'input');
    },
  });
  host.setCatalog([...coreCatalog(), ...extraCatalog]);
  return {
    host,
    input,
    session: () => {
      if (!host.session) throw new Error('no session');
      return host.session;
    },
    ticks(n) {
      for (let i = 0; i < n; i++) host.session!.scheduler.runTick();
    },
  };
}
