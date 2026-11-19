/**
 * In-page end of the dev protocol (P2.6): connects to the dev server's bridge as the "game" and answers JSON-RPC 2.0
 * requests with the dev-tools core. Dev builds only (main.ts imports it lazily behind __DEV__). Reconnects quietly
 * with backoff, so the page works the same with or without the bridge.
 */
import type { DevTools } from '@bulkhead/platform-web/devtools.ts';
import protocol from '../../schemas/dev-protocol.methods.json' with { type: 'json' };

type Req = { jsonrpc?: string; id?: string | number | null; method?: unknown; params?: unknown };
type Res = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

/** Answers one request (notifications without an id get no response). Exported for tests. */
export async function handleRpc(dev: () => Promise<DevTools>, req: Req): Promise<Res | undefined> {
  const id = req.id ?? null;
  const fail = (code: number, message: string): Res => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') return fail(-32600, 'invalid JSON-RPC 2.0 request');
  try {
    let result: unknown;
    if (req.method === 'rpc.discover') result = protocol;
    else {
      const tools = await dev();
      const fn = (tools as unknown as Record<string, ((p: unknown) => unknown) | undefined>)[req.method];
      if (typeof fn !== 'function' || !(req.method in protocol.methods)) return fail(-32601, `unknown method "${req.method}" (see rpc.discover)`);
      const params = req.params ?? {};
      if (typeof params !== 'object' || params === null || Array.isArray(params)) return fail(-32602, 'params must be an object');
      result = await fn.call(tools, params);
    }
    return req.id === undefined ? undefined : { jsonrpc: '2.0', id, result: result ?? null };
  } catch (e) {
    const code = typeof (e as { code?: unknown }).code === 'number' ? (e as { code: number }).code : -32000;
    return fail(code, e instanceof Error ? e.message : String(e));
  }
}

export function connectDevRpc(dev: () => Promise<DevTools>, url: string): { close(): void } {
  let ws: WebSocket | undefined, closed = false, delay = 1000, timer: ReturnType<typeof setTimeout> | undefined;
  const open = (): void => {
    if (closed) return;
    try { ws = new WebSocket(url); } catch { return retry(); }
    ws.onopen = () => { delay = 1000; console.info(`[dev-rpc] connected to ${url}`); };
    ws.onclose = () => retry();
    ws.onerror = () => { /* onclose follows */ };
    ws.onmessage = (ev) => {
      let msg: unknown;
      try { msg = JSON.parse(String(ev.data)); } catch { ws?.send(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })); return; }
      const batch = Array.isArray(msg);
      void Promise.all((batch ? (msg as Req[]) : [msg as Req]).map((r) => handleRpc(dev, r))).then((out) => {
        const res = out.filter((r): r is Res => !!r);
        if (res.length && ws?.readyState === 1) ws.send(JSON.stringify(batch ? res : res[0]));
      });
    };
  };
  const retry = (): void => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(open, delay);
    delay = Math.min(delay * 2, 15000);
  };
  open();
  return { close() { closed = true; clearTimeout(timer); ws?.close(); } };
}
