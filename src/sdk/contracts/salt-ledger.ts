import { defineRegistry, defineService } from '../core.ts';
import type { RelationshipPair } from './relationships.ts';

export interface SaltLocation { id: string; name: string; region: string; description: string; exits: string[] }
export interface SaltQuest { id: string; title: string; target: string; brief: string }
export interface SaltJournalEntry { id: string; title: string; status: 'locked' | 'active' | 'complete'; stage: number; stages: number; instruction: string; location: string; action: string; reward: string }
export interface SaltEnding { id: string; title: string; text: string }
export interface SaltCampaign { name: string; locations: SaltLocation[]; quests: SaltQuest[]; endings: SaltEnding[] }
export interface SaltActor { id: string; name: string; hp: number; maxHp: number; ap: number; x: number; y: number; weapon: string; armor: string; perk: string }
export interface SaltEnemy { id: string; name: string; hp: number; x: number; y: number; damage: number; range: number }
export interface SaltTerrain { x: number; y: number; kind: 'cover' | 'hazard' | 'obstacle' }
export interface SaltBattle { id: string; round: number; enemies: SaltEnemy[]; actors: SaltActor[]; terrain: SaltTerrain[] }
export interface SaltState { location: string; flags: string[]; party: SaltActor[]; active: string[]; xp: number; level: number; pending: number; bag: string[]; journal: SaltJournalEntry[]; bonds: readonly RelationshipPair[]; bondTraining: number; battle: SaltBattle | null; ending: string; message: string; revision: number }
export type SaltCommand = { type: 'travel' | 'interact' | 'choice' | 'recruit' | 'party' | 'equip' | 'use' | 'perk' | 'battle' | 'move' | 'attack' | 'ability' | 'ending' | 'bond'; id: string; target?: string } | { type: 'end-turn' | 'retry' | 'reset' };
export interface SaltLedgerService { readonly campaign: SaltCampaign; state(): SaltState; enqueue(command: SaltCommand): boolean }
export const SaltCampaigns = defineRegistry<SaltCampaign>('salt-campaign');
export const SaltLedger = defineService<SaltLedgerService>('sdk/salt-ledger');
