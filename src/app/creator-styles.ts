/** CSS for the creator/developer panel. Injected by creator.ts as a single <style> element (removed on dispose). */
export const CREATOR_CSS = `
.creator-panel {
  --c-amber: #ffb000; --c-amber-dim: #8a6100; --c-red: #e5392b; --c-green: #7ed957; --c-blue: #6fb7ff;
  --c-panel: #0b1118; --c-panel2: #111a24; --c-line: #2a3947; --c-text: #cdd6df; --c-mute: #7f8f9f;
  --c-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace;
  position: relative; display: flex; flex-direction: column; width: min(460px, 100vw); height: 100%;
  pointer-events: auto; box-sizing: border-box; color: var(--c-text); text-align: left;
  font-family: "Bahnschrift", "Arial Narrow", "Roboto Condensed", "DejaVu Sans Condensed", system-ui, sans-serif;
  font-size: 12px; line-height: 1.4;
  background: linear-gradient(180deg, var(--c-panel2), var(--c-panel) 30%);
  border-left: 2px solid var(--c-line); box-shadow: -8px 0 28px rgba(0,0,0,.55), -1px 0 0 #000;
  user-select: text; -webkit-user-select: text; cursor: default;
}
.creator-panel[hidden] { display: none; }
.creator-panel *, .creator-panel *::before, .creator-panel *::after { box-sizing: border-box; }
.creator-head { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-bottom: 2px solid var(--c-line); background: #080d13; flex: none; }
.creator-head::before { content: ""; width: 14px; height: 14px; flex: none; background: repeating-linear-gradient(-45deg, var(--c-amber) 0 4px, #10151b 4px 8px); border: 1px solid #000; }
.creator-title { margin: 0; flex: 1; font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: .24em; color: var(--c-amber); }
.creator-hint { color: var(--c-mute); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
.creator-tabs { display: flex; flex: none; border-bottom: 2px solid var(--c-line); background: #080d13; }
.creator-tab {
  flex: 1; font: inherit; font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; padding: 9px 4px; white-space: nowrap;
  color: var(--c-mute); background: transparent; border: 0; border-right: 1px solid var(--c-line); border-bottom: 3px solid transparent; cursor: pointer; border-radius: 0;
}
.creator-tab:last-child { border-right: 0; }
.creator-tab:hover { color: #fff; background: #101822; }
.creator-tab[aria-selected="true"] { color: var(--c-amber); border-bottom-color: var(--c-amber); background: #0d141c; }
.creator-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 12px 16px; scrollbar-color: #3a4b5c #05080b; scrollbar-width: thin; }
.creator-foot { flex: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 9px 12px; border-top: 2px solid var(--c-line); background: #080d13; }
.creator-foot[hidden] { display: none; }
.creator-h { margin: 16px 0 6px; display: flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .24em; color: var(--c-amber-dim); }
.creator-h::after { content: ""; flex: 1; height: 1px; background: var(--c-line); }
.creator-note { margin: 8px 0 0; color: var(--c-mute); font-size: 11.5px; }
.creator-mono { font-family: var(--c-mono); }
.creator-btn {
  font: inherit; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: .14em; padding: 7px 12px; cursor: pointer; border-radius: 0;
  color: var(--c-text); background: #0d141c; border: 2px solid #3a4b5c; box-shadow: 2px 2px 0 #000;
}
.creator-btn:hover:not(:disabled) { background: #16212d; border-color: var(--c-amber-dim); color: #fff; }
.creator-btn:active:not(:disabled) { transform: translate(1px,1px); box-shadow: 1px 1px 0 #000; }
.creator-btn:disabled { opacity: .45; cursor: not-allowed; }
.creator-btn.creator-primary { background: var(--c-amber); color: #120c00; border-color: #000; outline: 1px solid var(--c-amber); }
.creator-btn.creator-primary:hover:not(:disabled) { background: #ffc233; color: #000; }
.creator-btn.creator-small { padding: 3px 8px; font-size: 10px; letter-spacing: .1em; box-shadow: 1px 1px 0 #000; }
.creator-btn.creator-close { padding: 2px 9px; font-size: 16px; line-height: 1.1; letter-spacing: 0; }
.creator-panel button:focus-visible, .creator-panel select:focus-visible, .creator-panel input:focus-visible, .creator-panel textarea:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
.creator-panel select, .creator-panel input[type=text], .creator-panel input[type=number], .creator-panel textarea {
  font: inherit; font-size: 12px; color: var(--c-text); background: #05080b; border: 1px solid var(--c-line); border-radius: 0; padding: 4px 6px; max-width: 100%;
}
.creator-panel select { cursor: pointer; text-overflow: ellipsis; }
.creator-panel option { background: #05080b; }
.creator-panel option:disabled { color: #5d6b78; }
.creator-panel input:invalid { border-color: var(--c-red); }
.creator-panel input[type=checkbox] { accent-color: var(--c-amber); width: 15px; height: 15px; margin: 0; cursor: pointer; }
.creator-panel input[type=file] { font: inherit; font-size: 11px; color: var(--c-mute); max-width: 100%; }
.creator-panel input[type=file]::file-selector-button { font: inherit; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; margin-right: 8px; padding: 5px 10px; color: var(--c-text); background: #0d141c; border: 2px solid #3a4b5c; border-radius: 0; cursor: pointer; }
.creator-panel textarea { width: 100%; resize: vertical; font-family: var(--c-mono); font-size: 11px; line-height: 1.4; white-space: pre; overflow: auto; }
.creator-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.creator-row > label, .creator-field > label { flex: none; color: var(--c-mute); text-transform: uppercase; letter-spacing: .1em; font-size: 11px; }
.creator-row select { flex: 1; min-width: 0; }
.creator-fields { display: grid; grid-template-columns: 112px 1fr; gap: 6px 10px; align-items: center; }
.creator-fields > label { color: var(--c-mute); text-transform: uppercase; letter-spacing: .1em; font-size: 11px; }
.creator-fields select, .creator-fields input[type=text], .creator-fields input[type=number] { width: 100%; min-width: 0; }
.creator-cfg { margin: 8px 0 0; border: 1px solid var(--c-line); background: #090f15; }
.creator-cfg > h4 { margin: 0; padding: 4px 8px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--c-amber); background: #0d151d; border-bottom: 1px solid var(--c-line); font-weight: 800; }
.creator-cfg > h4 span { color: var(--c-mute); font-family: var(--c-mono); letter-spacing: 0; text-transform: none; font-weight: 400; margin-left: 6px; }
.creator-cfg .creator-fields { padding: 8px; grid-template-columns: minmax(0, 1fr) 150px; }
.creator-cfg .creator-fields > label small { display: block; font-family: var(--c-mono); letter-spacing: 0; text-transform: none; color: #566574; font-size: 10px; }
.creator-table { width: 100%; border-collapse: collapse; font-size: 11.5px; table-layout: auto; }
.creator-table th { text-align: left; padding: 3px 5px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: var(--c-amber-dim); border-bottom: 1px solid var(--c-line); white-space: nowrap; }
.creator-table td { padding: 3px 5px; vertical-align: top; border-bottom: 1px solid #18232e; overflow-wrap: anywhere; }
.creator-table td.creator-num, .creator-table th.creator-num { text-align: right; font-family: var(--c-mono); white-space: nowrap; }
.creator-table td.creator-id { white-space: nowrap; font-family: var(--c-mono); font-size: 11px; color: var(--c-text); }
.creator-plugins td { padding-top: 5px; }
.creator-plugins tr.creator-detail td { padding: 0 5px 6px 29px; border-bottom: 1px solid #1d2a37; color: var(--c-mute); font-size: 11px; }
.creator-plugins tr.creator-main td { border-bottom: 0; }
.creator-plugins tr[data-changed="1"] td:first-child { box-shadow: inset 3px 0 0 var(--c-amber); }
.creator-pname { font-weight: 700; color: #e6edf3; }
.creator-pid { font-family: var(--c-mono); font-size: 10.5px; color: var(--c-mute); }
.creator-tag { display: inline-block; padding: 0 5px; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; border: 1px solid var(--c-line); color: var(--c-mute); background: #0a1016; white-space: nowrap; }
.creator-badge { display: inline-block; padding: 0 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; border: 1px solid; white-space: nowrap; }
.creator-badge[data-s="active"] { color: var(--c-green); border-color: #3c6a28; background: #0f1a0b; }
.creator-badge[data-s="inactive"] { color: var(--c-mute); border-color: var(--c-line); background: #0a1016; }
.creator-badge[data-s="error"] { color: #ff8b80; border-color: #7a2a24; background: #1a0c0a; }
.creator-deps { color: var(--c-mute); }
.creator-deps b { font-family: var(--c-mono); font-weight: 400; color: #9fb0c0; }
.creator-box { margin: 8px 0 0; padding: 7px 10px; border: 1px solid var(--c-line); border-left: 4px solid var(--c-mute); background: #080d12; font-size: 12px; }
.creator-box[data-k="ok"] { border-left-color: var(--c-green); color: #bfe8ad; }
.creator-box[data-k="error"] { border-left-color: var(--c-red); border-color: #4a2a26; background: #0e0807; }
.creator-box[data-k="warn"] { border-left-color: var(--c-amber); border-color: #4a3600; background: #0d0a03; color: #f0d79a; }
.creator-box[data-k="info"] { border-left-color: var(--c-blue); }
.creator-box strong { display: block; text-transform: uppercase; letter-spacing: .1em; font-size: 11px; margin-bottom: 2px; }
.creator-box[data-k="error"] strong { color: #ff8b80; }
.creator-box[data-k="ok"] strong { color: var(--c-green); }
.creator-box[data-k="warn"] strong { color: var(--c-amber); }
.creator-box p { margin: 2px 0; }
.creator-box .creator-actions { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
.creator-issues { margin: 4px 0 0; padding: 0; list-style: none; font-family: var(--c-mono); font-size: 11px; max-height: 260px; overflow: auto; }
.creator-issues li { padding: 3px 0; border-top: 1px solid #2a1a18; color: #f0b8b0; overflow-wrap: anywhere; }
.creator-issues li:first-child { border-top: 0; }
.creator-issues .creator-src { color: var(--c-amber); }
.creator-issues .creator-path { color: #9fb0c0; }
.creator-inline-msg { margin-top: 4px; padding: 4px 8px; border-left: 3px solid var(--c-amber); background: #0d0a03; color: #f0d79a; font-size: 11px; }
.creator-inline-msg.creator-bad { border-left-color: var(--c-red); background: #0e0807; color: #f0b8b0; }
.creator-inline-msg .creator-actions { margin-top: 4px; }
.creator-kv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.creator-kv { margin: 0; padding: 0; list-style: none; font-family: var(--c-mono); font-size: 11px; }
.creator-kv h4 { margin: 0 0 3px; font-family: inherit; font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: var(--c-amber-dim); font-weight: 800; }
.creator-kv li { display: flex; gap: 6px; align-items: baseline; padding: 1px 0; }
.creator-kv .k { color: var(--c-mute); white-space: nowrap; }
.creator-kv .d { flex: 1; border-bottom: 1px dotted #33424f; transform: translateY(-3px); min-width: 6px; }
.creator-kv .v { color: var(--c-amber); font-weight: 700; text-align: right; }
.creator-scrolltable { max-height: 190px; overflow: auto; border: 1px solid #18232e; scrollbar-width: thin; scrollbar-color: #3a4b5c #05080b; }
.creator-scrolltable thead th { position: sticky; top: 0; background: #0b1118; z-index: 1; }
.creator-empty { padding: 6px 8px; color: var(--c-mute); font-style: italic; }
.creator-lv-warn { color: var(--c-amber); }
.creator-lv-error { color: #ff8b80; }
.creator-lv-info { color: var(--c-mute); }
.creator-export-head { display: flex; align-items: center; gap: 8px; margin: 6px 0 4px; }
.creator-export-head span { flex: 1; font-family: var(--c-mono); color: var(--c-amber); font-size: 11px; overflow-wrap: anywhere; }
.creator-packs { width: 100%; border-collapse: collapse; }
.creator-packs td { padding: 4px 5px; border-bottom: 1px solid #18232e; vertical-align: middle; }
.creator-packs td:last-child { text-align: right; white-space: nowrap; }
@media (max-height: 560px) { .creator-head { padding: 5px 10px; } .creator-tab { padding: 6px 4px; } }
`;
