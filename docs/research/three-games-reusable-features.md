# Reusable features for the three new games

The games retain their own rules and presentation; role-selected providers expose shared capabilities with concrete
consumer evidence and tests.

| Capability | Discovery | Decision under evaluation |
| --- | --- | --- |
| Temporary effects | `recipe/explicit-deadlines`, `mechanics/clock`; shooter-only `example/ward` | `mechanics/conditions` composes deadlines for named target windows; Silt owns exposure effects. |
| Relationships | `common/game`, `mechanics/resources` | `mechanics/relationships` extracts a bounded pair ledger; Common Ground and Salt Ledger own social policy and benefits. |
| Tactical terrain | `mechanics/navigation`, `board/tactics` | Salt Ledger reuses navigation for reachability and adds local cover, obstacles and hazards. `board/tactics` cover is family-bound; no generic provider is claimed. |
| Contextual hints | `mechanics/hints`, `portfolio/assist` | `expedition/assist` composes the existing hint ledger and supplies game-specific text without submitting commands. |

Implementation details, ownership, timing, consumers and verification are recorded in the plugins' READMEs and game guides.
