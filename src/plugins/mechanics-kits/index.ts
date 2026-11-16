import { definePlugin, MechanicKits, ResourceMechanicRole, ClockMechanicRole, ActionMechanicRole, ObjectiveMechanicRole, ResourcePoolProviders, MechanicClockProviders, MechanicActionProviders, ObjectiveProviders } from '../../sdk/index.ts';
import { loadKit } from './content.ts';

export default definePlugin({ register(ctx) {
  ctx.contentKind('mechanic-kit', { description: 'Bounded resources, explicit clock, actions and prerequisite objectives', load(data, c) {
    const kit = loadKit(data, c.r);
    if (kit) c.register(MechanicKits, c.id, kit);
  } });
  ctx.addValidator(v => {
    const pairs = [
      [ResourceMechanicRole, ResourcePoolProviders], [ClockMechanicRole, MechanicClockProviders],
      [ActionMechanicRole, MechanicActionProviders], [ObjectiveMechanicRole, ObjectiveProviders],
    ] as const;
    for (const [role, registry] of pairs) {
      const selected = v.selectedRole(role);
      if (selected && !v.registries.has(registry, selected)) v.reporter('preset', `roles.${role.id}`).error(`Selected mechanic provider ${selected} must register a matching factory for ${role.id}`);
    }
  });
} });
