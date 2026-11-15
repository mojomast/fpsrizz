import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSource, checkRepo } from '../scripts/boundaries.ts';

type Case = { name: string; file: string; src: string; caps?: string[]; rules: string[] };

const P = 'src/plugins/alpha/index.ts';
const cases: Case[] = [
  // plugin-isolation
  { name: 'plugin -> kernel host is denied', file: P, src: `import { Host } from '../../kernel/host.ts';`, rules: ['plugin-isolation'] },
  { name: 'plugin -> sdk index ok', file: P, src: `import { definePlugin } from '../../sdk/index.ts';`, rules: [] },
  { name: 'plugin -> sdk index from nested dir ok', file: 'src/plugins/alpha/a/b.ts', src: `import { x } from '../../../sdk/index.ts';`, rules: [] },
  { name: 'plugin -> sdk core denied', file: P, src: `import { x } from '../../sdk/core.ts';`, rules: ['plugin-isolation'] },
  { name: 'plugin -> sdk contracts denied', file: P, src: `import type { x } from '../../sdk/contracts/audio.ts';`, rules: ['plugin-isolation'] },
  { name: 'plugin -> own files ok', file: P, src: `import a from './art.ts';\nimport j from './content.json' with { type: 'json' };\nimport b from './sub/b.ts';`, rules: [] },
  { name: 'nested plugin file -> sibling in own plugin ok', file: 'src/plugins/alpha/sub/b.ts', src: `import a from '../art.ts';`, rules: [] },
  { name: 'plugin -> other plugin denied', file: P, src: `import b from '../beta/index.ts';`, rules: ['plugin-isolation'] },
  { name: 'plugin -> plugin with prefix-like name denied', file: P, src: `import b from '../alpha-two/index.ts';`, rules: ['plugin-isolation'] },
  { name: 'plugin -> platform denied', file: P, src: `import b from '../../platform/audio.ts';`, rules: ['plugin-isolation'] },
  { name: 'plugin -> app denied', file: P, src: `import b from '../../app/main.ts';`, rules: ['plugin-isolation'] },
  { name: 'plugin -> bare package denied', file: P, src: `import * as THREE from 'three';`, rules: ['plugin-isolation'] },
  { name: 'plugin escaping via .. denied', file: 'src/plugins/alpha/a/b.ts', src: `import x from '../../../kernel/bus.ts';`, rules: ['plugin-isolation'] },
  // render capability
  { name: 'render import without capability', file: P, src: `import { r } from '../../sdk/render.ts';`, caps: [], rules: ['render-capability'] },
  { name: 'render import with unrelated capability', file: P, src: `import { r } from '../../sdk/render.ts';`, caps: ['audio'], rules: ['render-capability'] },
  { name: 'render import with capability', file: P, src: `import { r } from '../../sdk/render.ts';`, caps: ['render'], rules: [] },
  // kernel
  { name: 'kernel -> kernel ok', file: 'src/kernel/host.ts', src: `import { a } from './bus.ts';\nexport * from './ecs.ts';`, rules: [] },
  { name: 'kernel -> sdk denied', file: 'src/kernel/host.ts', src: `import { a } from '../sdk/index.ts';`, rules: ['kernel-purity'] },
  { name: 'kernel -> platform denied', file: 'src/kernel/host.ts', src: `import { a } from '../platform/audio.ts';`, rules: ['kernel-purity'] },
  { name: 'kernel -> bare package denied', file: 'src/kernel/host.ts', src: `import x from 'node:fs';`, rules: ['kernel-purity'] },
  { name: 'kernel document. denied', file: 'src/kernel/host.ts', src: `const a = 1;\nconst el = document.body;`, rules: ['no-dom-in-kernel'] },
  { name: 'kernel window. denied', file: 'src/kernel/host.ts', src: `window.addEventListener('x', f);`, rules: ['no-dom-in-kernel'] },
  { name: 'kernel document in comment/string ok', file: 'src/kernel/host.ts', src: `// document.body\n/* window.x */ const s = 'document.body'; const t = \`window.foo\`;`, rules: [] },
  { name: 'kernel property named document ok', file: 'src/kernel/host.ts', src: `const a = obj.document.title;`, rules: [] },
  { name: 'dom use outside kernel ok', file: 'src/platform/dom.ts', src: `document.body.append(window.name);`, rules: [] },
  // sdk
  { name: 'sdk -> sdk, kernel ok', file: 'src/sdk/index.ts', src: `export * from './core.ts';\nexport type { A } from '../kernel/host.ts';`, rules: [] },
  { name: 'sdk index -> mini3 denied', file: 'src/sdk/index.ts', src: `import m from '../platform/render/mini3/renderer.ts';`, rules: ['sdk-surface'] },
  { name: 'sdk render -> mini3 ok', file: 'src/sdk/render.ts', src: `import m from '../platform/render/mini3/renderer.ts';`, rules: [] },
  { name: 'sdk render -> other platform denied', file: 'src/sdk/render.ts', src: `import m from '../platform/audio.ts';`, rules: ['sdk-surface'] },
  { name: 'sdk -> plugins denied', file: 'src/sdk/core.ts', src: `import m from '../plugins/alpha/index.ts';`, rules: ['sdk-surface'] },
  { name: 'sdk -> bare denied', file: 'src/sdk/core.ts', src: `import m from 'zod';`, rules: ['sdk-surface'] },
  // platform
  { name: 'platform -> platform/kernel/sdk ok', file: 'src/platform/audio.ts', src: `import a from './render/mini3/x.ts';\nimport b from '../kernel/bus.ts';\nimport c from '../sdk/index.ts';`, rules: [] },
  { name: 'platform -> plugins denied', file: 'src/platform/audio.ts', src: `import a from '../plugins/alpha/index.ts';`, rules: ['platform-layer'] },
  { name: 'platform -> app denied', file: 'src/platform/audio.ts', src: `import a from '../app/main.ts';`, rules: ['platform-layer'] },
  // unrestricted
  { name: 'app unrestricted', file: 'src/app/main.ts', src: `import a from '../plugins/alpha/index.ts';\nimport k from '../kernel/host.ts';\nimport t from 'three';`, rules: [] },
  { name: 'tests unrestricted', file: 'tests/x.test.ts', src: `import a from '../src/kernel/host.ts';`, rules: [] },
  // syntax forms
  { name: 'dynamic import', file: P, src: `const m = await import('../../kernel/host.ts');`, rules: ['plugin-isolation'] },
  { name: 'dynamic import allowed', file: P, src: `const m = await import('./art.ts');`, rules: [] },
  { name: 'side-effect import', file: P, src: `import '../../kernel/host.ts';`, rules: ['plugin-isolation'] },
  { name: 'export from', file: P, src: `export { a } from '../../kernel/host.ts';`, rules: ['plugin-isolation'] },
  { name: 'export star from', file: P, src: `export * from '../../kernel/host.ts';`, rules: ['plugin-isolation'] },
  { name: 'export type from', file: P, src: `export type { A } from '../../kernel/host.ts';`, rules: ['plugin-isolation'] },
  { name: 'export without from ignored', file: P, src: `const a = 1;\nexport { a };\nconst f = 'from';`, rules: [] },
  { name: 'multi-line import clause', file: P, src: `import {\n  a,\n  b as c,\n  type D,\n} from\n  '../../kernel/host.ts';`, rules: ['plugin-isolation'] },
  { name: 'default + namespace/type forms', file: P, src: `import type X from '../../kernel/a.ts';\nimport d, * as ns from '../../kernel/b.ts';`, rules: ['plugin-isolation', 'plugin-isolation'] },
  { name: 'line comment import ignored', file: P, src: `// import a from '../../kernel/host.ts';`, rules: [] },
  { name: 'block comment import ignored', file: P, src: `/*\nimport a from '../../kernel/host.ts';\n*/\nimport b from '../../sdk/index.ts';`, rules: [] },
  { name: 'import text inside string ignored', file: P, src: `const s = "import a from '../../kernel/host.ts'";`, rules: [] },
  { name: 'import.meta ignored', file: P, src: `const u = import.meta.url;`, rules: [] },
];

describe('boundaries: checkSource', () => {
  for (const c of cases) {
    it(c.name, () => {
      const v = checkSource(c.file, c.src, { capabilities: c.caps ?? [] });
      assert.deepEqual(v.map((x) => x.rule), c.rules, JSON.stringify(v));
    });
  }

  it('reports line numbers, specifier and file', () => {
    const v = checkSource(P, `import ok from './a.ts';\n\n// c\nimport bad from '../../kernel/host.ts';`);
    assert.equal(v.length, 1);
    assert.equal(v[0]!.line, 4);
    assert.equal(v[0]!.specifier, '../../kernel/host.ts');
    assert.equal(v[0]!.file, P);
    assert.match(v[0]!.message, /SDK entry point/);
  });

  it('reports line of the specifier for multi-line imports', () => {
    const v = checkSource(P, `import {\n a,\n} from '../../kernel/host.ts';`);
    assert.equal(v[0]!.line, 3);
  });
});

describe('boundaries: real repo', () => {
  it('has zero violations', () => {
    const root = resolve(fileURLToPath(import.meta.url), '../..');
    const v = checkRepo(root);
    assert.equal(v.length, 0, v.map((x) => `${x.file}:${x.line} [${x.rule}] ${x.message}`).join('\n'));
  });
});
