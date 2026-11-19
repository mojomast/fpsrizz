import { defineEvent, defineRegistry, defineService } from '../../../src/sdk/index.ts';

export interface AdventureAction {
  id: string;
  label: string;
  room: string;
  text: string;
  sound?: string;
  require?: string[];
  missing?: string[];
  items?: string[];
  consume?: string[];
  add?: string[];
  flags?: string[];
  journal?: string;
  move?: string;
  once?: string;
}

export interface AdventureRoom {
  id: string;
  name: string;
  description: string;
  art: string;
  motif: 'tower' | 'shelves' | 'window' | 'none';
}

export interface AdventureItem { name: string; icon?: string }

export interface AdventureChapter {
  version: number;
  name: string;
  subtitle: string;
  tagline: string;
  hint: string;
  portrait?: string;
  start: string;
  intro: string;
  initialFlags?: string[];
  victory: { flag: string; title: string; epilogue: string };
  rooms: AdventureRoom[];
  items: Record<string, AdventureItem>;
  actions: AdventureAction[];
}

export interface AdventureState {
  chapter: string;
  room: string;
  inventory: string[];
  flags: string[];
  journal: string[];
  message: string;
  completed: boolean;
}

export type AdventureCommand = { type: 'action'; id: string } | { type: 'save' | 'load' | 'reset' };
export interface AdventureService {
  readonly chapter: AdventureChapter;
  state(): AdventureState;
  enqueue(command: AdventureCommand): boolean;
}

/** Emitted after an accepted action has committed, never during save replay. */
export const AdventureActionResolved = defineEvent<{ id: string; sound?: string }>('sdk/adventure-action-resolved');
export const AdventureChapters = defineRegistry<AdventureChapter>('adventure-chapter');
export const Adventure = defineService<AdventureService>('sdk/adventure');
