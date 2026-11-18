import { createShell } from '../../src/app/shell.ts';
import type { Shell, ShellSettings } from '../../src/app/shell.ts';

const log: string[] = [];
const w = window as unknown as Record<string, unknown>;
w['__log'] = log;
const root = document.getElementById('app') as HTMLElement;
const init: ShellSettings = { sensitivity: 1, volume: 0.6, musicVolume: 0.7, effectsVolume: 1, pixelRatioCap: 1.5 };
const shell: Shell = createShell(
  root,
  {
    onPlay: () => log.push('play'),
    onResume: () => log.push('resume'),
    onRestart: () => log.push('restart'),
    onQuitToMenu: () => log.push('menu'),
    onSettingsChange: (s) => log.push('settings:' + JSON.stringify(s)),
    onOpenCreator: () => log.push('creator'),
  },
  init,
);
w['__shell'] = shell;
w['__createShell'] = createShell;
const c = shell.canvas;
function paint(): void {
  c.width = 1280; c.height = 720;
  const g = c.getContext('2d');
  if (!g) return;
  const gr = g.createLinearGradient(0, 0, 1280, 720);
  gr.addColorStop(0, '#3b5a3a'); gr.addColorStop(0.5, '#8a4a2a'); gr.addColorStop(1, '#1d2b55');
  g.fillStyle = gr; g.fillRect(0, 0, 1280, 720);
  g.fillStyle = '#fff'; g.font = '40px monospace'; g.fillText('CANVAS (game view)', 60, 120);
  g.fillRect(620, 350, 40, 4); g.fillRect(638, 332, 4, 40);
}
paint();
const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;left:20px;bottom:20px;color:#7f7;font:bold 28px monospace';
hud.textContent = 'HP 100  AMMO 48';
shell.hudLayer.appendChild(hud);
const ov = document.createElement('div');
ov.style.cssText = 'position:absolute;inset:0;box-shadow:inset 0 0 120px rgba(255,0,0,.45)';
shell.overlayLayer.appendChild(ov);
