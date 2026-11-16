export const styles = `
.puzzle-ui { position:absolute; inset:0; pointer-events:none; color:#e8ede2; font:14px/1.5 system-ui,sans-serif; }
.puzzle-ui * { box-sizing:border-box; }
.puzzle-ui button { pointer-events:auto; font:inherit; cursor:pointer; color:#e1e9dd; background:#263b3c; border:1px solid #647369; border-radius:4px; padding:9px 13px; transition:background .15s,border-color .15s; }
.puzzle-ui button:hover:not(:disabled) { background:#3b5350; border-color:#d8bc80; }
.puzzle-ui button:focus-visible, .puzzle-ui summary:focus-visible { outline:2px solid #a1f0cd; outline-offset:3px; }
.puzzle-ui button:disabled { opacity:.38; cursor:default; }
.puzzle-head { position:absolute; top:25px; left:32px; right:32px; display:flex; justify-content:space-between; align-items:flex-start; }
.puzzle-eyebrow { color:#bfa87a; font-size:10px; font-weight:700; letter-spacing:.25em; text-transform:uppercase; }
.puzzle-head h1 { font-family:Georgia,serif; font-size:clamp(28px,4vw,50px); line-height:1.1; font-weight:400; letter-spacing:.1em; margin:5px 0 3px; }
.puzzle-head p { color:#92a9a2; margin:0; font-size:12px; letter-spacing:.07em; }
.puzzle-edition { text-align:right; color:#b0c2b7; border-top:1px solid #7a8067; padding-top:8px; font-size:11px; letter-spacing:.14em; }
.puzzle-side { position:absolute; right:28px; top:143px; width:274px; max-height:calc(100% - 225px); overflow:auto; pointer-events:auto; background:linear-gradient(155deg,#263a39eb,#182b2ee8); border:1px solid #53645b; border-top:2px solid #bfa87a; padding:23px; box-shadow:0 18px 50px #07151855; }
.puzzle-side h2 { font:25px/1.2 Georgia,serif; color:#f1e6c9; margin:10px 0 18px; }
.puzzle-stats { display:flex; gap:20px; border-top:1px solid #485d54; border-bottom:1px solid #485d54; padding:12px 0; margin-bottom:16px; }
.puzzle-stats strong { display:block; font:30px/1.1 Georgia,serif; color:#e8eddc; }
.puzzle-stats small { font-size:9px; letter-spacing:.16em; color:#9cb3a6; text-transform:uppercase; }
.puzzle-seals { font-weight:700; color:#9debc9; display:flex; justify-content:space-between; align-items:center; }
.puzzle-seals span:last-child { font-size:20px; letter-spacing:.2em; }
.puzzle-goal { font-size:12px; color:#a6beb2; margin:7px 0 14px; }
.puzzle-watch { display:flex; gap:12px; align-items:center; padding:13px 0; border-top:1px solid #485d54; }
.puzzle-watch img { width:43px; height:51px; object-fit:contain; image-rendering:pixelated; }
.puzzle-watch strong { display:block; font-size:13px; }
.puzzle-watch small { display:block; color:#9bb4ab; font-size:11px; }
.puzzle-watch.imminent strong { color:#ffbd8c; }
.puzzle-side details { font-size:12px; border-top:1px solid #485d54; padding-top:12px; color:#b9c9bc; }
.puzzle-side summary { cursor:pointer; color:#d2bb85; }
.puzzle-side details p { margin:8px 0 0; }
.puzzle-toolbar { position:absolute; bottom:23px; left:28px; right:330px; display:flex; align-items:center; gap:11px; justify-content:space-between; }
.puzzle-dpad { display:grid; grid-template-columns:repeat(3,36px); grid-template-rows:repeat(2,32px); gap:3px; }
.puzzle-dpad button { padding:0; font-size:19px; }
.puzzle-dpad [data-direction=north] { grid-column:2; }
.puzzle-dpad [data-direction=west] { grid-column:1; grid-row:2; }
.puzzle-dpad [data-direction=south] { grid-column:2; grid-row:2; }
.puzzle-dpad [data-direction=east] { grid-column:3; grid-row:2; }
.puzzle-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
.puzzle-actions button { padding:8px 10px; font-size:12px; }
.puzzle-camera { display:flex; align-items:center; gap:5px; }
.puzzle-camera button { padding:6px 10px; }
.puzzle-camera span { font-size:10px; letter-spacing:.09em; color:#a6b9af; }
.puzzle-status { position:absolute; left:32px; right:350px; bottom:100px; margin:0; text-align:center; color:#b4c8bc; font-size:12px; text-shadow:0 2px 8px #081215; }
.puzzle-keyboard { position:absolute; right:28px; bottom:25px; width:274px; color:#7e9c94; font-size:10px; text-align:center; letter-spacing:.06em; }
.puzzle-result { pointer-events:auto; position:absolute; top:50%; left:calc((100% - 320px)/2); transform:translate(-50%,-50%); width:min(370px,80vw); text-align:center; background:#192e30f5; border:1px solid #c8b078; padding:28px; box-shadow:0 24px 70px #061417b0; }
.puzzle-result h2 { font:31px/1.2 Georgia,serif; color:#f3e6bf; margin:8px 0 12px; }
.puzzle-result p { color:#b3c9bb; font-size:13px; }
.puzzle-result .result-buttons { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.puzzle-result .primary { background:#bfa97a; border-color:#e0ca99; color:#192e2c; font-weight:700; }
.puzzle-result[hidden], .puzzle-ui [hidden] { display:none!important; }
.puzzle-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
.puzzle-mobile-goal { display:none; }
@media(max-width:999px) and (min-width:700px) {
  .puzzle-side { width:208px; right:18px; top:124px; max-height:calc(100% - 146px); padding:16px; }
  .puzzle-side h2 { font-size:21px; margin-bottom:12px; }
  .puzzle-stats { gap:15px; padding:9px 0; margin-bottom:10px; }
  .puzzle-stats strong { font-size:25px; }
  .puzzle-watch { padding:8px 0; gap:8px; }
  .puzzle-watch img { width:33px; height:40px; }
  .puzzle-watch strong { font-size:11px; }
  .puzzle-watch small { font-size:10px; }
  .puzzle-toolbar { right:245px; left:18px; gap:8px; }
  .puzzle-actions { max-width:170px; }
  .puzzle-actions button { padding:6px 8px; }
  .puzzle-camera { flex-direction:column; gap:2px; }
  .puzzle-camera span { display:none; }
  .puzzle-camera button { padding:3px 9px; }
  .puzzle-status { right:250px; left:20px; font-size:11px; }
  .puzzle-keyboard { display:none; }
  .puzzle-result { left:calc((100% - 240px)/2); width:320px; }
}
@media(max-width:699px) {
  .puzzle-head { top:18px; left:18px; right:18px; }
  .puzzle-head h1 { font-size:31px; }
  .puzzle-eyebrow { font-size:8px; letter-spacing:.18em; }
  .puzzle-head p { font-size:10px; }
  .puzzle-edition { display:none; }
  .puzzle-side { display:none; }
  .puzzle-mobile-goal { display:block; position:absolute; top:105px; left:18px; right:18px; padding-top:10px; border-top:1px solid #4c6257; color:#a6d3bf; font-size:11px; text-align:center; }
  .puzzle-toolbar { bottom:32px; left:18px; right:18px; gap:8px; flex-wrap:wrap; }
  .puzzle-actions { max-width:180px; }
  .puzzle-actions button { padding:8px 10px; }
  .puzzle-camera { width:100%; justify-content:center; }
  .puzzle-camera button { padding:3px 12px; }
  .puzzle-status { left:20px; right:20px; bottom:156px; font-size:11px; }
  .puzzle-keyboard { bottom:9px; left:18px; right:18px; width:auto; font-size:8px; }
  .puzzle-result { left:50%; width:min(330px,90vw); padding:22px; }
}
@media(prefers-reduced-motion:reduce) { .puzzle-ui button { transition:none; } }
`;
