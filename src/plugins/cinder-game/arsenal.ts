import type { CinderWeapon } from '../../sdk/index.ts';

/** Presentation metadata for the six-weapon armory. Gameplay names, slots and attack stats remain content-defined. */
export interface CinderArsenalEntry {
  readonly id: string;
  readonly description: string;
  readonly icon: string;
}

export const cinderArsenal: readonly CinderArsenalEntry[] = Object.freeze([
  { id: 'cinder/thornwake', icon: 'weapons/fantasy/01_thornwake.png', description: 'A witchglass knife. Quick, silent and unlimited — but you must get close.' },
  { id: 'cinder/cinderkey', icon: 'weapons/fantasy/02_cinderkey.png', description: 'A brass-and-ash sidearm. Eight rounds, steady damage and a fast reload.' },
  { id: 'cinder/mothspindle', icon: 'weapons/fantasy/03_mothspindle.png', description: 'A chattering hex-spindle. Each action fires a three-round burst from its 28-round coil.' },
  { id: 'cinder/briarward', icon: 'weapons/fantasy/04_briarward.png', description: 'A heavy repeating relic. Each action fires two harder-hitting rounds with a tighter spread.' },
  { id: 'cinder/faroracle', icon: 'weapons/fantasy/05_faroracle.png', description: 'A long-eye oracle. Five punishing shots built to unmake the Keeper.' },
  { id: 'cinder/ashbell', icon: 'weapons/fantasy/06_ashbell.png', description: 'A rocket reliquary. Two ember bells per load; slow, explosive and loud.' },
].map(entry => Object.freeze(entry)));

export function weaponView(id: string, slot: number, name: string, summary: string, stats: string): CinderWeapon {
  return Object.freeze({ id, slot, name, description: summary, stats, icon: cinderArsenal.find(w => w.id === id)!.icon });
}
