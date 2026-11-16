# Ember Bastion rules

`ember/game` provides `ExperienceRole` as `ember/bastion`, loads `ember-defense` content into `EmberConfigs`, and exposes the `Ember` service. It owns lane movement, wave orchestration, tower targeting, build legality, victory and defeat while composing selected shared resources, clock, actions and objectives through `mechanics/kits`.

The complete [preset](../../content/presets/ember-bastion.json) enables the game, kit and four providers, content, presentation and theme; it selects `sdk/experience` and each mechanic role and sets `options.defense` to `ember/ash-lane`. The manifest declares those provider roles as activation dependencies. Each tower gets an independent fire action handle; replay disposes tower handles and replaces the kit. Owned state and the bounded command queue are scoped to the session.

Consumers read `state()` and `config` and enqueue `build` with a zero-based pad, or `launch`, `repair`, `pulse`, `replay`. Commands are gated by `SessionControl`; target and pad legality are checked before shared transactions. See the [SDK](../../sdk/contracts/ember.ts), [rules and example strategy](../../../docs/ember-bastion.md), [content](../ember-content/content.json), [game tests](../../../tests/ember-bastion.test.ts) and [composition tests](../../../tests/reusable-games.test.ts).
