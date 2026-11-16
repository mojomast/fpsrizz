export const styles = `
.ember-ui { position: absolute; inset: 0; pointer-events: none; color: #ffe1bb; font: 14px system-ui; }
.ember-ui * { box-sizing: border-box; }
.ember-head, .ember-panel, .ember-actions, .ember-result {
  pointer-events: auto; background: linear-gradient(135deg, rgba(31,22,27,.96), rgba(47,27,24,.92));
  border: 1px solid #a35632; box-shadow: 0 8px 30px #0008;
}
.ember-head { position: absolute; top: 20px; left: 24px; padding: 14px 20px; }
.ember-head h1 { font: 700 25px Georgia; margin: 2px 0; letter-spacing: .08em; }
.ember-kicker { color: #ff9a54; font-size: 10px; letter-spacing: .22em; }
.ember-panel { position: absolute; right: 24px; top: 20px; width: 210px; padding: 16px; }
.ember-stats { font-size: 19px; color: #ffba72; }
.ember-actions {
  position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); padding: 12px;
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; width: min(630px, 95%);
}
.ember-pads { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.ember-ui button { background: #523025; color: #ffe4c2; border: 1px solid #b46c44; padding: 9px; cursor: pointer; }
.ember-ui button:hover, .ember-ui button:focus { background: #98512d; outline: 2px solid #ffcb83; }
.ember-ui button:disabled { opacity: .4; cursor: default; }
.ember-message { color: #ffd7a6; min-height: 38px; }
.ember-result { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); text-align: center; padding: 24px; min-width: 300px; }
.ember-result[hidden] { display: none; }
@media (max-width: 700px) {
  .ember-head { top: 8px; left: 8px; right: 8px; padding: 7px 10px; }
  .ember-head h1 { font-size: 17px; margin: 0; }
  .ember-head small { display: none; }
  .ember-panel { top: 66px; left: 8px; right: 8px; width: auto; padding: 7px 10px; display: grid;
    grid-template-columns: 1fr auto; gap: 3px 8px; align-items: center; }
  .ember-panel .ember-kicker { grid-column: 1 / -1; }
  .ember-panel p { margin: 0; }
  .ember-panel .ember-stats { font-size: 15px; }
  .ember-panel .ember-wave { font-size: 11px; text-align: right; }
  .ember-panel .ember-message { grid-column: 1 / -1; min-height: 0; font-size: 12px; }
  .ember-panel small { display: none; }
  .ember-actions { bottom: 8px; padding: 6px; gap: 4px; width: calc(100% - 16px); }
  .ember-pads { gap: 4px; }
  .ember-ui button { padding: 7px 3px; font-size: 11px; }
}
`;
