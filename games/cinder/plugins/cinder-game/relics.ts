import type { CinderRelic } from '../../contracts/cinder.ts';

export const relics: readonly CinderRelic[] = Object.freeze([
  { id: 'power', name: 'Oath of the Blade', description: '+25% weapon and pulse damage. Let the vault remember your name.', icon: 'cinder-power' },
  { id: 'vitality', name: 'Heart of the Undying', description: '+25 maximum health. Recover 35 health now.', icon: 'cinder-vitality' },
  { id: 'shell', name: 'Saint of Iron', description: 'Take 12% less damage. Each rank adds another 12%.', icon: 'cinder-shell' },
  { id: 'siphon', name: 'Ruby Hunger', description: 'Recover 4 health for every enemy you slay.', icon: 'cinder-siphon' },
  { id: 'pulse', name: 'Starless Spark', description: '+20 damage and +2m range to your ember pulse.', icon: 'cinder-pulse' },
  { id: 'bounty', name: 'The Gilded Debt', description: '+3 embers per kill. Embers become legacy when the run ends.', icon: 'cinder-bounty' },
  { id: 'execution', name: 'Executioner\'s Oath', description: '+30% damage to enemies below half health.', icon: 'cinder-power' },
  { id: 'emberheart', name: 'Emberheart', description: 'Recover 2 health at the start of each player turn.', icon: 'cinder-vitality' },
  { id: 'shardfinder', name: 'Shardfinder', description: 'Wardens and elite kills yield an extra Ember Shard.', icon: 'cinder-siphon' },
  { id: 'warpath', name: 'Warpath', description: 'Gain 1 action whenever you personally slay an enemy.', icon: 'cinder-bounty' },
].map(relic => Object.freeze(relic as CinderRelic)));
