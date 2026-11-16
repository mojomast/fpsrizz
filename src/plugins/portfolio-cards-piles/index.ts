import { CardPilesProviders, CardPilesRole, SessionControl, createOwnedInstances, definePlugin } from '../../sdk/index.ts';

export default definePlugin({ register(ctx) {
  ctx.provideRole(CardPilesRole, 'portfolio-cards/piles', { name: 'Ordered card piles', description: 'Owned draw, hand and discard partition' });
  ctx.register(CardPilesProviders, 'portfolio-cards/piles', { start(provider) {
    const instances = createOwnedInstances(provider, 'portfolio-card-piles');
    return { create(owner, id, cards) {
      if (!Array.isArray(cards) || cards.length < 1 || cards.length > 256 || [...cards].some(c => typeof c !== 'string' || !c.trim() || c.length > 128) || new Set(cards).size !== cards.length) throw new Error('Cards must be 1..256 unique nonblank IDs');
      const draw = [...cards], hand: string[] = [], discard: string[] = [];
      const lease = instances.acquire(owner, id);
      const allowed = () => lease.active && owner.services.tryGet(SessionControl)?.playing !== false;
      return Object.freeze({
        get active() { return lease.active; }, dispose: lease.dispose,
        snapshot: () => Object.freeze({ draw: Object.freeze([...draw]), hand: Object.freeze([...hand]), discard: Object.freeze([...discard]) }),
        draw(count: number) {
          if (!allowed() || !Number.isSafeInteger(count) || count <= 0 || count > draw.length) return { ok: false, reason: 'Cannot draw' };
          hand.push(...draw.splice(0, count)); return { ok: true, reason: '' };
        },
        discard(id: string) {
          if (!allowed()) return { ok: false, reason: 'Cannot discard' };
          const index = hand.indexOf(id); if (index < 0) return { ok: false, reason: 'Card is not held' };
          discard.push(...hand.splice(index, 1)); return { ok: true, reason: '' };
        },
      });
    } };
  } });
} });
