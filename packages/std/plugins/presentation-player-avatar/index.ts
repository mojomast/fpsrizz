import type { EntityId } from '@bulkhead/sdk';
import { Inventory, Player, PlayerAvatar, Transform, ViewModes, Visual, definePlugin } from '@bulkhead/sdk';

/**
 * Attaches a theme-visual player body only while an overhead ViewModes provider is active. First-person view remains
 * bodyless, avoiding a sprite inside the player camera.
 */
export default definePlugin({ activate(ctx) {
  let attached: EntityId | undefined;
  let key = '';
  let lastX = 0, lastZ = 0, walkUntil = 0;
  const detach = (): void => {
    if (attached === undefined) return;
    const visual = ctx.world.get(attached, Visual);
    if (visual?.key === key) ctx.world.remove(attached, Visual);
    attached = undefined; key = '';
  };
  ctx.scope.add(detach, 'player-avatar');
  ctx.systems.add({ id: 'presentation/player-avatar.sync', phase: 'presentation', order: 90, update() {
    const player = ctx.world.first(Player);
    const avatar = player === undefined ? undefined : ctx.world.get(player, PlayerAvatar);
    const overhead = ctx.services.tryGet(ViewModes)?.mode === 'isometric';
    if (player === undefined || !avatar || !overhead) { detach(); return; }
    const t = ctx.world.get(player, Transform);
    if (!t) { detach(); return; }
    if (attached !== player || key !== avatar.visual) {
      detach();
      if (ctx.world.has(player, Visual)) return; // another presenter already owns this body
      ctx.world.add(player, Visual, { key: avatar.visual, state: 'idle', stateAt: ctx.time.now, y: avatar.y, scale: avatar.scale, tint: '', renderer: '' });
      attached = player; key = avatar.visual; lastX = t.x; lastZ = t.z;
    }
    const visual = ctx.world.get(player, Visual); if (!visual) return;
    if (Math.hypot(t.x - lastX, t.z - lastZ) > 0.01) { lastX = t.x; lastZ = t.z; walkUntil = ctx.time.now + 0.2; }
    const inv = ctx.world.get(player, Inventory);
    const attacking = inv ? ctx.time.now - inv.lastFiredAt >= 0 && ctx.time.now - inv.lastFiredAt < 0.16 : false;
    const next = attacking ? 'attack' : ctx.time.now < walkUntil ? 'walk' : 'idle';
    if (visual.state !== next) { visual.state = next; visual.stateAt = ctx.time.now; }
    visual.y = avatar.y; visual.scale = avatar.scale;
  } });
} });
