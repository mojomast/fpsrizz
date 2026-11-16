import { defineService } from '../core.ts';

/** Local profile values, not a saved simulation or run. */
export type ProfileValue = string | boolean | number;
export interface ProfileData { values: Record<string, ProfileValue> }
export type ProfileFailure = 'unavailable' | 'corrupt' | 'incompatible' | 'invalid';
export type ProfileResult<T> = { ok: true; value: T } | { ok: false; reason: ProfileFailure };

/** Synchronous whole-profile replacement; no locking or atomic read-modify-write. */
export interface ProfileService {
  load(): ProfileResult<ProfileData | null>;
  save(profile: ProfileData): ProfileResult<void>;
  clear(): ProfileResult<void>;
}
export const Profile = defineService<ProfileService>('sdk/profile');
