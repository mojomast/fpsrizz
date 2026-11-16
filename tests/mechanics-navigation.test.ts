import assert from 'node:assert/strict';
import test from 'node:test';
import { NavigationRole } from '../src/sdk/index.ts';
import type { CatalogEntry, NavigationNode } from '../src/sdk/index.ts';
import manifest from '../src/plugins/mechanics-navigation/manifest.json' with { type: 'json' };
import { alternateNavigation, alternateNavigationId } from './helpers/alternate-navigation.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';

const implementations: { id: string; entry: CatalogEntry }[] = [
  { id: manifest.id, entry: { manifest, load: () => import('../src/plugins/mechanics-navigation/index.ts') } },
  { id: alternateNavigationId, entry: alternateNavigation },
];

for (const implementation of implementations) {
  const fixture = async () => {
    const game = createHeadlessGame([implementation.entry]);
    await game.host.apply(headlessPreset({
      plugins: [implementation.id], roles: { [NavigationRole.id]: implementation.id }, options: {},
    }));
    const provider = game.session().contexts.get(implementation.id)!.role(NavigationRole)!.provider;
    if (implementation.id !== manifest.id)
      assert.equal(game.host.catalogStatus().some(entry => entry.id === manifest.id), false, 'default is not even installed');
    return { ...game, provider };
  };

  test(`${implementation.id}: ordered shortest distances and first hops use adjacency, not node enumeration`, async () => {
    const g = await fixture();
    try {
      const nodes = [
        { id: 'goal', neighbors: [] },
        { id: 'west', neighbors: ['goal', 'tail'] },
        { id: 'start', neighbors: ['north', 'west'] },
        { id: 'tail', neighbors: ['goal'] },
        { id: 'north', neighbors: ['goal'] },
        { id: 'island', neighbors: [] },
      ];
      const expected = [
        { node: 'start', steps: 0, firstStep: 'start' },
        { node: 'north', steps: 1, firstStep: 'north' },
        { node: 'west', steps: 1, firstStep: 'west' },
        { node: 'goal', steps: 2, firstStep: 'north' },
        { node: 'tail', steps: 2, firstStep: 'west' },
      ];
      assert.deepEqual(g.provider.search(nodes, 'start'), expected);
      assert.deepEqual(g.provider.search([...nodes].reverse(), 'start'), expected);
      nodes.find(node => node.id === 'start')!.neighbors.reverse();
      assert.deepEqual(g.provider.search(nodes, 'start'), [expected[0], expected[2], expected[1],
        { node: 'goal', steps: 2, firstStep: 'west' }, expected[4]]);
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: cycles, self-loops and duplicate edges retain the first shortest visit`, async () => {
    const g = await fixture();
    try {
      assert.deepEqual(g.provider.search([
        { id: 'a', neighbors: ['a', 'b', 'b', 'c'] },
        { id: 'b', neighbors: ['a', 'c', 'd'] },
        { id: 'c', neighbors: ['d', 'c'] },
        { id: 'd', neighbors: ['b'] },
      ], 'a'), [
        { node: 'a', steps: 0, firstStep: 'a' }, { node: 'b', steps: 1, firstStep: 'b' },
        { node: 'c', steps: 1, firstStep: 'c' }, { node: 'd', steps: 2, firstStep: 'b' },
      ]);
      assert.deepEqual(g.provider.search([{ id: 'alone', neighbors: [] }], 'alone'), [
        { node: 'alone', steps: 0, firstStep: 'alone' },
      ]);
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: depth is inclusive and edges are directed`, async () => {
    const g = await fixture();
    try {
      const graph = [
        { id: 'a', neighbors: ['b'] }, { id: 'b', neighbors: ['c'] },
        { id: 'c', neighbors: ['d'] }, { id: 'd', neighbors: [] },
      ];
      const all = [
        { node: 'a', steps: 0, firstStep: 'a' }, { node: 'b', steps: 1, firstStep: 'b' },
        { node: 'c', steps: 2, firstStep: 'b' }, { node: 'd', steps: 3, firstStep: 'b' },
      ];
      assert.deepEqual(g.provider.search(graph, 'a', 0), all.slice(0, 1));
      assert.deepEqual(g.provider.search(graph, 'a', 2), all.slice(0, 3));
      assert.deepEqual(g.provider.search(graph, 'a', Number.MAX_SAFE_INTEGER), all);
      assert.deepEqual(g.provider.search(graph, 'd'), [{ node: 'd', steps: 0, firstStep: 'd' }]);
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: all graph shapes, references, origins and depths are validated before search`, async () => {
    const g = await fixture();
    try {
      const node = { id: 'a', neighbors: [] };
      const malformed: unknown[] = [
        null, {}, 'a', [], [null], [[]], [{}], [node, node], [{ id: '', neighbors: [] }],
        [{ id: '  ', neighbors: [] }], [{ id: 1, neighbors: [] }], [{ id: 'a' }],
        [{ id: 'a', neighbors: null }], [{ id: 'a', neighbors: 'a' }],
        [{ ...node, cost: 2 }], [{ ...node, neighbors: [1] }], [{ ...node, neighbors: ['missing'] }],
        [node, { id: 'unreachable', neighbors: ['missing'] }], new Array(1),
        [{ id: 'a', neighbors: new Array(1) }], Object.create({ nodes: [node] }),
        [Object.create(node)],
      ];
      for (const graph of malformed)
        assert.throws(() => g.provider.search(graph as readonly NavigationNode[], 'a', 0), TypeError);
      for (const origin of ['', 'missing', null, 1, {}])
        assert.throws(() => g.provider.search([node], origin as string), TypeError);
      for (const depth of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])
        assert.throws(() => g.provider.search([node], 'a', depth as number), RangeError);
      assert.deepEqual(g.provider.search([node], 'a'), [{ node: 'a', steps: 0, firstStep: 'a' }], 'errors retain no work state');
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: query borrows without mutation and returns detached frozen records`, async () => {
    const g = await fixture();
    try {
      const graph = [{ id: 'a', neighbors: ['b'] }, { id: 'b', neighbors: [] }];
      const original = JSON.stringify(graph);
      const result = g.provider.search(graph, 'a');
      assert.equal(JSON.stringify(graph), original);
      assert.equal(Object.isFrozen(graph), false, 'provider does not freeze caller data');
      assert.equal(Object.isFrozen(graph[0]), false);
      assert.equal(Object.isFrozen(result), true);
      assert.ok(result.every(Object.isFrozen));
      graph[0]!.neighbors.length = 0;
      graph[1]!.id = 'replacement';
      assert.deepEqual(result, [
        { node: 'a', steps: 0, firstStep: 'a' }, { node: 'b', steps: 1, firstStep: 'b' },
      ]);
      assert.deepEqual(g.provider.search(graph, 'a'), [{ node: 'a', steps: 0, firstStep: 'a' }]);
      const frozen = Object.freeze([Object.freeze({ id: 'only', neighbors: Object.freeze([] as string[]) })]);
      assert.deepEqual(g.provider.search(frozen, 'only'), [{ node: 'only', steps: 0, firstStep: 'only' }]);
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: pure retained queries have no session resources or restart state`, async () => {
    const g = await fixture();
    try {
      const graph = [{ id: 'one', neighbors: [] }];
      const resources = g.host.resourceReport();
      const retained = g.provider;
      const expected = retained.search(graph, 'one');
      assert.deepEqual(g.host.resourceReport(), resources);
      await g.host.restart();
      assert.deepEqual(g.host.resourceReport(), resources);
      g.host.stop();
      assert.deepEqual(retained.search(graph, 'one'), expected, 'no old session is consulted by pure functions');
    } finally { g.host.stop(); }
  });
}
