import { ExperienceRole, PortfolioCards, cardPilesMechanic, createCommandQueue, definePlugin } from '../../sdk/index.ts';

const deck = ['sun-1','wind-1','rain-1','sun-2','wind-2','rain-2','sun-3','wind-3','rain-3','sun-4','wind-4','rain-4'];
const islands = ['sun','wind','rain'];
const weather = (card: string) => card.split('-')[0]!;
export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'portfolio-cards/cloud', { name: 'Cloud Cartographer', description: 'Survey islands while sheltering from the storm.', pointer: 'free', controls: [['Card actions', 'Survey matching islands or shelter'], ['Restart', 'Plan a new expedition']] });
    ctx.addValidator(v => { if (v.selectedRole(ExperienceRole) !== 'portfolio-cards/cloud') v.reporter('preset', 'roles.sdk/experience').error('select portfolio-cards/cloud'); });
  },
  activate(ctx) {
    const provider = cardPilesMechanic(ctx);
    let piles = provider.create(ctx, 'expedition', deck);
    let initialized = false;
    let marks = [0, 0, 0], storm = 0, turns = 0, revision = 0;
    let status: 'playing' | 'won' | 'lost' = 'playing';
    let message = 'A clear horizon. Choose your first survey.';
    const queue = createCommandQueue<string>(ctx, { capacity: 16, normalize: x => typeof x === 'string' && x.length < 160 ? x : undefined });
    ctx.services.provide(PortfolioCards, { state: () => {
      const { hand, draw, discard } = piles.snapshot();
      return { title: 'Cloud Cartographer', instructions: 'Chart each island twice with matching weather. Survey adds one mark and one storm; a bold survey adds up to two marks and two storm. Sacrifice any card to shelter and lower storm by 2. Storm 4 or ten turns ends the expedition.', status,
        summary: `Sun ${marks[0]}/2 · Wind ${marks[1]}/2 · Rain ${marks[2]}/2 · storm ${storm}/4 · turn ${turns}/10 · draw ${draw.length} · discard ${discard.length}`, message, hand,
        actions: hand.flatMap(card => { const target = islands.indexOf(weather(card)); const remaining = 2 - marks[target]!; return [{ id: `survey:${card}`, label: `Survey ${weather(card)}`, detail: remaining > 0 ? `Add 1 mark; storm ${storm} → ${storm + 1}.` : 'Island complete; no turn spent.' }, { id: `bold:${card}`, label: 'Bold survey', detail: remaining > 0 ? `Add ${Math.min(2, remaining)} mark(s); storm ${storm} → ${storm + 2}. Storm 4 loses.` : 'Island complete; no turn spent.' }, { id: `shelter:${card}`, label: 'Shelter', detail: `Sacrifice ${card}; storm ${storm} → ${Math.max(0, storm - 2)}.` }]; }), revision };
    }, enqueue: value => queue.enqueue(value) });
    ctx.systems.add({ id: 'portfolio-cards/cloud.commands', phase: 'control', update() {
      // Activation can occur behind the paused launcher; wait until gameplay permits mutations.
      if (!initialized) { if (!piles.draw(3).ok) return; initialized = true; revision++; }
      const command = queue.drainOne(); if (!command) return;
      if (command === 'restart') {
        piles.dispose(); piles = provider.create(ctx, 'expedition', deck); piles.draw(3);
        marks = [0, 0, 0]; storm = 0; turns = 0; status = 'playing'; message = 'A fresh chart and a clear horizon.'; revision++; queue.clear(); return;
      }
      if (status !== 'playing') return;
      const [action, card, extra] = command.split(':');
      if (extra !== undefined || !card || !piles.snapshot().hand.includes(card) || (action !== 'survey' && action !== 'bold' && action !== 'shelter')) return;
      const target = islands.indexOf(weather(card));
      if ((action === 'survey' || action === 'bold') && (target < 0 || marks[target]! >= 2)) { message = 'That island is already charted. No turn spent.'; revision++; return; }
      if (!piles.discard(card).ok) return;
      turns++;
      if (action === 'survey' || action === 'bold') { const amount = action === 'bold' ? 2 : 1; marks[target] = Math.min(2, marks[target]! + amount); storm += amount; message = `${action === 'bold' ? 'Bold survey' : 'Survey'} recorded for the ${islands[target]} island.`; }
      else { storm = Math.max(0, storm - 2); message = 'The crew shelters until the storm eases.'; }
      if (storm >= 4) { status = 'lost'; message = 'Defeat — the storm overwhelmed the expedition.'; }
      else if (marks.every(n => n === 2)) { status = 'won'; message = 'Victory — all three islands are charted.'; }
      else if (turns >= 10) { status = 'lost'; message = 'Defeat — the expedition ran out of time.'; }
      else if (piles.snapshot().draw.length) piles.draw(1);
      revision++; if (status !== 'playing') queue.clear();
    } });
  },
});
