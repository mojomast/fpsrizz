/** Independent test replacement: stable whole-layer expansion, not the default provider's queue or code. */
import { NavigationRole, definePlugin } from '@bulkhead/sdk';
import type { CatalogEntry, NavigationNode, NavigationVisit } from '@bulkhead/sdk';

export const alternateNavigationId = 'test/layer-navigation';

function search(nodes: readonly NavigationNode[], origin: string, maxSteps?: number): readonly NavigationVisit[] {
  if (!Array.isArray(nodes)) throw new TypeError('Expected a graph array');
  if (maxSteps !== undefined && (!Number.isSafeInteger(maxSteps) || maxSteps < 0)) throw new RangeError('Invalid depth');
  const ids: string[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)
      || Object.keys(node).length !== 2 || !Object.hasOwn(node, 'id') || !Object.hasOwn(node, 'neighbors')
      || typeof node.id !== 'string' || node.id.trim().length === 0 || ids.includes(node.id) || !Array.isArray(node.neighbors))
      throw new TypeError('Invalid graph node');
    ids.push(node.id);
  }
  if (typeof origin !== 'string' || !ids.includes(origin)) throw new TypeError('Invalid origin');
  for (const node of nodes) {
    for (const neighbor of node.neighbors) {
      if (typeof neighbor !== 'string' || !ids.includes(neighbor)) throw new TypeError('Invalid graph edge');
    }
  }

  const found: NavigationVisit[] = [{ node: origin, steps: 0, firstStep: origin }];
  let layer = found.slice();
  let steps = 0;
  while (layer.length && (maxSteps === undefined || steps < maxSteps)) {
    steps++;
    const candidates = layer.flatMap(parent => nodes.find(node => node.id === parent.node)!.neighbors.map((node: string) => ({
      node, steps, firstStep: steps === 1 ? node : parent.firstStep,
    })));
    layer = [];
    for (const candidate of candidates) {
      if (found.some(visit => visit.node === candidate.node)) continue;
      found.push(candidate);
      layer.push(candidate);
    }
  }
  return Object.freeze(found.map(visit => Object.freeze(visit)));
}

export const alternateNavigation: CatalogEntry = {
  manifest: {
    schema: 1, id: alternateNavigationId, name: 'Independent layer navigation', version: '1.0.0',
    kind: 'code', sdk: '^2.0.0', dependencies: {}, capabilities: ['simulation'],
  },
  load: async () => ({ default: definePlugin({ register(ctx) {
    ctx.provideRole(NavigationRole, alternateNavigationId, {
      name: 'Stable layers', description: 'Independent test substitution using explicit distance layers', search,
    });
  } }) }),
};
