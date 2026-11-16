export const COMPOSER_CSS = `
.game-composer {
  --gc-amber:#ffb000; --gc-dim:#8a6100; --gc-green:#7ed957; --gc-red:#e5392b; --gc-blue:#6fb7ff;
  --gc-panel:#0b1118; --gc-panel2:#111a24; --gc-line:#2a3947; --gc-text:#cdd6df; --gc-mute:#7f8f9f;
  --gc-mono:ui-monospace,"SFMono-Regular",Menlo,Consolas,"DejaVu Sans Mono",monospace;
  position:fixed; inset:0; z-index:80; display:none; color:var(--gc-text);
  background:#05080b; font-family:"Bahnschrift","Arial Narrow","Roboto Condensed","DejaVu Sans Condensed",system-ui,sans-serif;
  font-size:12px; line-height:1.4; pointer-events:auto;
}
.game-composer.open { display:flex; flex-direction:column; }
.game-composer * { box-sizing:border-box; }
.gc-head { flex:none; display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:2px solid var(--gc-line); background:#080d13; }
.gc-head::before { content:""; width:15px; height:15px; background:repeating-linear-gradient(-45deg,var(--gc-amber) 0 4px,#10151b 4px 8px); border:1px solid #000; }
.gc-title { font-size:15px; font-weight:900; letter-spacing:.24em; text-transform:uppercase; color:var(--gc-amber); margin:0; }
.gc-head .gc-id { color:var(--gc-mute); font:10px var(--gc-mono); margin-left:4px; }
.gc-spacer { flex:1; }
.gc-btn { font:inherit; font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; padding:6px 9px; cursor:pointer; color:var(--gc-text); background:#0d141c; border:2px solid #3a4b5c; box-shadow:2px 2px 0 #000; }
.gc-btn:hover:not(:disabled) { border-color:var(--gc-amber-dim); color:#fff; background:#16212d; }
.gc-btn:disabled { opacity:.4; cursor:not-allowed; }
.gc-btn.primary { background:var(--gc-amber); color:#120c00; border-color:#000; }
.gc-btn.danger { border-color:#7a2a24; color:#ff8b80; }
.gc-btn.small { font-size:9px; padding:3px 6px; box-shadow:1px 1px 0 #000; }
.gc-main { flex:1; min-height:0; display:grid; grid-template-columns:230px 1fr 300px; }
.gc-panel { min-height:0; overflow:auto; background:var(--gc-panel); border-right:1px solid var(--gc-line); }
.gc-panel.right { border-right:0; border-left:1px solid var(--gc-line); }
.gc-panel-head { position:sticky; top:0; z-index:2; padding:8px 10px; background:#080d13; border-bottom:1px solid var(--gc-line); color:var(--gc-dim); text-transform:uppercase; letter-spacing:.18em; font-size:10px; font-weight:800; }
.gc-search { width:100%; margin-top:6px; background:#05080b; color:var(--gc-text); border:1px solid var(--gc-line); font:11px var(--gc-mono); padding:5px; }
.gc-palette-list { display:flex; flex-direction:column; gap:2px; padding:7px; }
.gc-palette-item { display:grid; grid-template-columns:1fr auto; gap:5px; align-items:center; width:100%; border:1px solid transparent; background:transparent; color:var(--gc-text); padding:4px 5px; cursor:pointer; text-align:left; font:inherit; }
.gc-palette-item:hover { border-color:#3a4b5c; background:#111a24; }
.gc-palette-item.enabled { opacity:.5; }
.gc-palette-item strong { display:block; font-size:11px; font-weight:600; }
.gc-palette-item small { display:block; font:9px var(--gc-mono); color:var(--gc-mute); }
.gc-stage { position:relative; min-width:0; min-height:0; overflow:hidden; background:radial-gradient(circle at 50% 30%,#14202a 0,#071016 70%); }
#gc-svg { width:100%; height:100%; display:block; touch-action:none; cursor:grab; }
#gc-svg.panning { cursor:grabbing; }
.gc-hint { position:absolute; left:12px; bottom:10px; color:var(--gc-mute); background:#071016c9; border:1px solid #2a3947; padding:5px 8px; font:10px var(--gc-mono); pointer-events:none; }
.gc-legend { position:absolute; right:12px; bottom:10px; display:flex; gap:12px; color:var(--gc-mute); font:9px var(--gc-mono); background:#071016c9; border:1px solid #2a3947; padding:5px 8px; pointer-events:none; }
.gc-legend i { display:inline-block; width:18px; height:2px; vertical-align:middle; margin-right:4px; }
.gc-inspector { padding:10px; display:flex; flex-direction:column; gap:10px; }
.gc-inspector h2 { font-size:17px; font-weight:500; color:#edf2f6; margin:0; }
.gc-inspector h3 { font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--gc-dim); margin:12px 0 5px; border-bottom:1px solid var(--gc-line); padding-bottom:3px; }
.gc-idline { font:10px var(--gc-mono); color:var(--gc-blue); overflow-wrap:anywhere; }
.gc-desc { color:var(--gc-mute); font-size:11px; line-height:1.5; }
.gc-field { display:grid; grid-template-columns:1fr; gap:3px; margin:7px 0; }
.gc-field label { color:var(--gc-mute); font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
.gc-field input, .gc-field select, .gc-field textarea { width:100%; background:#05080b; color:var(--gc-text); border:1px solid var(--gc-line); font:11px var(--gc-mono); padding:4px 5px; }
.gc-field input[type=checkbox] { width:auto; }
.gc-field textarea { min-height:72px; resize:vertical; }
.gc-role { display:flex; align-items:center; gap:6px; margin:4px 0; font:10px var(--gc-mono); color:var(--gc-mute); }
.gc-role select { flex:1; min-width:0; background:#05080b; color:var(--gc-text); border:1px solid var(--gc-line); font:10px var(--gc-mono); padding:3px; }
.gc-issues { display:flex; flex-direction:column; gap:4px; max-height:180px; overflow:auto; }
.gc-issue { padding:4px 6px; border-left:3px solid var(--gc-red); background:#0e0807; color:#f0b8b0; font:10px/1.4 var(--gc-mono); cursor:pointer; }
.gc-issue.warn { border-left-color:var(--gc-amber); background:#0d0a03; color:#f0d79a; }
.gc-issue.ok { border-left-color:var(--gc-green); background:#0b140a; color:#bfe8ad; }
.gc-empty { color:var(--gc-mute); font-style:italic; }
.gc-option-note { color:var(--gc-mute); font-size:10px; }
@media(max-width:960px){ .gc-main { grid-template-columns:190px 1fr 250px; } }
@media(max-width:720px){ .gc-main { grid-template-columns:1fr; grid-template-rows:180px 1fr 240px; } .gc-panel { border-right:0; border-bottom:1px solid var(--gc-line); } .gc-panel.right { border-left:0; border-top:1px solid var(--gc-line); } .gc-head .gc-id { display:none; } .gc-hint,.gc-legend { display:none; } }
`;
