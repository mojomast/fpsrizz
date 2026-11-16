# Expedition assist

An optional, keyboard-operable HUD for Silt Archive, Salt Ledger and Common Ground. It observes detached family
state, displays nothing until requested, and offers two progressive hints for the current situation. It never sends
gameplay commands. The shared `mechanics/hints` provider owns reveal counts and lifecycle; the UI owns its text and
context policy. See [integration and behavior](../../../docs/expedition-assist.md) for exact wiring and limits.

Run `node --test tests/expedition-assist.test.ts` with Node 22.18 or newer.
