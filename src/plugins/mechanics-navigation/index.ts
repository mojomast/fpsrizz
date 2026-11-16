import { NavigationRole, definePlugin, isObject } from '../../sdk/index.ts';
import type { NavigationNode, NavigationVisit } from '../../sdk/index.ts';

function search(nodes: readonly NavigationNode[], origin: string, maxSteps?: number): readonly NavigationVisit[] {
  if (!Array.isArray(nodes)) throw new TypeError('Navigation nodes must be an array');
  if (maxSteps !== undefined && (!Number.isSafeInteger(maxSteps) || maxSteps < 0))
    throw new RangeError('Navigation maxSteps must be a nonnegative safe integer');
  const graph = new Map<string, readonly string[]>();
  for (const [index, node] of nodes.entries()) {
    if (!isObject(node) || Object.keys(node).length !== 2 || !Object.hasOwn(node, 'id') || !Object.hasOwn(node, 'neighbors')
      || typeof node.id !== 'string' || !node.id.trim() || !Array.isArray(node.neighbors))
      throw new TypeError(`Navigation nodes[${index}] must contain only a nonblank id and a neighbors array`);
    if (graph.has(node.id)) throw new TypeError(`Navigation nodes[${index}] has duplicate id "${node.id}"`);
    graph.set(node.id, node.neighbors);
  }
  for (const [id, neighbors] of graph) {
    for (const neighbor of neighbors) {
      if (typeof neighbor !== 'string' || !graph.has(neighbor))
        throw new TypeError(`Navigation node "${id}" has an undeclared neighbor "${String(neighbor)}"`);
    }
  }
  if (typeof origin !== 'string' || !graph.has(origin)) throw new TypeError('Navigation origin must name a declared node');

  const visits: NavigationVisit[] = [Object.freeze({ node: origin, steps: 0, firstStep: origin })];
  const seen = new Set([origin]);
  for (let index = 0; index < visits.length; index++) {
    const visit = visits[index]!;
    if (maxSteps !== undefined && visit.steps >= maxSteps) continue;
    for (const node of graph.get(visit.node)!) {
      if (seen.has(node)) continue;
      seen.add(node);
      visits.push(Object.freeze({ node, steps: visit.steps + 1, firstStep: visit.steps === 0 ? node : visit.firstStep }));
    }
  }
  return Object.freeze(visits);
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(NavigationRole, 'mechanics/navigation', Object.freeze({
      name: 'Ordered graph navigation',
      description: 'Deterministic unit-edge distances and first hops over caller-supplied legal adjacency.',
      search,
    }));
  },
});
