#!/usr/bin/env node
import { buildReuseIndex, formatEntry, searchReuse } from './reuse-lib.mjs';

const usage = `Usage: npm run find-reuse -- <words...> [--json] [--limit 1..50] [--type plugin|contract|recipe] [--scope cross-genre|family|presentation|content|unreviewed|contract]
       npm run find-reuse -- --show <plugin-id|recipe-id|SDK-name> [--json]
       npm run find-reuse -- --list [--json]
Searches live source/registration inventory. No sessions are activated.`;
try {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) console.log(usage);
  else {
    const query = [], options = {}; let structured = false, show, list = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--json') structured = true;
      else if (arg === '--list') list = true;
      else if (['--show', '--limit', '--type', '--scope'].includes(arg)) {
        const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
        if (arg === '--show') show = value;
        else if (arg === '--limit') { if (!/^\d+$/.test(value) || +value < 1 || +value > 50) throw new Error('--limit must be 1..50'); options.limit = +value; }
        else options[arg.slice(2)] = value;
      } else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`);
      else query.push(arg);
    }
    if (options.type && !['plugin', 'contract', 'recipe'].includes(options.type)) throw new Error('Unknown --type');
    if (options.scope && !['cross-genre', 'family', 'presentation', 'content', 'unreviewed', 'contract'].includes(options.scope)) throw new Error('Unknown --scope');
    if ([Boolean(show), list, Boolean(query.length)].filter(Boolean).length !== 1) throw new Error('Choose a search query, --show, or --list');
    const index = await buildReuseIndex();
    const matches = show ? index.entries.filter(item => item.id === show || item.name === show) : list ? index.entries.filter(item => (!options.type || item.type === options.type) && (!options.scope || item.scope === options.scope)) : searchReuse(index, query.join(' '), options);
    if (show && !matches.length) throw new Error(`No element ${show}; search by intent first`);
    if (structured) console.log(JSON.stringify({ schema: 1, query: show ?? query.join(' '), sourceDigest: index.sourceDigest, results: matches }, null, 2));
    else if (!matches.length) console.log('No matches. Try a smaller mechanic phrase or --list; inspect SDK contracts and existing examples before deciding a capability is absent.');
    else console.log(matches.map(item => formatEntry(item, Boolean(show))).join('\n\n') + (show ? '' : '\n\nInspect a result: npm run find-reuse -- --show <id>'));
  }
} catch (error) { console.error(`${error.message}\n${usage}`); process.exitCode = 1; }
