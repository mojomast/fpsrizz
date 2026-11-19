#!/usr/bin/env node
// Fails when a relative link in a tracked Markdown file points at a file that does not exist.
// Usage: node scripts/check-links.mjs   (part of `npm run check`)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '*.md'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter((f) => f && existsSync(resolve(root, f)));
const LINK = /\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)|^\s*\[[^\]]+\]:\s*(\S+)/gm;
const broken = [];
for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(LINK)) {
    const target = (m[1] ?? m[2]).split('#')[0];
    if (!target || /^([a-z][a-z0-9+.-]*:|\/|\{)/i.test(target)) continue;
    let path;
    try { path = posix.normalize(posix.join(posix.dirname(file), decodeURI(target))); } catch { path = target; }
    if (!existsSync(resolve(root, path))) broken.push(`${file}: ${m[1] ?? m[2]}`);
  }
}
if (broken.length) {
  console.error(`${broken.length} broken relative Markdown link(s):\n  ${broken.join('\n  ')}`);
  process.exit(1);
}
console.log(`docs links OK (${files.length} Markdown files)`);
