// Minimal ambient declarations for the Node built-ins used by tests (no @types/node available offline).
declare module 'node:test' {
  type Fn = (t?: unknown) => void | Promise<void>;
  export function test(name: string, fn: Fn): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: Fn): void;
  export function beforeEach(fn: Fn): void;
  export function afterEach(fn: Fn): void;
  export function before(fn: Fn): void;
  export function after(fn: Fn): void;
  export default test;
}
declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal(a: unknown, b: unknown, message?: string): void;
    notEqual(a: unknown, b: unknown, message?: string): void;
    deepEqual(a: unknown, b: unknown, message?: string): void;
    notDeepEqual(a: unknown, b: unknown, message?: string): void;
    throws(fn: () => unknown, expected?: unknown, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
    rejects(p: Promise<unknown> | (() => Promise<unknown>), expected?: unknown, message?: string): Promise<void>;
    match(s: string, re: RegExp, message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}
declare module 'node:fs' {
  export function readFileSync(path: string, enc: string): string;
  export function readdirSync(path: string, opts?: unknown): string[];
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { isDirectory(): boolean };
  export function writeFileSync(path: string, data: string): void;
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
}
declare module 'node:path' {
  export function join(...p: string[]): string;
  export function resolve(...p: string[]): string;
  export function relative(a: string, b: string): string;
  export function dirname(p: string): string;
}
declare module 'node:url' { export function fileURLToPath(u: string | URL): string; export function pathToFileURL(p: string): URL; }
declare module 'node:child_process' {
  export function spawnSync(cmd: string, args: string[], opts?: unknown): { status: number | null; stdout: string; stderr: string; error?: Error };
  export function spawn(cmd: string, args: string[], opts?: unknown): {
    stdin: { write(s: string): void } | null;
    stdout: { on(ev: 'data', fn: (chunk: { toString(): string }) => void): void } | null;
    kill(): void;
  };
}
declare const process: {
  argv: string[];
  pid: number;
  execPath: string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  cwd(): string;
};
