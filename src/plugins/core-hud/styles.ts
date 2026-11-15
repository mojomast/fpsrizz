/** Stylesheet for the standard HUD. Every class is prefixed `core-hud`. Pure data: no side effects. */
export const HUD_CSS = `
.core-hud{--u:clamp(8px,1.9vmin,21px);--amber:#ffb000;--amber-dim:#7a5400;--red:#ff3a1f;--steel:rgba(10,11,12,.82);
position:absolute;inset:0;overflow:hidden;pointer-events:none;user-select:none;
font-family:ui-monospace,'Cascadia Mono','DejaVu Sans Mono','Liberation Mono',Menlo,Consolas,monospace;
font-weight:800;text-transform:uppercase;color:var(--amber);text-shadow:0 0 calc(var(--u)*.5) rgba(0,0,0,.9),0 calc(var(--u)*.1) 0 #000}
.core-hud *{box-sizing:border-box}
.core-hud-panel{position:absolute;background:linear-gradient(180deg,rgba(34,35,36,.86),var(--steel) 22%,rgba(6,7,8,.88));
border:2px solid var(--amber);padding:calc(var(--u)*1.1) calc(var(--u)*1.3) calc(var(--u)*.9);
box-shadow:0 0 0 1px #000,0 calc(var(--u)*.3) calc(var(--u)*1.2) rgba(0,0,0,.65),inset 0 0 0 1px rgba(255,176,0,.18),inset 0 0 calc(var(--u)*1.5) rgba(0,0,0,.7)}
.core-hud-panel::before{content:"";position:absolute;left:-2px;right:-2px;top:-2px;height:calc(var(--u)*.55);
background:repeating-linear-gradient(-45deg,var(--amber) 0 calc(var(--u)*.55),#0a0a0a calc(var(--u)*.55) calc(var(--u)*1.1))}
.core-hud-panel{padding-top:calc(var(--u)*1.5)}
.core-hud-label{font-size:calc(var(--u)*.95);letter-spacing:.22em;color:rgba(255,176,0,.78);line-height:1}
.core-hud-num{font-size:calc(var(--u)*5);line-height:.95;letter-spacing:-.04em;font-variant-numeric:tabular-nums;transform:scaleX(.9);transform-origin:left bottom;white-space:nowrap}
.core-hud-num small{font-size:.38em;letter-spacing:0;opacity:.7;margin-left:.2em}
.core-hud-health{left:calc(var(--u)*1.6);bottom:calc(var(--u)*1.6);width:calc(var(--u)*19)}
.core-hud-bar{display:flex;gap:calc(var(--u)*.18);margin-top:calc(var(--u)*.7);height:calc(var(--u)*1.2)}
.core-hud-seg{flex:1;background:#1c1c1c;box-shadow:inset 0 0 0 1px rgba(255,176,0,.22)}
.core-hud-seg.core-hud-on{background:var(--amber);box-shadow:0 0 calc(var(--u)*.6) rgba(255,176,0,.55)}
.core-hud-crit .core-hud-health{border-color:var(--red)}
.core-hud-crit .core-hud-health .core-hud-num,.core-hud-crit .core-hud-health .core-hud-label{color:var(--red)}
.core-hud-crit .core-hud-health .core-hud-seg.core-hud-on{background:var(--red);box-shadow:0 0 calc(var(--u)*.6) rgba(255,58,31,.7)}
.core-hud-ammo{right:calc(var(--u)*1.6);bottom:calc(var(--u)*1.6);min-width:calc(var(--u)*19);text-align:right}
.core-hud-weapon{font-size:calc(var(--u)*1.7);letter-spacing:.08em;line-height:1.1;margin-bottom:calc(var(--u)*.5);white-space:nowrap}
.core-hud-ammo .core-hud-num{transform-origin:right bottom;margin-top:calc(var(--u)*.3)}
.core-hud-ammotype{margin-top:calc(var(--u)*.3)}
.core-hud-slots{display:flex;gap:calc(var(--u)*.5);justify-content:flex-end;margin-top:calc(var(--u)*.9);padding-top:calc(var(--u)*.8);border-top:1px solid rgba(255,176,0,.3)}
.core-hud-slot{min-width:calc(var(--u)*3.4);padding:calc(var(--u)*.3) calc(var(--u)*.5);border:1px solid rgba(255,176,0,.4);background:rgba(0,0,0,.5);text-align:center;color:rgba(255,176,0,.65)}
.core-hud-slot b{display:block;font-size:calc(var(--u)*1.3);line-height:1.1}
.core-hud-slot i{display:block;font-style:normal;font-size:calc(var(--u)*.9);line-height:1.1;opacity:.85}
.core-hud-slot.core-hud-cur{background:var(--amber);color:#111;border-color:var(--amber);text-shadow:none;box-shadow:0 0 calc(var(--u)*.8) rgba(255,176,0,.6)}
.core-hud-slot.core-hud-empty i{color:var(--red)}
.core-hud-slot.core-hud-cur.core-hud-empty i{color:#8a1200}
.core-hud-objective{left:calc(var(--u)*1.6);top:calc(var(--u)*1.6);width:calc(var(--u)*24);max-width:26vw}
.core-hud-objtext{font-size:calc(var(--u)*1.45);letter-spacing:.04em;line-height:1.25;margin-top:calc(var(--u)*.5);color:#ffe3a0;word-break:break-word}
.core-hud-stat{display:flex;justify-content:space-between;gap:calc(var(--u)*1);font-size:calc(var(--u)*1.15);line-height:1.2;margin-top:calc(var(--u)*.4);letter-spacing:.06em}
.core-hud-stat span:first-child{color:rgba(255,176,0,.7)}
.core-hud-stat span:last-child{color:#ffe3a0}
.core-hud-stats{margin-top:calc(var(--u)*.7);padding-top:calc(var(--u)*.4);border-top:1px solid rgba(255,176,0,.3)}
.core-hud-stats:empty{display:none}
.core-hud-hidden{display:none!important}
.core-hud-notice{left:50%;top:calc(var(--u)*2);transform:translateX(-50%) translateY(calc(var(--u)*-.8));width:max-content;max-width:40vw;text-align:center;line-height:1.2;
padding:calc(var(--u)*1.5) calc(var(--u)*2.4) calc(var(--u)*.8);font-size:calc(var(--u)*1.9);letter-spacing:.14em;opacity:0;transition:opacity .25s,transform .25s}
.core-hud-notice.core-hud-show{opacity:1;transform:translateX(-50%)}
.core-hud-cross{position:absolute;left:50%;top:50%;width:0;height:0}
.core-hud-cross i{position:absolute;background:var(--amber);box-shadow:0 0 0 1px rgba(0,0,0,.9);transition:transform .09s ease-out}
.core-hud-cross i:nth-child(1){left:-1px;width:2px;height:calc(var(--u)*.9);top:calc(var(--u)*-1.7)}
.core-hud-cross i:nth-child(2){left:-1px;width:2px;height:calc(var(--u)*.9);top:calc(var(--u)*.8)}
.core-hud-cross i:nth-child(3){top:-1px;height:2px;width:calc(var(--u)*.9);left:calc(var(--u)*-1.7)}
.core-hud-cross i:nth-child(4){top:-1px;height:2px;width:calc(var(--u)*.9);left:calc(var(--u)*.8)}
.core-hud-cross b{position:absolute;left:-1px;top:-1px;width:2px;height:2px;background:var(--amber);box-shadow:0 0 0 1px #000}
.core-hud-fire .core-hud-cross i:nth-child(1){transform:translateY(calc(var(--u)*-.9))}
.core-hud-fire .core-hud-cross i:nth-child(2){transform:translateY(calc(var(--u)*.9))}
.core-hud-fire .core-hud-cross i:nth-child(3){transform:translateX(calc(var(--u)*-.9))}
.core-hud-fire .core-hud-cross i:nth-child(4){transform:translateX(calc(var(--u)*.9))}
.core-hud-vignette,.core-hud-lowhp{position:absolute;inset:0;opacity:0}
.core-hud-vignette{background:radial-gradient(ellipse at center,rgba(255,0,0,0) 35%,rgba(210,10,0,.55) 75%,rgba(150,0,0,.95) 100%)}
.core-hud-lowhp{background:radial-gradient(ellipse at center,rgba(255,0,0,0) 45%,rgba(190,0,0,.7) 100%)}
.core-hud-low .core-hud-lowhp{animation:core-hud-pulse 1.1s ease-in-out infinite}
@keyframes core-hud-pulse{0%,100%{opacity:.12}45%{opacity:.85}}
.core-hud-dead .core-hud-panel{filter:grayscale(1) brightness(.8)}
.core-hud-dead .core-hud-ammo,.core-hud-dead .core-hud-cross{display:none}
`;
