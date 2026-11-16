# The Last Light

An independent point-and-click story. `story/adventure` owns the authoritative room graph, inventory, flags and journal; `story/presentation` reads the `Adventure` SDK service; `story/chapter` supplies the `adventure-chapter` content kind. The preset selects `story/adventure` for `sdk/experience` (free pointer) and `theme/story` for `sdk/theme`. It requires no shooter gameplay plugins.

Actions are queued through `Adventure.enqueue` and committed FIFO by `story/adventure.commands` in the `rules` phase. The optional `SessionControl` service rejects ingress while not playing. Invalid actions do not change state or spend items. The service returns copies of state arrays.

The queue uses the shared SDK [bounded command helper](command-queues.md), with capacity 128 and snapshot-batch
draining: each tick processes the batch present at its start. Commands enqueued during processing wait for a later tick.
Reset/load/save retain their positions within that batch. The helper owns pause/disposal gating and pending-command
cleanup; chapter command normalization, item/flag legality and save replay remain story responsibilities. Enqueue
success means acceptance into the queue, not a successful story action.

The chapter contains `version`, labels, `start`, `intro`, `rooms`, item definitions, a victory definition and `actions`. Rooms select a theme art key and a presentation motif; items select an optional icon key, and actions select an optional sound key. Each action has an ID, label, room and response text. Optional conditions are `require` and `missing` flags and `items`; optional effects are `consume`, `add`, `flags`, `once`, `journal` and `move`. Consumed items must be required. Validation bounds sizes, rejects unknown fields and checks references during staging; referenced flags must be produced by an action or listed in `initialFlags`. Raising the chapter version intentionally makes old snapshots incompatible.

Save and Load are explicit. The optional profile stores a versioned, chapter-identified JSON action history under `story/save/<chapter-id>`; load replays it into a temporary state and only commits a valid replay. Other profile values are preserved. Reset and host restart do not write the save. This is a save of this adventure alone, not a general session snapshot. Profile replacement is not coordinated between tabs. The queue holds at most 128 commands; a run records at most 4096 accepted actions. Further actions are rejected without changing state when that limit is reached. Completion is driven by the authored victory flag and leaves exploration, Load and Start over available. Only accepted actions emit `AdventureActionResolved`, including their optional theme sound key.

## Completion route

1. On the quay, inspect the sea if desired, then choose either conversation with Mara. Take the workshop key she gives you.
2. Unlock the workshop. Read the keeper's log, take the clouded lens and polishing cloth, and combine lens + cloth at the workbench.
3. Climb to the lantern room. Release the brass catch, raise the shutter, and install the polished lens.
4. Light the beacon. The boat sees the light and the journal records the rescue.

If an action is attempted before its clues or items are available, nothing is consumed; return to the relevant room, collect the missing evidence or supplies, and try again. Both opening dialogue branches lead to the same recoverable puzzle, while recording different facts and flags.
