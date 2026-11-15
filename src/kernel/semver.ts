/** Minimal semantic-version support: x.y.z versions and ^ ~ >= > <= < = * x ranges joined by spaces (AND) and || (OR). */
export type Version = readonly [number, number, number];

export function parseVersion(s: string): Version | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s.trim());
  if (!m) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

type Cmp = { op: '>=' | '>' | '<' | '<=' | '='; v: Version };

function parsePartial(s: string): (number | undefined)[] | undefined {
  if (s === '' || s === '*' || s === 'x') return [undefined, undefined, undefined];
  const parts = s.split('.');
  if (parts.length > 3) return undefined;
  const out: (number | undefined)[] = [];
  for (let i = 0; i < 3; i++) {
    const p = parts[i];
    if (p === undefined || p === 'x' || p === '*') out.push(undefined);
    else if (/^\d+$/.test(p)) out.push(Number(p));
    else return undefined;
  }
  return out;
}

function comparators(token: string): Cmp[] | undefined {
  const m = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(token)!;
  const op = m[1] ?? '';
  const p = parsePartial(m[2]!);
  if (!p) return undefined;
  const [maj, min, pat] = p;
  const lo: Version = [maj ?? 0, min ?? 0, pat ?? 0];
  if (op === '>=' || op === '>' || op === '<' || op === '<=') return [{ op, v: lo }];
  if (maj === undefined) return [];
  if (op === '^') {
    let hi: Version;
    if (maj > 0 || min === undefined) hi = [maj + 1, 0, 0];
    else if (min > 0 || pat === undefined) hi = [0, min + 1, 0];
    else hi = [0, 0, pat + 1];
    return [{ op: '>=', v: lo }, { op: '<', v: hi }];
  }
  if (op === '~') {
    const hi: Version = min === undefined ? [maj + 1, 0, 0] : [maj, min + 1, 0];
    return [{ op: '>=', v: lo }, { op: '<', v: hi }];
  }
  if (min === undefined) return [{ op: '>=', v: lo }, { op: '<', v: [maj + 1, 0, 0] }];
  if (pat === undefined) return [{ op: '>=', v: lo }, { op: '<', v: [maj, min + 1, 0] }];
  return [{ op: '=', v: lo }];
}

function parseRange(range: string): Cmp[][] | undefined {
  const alts: Cmp[][] = [];
  for (const alt of range.split('||')) {
    const set: Cmp[] = [];
    for (const tok of alt.trim().split(/\s+/)) {
      const c = comparators(tok);
      if (!c) return undefined;
      set.push(...c);
    }
    alts.push(set);
  }
  return alts;
}

export function isValidRange(range: string): boolean {
  return parseRange(range) !== undefined;
}

export function satisfies(version: string, range: string): boolean {
  const v = parseVersion(version);
  const alts = parseRange(range);
  if (!v || !alts) return false;
  return alts.some((set) =>
    set.every((c) => {
      const d = compareVersions(v, c.v);
      return c.op === '>=' ? d >= 0 : c.op === '>' ? d > 0 : c.op === '<' ? d < 0 : c.op === '<=' ? d <= 0 : d === 0;
    }),
  );
}
