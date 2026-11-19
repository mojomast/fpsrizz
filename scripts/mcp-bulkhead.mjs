#!/usr/bin/env node
// Thin MCP server (stdio) for the Bulkhead dev protocol (P2.6). Every dev-protocol method becomes a tool
// (world.query -> world_query, ...); calls are forwarded to the dev server's JSON-RPC bridge. Start the game with
// `npm run dev`, open it in a browser (or let Playwright / Chrome DevTools MCP open it), then register this server:
//   { "command": "node", "args": ["scripts/mcp-bulkhead.mjs"], "env": { "BULKHEAD_RPC": "http://127.0.0.1:5174/rpc" } }
// No dependencies: newline-delimited JSON-RPC 2.0 on stdin/stdout per the MCP stdio transport.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { root } from './tools.mjs';

const RPC = process.env.BULKHEAD_RPC ?? 'http://127.0.0.1:5174/rpc';
const protocol = JSON.parse(readFileSync(resolve(root, 'schemas/dev-protocol.methods.json'), 'utf8'));
const toolName = (m) => m.replace(/\./g, '_');
const tools = Object.entries(protocol.methods).map(([method, m]) => ({ name: toolName(method), description: `${m.description} (dev protocol: ${method})`, inputSchema: { type: 'object', ...m.params } }));
tools.push({ name: 'bridge_status', description: 'Whether the dev bridge is up and a game page is connected.', inputSchema: { type: 'object', properties: {} } });
const byName = new Map(Object.keys(protocol.methods).map((m) => [toolName(m), m]));

let seq = 0;
async function call(method, params) {
  if (method === 'bridge_status') {
    const r = await fetch(RPC.replace(/\/rpc$/, '/status'));
    return r.json();
  }
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }) });
  const res = await r.json();
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.result;
}

const out = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
async function onMessage(msg) {
  const { id, method, params } = msg;
  const reply = (result) => id !== undefined && out({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && out({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'bulkhead-dev', version: '1.0.0' },
        instructions: 'Query, step, tweak and screenshot a running Bulkhead dev build. sim_pause/sim_step make runs deterministic; world_query then entity_get to inspect. Needs `npm run dev` and the game page open.',
      });
    case 'notifications/initialized': case 'notifications/cancelled': return;
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools });
    case 'tools/call': {
      const name = params?.name;
      const method = name === 'bridge_status' ? name : byName.get(name);
      if (!method) return fail(-32602, `unknown tool ${name}`);
      try {
        const result = await call(method, params?.arguments ?? {});
        if (method === 'screenshot' && typeof result?.dataUrl === 'string') {
          return reply({ content: [{ type: 'image', mimeType: 'image/png', data: result.dataUrl.replace(/^data:image\/png;base64,/, '') }] });
        }
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 1) }], structuredContent: result && typeof result === 'object' && !Array.isArray(result) ? result : { result } });
      } catch (e) {
        const hint = e.cause?.code === 'ECONNREFUSED' ? ' (is `npm run dev` running?)' : '';
        return reply({ content: [{ type: 'text', text: `${e.message}${hint}` }], isError: true });
      }
    }
    default:
      if (id !== undefined) fail(-32601, `method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  void onMessage(msg);
});
