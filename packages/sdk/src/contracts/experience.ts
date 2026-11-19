import { defineRole, defineService } from '../core.ts';

/** Optional launcher policy. An absent selection retains the legacy locked-pointer FPS experience. */
export interface ExperienceProvider {
  name: string;
  description: string;
  pointer: 'locked' | 'free' | 'none';
  controls?: readonly (readonly [string, string])[];
}
export const ExperienceRole = defineRole<ExperienceProvider>('sdk/experience');

/** Host-owned ingress gate. UI handlers reject actions when playing is false; commit commands in simulation systems. */
export interface SessionControlService {
  readonly playing: boolean;
}
export const SessionControl = defineService<SessionControlService>('sdk/session-control');
