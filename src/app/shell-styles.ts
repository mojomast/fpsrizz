/** CSS for the menu/overlay shell. Injected by shell.ts as a single <style> element. */
export const SHELL_CSS = `
.bh-root {
  position: absolute; inset: 0; overflow: hidden; background: #05070a;
  font-family: "Bahnschrift", "Arial Narrow", "Roboto Condensed", "DejaVu Sans Condensed", system-ui, sans-serif;
  color: #cdd6df; user-select: none; -webkit-user-select: none;
  --bh-amber: #ffb000; --bh-amber-dim: #8a6100; --bh-red: #e5392b; --bh-green: #7ed957;
  --bh-panel: #0b1118; --bh-panel2: #111a24; --bh-line: #2a3947; --bh-text: #cdd6df; --bh-mute: #7f8f9f;
  --bh-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace;
}
.bh-root *, .bh-root *::before, .bh-root *::after { box-sizing: border-box; }
.bh-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: #05070a; outline: none; }
.bh-hud, .bh-overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.bh-hud { z-index: 1; }
.bh-overlay { z-index: 2; }
.bh-root[data-hide-layers="1"] .bh-hud, .bh-root[data-hide-layers="1"] .bh-overlay { visibility: hidden; }
.bh-hint {
  position: absolute; z-index: 3; left: 50%; bottom: 9%; transform: translateX(-50%);
  max-width: 90%; padding: 8px 16px; pointer-events: none;
  background: rgba(8,12,17,.85); border: 1px solid var(--bh-amber); color: var(--bh-amber);
  font-size: 14px; letter-spacing: .12em; text-transform: uppercase; text-align: center;
}
.bh-hint[hidden] { display: none; }
.bh-screen {
  position: absolute; inset: 0; z-index: 4; display: none; overflow-y: auto; overflow-x: hidden;
  padding: 24px 16px; user-select: none;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse at 50% 40%, rgba(10,16,24,.78), rgba(2,4,6,.95));
}
.bh-screen[data-active="1"] { display: block; }
.bh-screen[data-kind="pause"], .bh-screen[data-kind="end"] {
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.2) 0 1px, transparent 1px 3px),
    rgba(3,6,10,.68);
}
.bh-screen[data-kind="unsupported"], .bh-screen[data-kind="error"] {
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse at 50% 40%, rgba(24,10,8,.8), rgba(4,2,2,.96));
}
.bh-center { min-height: 100%; display: flex; align-items: center; justify-content: center; }
.bh-panel {
  position: relative; width: 100%; max-width: 640px; margin: auto;
  background: linear-gradient(180deg, var(--bh-panel2), var(--bh-panel));
  border: 2px solid var(--bh-line); box-shadow: 0 0 0 1px #000, 0 12px 40px rgba(0,0,0,.6);
  padding: 22px 26px 18px;
}
.bh-panel.bh-wide { max-width: 760px; }
.bh-panel::before, .bh-panel::after {
  content: ""; position: absolute; left: -2px; right: -2px; height: 8px;
  background: repeating-linear-gradient(-45deg, var(--bh-amber) 0 10px, #10151b 10px 20px);
  border-left: 2px solid #000; border-right: 2px solid #000;
}
.bh-panel::before { top: -10px; }
.bh-panel::after { bottom: -10px; }
.bh-panel[data-tone="danger"]::before, .bh-panel[data-tone="danger"]::after {
  background: repeating-linear-gradient(-45deg, var(--bh-red) 0 10px, #10151b 10px 20px);
}
.bh-panel[data-tone="danger"] { border-color: #5a2a26; }
.bh-title {
  margin: 0; font-weight: 900; text-transform: uppercase; color: var(--bh-amber);
  font-size: 64px; line-height: 1; letter-spacing: .2em; padding-left: .2em; text-align: center;
  text-shadow: 3px 3px 0 #000, 0 0 18px rgba(255,176,0,.25);
}
.bh-sub { margin: 6px 0 14px; text-align: center; color: var(--bh-mute); text-transform: uppercase; letter-spacing: .38em; font-size: 12px; }
.bh-h2 {
  margin: 0 0 14px; font-weight: 900; text-transform: uppercase; letter-spacing: .24em; font-size: 38px;
  text-align: center; color: var(--bh-amber); text-shadow: 2px 2px 0 #000;
}
.bh-h2[data-tone="victory"] { color: var(--bh-green); text-shadow: 2px 2px 0 #000, 0 0 16px rgba(126,217,87,.3); }
.bh-h2[data-tone="defeat"], .bh-h2[data-tone="error"] { color: var(--bh-red); text-shadow: 2px 2px 0 #000, 0 0 16px rgba(229,57,43,.3); }
.bh-label {
  margin: 14px 0 6px; font-size: 11px; letter-spacing: .28em; text-transform: uppercase; color: var(--bh-amber-dim);
  display: flex; align-items: center; gap: 10px; font-weight: 700;
}
.bh-label::after { content: ""; flex: 1; height: 1px; background: var(--bh-line); }
.bh-preset { text-align: center; font-size: 15px; letter-spacing: .16em; text-transform: uppercase; color: var(--bh-text); margin: 0 0 4px; }
.bh-preset b { color: var(--bh-amber); }
.bh-text { margin: 4px 0; font-size: 15px; line-height: 1.45; color: var(--bh-text); text-align: center; }
.bh-objective { text-align: center; font-size: 14px; color: var(--bh-mute); margin: 0; }
.bh-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.bh-table td { padding: 3px 8px; border-bottom: 1px solid #18232e; vertical-align: top; }
.bh-table td:first-child { color: var(--bh-amber); font-family: var(--bh-mono); white-space: nowrap; width: 38%; font-size: 12px; }
.bh-table td:last-child { color: var(--bh-text); text-transform: uppercase; letter-spacing: .06em; font-size: 12px; }
.bh-ctrl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; }
.bh-ext { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.bh-ext li { border: 1px solid var(--bh-line); background: #0a1016; padding: 2px 8px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--bh-mute); }
.bh-settings { display: grid; grid-template-columns: 150px 1fr 52px; gap: 8px 12px; align-items: center; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }
.bh-settings .bh-readout { font-family: var(--bh-mono); color: var(--bh-amber); text-align: right; font-size: 13px; }
.bh-settings select { grid-column: 2 / 4; }
.bh-root input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; background: transparent; margin: 0; cursor: pointer; }
.bh-root input[type=range]::-webkit-slider-runnable-track { height: 6px; background: #05080b; border: 1px solid var(--bh-line); }
.bh-root input[type=range]::-moz-range-track { height: 6px; background: #05080b; border: 1px solid var(--bh-line); }
.bh-root input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 18px; margin-top: -7px; background: var(--bh-amber); border: 1px solid #000; border-radius: 0; }
.bh-root input[type=range]::-moz-range-thumb { width: 10px; height: 16px; background: var(--bh-amber); border: 1px solid #000; border-radius: 0; }
.bh-root select {
  background: #05080b; color: var(--bh-text); border: 1px solid var(--bh-line); border-radius: 0;
  font: inherit; font-size: 13px; padding: 5px 8px; text-transform: uppercase; letter-spacing: .1em; cursor: pointer;
}
.bh-root option { background: #05080b; }
.bh-btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; justify-content: center; }
.bh-btn {
  font: inherit; font-weight: 900; font-size: 16px; text-transform: uppercase; letter-spacing: .22em;
  padding: 11px 26px; min-width: 150px; cursor: pointer; border-radius: 0;
  color: var(--bh-text); background: #0d141c; border: 2px solid #3a4b5c; box-shadow: 3px 3px 0 #000;
}
.bh-btn:hover { background: #16212d; border-color: var(--bh-amber-dim); color: #fff; }
.bh-btn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 #000; }
.bh-btn.bh-primary { background: var(--bh-amber); color: #120c00; border-color: #000; outline: 1px solid var(--bh-amber); font-size: 20px; padding: 12px 44px; }
.bh-btn.bh-primary:hover { background: #ffc233; color: #000; }
.bh-btn.bh-small { font-size: 12px; padding: 8px 16px; min-width: 0; letter-spacing: .18em; }
.bh-btn:focus-visible, .bh-root select:focus-visible, .bh-root input[type=range]:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.bh-foot { margin: 14px 0 0; text-align: center; font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: var(--bh-mute); }
.bh-stats { list-style: none; margin: 14px auto 0; padding: 0; max-width: 420px; font-family: var(--bh-mono); font-size: 14px; }
.bh-stats li { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; }
.bh-stats .k { text-transform: uppercase; color: var(--bh-mute); letter-spacing: .08em; font-size: 12px; }
.bh-stats .d { flex: 1; border-bottom: 1px dotted #33424f; transform: translateY(-3px); }
.bh-stats .v { color: var(--bh-amber); font-weight: 700; }
.bh-errlines {
  margin: 8px 0 0; padding: 10px 12px; max-height: 40vh; overflow: auto; user-select: text; -webkit-user-select: text;
  background: #05080b; border: 1px solid #4a2a26; border-left: 4px solid var(--bh-red);
  font-family: var(--bh-mono); font-size: 12px; line-height: 1.5; color: #f0b8b0; white-space: pre-wrap; word-break: break-word;
}
.bh-errlines div { padding: 1px 0; }
.bh-loading { text-align: center; }
.bh-bar { height: 10px; border: 1px solid var(--bh-line); background: #05080b; margin: 16px auto 0; max-width: 320px; overflow: hidden; position: relative; }
.bh-bar::before {
  content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(-45deg, var(--bh-amber) 0 10px, #3a2a00 10px 20px);
  background-size: 28px 28px; opacity: .85;
}
.bh-creator { position: absolute; z-index: 5; top: 0; right: 0; bottom: 0; pointer-events: none; }
.bh-creator > * { pointer-events: auto; }
@media (max-height: 560px), (max-width: 700px) {
  .bh-screen { padding: 14px 8px; }
  .bh-panel { padding: 14px 14px 12px; }
  .bh-title { font-size: 40px; }
  .bh-h2 { font-size: 28px; margin-bottom: 8px; }
  .bh-sub { margin-bottom: 8px; }
  .bh-btn { padding: 8px 16px; min-width: 110px; font-size: 14px; }
  .bh-btn.bh-primary { font-size: 16px; padding: 9px 28px; }
  .bh-ctrl-grid { grid-template-columns: 1fr; }
  .bh-settings { grid-template-columns: 110px 1fr 44px; }
}
`;
