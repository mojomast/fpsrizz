# Ember Bastion presentation

`ember/presentation` consumes the `Ember` service to render a lit 3D bastion and accessible DOM controls. Enable it with `ember/game`; the complete [Ember preset](../../content/presets/ember-bastion.json) supplies content, theme and mechanic roles. It does not provide or select a HUD role.

Players can click scene pads or use numbered buttons to enqueue builds, launch waves, repair, pulse and replay. Action costs, availability and cooldowns come from game observations; `SessionControl` gates command ingress. Render and UI are optional, and frame systems, listeners and Three.js resources are owned by the presentation scope. Rules and resource transactions stay in the game and selected providers.

The scene presents Ember's authored lane and `Ember` contract rather than a generic tower-defense renderer. See the [game guide](../../../docs/ember-bastion.md), [SDK](../../sdk/contracts/ember.ts), [game tests](../../../tests/ember-bastion.test.ts) and [shared composition tests](../../../tests/reusable-games.test.ts).
