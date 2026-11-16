export const styles = `
.hollowmere-ui{
  --hm-bg:#08100d;
  --hm-ink:#ece3ca;
  --hm-ink-dim:#c0cbae;
  --hm-ink-faint:#9eae97;
  --hm-gold:#e2cd8c;
  --hm-gold-bright:#f4e7bd;
  --hm-gold-dim:#b7a66a;
  --hm-green:#88a77c;
  --hm-teal:#9bd5c9;
  --hm-red:#dfa07d;
  --hm-line:rgba(201,173,107,.34);
  --hm-line-soft:rgba(138,161,122,.26);
  --hm-shadow:0 18px 50px rgba(0,0,0,.5);
  --hm-mono:ui-monospace,'SFMono-Regular',Consolas,'Liberation Mono',monospace;
  --hm-display:Georgia,'Times New Roman',serif;
  position:absolute;inset:0;overflow:hidden;background:var(--hm-bg);color:var(--hm-ink);
  font-family:var(--hm-display);pointer-events:none;-webkit-font-smoothing:antialiased;
}
.hollowmere-ui *{box-sizing:border-box}
.hollowmere-ui [hidden]{display:none!important}
.hollowmere-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:#0a140e;image-rendering:auto}
.hollowmere-vignette{
  position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(ellipse at center,transparent 46%,rgba(4,12,8,.8) 100%),
    linear-gradient(180deg,rgba(3,10,7,.38) 0,rgba(3,10,7,0) 22%,rgba(3,10,7,0) 68%,rgba(3,10,7,.48) 100%);
}
.hollowmere-hud{position:absolute;inset:0;pointer-events:none}

/* Brand and room hierarchy */
.hm-brand{
  position:absolute;top:max(20px,calc(env(safe-area-inset-top) + 12px));left:max(24px,calc(env(safe-area-inset-left) + 16px));
  letter-spacing:.18em;font-size:9px;color:#cbbd93;
  text-shadow:0 1px 0 rgba(0,0,0,.7),0 3px 16px rgba(0,0,0,.9);
}
.hm-brand strong{display:block;font-size:20px;line-height:1.1;letter-spacing:.16em;color:var(--hm-gold-bright);font-weight:400}
.hm-brand span{display:block;margin-top:2px;color:#a7c1a1;font:8px/1.5 var(--hm-mono);letter-spacing:.21em}
.hm-brand::after{content:"";display:block;width:44px;height:1px;margin-top:7px;background:linear-gradient(90deg,rgba(226,205,140,.8),transparent)}
.hm-status{
  position:absolute;top:max(22px,calc(env(safe-area-inset-top) + 14px));left:max(24px,calc(env(safe-area-inset-left) + 16px));
  width:min(248px,28vw);margin-top:54px;display:grid;gap:7px;
  text-shadow:0 1px 0 rgba(0,0,0,.8),0 3px 12px rgba(0,0,0,.9);
}
.hm-label{font:9px/1.3 var(--hm-mono);letter-spacing:.16em;color:#c2cbb5;text-transform:uppercase}
.hm-bar{
  position:relative;height:8px;padding:1px;overflow:hidden;
  background:rgba(5,13,9,.86);border:1px solid rgba(201,173,107,.42);
  box-shadow:inset 0 1px 2px rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.04);
}
.hm-bar i{
  display:block;height:100%;min-width:1px;border-radius:1px;
  background:linear-gradient(90deg,#517446,#9caf69 62%,#e0cd8b);
  box-shadow:0 0 9px rgba(211,192,123,.38);transition:width .16s linear;
}
.hm-bar.focus i{background:linear-gradient(90deg,#3f6f78,#79b9ae 62%,#aee0d5);box-shadow:0 0 9px rgba(132,206,193,.32)}
.hm-hp{
  display:flex;justify-content:space-between;align-items:baseline;
  font:10px/1.2 var(--hm-mono);letter-spacing:.08em;color:#f2dda6;font-variant-numeric:tabular-nums;
}
.hm-status .hm-bar:not(.focus) + .hm-hp{font:16px/1.2 var(--hm-display);letter-spacing:.02em;color:#f4e0a7}
.hm-status .hm-bar.focus + .hm-hp{font:11px/1.3 var(--hm-mono);letter-spacing:.06em;color:#b9ded5}
.hm-right{
  position:absolute;top:max(22px,calc(env(safe-area-inset-top) + 14px));right:max(24px,calc(env(safe-area-inset-right) + 16px));
  text-align:right;font:9px/1.6 var(--hm-mono);letter-spacing:.05em;color:#c6d0b9;
  text-shadow:0 1px 0 rgba(0,0,0,.8),0 3px 12px rgba(0,0,0,.9);
}
.hm-right strong{display:block;font-size:20px;line-height:1.1;color:var(--hm-gold-bright);font-weight:400;letter-spacing:.04em;font-variant-numeric:tabular-nums}
.hm-right > div{color:#cbd5c0;letter-spacing:.1em}
.hm-sigils{display:flex;gap:6px;justify-content:flex-end;margin:8px 0 0}
.hm-sigil{
  width:22px;height:22px;display:grid;place-items:center;
  border:1px solid rgba(201,173,107,.38);background:linear-gradient(180deg,rgba(20,33,24,.82),rgba(10,18,13,.82));
  color:#c9b573;font-size:14px;line-height:1;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);transition:border-color .15s,color .15s,box-shadow .15s;
}
.hm-sigil.on{border-color:var(--hm-gold);color:#f6e4a8;box-shadow:0 0 12px rgba(226,205,140,.4),inset 0 0 9px rgba(226,205,140,.18)}
.hm-room{
  position:absolute;left:50%;top:max(20px,calc(env(safe-area-inset-top) + 12px));transform:translateX(-50%);
  min-width:280px;max-width:70vw;padding:0 16px;text-align:center;
  text-shadow:0 2px 4px rgba(0,0,0,.85),0 6px 24px rgba(0,0,0,.8);
}
.hm-room strong{display:block;font-size:24px;line-height:1.12;font-weight:400;color:var(--hm-gold-bright);letter-spacing:.025em;text-wrap:balance}
.hm-room small{font:8px/1.5 var(--hm-mono);letter-spacing:.19em;color:#b9c5ae;text-transform:uppercase}
.hm-room small:last-child{color:#a6b49d;letter-spacing:.11em}
.hm-room::after{content:"";display:block;width:74px;height:1px;margin:8px auto 0;background:linear-gradient(90deg,transparent,rgba(201,173,107,.8),transparent)}
.hm-boss{
  position:absolute;top:max(92px,calc(env(safe-area-inset-top) + 84px));left:50%;transform:translateX(-50%);
  width:min(560px,58vw);padding:8px 14px 10px;text-align:center;display:none;
  background:linear-gradient(180deg,rgba(36,18,14,.78),rgba(8,12,9,.6));
  border:1px solid rgba(201,173,107,.3);box-shadow:0 12px 34px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.05);
}
.hm-boss.show{display:block}
.hm-boss-name{font:9.5px/1.4 var(--hm-mono);letter-spacing:.18em;color:#edc2a3;margin-bottom:5px;text-transform:uppercase}
.hm-boss .hm-bar{height:9px;border-color:rgba(226,174,114,.5)}
.hm-boss .hm-bar i{background:linear-gradient(90deg,#8b4d47,#c47c63 55%,#e2ae72);box-shadow:0 0 10px rgba(226,174,114,.3)}

/* Transient prompts */
.hm-toast{
  position:absolute;left:50%;bottom:max(90px,calc(env(safe-area-inset-bottom) + 78px));transform:translate(-50%,6px);
  max-width:min(720px,calc(100vw - 48px));padding:9px 16px;visibility:hidden;opacity:0;
  background:linear-gradient(180deg,rgba(18,29,22,.94),rgba(8,15,11,.92));
  border:1px solid var(--hm-line);border-left:2px solid rgba(226,205,140,.72);
  color:#f0e6c9;font:10.5px/1.55 var(--hm-mono);letter-spacing:.015em;text-align:center;
  box-shadow:0 10px 30px rgba(0,0,0,.44),inset 0 1px 0 rgba(255,255,255,.04);
  transition:opacity .18s ease,transform .18s ease,visibility .18s;
}
.hm-toast.show{visibility:visible;opacity:1;transform:translate(-50%,0)}
.hm-prompt{
  position:absolute;left:50%;bottom:max(42px,calc(env(safe-area-inset-bottom) + 30px));transform:translateX(-50%);
  max-width:min(560px,calc(100vw - 32px));padding:7px 14px;display:none;
  background:linear-gradient(180deg,rgba(19,29,22,.94),rgba(8,15,11,.9));
  border:1px solid rgba(201,173,107,.5);border-left:2px solid var(--hm-gold);
  color:#f3e3b1;font:9.5px/1.45 var(--hm-mono);letter-spacing:.09em;text-align:center;
  box-shadow:0 8px 24px rgba(0,0,0,.4);white-space:normal;
}
.hm-prompt.show{display:block}
.hm-controls{
  position:absolute;left:max(24px,calc(env(safe-area-inset-left) + 16px));bottom:max(18px,calc(env(safe-area-inset-bottom) + 10px));
  max-width:min(540px,52vw);padding:6px 12px 6px 10px;
  font:9.5px/1.9 var(--hm-mono);letter-spacing:.045em;color:#b9c5ae;
  text-shadow:0 1px 2px rgba(0,0,0,.9);
  background:linear-gradient(90deg,rgba(5,14,9,.62),rgba(5,14,9,.08));
  border-left:1px solid rgba(201,173,107,.42);
}
.hm-controls b{
  display:inline-block;margin:0 1px;padding:0 4px;border:1px solid rgba(201,173,107,.32);border-bottom-color:rgba(201,173,107,.5);
  background:rgba(15,28,20,.72);color:#f0dfa9;font-weight:400;line-height:1.55;letter-spacing:.055em;border-radius:1px;
}

/* Portrait dialogue */
.hm-dialogue{
  position:absolute;left:50%;bottom:max(28px,calc(env(safe-area-inset-bottom) + 18px));transform:translateX(-50%);
  width:min(820px,calc(100vw - 48px));display:none;pointer-events:auto;z-index:16;
  background:linear-gradient(145deg,rgba(27,37,29,.98),rgba(9,15,11,.99));
  border:1px solid rgba(201,173,107,.56);border-left:3px solid rgba(226,205,140,.82);
  box-shadow:0 24px 80px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.05);
  padding:18px 20px;
}
.hm-dialogue.show{display:grid;grid-template-columns:88px minmax(0,1fr);gap:16px;align-items:start}
.hm-portrait{width:88px;height:88px;object-fit:cover;border:1px solid rgba(201,173,107,.48);background:#0a0e0b;box-shadow:0 8px 22px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.04)}
.hm-dialogue > div{min-width:0}
.hm-dialogue h2{font-weight:400;font-size:22px;line-height:1.15;margin:3px 0 0;color:#f5e8c3;letter-spacing:.015em}
.hm-dialogue .hm-kicker{font:8px/1.5 var(--hm-mono);letter-spacing:.2em;color:#c3b27c;text-transform:uppercase}
.hm-dialogue p{font-size:12.5px;line-height:1.6;color:#d7cfba;margin:9px 0 12px;max-width:66ch}
.hm-dialogue-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px}
.hm-dialogue-option{
  min-height:38px;padding:7px 10px;border:1px solid rgba(115,144,111,.55);border-radius:1px;
  background:linear-gradient(180deg,#19281e,#101a14);color:#ece4cc;
  font:10px/1.35 var(--hm-mono);letter-spacing:.015em;cursor:pointer;text-align:left;
  transition:background .15s,border-color .15s,color .15s;
}
.hm-dialogue-option small{display:block;color:#a8bda2;font-size:8px;line-height:1.4;margin-top:3px;letter-spacing:.03em}
.hm-dialogue-option kbd{
  display:inline-grid;place-items:center;min-width:16px;height:16px;margin-right:6px;padding:0 3px;
  border:1px solid rgba(201,173,107,.4);background:rgba(8,15,11,.7);color:var(--hm-gold);
  font:8px/1 var(--hm-mono);border-radius:1px;vertical-align:1px;
}
.hm-dialogue-option:hover:not(:disabled),.hm-dialogue-option:focus-visible:not(:disabled){background:linear-gradient(180deg,#22362a,#16241b);border-color:rgba(226,205,140,.7);color:#fbf1d4}
.hm-dialogue-option:focus-visible{outline:2px solid var(--hm-gold-bright);outline-offset:2px}
.hm-dialogue-option.disabled,.hm-dialogue-option:disabled{opacity:.46;cursor:not-allowed;filter:grayscale(.35)}
.hm-dialogue-option.disabled:hover,.hm-dialogue-option:disabled:hover{background:linear-gradient(180deg,#19281e,#101a14);border-color:rgba(115,144,111,.55);color:#ece4cc}

/* Journal shell */
.hm-pause{position:absolute;inset:0;z-index:20;display:none;background:rgba(7,16,12,.95);pointer-events:auto;overflow:auto;overscroll-behavior:contain}
.hm-pause.show{display:block}
.hm-pause-bg{
  position:absolute;inset:0;pointer-events:none;opacity:.95;
  background:
    linear-gradient(90deg,rgba(7,16,12,.96),rgba(9,23,16,.84) 50%,rgba(7,16,12,.96)),
    radial-gradient(ellipse at 50% 22%,rgba(46,66,44,.22),transparent 62%),
    url('assetrizz/hollow-bg-forest.png') center/cover no-repeat;
}
.hm-pause-shell{
  position:relative;width:min(1120px,100%);margin:0 auto;min-height:100%;
  padding:max(24px,calc(env(safe-area-inset-top) + 14px)) max(20px,calc(env(safe-area-inset-right) + 16px)) max(32px,calc(env(safe-area-inset-bottom) + 18px)) max(20px,calc(env(safe-area-inset-left) + 16px));
}
.hm-pause-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;border-bottom:1px solid var(--hm-line);padding-bottom:14px;box-shadow:0 1px 0 rgba(0,0,0,.35)}
.hm-pause-head > div{min-width:0}
.hm-pause-head h1{font-size:clamp(32px,4vw,50px);line-height:.95;font-weight:400;color:var(--hm-gold-bright);margin:3px 0 0;letter-spacing:.015em;text-shadow:0 2px 18px rgba(0,0,0,.45);text-wrap:balance}
.hm-pause-head .hm-kicker{font:9px/1.5 var(--hm-mono);color:#c8b981;letter-spacing:.21em;text-transform:uppercase}
.hm-pause-head aside{
  max-width:320px;padding-left:16px;border-left:1px solid var(--hm-line-soft);
  text-align:right;font:10.5px/1.75 var(--hm-mono);color:#c6d0ba;
  white-space:pre-line;letter-spacing:.04em;
}
.hm-pause-head aside::first-line{color:#ead8a2;letter-spacing:.12em;text-transform:uppercase}
.hm-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:stretch;margin:16px 0 14px}
.hm-tab{
  appearance:none;min-height:38px;padding:9px 12px;border:1px solid rgba(127,148,122,.54);border-radius:2px;
  background:linear-gradient(180deg,rgba(18,32,25,.92),rgba(11,21,15,.92));
  color:#c8d4bd;font:10.5px/1.2 var(--hm-mono);letter-spacing:.09em;cursor:pointer;
  transition:border-color .12s,box-shadow .12s;
}
.hm-tab:hover{border-color:rgba(216,194,123,.7);background:linear-gradient(180deg,rgba(26,43,32,.96),rgba(15,27,19,.96));color:#f3e7c6}
.hm-tab:focus-visible{outline:2px solid var(--hm-gold-bright);outline-offset:2px}
.hm-tab:disabled{opacity:.45;cursor:not-allowed}
.hm-tab.selected{
  background:linear-gradient(180deg,#ecda9f,#c7b06c);border-color:#f2e4b6;color:#11190f;
  box-shadow:inset 0 1px 0 rgba(255,248,217,.75),0 4px 14px rgba(0,0,0,.32);
}
.hm-tab.selected:hover{background:linear-gradient(180deg,#f4e3ab,#d0b975);color:#11190f}
.hm-panel{
  position:relative;min-height:0;padding:clamp(14px,2vw,20px);
  background:linear-gradient(180deg,rgba(15,26,20,.96),rgba(8,17,12,.93));
  border:1px solid rgba(138,161,122,.4);border-top-color:rgba(201,173,107,.34);border-radius:2px;
  box-shadow:var(--hm-shadow),inset 0 1px 0 rgba(255,255,255,.04);
}
.hm-panel-head{display:flex;justify-content:space-between;gap:16px;align-items:baseline;border-bottom:1px solid rgba(201,173,107,.24);padding-bottom:9px;margin-bottom:13px}
.hm-panel-head h2{font-size:clamp(18px,2vw,22px);line-height:1.15;font-weight:400;margin:0;color:#f4e6c1;letter-spacing:.01em}
.hm-panel-head small{font:9px/1.5 var(--hm-mono);color:#b6c4aa;letter-spacing:.12em;text-align:right;text-transform:uppercase}
.hm-map-wrap{
  position:relative;height:clamp(260px,47vh,430px);min-height:260px;overflow:hidden;
  background:radial-gradient(ellipse at center,rgba(16,30,21,.75),#07100b 70%);
  border:1px solid rgba(138,161,122,.38);border-radius:1px;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.35),inset 0 18px 60px rgba(0,0,0,.28);
}
.hm-map-canvas{width:100%;height:100%;display:block}
.hm-legend{display:flex;gap:10px 18px;flex-wrap:wrap;margin-top:10px;font:8.5px/1.6 var(--hm-mono);color:#b8c5ab;letter-spacing:.085em;text-transform:uppercase}
.hm-legend i{display:inline-block;width:8px;height:8px;margin-right:5px;background:#c9ad6b;border:1px solid rgba(255,255,255,.16);vertical-align:-1px}
.hm-list{display:flex;flex-direction:column;gap:7px}
.hm-item{
  display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:11px;align-items:center;
  padding:9px 11px;border:1px solid rgba(119,144,111,.32);border-left:2px solid transparent;border-radius:1px;
  background:linear-gradient(180deg,rgba(19,31,23,.72),rgba(13,23,17,.72));
  cursor:pointer;transition:background .15s,border-color .15s;
}
.hm-item:hover{background:linear-gradient(180deg,rgba(25,41,30,.82),rgba(16,29,21,.82));border-color:rgba(201,173,107,.4)}
.hm-item.selected{border-color:rgba(216,194,123,.78);border-left-color:var(--hm-gold);background:linear-gradient(180deg,rgba(31,48,32,.92),rgba(20,35,23,.92));box-shadow:inset 3px 0 0 rgba(230,211,154,.16)}
.hm-item:focus-visible{outline:2px solid var(--hm-gold-bright);outline-offset:2px}
.hm-item img{width:38px;height:38px;padding:3px;object-fit:contain;background:rgba(7,13,9,.76);border:1px solid rgba(201,173,107,.2);image-rendering:auto}
.hm-item:not(:has(img)){display:flex;align-items:center;min-height:56px;color:#b8c5ab;font:9px/1.5 var(--hm-mono);letter-spacing:.05em;cursor:default}
.hm-item strong{display:block;font-weight:400;font-size:14px;line-height:1.25;color:#f0e3bf;letter-spacing:.01em}
.hm-item small{display:block;font:11px/1.55 var(--hm-display);color:#b8c6ac;margin-top:3px;overflow-wrap:anywhere}
.hm-item .hm-count{font:10.5px/1.2 var(--hm-mono);color:#e6cf8a;white-space:nowrap;font-variant-numeric:tabular-nums}
.hm-cap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}
.hm-cap{
  display:grid;grid-template-columns:36px minmax(0,1fr);gap:9px;align-items:start;
  padding:10px;border:1px solid rgba(119,144,111,.32);border-top-color:rgba(201,173,107,.24);border-radius:1px;
  background:linear-gradient(180deg,rgba(19,31,23,.72),rgba(12,22,16,.72));
  transition:background .15s,border-color .15s;
}
.hm-cap:hover{background:linear-gradient(180deg,rgba(25,41,30,.85),rgba(15,27,20,.85));border-color:rgba(201,173,107,.4)}
.hm-cap.locked{opacity:.52;filter:grayscale(.78)}
.hm-cap img{width:34px;height:34px;padding:2px;object-fit:contain;background:rgba(7,13,9,.64);border:1px solid rgba(201,173,107,.18)}
.hm-cap strong{display:block;font-size:13.5px;line-height:1.25;font-weight:400;color:#efe2bd}
.hm-cap small{display:block;font:10.5px/1.55 var(--hm-display);color:#b4c2a9;margin-top:4px;overflow-wrap:anywhere}
.hm-cap small:last-child{font:8.5px/1.45 var(--hm-mono);color:#cdbb83;letter-spacing:.08em;text-transform:uppercase;margin-top:7px}
.hm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px}
.hm-stat{
  min-height:64px;padding:9px 12px;border:1px solid rgba(119,144,111,.26);border-left:2px solid rgba(201,173,107,.5);
  background:linear-gradient(180deg,rgba(19,31,23,.66),rgba(11,21,15,.6));
  transition:background .15s,border-color .15s;
}
.hm-stat:hover{background:linear-gradient(180deg,rgba(25,41,30,.8),rgba(14,26,19,.7));border-left-color:rgba(230,211,154,.8)}
.hm-stat b{display:block;font:20px/1.15 var(--hm-display);font-weight:400;color:#f2dca7;font-variant-numeric:tabular-nums}
.hm-stat span{display:block;margin-top:3px;font:9px/1.45 var(--hm-mono);color:#b0bfa5;letter-spacing:.1em;text-transform:uppercase}
.hm-options{display:flex;flex-direction:column;gap:7px;max-width:680px}
.hm-option{
  display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:44px;padding:9px 12px;
  border:1px solid rgba(119,144,111,.32);border-left:2px solid transparent;border-radius:1px;
  background:linear-gradient(180deg,rgba(18,30,22,.72),rgba(12,22,16,.68));
  color:#e6d9b8;font:11px/1.4 var(--hm-mono);letter-spacing:.03em;cursor:pointer;
  transition:background .15s,border-color .15s,color .15s;
}
.hm-option:hover{background:linear-gradient(180deg,rgba(25,41,30,.85),rgba(15,27,20,.8));border-color:rgba(201,173,107,.42)}
.hm-option:focus-visible{outline:2px solid var(--hm-gold-bright);outline-offset:2px}
.hm-option.selected{border-color:rgba(216,194,123,.78);border-left-color:var(--hm-gold);background:linear-gradient(180deg,rgba(31,48,32,.92),rgba(20,35,23,.9));box-shadow:inset 3px 0 0 rgba(230,211,154,.16)}
.hm-option b{
  display:inline-block;min-width:44px;padding:2px 8px;text-align:center;
  border:1px solid rgba(201,173,107,.42);background:rgba(7,14,10,.62);color:#d8c27b;
  font:10px/1.5 var(--hm-mono);font-weight:400;letter-spacing:.1em;border-radius:1px;
}
.hm-option.selected b{border-color:rgba(230,211,154,.7);color:#f5e5ad}
.hm-pause-foot{
  margin-top:14px;padding-top:11px;border-top:1px solid rgba(201,173,107,.22);
  font:9.5px/1.8 var(--hm-mono);color:#b4c3a9;display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;letter-spacing:.03em;
}
.hm-pause-foot kbd{display:inline-block;margin:0 1px;padding:0 3px;border:1px solid rgba(201,173,107,.3);background:rgba(9,18,12,.55);color:#e6d39a;font:inherit;border-radius:1px}
.hm-pause-mobile{display:none}

@media(max-width:760px){
  .hm-brand{top:max(12px,calc(env(safe-area-inset-top) + 8px));left:max(12px,calc(env(safe-area-inset-left) + 8px))}
  .hm-brand strong{font-size:16px;letter-spacing:.15em}.hm-brand span{display:none}.hm-brand::after{width:30px;margin-top:5px}
  .hm-status{top:max(12px,calc(env(safe-area-inset-top) + 8px));left:max(12px,calc(env(safe-area-inset-left) + 8px));width:170px;margin-top:36px;gap:5px}
  .hm-label{font-size:8.5px;letter-spacing:.12em}.hm-hp{font-size:9.5px;letter-spacing:.05em}
  .hm-status .hm-bar:not(.focus) + .hm-hp{font-size:14px}.hm-status .hm-bar.focus + .hm-hp{font-size:10px}
  .hm-right{top:max(10px,calc(env(safe-area-inset-top) + 7px));right:max(12px,calc(env(safe-area-inset-right) + 8px));font-size:8px}
  .hm-right strong{font-size:15px}.hm-right > div{font-size:7.5px}.hm-sigils{gap:4px;margin-top:4px}.hm-sigil{width:18px;height:18px;font-size:11px}
  .hm-room{top:max(10px,calc(env(safe-area-inset-top) + 7px));min-width:0;width:min(320px,45vw);padding:0 6px}
  .hm-room strong{font-size:16px}.hm-room small{font-size:7px;letter-spacing:.15em}.hm-room small:last-child{letter-spacing:.08em}
  .hm-room::after{width:48px;margin-top:6px}
  .hm-boss{top:max(66px,calc(env(safe-area-inset-top) + 60px));width:75vw;padding:6px 10px 8px}.hm-boss-name{font-size:8px;letter-spacing:.13em}
  .hm-controls{display:none}
  .hm-toast{bottom:max(74px,calc(env(safe-area-inset-bottom) + 64px));max-width:calc(100vw - 24px);padding:8px 11px;font-size:9.5px}
  .hm-prompt{bottom:max(34px,calc(env(safe-area-inset-bottom) + 24px));max-width:calc(100vw - 24px);padding:6px 10px;font-size:9px;letter-spacing:.06em}
  .hm-dialogue{bottom:max(12px,calc(env(safe-area-inset-bottom) + 8px));width:calc(100vw - 24px);padding:12px}
  .hm-dialogue.show{grid-template-columns:60px minmax(0,1fr);gap:10px}
  .hm-portrait{width:60px;height:60px}.hm-dialogue h2{font-size:18px}.hm-dialogue p{font-size:10.5px;line-height:1.55;margin:6px 0 9px}
  .hm-dialogue .hm-kicker{font-size:7px;letter-spacing:.15em}.hm-dialogue-options{grid-template-columns:1fr;gap:5px}
  .hm-dialogue-option{font-size:9px;padding:6px 8px;min-height:34px}.hm-dialogue-option small{font-size:7.5px}
  .hm-pause-shell{padding:max(16px,calc(env(safe-area-inset-top) + 10px)) max(12px,calc(env(safe-area-inset-right) + 10px)) max(24px,calc(env(safe-area-inset-bottom) + 14px)) max(12px,calc(env(safe-area-inset-left) + 10px))}
  .hm-pause-head{padding-bottom:10px;gap:12px}.hm-pause-head h1{font-size:32px}.hm-pause-head aside{display:none}
  .hm-pause-head .hm-kicker{font-size:7px;letter-spacing:.16em}
  .hm-tabs{gap:4px;margin:11px 0 10px}.hm-tab{min-height:38px;padding:8px;font-size:8.5px;letter-spacing:.04em}
  .hm-panel{padding:10px}.hm-panel-head{gap:10px;padding-bottom:7px;margin-bottom:10px}.hm-panel-head h2{font-size:17px}.hm-panel-head small{font-size:8px;letter-spacing:.08em}
  .hm-map-wrap{height:clamp(210px,32vh,270px);min-height:210px}
  .hm-legend{gap:7px 11px;margin-top:8px;font-size:8px;letter-spacing:.05em}
  .hm-item{grid-template-columns:34px minmax(0,1fr) auto;gap:8px;padding:8px}
  .hm-item img{width:30px;height:30px}.hm-item strong{font-size:12.5px}.hm-item small{font-size:10px;line-height:1.45}.hm-item .hm-count{font-size:9.5px}
  .hm-cap-grid{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px}.hm-cap{padding:9px;grid-template-columns:32px minmax(0,1fr);gap:7px}
  .hm-cap img{width:30px;height:30px}.hm-cap strong{font-size:12.5px}.hm-cap small{font-size:9.5px}.hm-cap small:last-child{font-size:8px}
  .hm-stats{grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:6px}.hm-stat{padding:8px 10px;min-height:58px}.hm-stat b{font-size:18px}.hm-stat span{font-size:8px}
  .hm-option{font-size:10px;min-height:42px;padding:8px 10px}.hm-option b{min-width:42px;font-size:9px}
  .hm-pause-foot{font-size:8.5px;line-height:1.7;gap:8px}.hm-pause-mobile{display:none}
}

@media(min-width:561px) and (max-width:1140px){
  .hm-boss{top:max(198px,calc(env(safe-area-inset-top) + 190px));width:min(560px,calc(100vw - 48px))}
}

@media(max-width:560px){
  .hm-brand{top:max(10px,calc(env(safe-area-inset-top) + 6px))}
  .hm-brand strong{font-size:15px}.hm-right{top:max(9px,calc(env(safe-area-inset-top) + 6px))}
  .hm-room{top:max(56px,calc(env(safe-area-inset-top) + 46px));left:0;right:0;width:auto;max-width:none;transform:none;padding:0 12px}
  .hm-room strong{font-size:18px}.hm-room small{font-size:7px}
  .hm-status{
    top:max(112px,calc(env(safe-area-inset-top) + 102px));left:max(12px,calc(env(safe-area-inset-left) + 8px));right:max(12px,calc(env(safe-area-inset-right) + 8px));
    width:auto;margin-top:0;display:grid;grid-template-columns:auto minmax(56px,1fr) auto;align-items:center;gap:4px 8px;
  }
  .hm-status .hm-bar{height:6px}.hm-status .hm-hp{justify-self:end;letter-spacing:.02em}
  .hm-status .hm-bar:not(.focus) + .hm-hp{font-size:13px}.hm-status .hm-bar.focus + .hm-hp{font-size:9px}
  .hm-boss{top:max(154px,calc(env(safe-area-inset-top) + 144px));width:calc(100vw - 24px)}
  .hm-toast{bottom:max(72px,calc(env(safe-area-inset-bottom) + 62px));font-size:9px;line-height:1.5}
  .hm-prompt{bottom:max(30px,calc(env(safe-area-inset-bottom) + 20px));font-size:8.5px}
  .hm-dialogue{width:calc(100vw - 20px);padding:10px}
  .hm-dialogue.show{grid-template-columns:52px minmax(0,1fr);gap:8px}
  .hm-portrait{width:52px;height:52px}.hm-dialogue h2{font-size:16px}.hm-dialogue p{font-size:10px}
  .hm-dialogue-option{font-size:9px;padding:6px}.hm-dialogue-option small{font-size:7.5px}
  .hm-pause-head h1{font-size:29px}.hm-pause-head{padding-bottom:9px}
  .hm-pause-head .hm-kicker{font-size:7px;letter-spacing:.14em}
  .hm-tabs{gap:3px}.hm-tab{padding:8px 5px;font-size:8px;letter-spacing:0;text-align:center;white-space:normal;line-height:1.2}
  .hm-map-wrap{height:clamp(190px,27vh,230px);min-height:190px}
  .hm-legend{gap:5px 9px;font-size:7.5px;letter-spacing:.03em;line-height:1.5}.hm-legend i{width:7px;height:7px;margin-right:3px}
  .hm-panel-head{flex-wrap:wrap}.hm-panel-head small{text-align:left}
  .hm-stat span{font-size:7.5px;letter-spacing:.05em}
  .hm-cap-grid{grid-template-columns:1fr}
  .hm-option{font-size:9.5px;gap:10px}.hm-option b{font-size:8.5px}
  .hm-pause-foot{flex-direction:column;gap:3px;font-size:8px}
}

@media(min-width:1200px){
  .hm-pause-shell{padding-top:max(32px,calc(env(safe-area-inset-top) + 20px));padding-bottom:max(40px,calc(env(safe-area-inset-bottom) + 24px))}
  .hm-pause-head{padding-bottom:16px}.hm-pause-head h1{font-size:50px}
  .hm-tabs{margin:18px 0 16px;gap:7px}.hm-tab{padding:10px 14px;font-size:10.5px;min-height:38px}
  .hm-panel{padding:20px 22px}.hm-panel-head h2{font-size:22px}
  .hm-map-wrap{height:clamp(320px,48vh,440px)}
  .hm-item{padding:10px 12px}.hm-cap{padding:11px}.hm-stat{padding:11px 14px}
  .hm-stats{grid-template-columns:repeat(4,minmax(0,1fr))}
  .hm-pause-foot{margin-top:13px;padding-top:12px;font-size:9px}
}

@media(prefers-reduced-motion:reduce){
  .hollowmere-ui *{transition-duration:.01ms!important}
}
`;
