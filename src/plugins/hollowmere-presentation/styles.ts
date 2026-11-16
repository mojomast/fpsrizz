export const styles = `
.hollowmere-ui{position:absolute;inset:0;overflow:hidden;background:#08100d;color:#e9e1c8;font-family:Georgia,'Times New Roman',serif;pointer-events:none}
.hollowmere-ui *{box-sizing:border-box}
.hollowmere-ui [hidden]{display:none!important}
.hollowmere-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:#0a140e;image-rendering:auto}
.hollowmere-vignette{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 48%,#06100bcc 100%);pointer-events:none}
.hollowmere-hud{position:absolute;inset:0;pointer-events:none}
.hm-brand{position:absolute;top:20px;left:24px;text-shadow:0 2px 8px #000;letter-spacing:.18em;font-size:10px;color:#c9bb92}
.hm-brand strong{display:block;font-size:20px;letter-spacing:.2em;color:#f4e7bd;font-weight:400}
.hm-brand span{color:#8db58f}
.hm-status{position:absolute;top:22px;left:24px;width:240px;margin-top:50px;display:grid;gap:7px;text-shadow:0 2px 6px #000}
.hm-label{font:9px ui-monospace,monospace;letter-spacing:.13em;color:#a9ba9d}
.hm-bar{height:8px;background:#0b1511cc;border:1px solid #b7a66a66;padding:1px}
.hm-bar i{display:block;height:100%;background:linear-gradient(90deg,#668b55,#d3c07b);transition:width .12s linear}
.hm-bar.focus i{background:linear-gradient(90deg,#416c78,#9bd5c9)}
.hm-hp{font:11px ui-monospace,monospace;color:#f2dda6;display:flex;justify-content:space-between}
.hm-right{position:absolute;top:22px;right:24px;text-align:right;font:10px/1.55 ui-monospace,monospace;color:#c9bb92;text-shadow:0 2px 6px #000}
.hm-right strong{font-size:18px;color:#f4e7bd;font-weight:400}
.hm-sigils{display:flex;gap:5px;justify-content:flex-end;margin:6px 0}
.hm-sigil{width:22px;height:22px;border:1px solid #b7a66a55;background:#111b14aa;display:grid;place-items:center;font-size:15px;color:#d7c27b}
.hm-sigil.on{box-shadow:0 0 14px #d7c27b99;border-color:#d7c27b}
.hm-room{position:absolute;left:50%;top:22px;transform:translateX(-50%);text-align:center;text-shadow:0 2px 8px #000;min-width:280px}
.hm-room strong{display:block;font-size:22px;font-weight:400;color:#f1e4bc;letter-spacing:.03em}
.hm-room small{font:9px ui-monospace,monospace;letter-spacing:.18em;color:#a9ba9d}
.hm-boss{position:absolute;top:86px;left:50%;transform:translateX(-50%);width:min(520px,62vw);text-align:center;display:none}
.hm-boss.show{display:block}
.hm-boss-name{font:10px ui-monospace,monospace;letter-spacing:.15em;color:#e9b799;margin-bottom:4px}
.hm-boss .hm-bar i{background:linear-gradient(90deg,#8b4d47,#e2ae72)}
.hm-toast{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);max-width:min(720px,80vw);padding:8px 14px;background:#0b1411d9;border:1px solid #b7a66a55;color:#e8dab5;font:10px/1.5 ui-monospace,monospace;text-align:center;opacity:0;transition:opacity .2s}
.hm-toast.show{opacity:1}
.hm-prompt{position:absolute;left:50%;bottom:42px;transform:translateX(-50%);padding:7px 12px;background:#0b1411e8;border:1px solid #b7a66a77;color:#f0dca4;font:10px ui-monospace,monospace;letter-spacing:.08em;display:none;white-space:nowrap}
.hm-prompt.show{display:block}
.hm-controls{position:absolute;left:24px;bottom:20px;font:9px/1.7 ui-monospace,monospace;color:#9eaf98;text-shadow:0 2px 5px #000;letter-spacing:.04em}
.hm-controls b{color:#e6d39a;font-weight:400}
.hm-dialogue{position:absolute;left:50%;bottom:30px;transform:translateX(-50%);width:min(780px,90vw);background:linear-gradient(145deg,#182019f7,#0b110df9);border:1px solid #c9ad6b88;box-shadow:0 20px 80px #000c;padding:16px 18px;display:none;pointer-events:auto;z-index:16}
.hm-dialogue.show{display:grid;grid-template-columns:92px 1fr;gap:14px}
.hm-portrait{width:92px;height:92px;object-fit:cover;border:1px solid #bca16a77;background:#0a0e0b}
.hm-dialogue h2{font-weight:400;font-size:20px;margin:2px 0 2px;color:#f2e2b5}
.hm-dialogue .hm-kicker{font:8px ui-monospace,monospace;letter-spacing:.17em;color:#b4a477}
.hm-dialogue p{font-size:12px;line-height:1.55;color:#d1c8b3;margin:8px 0 10px}
.hm-dialogue-options{display:flex;flex-wrap:wrap;gap:6px}
.hm-dialogue-option{background:#1c2a20;border:1px solid #73906f;color:#e9e1c8;padding:6px 8px;font:10px ui-monospace,monospace;cursor:pointer;text-align:left}
.hm-dialogue-option small{display:block;color:#9db398;font-size:8px;margin-top:2px}
.hm-dialogue-option.disabled{opacity:.45;cursor:not-allowed}
.hm-dialogue-option kbd{color:#f2dda6;margin-right:6px}
.hm-pause{position:absolute;inset:0;z-index:20;display:none;background:#07100cf2;pointer-events:auto;overflow:auto}
.hm-pause.show{display:block}
.hm-pause-bg{position:absolute;inset:0;background:linear-gradient(90deg,#07100cf5,#0a1710d9 50%,#07100cf5),url('assetrizz/hollow-bg-forest.png') center/cover;opacity:.95;pointer-events:none}
.hm-pause-shell{position:relative;max-width:1040px;margin:0 auto;padding:28px 28px 40px;min-height:100%}
.hm-pause-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #c9ad6b77;padding-bottom:12px}
.hm-pause-head h1{font-size:clamp(30px,4vw,48px);font-weight:400;color:#f4e7bd;margin:0;letter-spacing:.02em}
.hm-pause-head .hm-kicker{font:9px ui-monospace,monospace;color:#b6a778;letter-spacing:.2em}
.hm-pause-head aside{text-align:right;font:10px ui-monospace,monospace;color:#a9ba9d;line-height:1.7}
.hm-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:15px 0 12px}
.hm-tab{border:1px solid #78907188;background:#0e1812d9;color:#b9c9ad;font:10px ui-monospace,monospace;letter-spacing:.1em;padding:8px 10px;cursor:pointer}
.hm-tab.selected{background:#c4b06f;color:#11190f;border-color:#e6d39a}
.hm-tab:hover{outline:1px solid #e6d39a88}
.hm-panel{min-height:380px;background:#0a130fe8;border:1px solid #8aa17a55;padding:16px;box-shadow:0 18px 60px #0008}
.hm-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;border-bottom:1px solid #a18e5944;padding-bottom:8px;margin-bottom:11px}
.hm-panel-head h2{font-size:20px;font-weight:400;margin:0;color:#f2e2b5}
.hm-panel-head small{font:9px ui-monospace,monospace;color:#9bad91;letter-spacing:.1em}
.hm-map-wrap{position:relative;height:390px;min-height:280px;background:#08100b;border:1px solid #71887155;overflow:hidden}
.hm-map-canvas{width:100%;height:100%;display:block}
.hm-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:9px;font:9px ui-monospace,monospace;color:#a9ba9d}
.hm-legend i{display:inline-block;width:8px;height:8px;margin-right:4px;background:#c9ad6b}
.hm-list{display:flex;flex-direction:column;gap:6px}
.hm-item{display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;border:1px solid #77906f44;background:#101b14b8;padding:7px;cursor:pointer}
.hm-item.selected{border-color:#d8c27b;background:#1a281b}
.hm-item img{width:38px;height:38px;object-fit:contain;image-rendering:auto}
.hm-item strong{display:block;font-weight:400;font-size:13px;color:#efe1bb}
.hm-item small{display:block;font:8px/1.5 ui-monospace,monospace;color:#9bad91;margin-top:2px}
.hm-item .hm-count{font:10px ui-monospace,monospace;color:#e0c77d;white-space:nowrap}
.hm-cap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px}
.hm-cap{border:1px solid #77906f44;background:#101b14b8;padding:9px;display:grid;grid-template-columns:34px 1fr;gap:8px;align-items:start}
.hm-cap.locked{opacity:.42;filter:grayscale(1)}
.hm-cap img{width:32px;height:32px;object-fit:contain}
.hm-cap strong{display:block;font-size:13px;font-weight:400;color:#efe1bb}
.hm-cap small{display:block;font:8px/1.45 ui-monospace,monospace;color:#9bad91;margin-top:3px}
.hm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.hm-stat{border-left:2px solid #b7a66a66;padding:6px 9px;background:#101b1488}
.hm-stat b{display:block;font:19px Georgia,serif;font-weight:400;color:#f2dca7}
.hm-stat span{font:8px ui-monospace,monospace;color:#9bad91;letter-spacing:.1em}
.hm-options{display:flex;flex-direction:column;gap:6px;max-width:600px}
.hm-option{display:flex;justify-content:space-between;align-items:center;border:1px solid #77906f44;background:#101b14b8;padding:9px 11px;color:#e4d7b4;font:10px ui-monospace,monospace;cursor:pointer}
.hm-option.selected{border-color:#d8c27b;background:#1a281b}
.hm-option b{color:#d8c27b;font-weight:400}
.hm-pause-foot{margin-top:10px;font:9px ui-monospace,monospace;color:#9bad91;display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap}
.hm-pause-foot kbd{color:#e6d39a}
.hm-pause-mobile{display:none}
@media(max-width:760px){
 .hm-brand{top:10px;left:12px}.hm-brand strong{font-size:15px}.hm-brand span{display:none}
 .hm-status{top:12px;left:12px;width:170px;margin-top:35px;gap:4px}.hm-label{font-size:8px}.hm-hp{font-size:9px}
 .hm-right{top:10px;right:12px;font-size:8px}.hm-right strong{font-size:13px}.hm-sigils{margin:3px 0}.hm-sigil{width:17px;height:17px;font-size:11px}
 .hm-room{top:10px}.hm-room strong{font-size:16px}.hm-room small{font-size:7px}
 .hm-controls{display:none}.hm-toast{bottom:74px;font-size:8px;max-width:88vw}.hm-prompt{bottom:37px;font-size:8px}
 .hm-pause-shell{padding:16px 12px 26px}.hm-pause-head h1{font-size:30px}.hm-pause-head aside{display:none}
 .hm-pause-head .hm-kicker{font-size:7px}.hm-tabs{gap:3px}.hm-tab{padding:6px;font-size:8px}
 .hm-panel{padding:10px;min-height:430px}.hm-map-wrap{height:310px}.hm-panel-head h2{font-size:16px}
 .hm-item{grid-template-columns:34px 1fr auto;gap:6px}.hm-item img{width:30px;height:30px}.hm-item strong{font-size:11px}.hm-item small{font-size:7px}
 .hm-dialogue{bottom:12px;width:94vw;padding:10px;grid-template-columns:58px 1fr;gap:8px}.hm-portrait{width:58px;height:58px}.hm-dialogue h2{font-size:16px}.hm-dialogue p{font-size:10px}.hm-dialogue-option{font-size:8px;padding:5px}.hm-dialogue-option small{font-size:7px}
 .hm-boss{top:66px;width:75vw}.hm-pause-foot{font-size:8px}
}
`;
