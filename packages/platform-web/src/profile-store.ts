import type { ProfileData, ProfileFailure, ProfileResult, ProfileService, ProfileValue } from '@bulkhead/sdk/contracts/profile.ts';

export type { ProfileData as Profile, ProfileFailure, ProfileResult, ProfileValue } from '@bulkhead/sdk/contracts/profile.ts';

export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROFILE_KEY = 'shooter-foundation/profile';

const failure = (reason: ProfileFailure): ProfileResult<never> => ({ ok: false, reason });
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

// Copy through entries, including names such as "constructor", without prototype setters.
function copyValues(value: unknown): Record<string, ProfileValue> | undefined {
  if (!isObject(value)) return undefined;
  const entries: [string, ProfileValue][] = [];
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(key)) return undefined;
    if (typeof item !== 'string' && typeof item !== 'boolean' &&
        !(typeof item === 'number' && Number.isFinite(item))) return undefined;
    entries.push([key, item]);
  }
  return Object.fromEntries(entries);
}

/**
 * Storage is supplied by the caller (or null when unavailable). Each operation
 * is synchronous. No cache, locking, cross-tab coordination, or atomic update
 * protocol is provided. save replaces the complete profile, but refuses to
 * overwrite unreadable or unsupported existing data; clear is explicit.
 */
export function createProfileStore(storage: ProfileStorage | null, key = PROFILE_KEY): ProfileService {
  function load(): ProfileResult<ProfileData | null> {
    if (!storage) return failure('unavailable');
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      return failure('unavailable');
    }
    if (raw === null) return { ok: true, value: null };
    try {
      const data: unknown = JSON.parse(raw);
      if (!isObject(data) || !Number.isSafeInteger(data.schema) || (data.schema as number) < 1) {
        return failure('corrupt');
      }
      if (data.schema !== 1) return failure('incompatible');
      if (Object.keys(data).some(k => k !== 'schema' && k !== 'values')) return failure('corrupt');
      const values = copyValues(data.values);
      return values ? { ok: true, value: { values } } : failure('corrupt');
    } catch {
      return failure('corrupt');
    }
  }

  function save(profile: ProfileData): ProfileResult<void> {
    let values: Record<string, ProfileValue> | undefined;
    try {
      if (!isObject(profile) || Object.keys(profile).some(k => k !== 'values')) return failure('invalid');
      values = copyValues(profile.values);
    } catch {
      return failure('invalid');
    }
    if (!values) return failure('invalid');
    const existing = load();
    if (!existing.ok) return existing;
    try {
      storage!.setItem(key, JSON.stringify({ schema: 1, values }));
      return { ok: true, value: undefined };
    } catch {
      return failure('unavailable');
    }
  }

  function clear(): ProfileResult<void> {
    if (!storage) return failure('unavailable');
    try {
      storage.removeItem(key);
      return { ok: true, value: undefined };
    } catch {
      return failure('unavailable');
    }
  }

  return { load, save, clear };
}
