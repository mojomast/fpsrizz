import type { CinderThreatId, CinderThreatView } from '../../contracts/cinder.ts';

export const CinderThreats: readonly CinderThreatView[] = Object.freeze([
  Object.freeze({
    id: 'pilgrim', name: 'Pilgrim',
    description: 'Enemies strike softer and fall faster; healing is stronger. Lower legacy reward.',
    enemyDamage: 0.85, enemyHealth: 0.9, eliteChance: 0.03, healing: 1.25, lootBonus: 0, legacyBonus: 0.8,
  }),
  Object.freeze({
    id: 'delver', name: 'Delver',
    description: 'The intended descent. Elite packs appear as the wing deepens.',
    enemyDamage: 1, enemyHealth: 1, eliteChance: 0.1, healing: 1, lootBonus: 0, legacyBonus: 1,
  }),
  Object.freeze({
    id: 'ashbound', name: 'Ashbound',
    description: 'Harsher blows, more elites, leaner healing and extra caches. More legacy if you survive.',
    enemyDamage: 1.2, enemyHealth: 1.1, eliteChance: 0.28, healing: 0.8, lootBonus: 1, legacyBonus: 1.3,
  }),
] as CinderThreatView[]);
export function threatById(id: string): CinderThreatView | undefined {
  return CinderThreats.find(threat => threat.id === id);
}
export function threatRank(id: CinderThreatId): number {
  return Math.max(0, CinderThreats.findIndex(threat => threat.id === id));
}
