import { ExperienceRole, PortfolioCards, cardPilesMechanic, createCommandQueue, definePlugin } from '../../sdk/index.ts';

const deck = ['ash-1','ink-1','ink-2','ember-1','ember-2','ash-2','ash-3','ink-3','ember-3','ash-4','ink-4','ember-4'];
const seals = ['ash','ink','ink','ember','ember','ash'];
const glyph = (card: string) => card.split('-')[0]!;
export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'portfolio-cards/ash', { name: 'Ash & Ink', description: 'Break the clockwork scribe’s seals.', pointer: 'free', controls: [['Card actions', 'Choose a glyph or restore ink'], ['Restart', 'Start a fresh duel']] });
    ctx.addValidator(v => { if (v.selectedRole(ExperienceRole) !== 'portfolio-cards/ash') v.reporter('preset', 'roles.sdk/experience').error('select portfolio-cards/ash'); });
  },
  activate(ctx) {
    const provider = cardPilesMechanic(ctx);
    let piles = provider.create(ctx, 'duel', deck);
    let initialized = false;
    let step = 0, ink = 5, turns = 0, revision = 0;
    let status: 'playing' | 'won' | 'lost' = 'playing';
    let message = 'The first seal awaits ash.';
    const queue = createCommandQueue<string>(ctx, { capacity: 16, normalize: x => typeof x === 'string' && x.length < 160 ? x : undefined });
    ctx.services.provide(PortfolioCards, { state: () => {
      const hand = piles.snapshot().hand;
      return { title: 'Ash & Ink', instructions: 'Break all three two-glyph seals in order. Play a matching glyph for 1 ink, or sacrifice any card to restore 2 ink. Each play takes one turn; finish by turn 8 before ink runs out.', status,
        summary: `Seal ${Math.min(3, Math.floor(step / 2) + 1)} / 3 · next ${seals[step] ?? 'complete'} · ink ${ink} · turn ${turns} / 8`, message, hand,
        actions: hand.flatMap(card => [{ id: `play:${card}`, label: `Inscribe ${glyph(card)}`, detail: card }, { id: `restore:${card}`, label: 'Restore 2 ink', detail: `Sacrifice ${card}` }]), revision };
    }, enqueue: value => queue.enqueue(value) });
    ctx.systems.add({ id: 'portfolio-cards/ash.commands', phase: 'control', update() {
      // Activation can occur behind the paused launcher; wait until gameplay permits mutations.
      if (!initialized) { if (!piles.draw(3).ok) return; initialized = true; revision++; }
      const command = queue.drainOne(); if (!command) return;
      if (command === 'restart') {
        piles.dispose(); piles = provider.create(ctx, 'duel', deck); piles.draw(3);
        step = 0; ink = 5; turns = 0; status = 'playing'; message = 'A fresh page. The first seal awaits ash.'; revision++; queue.clear(); return;
      }
      if (status !== 'playing') return;
      const [action, card, extra] = command.split(':');
      if (extra !== undefined || !card || !piles.snapshot().hand.includes(card) || (action !== 'play' && action !== 'restore')) return;
      if (action === 'play' && glyph(card) !== seals[step]) { message = `Wrong glyph: the seal requires ${seals[step]}. No turn spent.`; revision++; return; }
      if (!piles.discard(card).ok) return;
      turns++;
      if (action === 'play') { step++; ink--; message = 'The glyph cracks the seal.'; }
      else { ink = Math.min(7, ink + 2); message = 'The scribe distills a card into ink.'; }
      if (ink <= 0) { status = 'lost'; message = 'Defeat — the ink ran dry.'; }
      else if (step === seals.length) { status = 'won'; message = 'Victory — all three seals are broken.'; }
      else if (turns >= 8) { status = 'lost'; message = 'Defeat — the clockwork scribe ran out of time.'; }
      else if (piles.snapshot().draw.length) piles.draw(1);
      revision++; if (status !== 'playing') queue.clear();
    } });
  },
});
