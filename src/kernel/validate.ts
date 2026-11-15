/** Small path-tracking validation helpers for JSON content. No schemas-as-code, no eval. */
export interface Issue {
  /** Content file, pack id or plugin id the problem belongs to. */
  source: string;
  /** Field path, e.g. "spawns[3].prefab". */
  path: string;
  message: string;
}

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9._-]*)+$/;

export class Reporter {
  readonly issues: Issue[];
  readonly source: string;
  readonly path: string;
  constructor(issues: Issue[], source: string, path = '') {
    this.issues = issues;
    this.source = source;
    this.path = path;
  }
  at(key: string | number): Reporter {
    const p = typeof key === 'number' ? `${this.path}[${key}]` : this.path ? `${this.path}.${key}` : key;
    return new Reporter(this.issues, this.source, p);
  }
  error(message: string): undefined {
    this.issues.push({ source: this.source, path: this.path || '(root)', message });
    return undefined;
  }
  get failed(): boolean {
    return this.issues.length > 0;
  }
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function vObject(v: unknown, r: Reporter): Record<string, unknown> | undefined {
  return isObject(v) ? v : r.error(`expected an object, got ${describe(v)}`);
}

export function vString(v: unknown, r: Reporter, opts: { max?: number; nonEmpty?: boolean } = {}): string | undefined {
  if (typeof v !== 'string') return r.error(`expected a string, got ${describe(v)}`);
  if (opts.nonEmpty !== false && v.length === 0) return r.error('must not be empty');
  if (v.length > (opts.max ?? 200)) return r.error(`string is longer than ${opts.max ?? 200} characters`);
  return v;
}

export function vId(v: unknown, r: Reporter): string | undefined {
  const s = vString(v, r);
  if (s === undefined) return undefined;
  return ID_PATTERN.test(s) ? s : r.error(`"${s}" is not a namespaced id like "my-pack/thing" (lowercase letters, digits, "-", with at least one "/")`);
}

export function vNumber(v: unknown, r: Reporter, opts: { min?: number; max?: number; int?: boolean } = {}): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return r.error(`expected a finite number, got ${describe(v)}`);
  if (opts.int && !Number.isInteger(v)) return r.error(`expected an integer, got ${v}`);
  if (opts.min !== undefined && v < opts.min) return r.error(`must be >= ${opts.min}, got ${v}`);
  if (opts.max !== undefined && v > opts.max) return r.error(`must be <= ${opts.max}, got ${v}`);
  return v;
}

export function vBool(v: unknown, r: Reporter): boolean | undefined {
  return typeof v === 'boolean' ? v : r.error(`expected true or false, got ${describe(v)}`);
}

export function vArray(v: unknown, r: Reporter, opts: { max?: number; min?: number } = {}): unknown[] | undefined {
  if (!Array.isArray(v)) return r.error(`expected an array, got ${describe(v)}`);
  if (v.length > (opts.max ?? 4096)) return r.error(`array has ${v.length} items; the limit is ${opts.max ?? 4096}`);
  if (v.length < (opts.min ?? 0)) return r.error(`array needs at least ${opts.min} item(s)`);
  return v;
}

export function vOneOf<T extends string>(v: unknown, r: Reporter, options: readonly T[]): T | undefined {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : r.error(`expected one of ${options.map((o) => `"${o}"`).join(', ')}; got ${describe(v)}`);
}

/** Optional field helper: returns fallback when the key is absent. */
export function opt<T>(v: unknown, fallback: T, read: (v: unknown) => T | undefined): T | undefined {
  return v === undefined ? fallback : read(v);
}

/** Rejects non-JSON values (functions, NaN, cycles are impossible after JSON.parse but imports may be objects). */
export function vJson(v: unknown, r: Reporter, depth = 0): Json | undefined {
  if (depth > 32) return r.error('nesting is deeper than 32 levels');
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : r.error('non-finite number');
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (vJson(v[i], r.at(i), depth + 1) === undefined) return undefined;
    return v as Json[];
  }
  if (isObject(v)) {
    for (const k of Object.keys(v)) if (vJson(v[k], r.at(k), depth + 1) === undefined) return undefined;
    return v as { [k: string]: Json };
  }
  return r.error(`${typeof v} values are not allowed in content`);
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `"${v.length > 40 ? v.slice(0, 40) + '…' : v}"`;
  return typeof v === 'undefined' ? 'nothing (field is missing)' : `a ${typeof v}`;
}

export function formatIssues(issues: readonly Issue[]): string {
  return issues.map((i) => `[${i.source}] ${i.path}: ${i.message}`).join('\n');
}
