const PREFIX = 'shooter-foundation/';
const SETTINGS_KEY = `${PREFIX}settings`;
const PRESET_KEY = `${PREFIX}preset`;

export interface UserSettings {
  schema: 1;
  /** Look sensitivity multiplier, 0.2..3. */
  sensitivity: number;
  /** Master volume 0..1. */
  volume: number;
  /** 1, 1.5 or 2. */
  pixelRatioCap: number;
}

export const DEFAULT_SETTINGS: Readonly<UserSettings> = { schema: 1, sensitivity: 1, volume: 0.6, pixelRatioCap: 1.5 };

const num = (v: unknown, def: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;

export function sanitizeSettings(raw: unknown): UserSettings {
  const d = DEFAULT_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return { ...d };
  const r = raw as Record<string, unknown>;
  if (r.schema !== 1) return { ...d };
  const cap = typeof r.pixelRatioCap === 'number' && Number.isFinite(r.pixelRatioCap) ? r.pixelRatioCap : d.pixelRatioCap;
  // snap to nearest allowed cap
  const caps = [1, 1.5, 2];
  let best = caps[0]!;
  for (const c of caps) if (Math.abs(c - cap) < Math.abs(best - cap)) best = c;
  return {
    schema: 1,
    sensitivity: num(r.sensitivity, d.sensitivity, 0.2, 3),
    volume: num(r.volume, d.volume, 0, 1),
    pixelRatioCap: best,
  };
}

function read(key: string): unknown {
  try {
    const s = globalThis.localStorage?.getItem(key);
    return s == null ? undefined : JSON.parse(s);
  } catch {
    return undefined;
  }
}
function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: ignore */
  }
}

export function loadSettings(): UserSettings {
  return sanitizeSettings(read(SETTINGS_KEY));
}
export function saveSettings(s: UserSettings): void {
  write(SETTINGS_KEY, sanitizeSettings(s));
}

export function loadSelectedPreset(): unknown | undefined {
  const r = read(PRESET_KEY);
  if (typeof r !== 'object' || r === null) return undefined;
  const o = r as { schema?: unknown; preset?: unknown };
  return o.schema === 1 ? o.preset : undefined;
}
export function saveSelectedPreset(preset: unknown): void {
  write(PRESET_KEY, { schema: 1, preset });
}
