import { SessionControl, Ui, definePlugin, hintMechanic } from '../../../../src/sdk/index.ts';
import { Hearth } from '../../contracts/hearth-sim.ts';
import { SaltLedger } from '../../contracts/salt-ledger.ts';
import { Silt } from '../../contracts/silt-archive.ts';
import type { HearthService } from '../../contracts/hearth-sim.ts';
import type { SaltLedgerService } from '../../contracts/salt-ledger.ts';
import type { SiltService } from '../../contracts/silt-archive.ts';

type Guidance = { key: string; hints: readonly string[] };

function silt(service: SiltService): Guidance {
  const s = service.state();
  let hints: string[];
  if (s.status !== 'playing') hints = [`Expedition ended: ${s.status}.`, 'Restart to begin a fresh expedition.'];
  else if (s.pendingUpgrades) hints = [`You have ${s.pendingUpgrades} upgrade choice(s) available.`, 'Choose health, air or damage; upgrades do not advance a turn.'];
  else if (s.enemies.length) {
    const danger = s.enemies.some(e => e.threat.some(p => p.x === s.x && p.y === s.y));
    hints = [danger ? 'Your current cell is marked by an enemy attack.' : 'An enemy is present; check its intent and marked cells.', danger ? 'Move out of the marked cells before the next valid action, or brace if you have charge.' : 'Strike adjacent enemies; watch for windup and use recovery to attack armored foes.'];
  } else if (s.health < s.maxHealth && s.bandages && s.health <= s.maxHealth / 2) hints = ['Your health is low and you carry a bandage.', 'Use a bandage to restore up to 8 health; using it advances a turn.'];
  else if (s.air <= 2 && s.airSupplies) hints = ['Your air is low and you carry an air supply.', 'Use an air supply to restore up to 5 air; entering flooded tiles can consume air.'];
  else if (s.register) hints = ['You have the Heart Register; consider returning safely.', 'Extract at the entry, or at a lift after collecting both district fragments.'];
  else if (s.fragments >= 2) hints = ['Both district fragments are collected.', s.purpose === 'lift' ? 'Use Descend here to continue deeper, or Extract to end the expedition.' : 'Find the lift through connected doors; Descend continues the expedition.'];
  else if (s.purpose === 'fragment') hints = ['This is a fragment room.', 'Try Interact to collect its fragment if it has not already been claimed.'];
  else if (s.purpose === 'passage' && !s.workbench) hints = ['This passage is clear.', 'Interact with its pump to lower water and activate the workbench, if it has not already been activated.'];
  else hints = [`You have ${s.fragments} of 2 district fragments.`, 'Explore connected doors and the revealed district survey; fragment rooms and the district boss each offer progress.'];
  return { key: `silt:${JSON.stringify(s)}`, hints };
}

function salt(service: SaltLedgerService): Guidance {
  const s = service.state();
  let hints: string[];
  if (s.ending) hints = ['Your journey has reached an ending.', 'Reset to explore another path.'];
  else if (s.battle) {
    const ready = s.battle.actors.filter(a => a.hp > 0 && a.ap > 0);
    hints = [`Battle round ${s.battle.round}: ${ready.length} living actor(s) have AP remaining.`, ready.length ? 'Select a living actor: moving or attacking costs 1 AP. Check weapon range and enemy positions before ending the turn.' : 'End the turn to let enemies act and begin the next round.'];
  } else if (s.pending) hints = [`You have ${s.pending} pending level reward(s).`, 'Spend rewards on Force for damage or Vigor for maximum health before your next battle.'];
  else {
    const quest = s.journal.find(q => q.status === 'active');
    const location = service.campaign.locations.find(l => l.id === s.location);
    hints = quest ? [`Your journal has an active objective: ${quest.title}.`, `${quest.instruction}${quest.location ? ` Destination: ${quest.location}.` : ''}${quest.action ? ` Action: ${quest.action}.` : ''}`] : [`You are at ${location?.name ?? s.location}.`, 'Explore adjacent destinations and interact with people and places to advance the story; consult the journal for active objectives.'];
  }
  return { key: `salt:${JSON.stringify(s)}`, hints };
}

function hearth(service: HearthService): Guidance {
  const s = service.state(), resident = s.residents.find(r => r.id === s.selected);
  let hints: string[];
  const owns = (category: string) => s.furniture.some(id => service.household.objects.some(o => o.id === id && o.category === category));
  if (!resident) hints = ['Select a resident to plan their next action.', 'Review their needs and available furniture before choosing an action.'];
  else if (resident.needs.energy < 35) hints = [`${resident.name} has low energy (${resident.needs.energy}).`, owns('sleep') ? 'Choose Sleep to restore energy; care actions advance time.' : 'Buy sleep furniture, then choose Sleep to restore energy.'];
  else if (resident.needs.nourishment < 35) hints = [`${resident.name} needs nourishment (${resident.needs.nourishment}).`, !owns('cooking') ? 'Buy cooking furniture, then prepare a meal; eating costs 5 credits.' : s.money < 5 ? 'A meal costs 5 credits; earn enough money before choosing Eat.' : 'Choose Eat to prepare a meal for 5 credits.'];
  else if (resident.needs.comfort < 35) hints = [`${resident.name} has low comfort (${resident.needs.comfort}).`, owns('hygiene') ? 'Choose Wash to restore comfort; low comfort can strain conversations.' : 'Buy hygiene furniture, then choose Wash to restore comfort.'];
  else if (s.debt > 0) hints = [`The household owes ${s.debt} credits.`, s.money >= s.debt ? 'Choose Pay debt to clear the full balance.' : 'Work can earn credits; the debt must be paid in full.'];
  else if (s.gathering === 'hosted' && s.visitors.length < service.household.visitors.length) hints = ['The gathering is underway.', 'Greet each visitor who has not yet been greeted.'];
  else if (s.projects.filter(p => p.complete).length >= 2 && s.day >= 7 && s.gathering === 'unplanned') hints = ['The household meets the project and day requirements for a gathering.', s.money >= 30 ? 'Choose Host; it costs 30 credits, then greet the visitors.' : 'Hosting costs 30 credits; earn enough before choosing Host.'];
  else hints = [`${s.projects.filter(p => p.complete).length} of ${s.projects.length} projects are complete.`, 'Prepare meals and add seating, have the first resident work shifts and add work furniture, or build healthy conversations across different pairs to advance projects.'];
  return { key: `hearth:${JSON.stringify(s)}`, hints };
}

const styles = `.expedition-assist { position:fixed; right:1rem; bottom:1rem; z-index:40; max-width:min(24rem,calc(100vw - 2rem)); pointer-events:auto; font:14px/1.45 system-ui,sans-serif; color:#fff; }
.expedition-assist section { background:#172630f2; border:1px solid #e8cf95; border-radius:.6rem; padding:.7rem; box-shadow:0 3px 18px #0008; }
.expedition-assist button { color:#fff; background:#344c54; border:1px solid #f0d69c; border-radius:.35rem; padding:.5rem .75rem; cursor:pointer; }
.expedition-assist button:focus-visible { outline:3px solid #fff; outline-offset:2px; }
.expedition-assist p { margin:.6rem 0 0; }`;

export default definePlugin({ activate(ctx) {
  const ui = ctx.services.tryGet(Ui);
  if (!ui) return;
  const ledger = hintMechanic(ctx).create(ctx, 'expedition-assist', [{ id: 'current', levels: 2 }]);
  const root = ui.mount(ctx, 'hud', 'expedition-assist');
  ui.addStyles(ctx, styles);
  root.innerHTML = '<section aria-label="Optional contextual assistance"><button type="button">Show a hint</button><p role="status" aria-live="polite"></p></section>';
  const button = root.querySelector<HTMLButtonElement>('button')!, output = root.querySelector<HTMLElement>('p')!;
  let key = '', hints: readonly string[] = [];
  const refresh = () => {
    const a = ctx.services.tryGet(Silt), b = ctx.services.tryGet(SaltLedger), c = ctx.services.tryGet(Hearth);
    const next = a ? silt(a) : b ? salt(b) : c ? hearth(c) : undefined;
    if ((next?.key ?? '') !== key) {
      output.textContent = '';
      if (key && !ledger.reset('current').ok) { root.hidden = true; return; }
      key = next?.key ?? '';
    }
    hints = next?.hints ?? [];
    root.hidden = !next;
    button.disabled = !next || ctx.services.tryGet(SessionControl)?.playing === false || (!a && !b && c?.state().paused === true) || ledger.level('current') >= hints.length;
    button.textContent = ledger.level('current') ? 'Show another hint' : 'Show a hint';
  };
  const click = () => { refresh(); if (!button.disabled && ledger.reveal('current').ok) { output.textContent = hints[ledger.level('current') - 1] ?? ''; refresh(); } };
  button.addEventListener('click', click);
  ctx.scope.add(() => button.removeEventListener('click', click), 'expedition-assist-input');
  refresh();
  ctx.systems.addFrame({ id: 'expedition/assist.refresh', update: refresh });
} });
