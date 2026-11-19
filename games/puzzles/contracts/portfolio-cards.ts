import { defineRegistry, defineRole, defineService } from '@bulkhead/sdk';
import type { SessionContext } from '@bulkhead/sdk';
import type { MechanicFactory, MechanicProviderInfo, MechanicResult } from '@bulkhead/sdk';

/** Ordered IDs form a partition. Index zero is the top of the draw pile. */
export interface CardPilesSnapshot { readonly draw: readonly string[]; readonly hand: readonly string[]; readonly discard: readonly string[] }
export interface CardPiles {
  readonly active: boolean;
  snapshot(): CardPilesSnapshot;
  /** Move exactly count cards or reject without mutation. */
  draw(count: number): MechanicResult;
  discard(id: string): MechanicResult;
  dispose(): void;
}
export interface CardPilesProvider { create(owner: SessionContext, id: string, cards: readonly string[]): CardPiles }
export const CardPilesProviders = defineRegistry<MechanicFactory<CardPilesProvider>>('portfolio-card-piles-provider');
export const CardPilesRole = defineRole<MechanicProviderInfo>('sdk/portfolio-card-piles');
export function cardPilesMechanic(ctx: SessionContext): CardPilesProvider {
  const selected = ctx.role(CardPilesRole);
  if (!selected) throw new Error('Select sdk/portfolio-card-piles');
  return ctx.instantiate(CardPilesProviders, selected.id, (factory, owner) => factory.start(owner));
}

export interface PortfolioCardAction { readonly id: string; readonly label: string; readonly detail: string }
export interface PortfolioCardsState {
  readonly title: string; readonly instructions: string; readonly status: 'playing' | 'won' | 'lost';
  readonly summary: string; readonly message: string; readonly hand: readonly string[];
  readonly actions: readonly PortfolioCardAction[]; readonly revision: number;
}
export interface PortfolioCardsService { state(): PortfolioCardsState; enqueue(command: unknown): boolean }
export const PortfolioCards = defineService<PortfolioCardsService>('portfolio/cards-game');
