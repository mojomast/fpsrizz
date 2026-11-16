import type { Json } from './validate.ts';
import { Reporter, vArray, vId, vJson, vNumber, vObject, vOneOf, vString, isObject } from './validate.ts';
import { isValidRange, parseVersion } from './semver.ts';

export const MANIFEST_SCHEMA = 1;
export const PRESET_SCHEMA = 1;
export const PACK_SCHEMA = 1;

export interface ConfigField {
  type: 'number' | 'boolean' | 'string' | 'select';
  label: string;
  default: Json;
  min?: number;
  max?: number;
  options?: string[];
}

export interface PluginManifest {
  schema: 1;
  id: string;
  name: string;
  version: string;
  /** "code" = trusted compiled module; "content" = data-only pack. */
  kind: 'code' | 'content';
  /** Semver range of the SDK this plugin was written against. */
  sdk: string;
  description: string;
  dependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  conflicts: string[];
  /** Declared intent only (documentation/diagnostics) - NOT a sandbox. */
  capabilities: string[];
  /** Exclusive roles that must have a provider selected by the preset when this plugin is active. */
  requiresRoles: string[];
  /** Selected roles whose owning plugins must activate first. Also requires a selection. Defaults to []. */
  roleDependencies?: string[];
  config: Record<string, ConfigField>;
}

export interface ContentEntry {
  kind: string;
  id: string;
  data: Json;
}

export interface GamePreset {
  schema: 1;
  id: string;
  name: string;
  plugins: string[];
  /** role id -> selected provider id */
  roles: Record<string, string>;
  /** free-form options read by plugins (e.g. "map") */
  options: Record<string, Json>;
  /** plugin id -> config overrides */
  config: Record<string, Record<string, Json>>;
  seed: number;
}

function vRangeMap(v: unknown, r: Reporter): Record<string, string> | undefined {
  if (v === undefined) return {};
  const o = vObject(v, r);
  if (!o) return undefined;
  const out: Record<string, string> = {};
  for (const [k, range] of Object.entries(o)) {
    const id = vId(k, r.at(k));
    const s = vString(range, r.at(k));
    if (id === undefined || s === undefined) return undefined;
    if (!isValidRange(s)) return r.at(k).error(`"${s}" is not a valid version range (use e.g. "^1.0.0", ">=1.2.0 <2.0.0")`);
    out[id] = s;
  }
  return out;
}

function vIdList(v: unknown, r: Reporter, idLike = true): string[] | undefined {
  if (v === undefined) return [];
  const a = vArray(v, r, { max: 64 });
  if (!a) return undefined;
  const out: string[] = [];
  for (let i = 0; i < a.length; i++) {
    const s = idLike ? vId(a[i], r.at(i)) : vString(a[i], r.at(i));
    if (s === undefined) return undefined;
    if (out.includes(s)) return r.at(i).error(`"${s}" is listed twice`);
    out.push(s);
  }
  return out;
}

export function parseManifest(raw: unknown, r: Reporter): PluginManifest | undefined {
  const before = r.issues.length;
  const o = vObject(raw, r);
  if (!o) return undefined;
  if (o.schema !== MANIFEST_SCHEMA) return r.at('schema').error(`unsupported manifest schema ${JSON.stringify(o.schema)}; this build understands schema ${MANIFEST_SCHEMA}`);
  const id = vId(o.id, r.at('id'));
  const name = vString(o.name, r.at('name'), { max: 80 });
  const version = vString(o.version, r.at('version'));
  if (version !== undefined && !parseVersion(version)) r.at('version').error(`"${version}" is not a semantic version like "1.0.0"`);
  const kind = vOneOf(o.kind, r.at('kind'), ['code', 'content'] as const);
  const sdk = vString(o.sdk, r.at('sdk'));
  if (sdk !== undefined && !isValidRange(sdk)) r.at('sdk').error(`"${sdk}" is not a valid version range`);
  const description = o.description === undefined ? '' : vString(o.description, r.at('description'), { max: 400, nonEmpty: false });
  const dependencies = vRangeMap(o.dependencies, r.at('dependencies'));
  const optionalDependencies = vRangeMap(o.optionalDependencies, r.at('optionalDependencies'));
  const conflicts = vIdList(o.conflicts, r.at('conflicts'));
  const capabilities = vIdList(o.capabilities, r.at('capabilities'), false);
  const requiresRoles = vIdList(o.requiresRoles, r.at('requiresRoles'));
  const roleDependencies = vIdList(o.roleDependencies, r.at('roleDependencies'));
  const config: Record<string, ConfigField> = {};
  if (o.config !== undefined) {
    const c = vObject(o.config, r.at('config'));
    if (c)
      for (const [key, f] of Object.entries(c)) {
        const fr = r.at('config').at(key);
        const fo = vObject(f, fr);
        if (!fo) continue;
        const type = vOneOf(fo.type, fr.at('type'), ['number', 'boolean', 'string', 'select'] as const);
        const label = vString(fo.label, fr.at('label'), { max: 80 });
        const def = vJson(fo.default, fr.at('default'));
        if (type === undefined || label === undefined || def === undefined) continue;
        const field: ConfigField = { type, label, default: def };
        if (fo.min !== undefined) field.min = vNumber(fo.min, fr.at('min'));
        if (fo.max !== undefined) field.max = vNumber(fo.max, fr.at('max'));
        if (fo.options !== undefined) field.options = vIdList(fo.options, fr.at('options'), false);
        const err = checkConfigValue(field, def);
        if (err) fr.at('default').error(err);
        config[key] = field;
      }
  }
  if (r.issues.length > before) return undefined;
  if (id! in dependencies!) return r.at('dependencies').error('a plugin cannot depend on itself');
  return { schema: 1, id: id!, name: name!, version: version!, kind: kind!, sdk: sdk!, description: description!, dependencies: dependencies!, optionalDependencies: optionalDependencies!, conflicts: conflicts!, capabilities: capabilities!, requiresRoles: requiresRoles!, roleDependencies: roleDependencies!, config };
}

export function checkConfigValue(field: ConfigField, v: Json): string | undefined {
  switch (field.type) {
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'expected a finite number';
      if (field.min !== undefined && v < field.min) return `must be >= ${field.min}`;
      if (field.max !== undefined && v > field.max) return `must be <= ${field.max}`;
      return undefined;
    case 'boolean':
      return typeof v === 'boolean' ? undefined : 'expected true or false';
    case 'string':
      return typeof v === 'string' ? undefined : 'expected a string';
    case 'select':
      return typeof v === 'string' && (field.options ?? []).includes(v) ? undefined : `expected one of: ${(field.options ?? []).join(', ')}`;
  }
}

export function parsePreset(raw: unknown, r: Reporter): GamePreset | undefined {
  const before = r.issues.length;
  const o = vObject(raw, r);
  if (!o) return undefined;
  if (o.schema !== PRESET_SCHEMA) return r.at('schema').error(`unsupported preset schema ${JSON.stringify(o.schema)}; this build understands schema ${PRESET_SCHEMA}`);
  const id = vId(o.id, r.at('id'));
  const name = vString(o.name, r.at('name'), { max: 80 });
  const plugins = vIdList(o.plugins, r.at('plugins'));
  const roles: Record<string, string> = {};
  const ro = o.roles === undefined ? {} : vObject(o.roles, r.at('roles'));
  if (ro)
    for (const [k, v] of Object.entries(ro)) {
      const rid = vId(k, r.at('roles').at(k));
      const pid = vId(v, r.at('roles').at(k));
      if (rid !== undefined && pid !== undefined) roles[rid] = pid;
    }
  const options: Record<string, Json> = {};
  const oo = o.options === undefined ? {} : vObject(o.options, r.at('options'));
  if (oo)
    for (const [k, v] of Object.entries(oo)) {
      const j = vJson(v, r.at('options').at(k));
      if (j !== undefined) options[k] = j;
    }
  const config: Record<string, Record<string, Json>> = {};
  const co = o.config === undefined ? {} : vObject(o.config, r.at('config'));
  if (co)
    for (const [pid, vals] of Object.entries(co)) {
      const vo = vObject(vals, r.at('config').at(pid));
      const j = vo && vJson(vo, r.at('config').at(pid));
      if (j !== undefined && isObject(j)) config[pid] = j as Record<string, Json>;
    }
  const seed = o.seed === undefined ? 1 : vNumber(o.seed, r.at('seed'), { int: true, min: 0, max: 0xffffffff });
  if (r.issues.length > before) return undefined;
  return { schema: 1, id: id!, name: name!, plugins: plugins!, roles, options, config, seed: seed! };
}

/** Parses the `content` array of a pack: shape only; each entry's data is validated by its content-kind loader. */
export function parseContentEntries(raw: unknown, r: Reporter): ContentEntry[] | undefined {
  const a = vArray(raw, r, { max: 2000 });
  if (!a) return undefined;
  const out: ContentEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < a.length; i++) {
    const er = r.at(i);
    const o = vObject(a[i], er);
    if (!o) continue;
    const kind = vString(o.kind, er.at('kind'), { max: 60 });
    const id = vId(o.id, er.at('id'));
    const data = vJson(o.data, er.at('data'));
    if (kind === undefined || id === undefined || data === undefined) continue;
    if (seen.has(kind + '\n' + id)) {
      er.at('id').error(`duplicate ${kind} id "${id}" inside the same pack`);
      continue;
    }
    seen.add(kind + '\n' + id);
    out.push({ kind, id, data });
  }
  return out;
}
