export const STORY_CSS = `
.story-completion { border-top: 1px solid #b49d73; margin-top: 18px; color: #f7d588; }
.story-completion h3 { font-size: 23px; font-weight: normal; margin-bottom: 6px; }
.story-ui {
  position: absolute;
  inset: 0;
  overflow: auto;
  pointer-events: auto;
  background: #101d28;
  color: #f2e7ce;
  font: 16px/1.45 Georgia,serif;
}

.story-ui * {
  box-sizing: border-box;
}
.story-wrap {
  max-width: 1380px;
  margin: auto;
  padding: 24px;
  display: grid;
  grid-template-columns: minmax(0,2fr) minmax(250px,1fr);
  gap: 18px;
}

.story-header {
  grid-column: 1/-1;
  display: flex;
  justify-content: space-between;
  align-items: end;
  border-bottom: 1px solid #a98858;
  padding-bottom: 12px;
}
.story-header h1 {
  font-size: clamp(25px,4vw,42px);
  font-weight: normal;
  margin: 0;
  letter-spacing: .03em;
}
.story-kicker {
  font: 11px sans-serif;
  letter-spacing: .23em;
  color: #e3be80;
  text-transform: uppercase;
}

.story-scene,.story-side,.story-narrative {
  background: #1e3039;
  border: 1px solid #6e6a58;
  box-shadow: 0 8px 30px #050d1388;
}
.story-scene {
  position: relative;
  min-height: 320px;
  overflow: hidden;
  background: linear-gradient(#496c7c,#1c3641 65%,#142630);
}

.story-plate {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: .58;
}
.story-illustration {
  position: absolute;
  inset: 0;
  background: linear-gradient(0deg,#101d28 0%,transparent 55%),linear-gradient(125deg,#d6b47b22,transparent 60%);
}

.story-motif-shelves {
  background: linear-gradient(135deg,#654f38,#23343a 60%,#101d28);
}
.story-motif-window {
  background: radial-gradient(circle at 72% 35%,#d7b87588,transparent 26%),linear-gradient(#536e79,#1c303b);
}

.story-motif-tower .story-illustration:before {
  content: '';
  position: absolute;
  right: 15%;
  top: 7%;
  width: 15%;
  height: 65%;
  background: #172630;
  clip-path: polygon(30% 10%,70% 10%,78% 18%,87% 100%,13% 100%,22% 18%);
  box-shadow: 0 0 30px #f6c87733;
}

.story-motif-shelves .story-plate,.story-motif-window .story-plate {
  opacity: .16;
}
.story-motif-shelves .story-illustration:before {
  content: '';
  position: absolute;
  right: 8%;
  top: 14%;
  width: 45%;
  height: 51%;
  border: 12px solid #2a2825;
  background: repeating-linear-gradient(0deg,#55483b 0 30%,#252b2b 31% 35%);
  box-shadow: 0 9px 0 #b08c59;
}

.story-motif-window .story-illustration:before {
  content: '';
  position: absolute;
  right: 15%;
  top: 8%;
  width: 31%;
  height: 60%;
  border: 9px solid #24343b;
  border-radius: 50% 50% 5% 5%;
  background: linear-gradient(90deg,transparent 46%,#24343b 47% 53%,transparent 54%),linear-gradient(#b7c7bd77,#91a3a155);
  box-shadow: 0 0 45px #f5cc6c55;
}

.story-scene-content {
  position: relative;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  justify-content: end;
  padding: 24px;
}
.story-scene h2 {
  font-size: 30px;
  font-weight: normal;
  margin: 6px 0;
}
.story-scene p {
  max-width: 55ch;
  margin: 0 0 16px;
  text-shadow: 0 2px 4px #000;
}

.story-item-icon {
  width: 32px;
  height: 32px;
  vertical-align: middle;
  margin-right: 8px;
  image-rendering: auto;
}

.story-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.story-ui button {
  font: inherit;
  cursor: pointer;
  color: #f4e7cd;
  background: #172b35;
  border: 1px solid #b09b75;
  padding: 9px 12px;
  text-align: left;
}
.story-ui button:hover,.story-ui button:focus-visible {
  outline: 2px solid #f4d38a;
  outline-offset: 2px;
  background: #3b5154;
}
.story-ui button[aria-disabled=true] {
  opacity: .65;
}
.story-side {
  padding: 20px;
}
.story-side h2,.story-narrative h2 {
  font: 11px sans-serif;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: #e3be80;
  margin: 0 0 12px;
}
.story-side ul {
  padding-left: 20px;
}
.story-side li {
  margin-bottom: 8px;
}
.story-narrative {
  padding: 20px;
  min-height: 100px;
}
.story-message {
  font-size: 19px;
  margin: 0;
}
.story-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 20px;
}
.story-controls button {
  font: 12px sans-serif;
}
.story-divider {
  height: 1px;
  background: #627078;
  margin: 22px 0;
}
.story-hint {
  font: 12px/1.5 sans-serif;
  color: #c5c5b6;
}
.story-portrait {
  width: 68px;
  height: 68px;
  float: right;
  border: 1px solid #b49d73;
  margin-left: 10px;
}
.story-win {
  color: #f7d588;
}

@media(max-width:720px) {
  .story-wrap {
  display: block;
  padding: 12px;
}
.story-header,.story-scene,.story-side,.story-narrative {
  margin-bottom: 12px;
}
.story-scene,.story-scene-content {
  min-height: 280px;
}
.story-header {
  display: block;
}
.story-ui {
  font-size: 15px;
}

}

`;
