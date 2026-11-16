export type CinderClassId = 'warden' | 'emberwright' | 'vaultrunner';

export interface CinderClassDefinition {
  readonly id: CinderClassId;
  readonly name: string;
  readonly epithet: string;
  readonly description: string;
  readonly maxHealth: number;
  readonly ap: number;
  /** Additional starting weapon beyond the universal Thornwake/Cinderkey pair. */
  readonly extraWeapon?: string;
  /** Theme visual key used by the overhead player avatar. */
  readonly avatarVisual: string;
  readonly startItems: readonly { readonly id: string; readonly count: number }[];
  readonly damage: number;
  readonly armor: number;
  readonly pulse: number;
}

export const CinderClasses: readonly CinderClassDefinition[] = Object.freeze([
  Object.freeze({
    id: 'warden', name: 'Ash Warden', epithet: 'SHIELD OF THE DEPTHS',
    description: 'A durable front-line delver. More health, iron discipline and a measured three-action turn.',
    maxHealth: 130, ap: 3, avatarVisual: 'player-knight', startItems: [{ id: 'cinder/draught', count: 2 }], damage: 0, armor: 0.1, pulse: 0,
  }),
  Object.freeze({
    id: 'emberwright', name: 'Emberwright', epithet: 'KEEPER OF THE OLD FLAME',
    description: 'A fragile rune-caster carrying an Ashbell into the vault. Ember pulses and explosives hit far harder.',
    maxHealth: 90, ap: 3, extraWeapon: 'cinder/ashbell', avatarVisual: 'player-mage', startItems: [{ id: 'cinder/draught', count: 1 }, { id: 'cinder/ember-flask', count: 1 }],
    damage: 0, armor: 0, pulse: 0.35,
  }),
  Object.freeze({
    id: 'vaultrunner', name: 'Vaultrunner', epithet: 'THE UNSEEN HAND',
    description: 'A quick, under-armored skirmisher with four actions per turn and a Mothspindle already in hand.',
    maxHealth: 85, ap: 4, extraWeapon: 'cinder/mothspindle', avatarVisual: 'player-rogue', startItems: [{ id: 'cinder/draught', count: 1 }, { id: 'cinder/ember-flask', count: 1 }],
    damage: 0.1, armor: 0, pulse: 0,
  }),
]);

export const MasteryThresholds = Object.freeze([20, 50, 90, 140, 200] as const);

export function masteryRank(xp: number): number {
  let rank = 0;
  for (const threshold of MasteryThresholds) if (xp >= threshold) rank++;
  return rank;
}
export function masteryNext(xp: number): number | null {
  return MasteryThresholds.find(threshold => xp < threshold) ?? null;
}
export function masteryBonuses(rank: number): { health: number; damage: number; armor: number; draughts: number } {
  return {
    health: (rank >= 1 ? 5 : 0) + (rank >= 4 ? 5 : 0),
    damage: rank >= 3 ? 0.05 : 0,
    armor: rank >= 5 ? 0.05 : 0,
    draughts: rank >= 2 ? 1 : 0,
  };
}
export function classById(id: string): CinderClassDefinition | undefined {
  return CinderClasses.find(entry => entry.id === id);
}
