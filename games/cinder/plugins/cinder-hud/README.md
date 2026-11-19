# Cinder Vault HUD (`cinder/hud`)

Provides the `cinder/hud` implementation of `sdk/hud` for Cinder's turn-based interface: class and threat selection, AP and intent, tactical map, pack and forge, dialogue, field guide, view state, and weapon magazines.

## Use

Enable its declared `cinder/game` dependency and select `"sdk/hud": "cinder/hud"`; the [Cinder preset](../../presets/cinder-vault.json) shows the complete role and plugin composition. The manifest requires a selected HUD role but declares no configuration. This HUD reads and issues Cinder-specific commands; it is not a general shooter HUD.

The selected role mounts its UI and owns frame updates only when the necessary services exist. It returns without mounting in headless sessions. Gameplay rules live in `cinder/game` and shared mechanic providers. See the [Cinder guide](../../README.md), [Cinder tests](../../tests/cinder-vault.test.ts), and [browser demo](../../tests/cinder-demo). Run `npm test`; UI changes also require `npm run build && npm run smoke`.
