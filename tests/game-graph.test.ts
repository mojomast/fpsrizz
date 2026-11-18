import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import defaultPresetJson from '../src/content/presets/default.json' with { type: 'json' };
import overheadRacingPresetJson from '../games/racing/presets/overhead-racing.json' with { type: 'json' };
import coreContentManifest from '../src/plugins/core-content/manifest.json' with { type: 'json' };
import coreCombatManifest from '../src/plugins/core-combat/manifest.json' with { type: 'json' };
import coreEnemiesManifest from '../src/plugins/core-enemies/manifest.json' with { type: 'json' };
import coreHudManifest from '../src/plugins/core-hud/manifest.json' with { type: 'json' };
import coreModesManifest from '../src/plugins/core-modes/manifest.json' with { type: 'json' };
import corePlayerManifest from '../src/plugins/core-player/manifest.json' with { type: 'json' };
import corePresentationManifest from '../src/plugins/core-presentation/manifest.json' with { type: 'json' };
import coreWorldManifest from '../src/plugins/core-world/manifest.json' with { type: 'json' };
import exampleDashManifest from '../src/plugins/example-dash-controller/manifest.json' with { type: 'json' };
import exampleHudManifest from '../src/plugins/example-hud/manifest.json' with { type: 'json' };
import exampleSurvivalManifest from '../src/plugins/example-survival/manifest.json' with { type: 'json' };
import mechanicsSequenceManifest from '../src/plugins/mechanics-sequence/manifest.json' with { type: 'json' };
import themeArcadeManifest from '../src/plugins/theme-arcade/manifest.json' with { type: 'json' };
import themeIndustrialManifest from '../src/plugins/theme-industrial/manifest.json' with { type: 'json' };
import vehiclePresentationManifest from '../games/racing/plugins/vehicle-presentation/manifest.json' with { type: 'json' };
import vehicleRacingManifest from '../games/racing/plugins/vehicle-racing/manifest.json' with { type: 'json' };
import vehicleTrackManifest from '../games/racing/plugins/vehicle-track/manifest.json' with { type: 'json' };
import {
  GAME_GRAPH_SCHEMA,
  addPluginNode,
  autoLayout,
  compileGraph,
  dependencyEdgeId,
  graphToPreset,
  pluginNodeId,
  presetToGraph,
  removePluginNode,
  roleNodeId,
  selectRoleProvider,
  setGraphOption,
  setPluginConfig,
  validateGraph,
} from '../src/app/game-graph.ts';
import type {
  GameGraph,
  GameGraphCatalog,
  GameGraphIssue,
  PluginDescriptor,
} from '../src/app/game-graph.ts';
import type { GamePreset, PluginManifest } from '../src/sdk/index.ts';

const descriptor = (
  manifest: unknown,
  providers: Readonly<Record<string, readonly string[]>> = {},
): PluginDescriptor => ({ manifest: manifest as unknown as PluginManifest, providers });

const catalog: GameGraphCatalog = [
  descriptor(coreWorldManifest),
  descriptor(coreCombatManifest),
  descriptor(corePlayerManifest, {
    'sdk/controller': ['core/fps-controller'],
    'sdk/camera': ['core/fp-camera'],
  }),
  descriptor(coreEnemiesManifest),
  descriptor(coreModesManifest, { 'sdk/mode': ['core/objective'] }),
  descriptor(coreHudManifest, { 'sdk/hud': ['core/hud'] }),
  descriptor(corePresentationManifest),
  descriptor(themeIndustrialManifest, { 'sdk/theme': ['theme/industrial'] }),
  descriptor(coreContentManifest),
  descriptor(exampleDashManifest, { 'sdk/controller': ['example/dash-controller'] }),
  descriptor(exampleHudManifest, { 'sdk/hud': ['example/visor-hud'] }),
  descriptor(exampleSurvivalManifest, { 'sdk/mode': ['example/survival'] }),
  descriptor(mechanicsSequenceManifest, { 'sdk/mechanic-sequence': ['mechanics/sequence'] }),
  descriptor(vehicleRacingManifest, {
    'sdk/experience': ['vehicle/arcade-race'],
    'sdk/controller': ['example/racing-controller'],
    'sdk/mode': ['example/race'],
  }),
  descriptor(vehicleTrackManifest),
  descriptor(vehiclePresentationManifest),
  descriptor(themeArcadeManifest, { 'sdk/theme': ['theme/arcade'] }),
];

const defaultPreset = defaultPresetJson as unknown as GamePreset;
const overheadRacingPreset = overheadRacingPresetJson as unknown as GamePreset;

function sortedIdentity(preset: GamePreset): GamePreset {
  return { ...preset, plugins: [...preset.plugins].sort() };
}

function format(issues: readonly GameGraphIssue[]): string {
  return issues.map((issue) => `[${issue.code}] ${issue.source} ${issue.path}: ${issue.message}`).join('\n');
}

function issueCodes(issues: readonly GameGraphIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

function manifest(
  id: string,
  overrides: Partial<PluginManifest> = {},
): PluginManifest {
  return {
    schema: 1,
    id,
    name: id,
    version: '1.0.0',
    kind: 'code',
    sdk: '^2.0.0',
    description: '',
    dependencies: {},
    optionalDependencies: {},
    conflicts: [],
    capabilities: [],
    requiresRoles: [],
    roleDependencies: [],
    config: {},
    ...overrides,
  };
}

function pluginGraph(id: string, plugins: string[], edges: GameGraph['edges']): GameGraph {
  return {
    schema: GAME_GRAPH_SCHEMA,
    id,
    name: id,
    seed: 1,
    options: {},
    config: {},
    nodes: plugins.map((plugin) => ({ id: pluginNodeId(plugin), type: 'plugin' as const, plugin })),
    edges,
  };
}

describe('GameGraph v1 preset round-trips', () => {
  for (const [label, preset] of [
    ['default shooter', defaultPreset],
    ['overhead racing', overheadRacingPreset],
  ] as const) {
    it(`${label}: preset -> graph -> preset and compileGraph`, () => {
      const graph = presetToGraph(preset, catalog);
      const expected = sortedIdentity(preset);
      assert.deepEqual(graphToPreset(graph), expected);
      assert.ok(graph.nodes.every((node) => node.layout === undefined), 'authoring starts without coordinates');

      const compiled = compileGraph(graph, catalog);
      assert.equal(compiled.ok, true, format(compiled.issues));
      assert.deepEqual(compiled.preset, expected);
      assert.deepEqual(compiled.preset?.roles, preset.roles);
      assert.equal(compiled.preset?.seed, preset.seed);
      assert.equal(compiled.preset?.id, preset.id);
      assert.equal(compiled.preset?.name, preset.name);
      assert.equal(compiled.preset?.schema, preset.schema);
    });
  }
});

describe('deterministic output', () => {
  it('ignores node, edge and layout ordering', () => {
    const graph = presetToGraph(defaultPreset, catalog);
    const reordered: GameGraph = {
      ...graph,
      nodes: [...graph.nodes]
        .reverse()
        .map((node, index) => ({ ...node, layout: { x: index * 17, y: -index, collapsed: index % 2 === 0 } })),
      edges: [...graph.edges].reverse(),
    };
    const first = compileGraph(graph, catalog);
    const second = compileGraph(reordered, catalog);
    assert.equal(first.ok, true, format(first.issues));
    assert.equal(second.ok, true, format(second.issues));
    assert.deepEqual(second.preset, first.preset);
    assert.equal(JSON.stringify(second.preset), JSON.stringify(first.preset));
    assert.equal(JSON.stringify(graphToPreset(reordered)), JSON.stringify(graphToPreset(graph)));
    assert.deepEqual(first.preset?.plugins, [...(first.preset?.plugins ?? [])].sort());
    assert.deepEqual(Object.keys(first.preset?.roles ?? {}), [...Object.keys(first.preset?.roles ?? {})].sort());
  });

  it('autoLayout only changes presentation metadata', () => {
    const graph = presetToGraph(defaultPreset, catalog);
    const laidOut = autoLayout(graph);
    assert.ok(laidOut.nodes.every((node) => typeof node.layout?.x === 'number' && typeof node.layout?.y === 'number'));
    assert.deepEqual(compileGraph(laidOut, catalog).preset, compileGraph(graph, catalog).preset);
  });
});

describe('editing options, typed config and seed', () => {
  it('preserves edited values through compilation', () => {
    let graph = presetToGraph(defaultPreset, catalog);
    graph = setGraphOption(graph, 'map', 'example/annex');
    graph = setPluginConfig(graph, 'core/player', 'fov', 91);
    graph = setPluginConfig(graph, 'core/modes', 'playerPrefab', 'example/hero');
    graph = { ...graph, seed: 424242, name: 'Edited graph' };

    const compiled = compileGraph(graph, catalog);
    assert.equal(compiled.ok, true, format(compiled.issues));
    assert.equal(compiled.preset?.options.map, 'example/annex');
    assert.equal(compiled.preset?.config['core/player']?.fov, 91);
    assert.equal(compiled.preset?.config['core/modes']?.playerPrefab, 'example/hero');
    assert.equal(compiled.preset?.seed, 424242);
    assert.equal(compiled.preset?.name, 'Edited graph');
  });

  it('rejects unknown settings and out-of-range typed values', () => {
    const base = presetToGraph(defaultPreset, catalog);
    const badValue = setPluginConfig(base, 'core/player', 'fov', 999);
    const badKey = setPluginConfig(base, 'core/player', 'notASetting', 1);
    const disabledPlugin = setPluginConfig(base, 'example/hud', 'accent', 'cyan');
    assert.ok(issueCodes(validateGraph(badValue, catalog)).includes('config/value'));
    assert.ok(issueCodes(validateGraph(badKey, catalog)).includes('config/key'));
    assert.ok(issueCodes(validateGraph(disabledPlugin, catalog)).includes('config/plugin'));
  });
});

describe('dependency and catalog validation', () => {
  it('reports installed-but-disabled dependencies with actionable paths', () => {
    const graph = removePluginNode(presetToGraph(defaultPreset, catalog), 'core/combat');
    const result = compileGraph(graph, catalog);
    assert.equal(result.ok, false);
    const missing = result.issues.filter((issue) => issue.code === 'plugin/dependency-missing');
    assert.ok(missing.some((issue) => issue.source === 'core/enemies' && issue.path === 'dependencies.core/combat'));
    assert.ok(missing.some((issue) => issue.source === 'core/content' && issue.path === 'dependencies.core/combat'));
    assert.ok(missing.every((issue) => issue.message.includes('installed but not enabled')));
  });

  it('reports unknown plugins and truthful dependency edges', () => {
    const base = presetToGraph(defaultPreset, catalog);
    const unknown = addPluginNode(base, 'test/not-installed');
    assert.ok(issueCodes(validateGraph(unknown, catalog)).includes('plugin/unknown'));

    const falseEdge: GameGraph = {
      ...base,
      edges: [
        ...base.edges,
        {
          id: 'dependency:false',
          type: 'dependency',
          from: pluginNodeId('core/hud'),
          to: pluginNodeId('core/combat'),
        },
      ],
    };
    const issues = validateGraph(falseEdge, catalog);
    assert.ok(issues.some((issue) => issue.code === 'edge/dependency' && issue.source === 'graph'));
  });

  it('reports dependency version mismatches', () => {
    const versionedCatalog: GameGraphCatalog = [
      descriptor(manifest('test/a', { dependencies: { 'test/b': '^2.0.0' } })),
      descriptor(manifest('test/b')),
    ];
    const graph = pluginGraph('test/versions', ['test/a', 'test/b'], [
      {
        id: dependencyEdgeId('test/a', 'test/b'),
        type: 'dependency',
        from: pluginNodeId('test/a'),
        to: pluginNodeId('test/b'),
      },
    ]);
    const issues = validateGraph(graph, versionedCatalog);
    const version = issues.find((issue) => issue.code === 'plugin/dependency-version');
    assert.ok(version);
    assert.equal(version.source, 'test/a');
    assert.match(version.message, /requires "test\/b" \^2\.0\.0, but version 1\.0\.0/);
  });

  it('detects roleDependencies activation cycles', () => {
    const cyclicCatalog: GameGraphCatalog = [
      descriptor(manifest('test/a', { roleDependencies: ['sdk/test'] })),
      descriptor(manifest('test/b', { dependencies: { 'test/a': '^1.0.0' } }), {
        'sdk/test': ['test/provider'],
      }),
    ];
    const base = pluginGraph('test/role-cycle', ['test/a', 'test/b'], [
      {
        id: 'selects:test',
        type: 'selects',
        from: roleNodeId('sdk/test'),
        to: pluginNodeId('test/b'),
        provider: 'test/provider',
      },
    ]);
    const graph: GameGraph = {
      ...base,
      nodes: [...base.nodes, { id: roleNodeId('sdk/test'), type: 'role', role: 'sdk/test' }],
    };
    const result = compileGraph(graph, cyclicCatalog);
    assert.equal(result.ok, false);
    const cycle = result.issues.find((issue) => issue.code === 'plugin/cycle');
    assert.ok(cycle);
    assert.match(cycle.message, /roleDependencies\.sdk\/test/);
    assert.match(cycle.message, /"test\/a" waits for "test\/b"/);
  });

  it('detects dependency cycles', () => {
    const cyclicCatalog: GameGraphCatalog = [
      descriptor(manifest('test/a', { dependencies: { 'test/b': '^1.0.0' } })),
      descriptor(manifest('test/b', { dependencies: { 'test/a': '^1.0.0' } })),
    ];
    const graph = pluginGraph('test/cycle', ['test/a', 'test/b'], [
      {
        id: dependencyEdgeId('test/a', 'test/b'),
        type: 'dependency',
        from: pluginNodeId('test/a'),
        to: pluginNodeId('test/b'),
      },
      {
        id: dependencyEdgeId('test/b', 'test/a'),
        type: 'dependency',
        from: pluginNodeId('test/b'),
        to: pluginNodeId('test/a'),
      },
    ]);
    const result = compileGraph(graph, cyclicCatalog);
    assert.equal(result.ok, false);
    const cycle = result.issues.find((issue) => issue.code === 'plugin/cycle');
    assert.ok(cycle);
    assert.match(cycle.message, /"test\/a" waits for "test\/b"/);
    assert.match(cycle.message, /"test\/b" waits for "test\/a"/);
  });
});

describe('role wiring', () => {
  it('reports a missing required role provider with available providers', () => {
    const base = presetToGraph(defaultPreset, catalog);
    const graph: GameGraph = {
      ...base,
      edges: base.edges.filter((edge) => !(edge.type === 'selects' && edge.from === roleNodeId('sdk/mode'))),
    };
    const issues = validateGraph(graph, catalog);
    const missing = issues.find((issue) => issue.code === 'role/missing' && issue.path === 'roles.sdk/mode');
    assert.ok(missing);
    assert.match(missing.message, /core\/world/);
    assert.match(missing.message, /"core\/objective" \(from "core\/modes"\)/);
  });

  it('rejects a provider the target plugin does not offer', () => {
    const graph = selectRoleProvider(
      presetToGraph(defaultPreset, catalog),
      'sdk/mode',
      'core/objective',
      'core/hud',
    );
    const issues = validateGraph(graph, catalog);
    const provider = issues.find((issue) => issue.code === 'role/provider');
    assert.ok(provider);
    assert.match(provider.message, /plugin "core\/hud" does not offer provider "core\/objective"/);
    assert.match(provider.message, /offered by "core\/modes"/);
  });

  it('rejects duplicate and ambiguous selections', () => {
    const base = presetToGraph(defaultPreset, catalog);
    const withSurvival = addPluginNode(base, 'example/survival');
    const duplicate: GameGraph = {
      ...withSurvival,
      edges: [
        ...withSurvival.edges,
        {
          id: 'selects:duplicate-mode',
          type: 'selects',
          from: roleNodeId('sdk/mode'),
          to: pluginNodeId('example/survival'),
          provider: 'example/survival',
        },
      ],
    };
    const duplicateIssues = validateGraph(duplicate, catalog);
    assert.ok(duplicateIssues.some((issue) => issue.code === 'role/duplicate'));

    const withVisor = addPluginNode(base, 'example/hud');
    const ambiguous: GameGraph = {
      ...withVisor,
      edges: withVisor.edges.filter((edge) => !(edge.type === 'selects' && edge.from === roleNodeId('sdk/hud'))),
    };
    const ambiguousIssues = validateGraph(ambiguous, catalog);
    const ambiguousRole = ambiguousIssues.find((issue) => issue.code === 'role/ambiguous');
    assert.ok(ambiguousRole);
    assert.match(ambiguousRole.message, /core\/hud/);
    assert.match(ambiguousRole.message, /example\/visor-hud/);
  });

  it('reports unknown roles and preserves explicit provider ids on selection edges', () => {
    const graph = selectRoleProvider(
      presetToGraph(defaultPreset, catalog),
      'sdk/not-a-role',
      'test/provider',
      'core/world',
    );
    assert.ok(validateGraph(graph, catalog).some((issue) => issue.code === 'role/unknown'));

    const defaultGraph = presetToGraph(defaultPreset, catalog);
    const selection = defaultGraph.edges.find(
      (edge) => edge.type === 'selects' && edge.from === roleNodeId('sdk/controller'),
    );
    assert.ok(selection && selection.type === 'selects');
    assert.equal(selection.provider, 'core/fps-controller');
    assert.equal(selection.to, pluginNodeId('core/player'));
  });
});

describe('invalid graph data', () => {
  it('never throws for non-object or malformed graphs', () => {
    for (const value of [null, 42, 'graph', [], { schema: 1 }]) {
      const result = compileGraph(value, catalog);
      assert.equal(result.ok, false);
      assert.ok(result.issues.length > 0);
      assert.equal(result.preset, undefined);
    }
    const base = presetToGraph(defaultPreset, catalog);
    assert.doesNotThrow(() => compileGraph({ ...base, schema: 2n }, catalog));
    assert.doesNotThrow(() => compileGraph({ ...base, id: { nested: true } }, catalog));
  });

  it('rejects unsupported schema, ids, seeds and mismatched node ids', () => {
    const base = presetToGraph(defaultPreset, catalog);
    assert.ok(issueCodes(validateGraph({ ...base, schema: 2 }, catalog)).includes('graph/schema'));
    assert.ok(issueCodes(validateGraph({ ...base, id: 'Not Namespaced' }, catalog)).includes('graph/id'));
    assert.ok(issueCodes(validateGraph({ ...base, seed: 1.5 }, catalog)).includes('graph/seed'));
    const wrongNode: GameGraph = {
      ...base,
      nodes: base.nodes.map((node) =>
        node.type === 'plugin' && node.plugin === 'core/world' ? { ...node, id: 'plugin:wrong' } : node,
      ),
    };
    assert.ok(issueCodes(validateGraph(wrongNode, catalog)).includes('node/id'));
  });

  it('reports duplicate catalog ids without throwing', () => {
    const duplicateCatalog: GameGraphCatalog = [
      descriptor(manifest('test/duplicate')),
      descriptor(manifest('test/duplicate')),
    ];
    const graph = pluginGraph('test/catalog', ['test/duplicate'], []);
    const result = compileGraph(graph, duplicateCatalog);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === 'catalog/duplicate'));
  });
});
