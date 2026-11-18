import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '../../../src/kernel/host.ts';
import { PHASES, SDK_COMPAT, SDK_VERSION } from '../../../src/sdk/index.ts';
import { Adventure } from '../contracts/adventure.ts';
import rules from '../plugins/story-adventure/manifest.json' with { type: 'json' };
import presentation from '../plugins/story-presentation/manifest.json' with { type: 'json' };
import theme from '../../../src/plugins/theme-story/manifest.json' with { type: 'json' };
import archive from '../plugins/portfolio-archive-adventure/manifest.json' with { type: 'json' };
import archiveContent from '../plugins/portfolio-archive-adventure/content.json' with { type: 'json' };
import orchard from '../plugins/portfolio-orchard-adventure/manifest.json' with { type: 'json' };
import orchardContent from '../plugins/portfolio-orchard-adventure/content.json' with { type: 'json' };
import archivePreset from '../presets/portfolio-archive-adventure.json' with { type: 'json' };
import orchardPreset from '../presets/portfolio-orchard-adventure.json' with { type: 'json' };

function fixture() {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  host.setCatalog([
    { manifest: rules, load: () => import('../plugins/story-adventure/index.ts') },
    { manifest: presentation, load: () => import('../plugins/story-presentation/index.ts') },
    { manifest: theme, load: () => import('../../../src/plugins/theme-story/index.ts') },
    { manifest: archive, content: archiveContent },
    { manifest: orchard, content: orchardContent },
  ]);
  const service = () => host.session!.services.get(Adventure);
  const action = (id: string) => {
    assert.equal(service().enqueue({ type: 'action', id }), true);
    host.session!.scheduler.runTick();
  };
  const route = (ids: string[]) => { for (const id of ids) action(id); };
  const rejected = (id: string) => {
    const before = service().state();
    action(id);
    assert.deepEqual(service().state(), before);
  };
  return { host, service, action, route, rejected };
}

test('The Quiet Index recovers evidence and supports three evidence-disclosure outcomes', async () => {
  const f = fixture();
  await f.host.apply(archivePreset);
  f.rejected('enter-stacks');
  f.route(['ask-iva', 'enter-stacks']);
  f.rejected('open-cabinet');
  f.route(['chart', 'take-rubbing', 'open-cabinet', 'survey-index', 'to-bindery']);
  f.rejected('restore');
  assert.ok(f.service().state().inventory.includes('fragment'));
  f.route(['find-survey', 'take-tissue', 'restore']);
  assert.ok(f.service().state().inventory.includes('evidence'));
  assert.equal(f.service().state().inventory.includes('fragment'), false);
  f.route(['to-stacks', 'to-reading', 'to-hearing', 'ask-residents', 'compare-records', 'public-record']);
  assert.equal(f.service().state().completed, true);
  assert.ok(f.service().state().flags.includes('public'));
  f.rejected('private-record');
  await f.host.restart();
  assert.equal(f.service().state().room, 'reading-room');
  f.route(['challenge-iva', 'enter-stacks', 'chart', 'take-rubbing', 'open-cabinet', 'survey-index', 'to-bindery', 'find-survey', 'take-tissue', 'restore', 'to-stacks', 'to-reading', 'to-hearing', 'ask-residents', 'compare-records', 'private-record']);
  assert.equal(f.service().state().completed, true);
  assert.ok(f.service().state().flags.includes('private'));
  assert.ok(f.service().state().flags.includes('confronted'));
  await f.host.restart();
  f.route(['ask-iva', 'enter-stacks', 'chart', 'take-rubbing', 'open-cabinet', 'survey-index', 'to-bindery', 'find-survey', 'take-tissue', 'restore', 'to-stacks', 'to-reading', 'to-hearing']);
  f.rejected('redacted-record');
  f.route(['ask-residents', 'compare-records', 'redacted-record']);
  assert.ok(f.service().state().completed);
  assert.ok(f.service().state().flags.includes('redacted'));
  assert.match(f.service().state().message, /under seal/);
  f.rejected('public-record');
  await f.host.stop();
});

test('The Night Orchard prepares a cutting and offers three distinct care outcomes', async () => {
  const f = fixture();
  await f.host.apply(orchardPreset);
  f.route(['to-cryo']);
  f.rejected('wake-sen');
  f.route(['cryo-return', 'to-cistern']);
  f.rejected('take-filter');
  f.route(['diagram', 'take-filter']);
  f.rejected('filter-water');
  f.route(['inspect-salinity', 'filter-water', 'cistern-return', 'to-nursery']);
  f.rejected('prepare');
  assert.ok(f.service().state().inventory.includes('water'));
  f.route(['manual', 'take-knife', 'nursery-return', 'cut-shoot', 'to-nursery', 'prepare']);
  assert.equal(f.service().state().inventory.includes('water'), false);
  f.route(['nursery-return', 'to-cryo', 'specialist-logs', 'wake-sen']);
  assert.equal(f.service().state().completed, true);
  assert.ok(f.service().state().flags.includes('botanist'));
  f.rejected('wake-sol');
  await f.host.restart();
  f.route(['to-nursery', 'manual', 'take-knife', 'nursery-return', 'cut-shoot', 'to-cistern', 'diagram', 'take-filter', 'inspect-salinity', 'filter-water', 'cistern-return', 'to-nursery', 'prepare', 'nursery-return', 'to-cryo', 'specialist-logs', 'wake-sol']);
  assert.equal(f.service().state().completed, true);
  assert.ok(f.service().state().flags.includes('engineer'));
  await f.host.restart();
  f.route(['power-log', 'to-cistern', 'diagram', 'bypass', 'take-filter', 'inspect-salinity', 'filter-water', 'cistern-return', 'to-nursery', 'manual', 'take-knife', 'nursery-return', 'cut-shoot', 'to-nursery', 'prepare', 'nursery-return', 'to-cryo', 'specialist-logs', 'keep-watch']);
  assert.ok(f.service().state().completed);
  assert.ok(f.service().state().flags.includes('watch'));
  assert.match(f.service().state().message, /continued care/);
  f.rejected('wake-sen');
  await f.host.stop();
});
