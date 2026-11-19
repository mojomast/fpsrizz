# Common Ground

Common Ground is a turn-based shared-household game. Select a resident and care for their needs, grow relationships, furnish the house and complete neighborhood projects. Accepted actions and furnishing transactions advance the clock by 30 minutes; selecting residents, changing autonomy, pausing and restarting do not. Failed actions do not advance time. Autonomous residents may care for themselves or work as time advances.

## Controls

Use the resident cards to select someone, then choose an action. All controls are native buttons usable with pointer, touch, Tab, Shift+Tab, Enter and Space. Use the resident cards to toggle each person's autonomy. Chat and reconcile buttons identify their target. Host a gathering from day 7 after two projects are complete, then greet both named visitors. The furniture catalog lists all items, prices and half-price resale values. Pause/resume is internal to the household; restart resets it. The launcher must also be playing for commands to be accepted.

## Build your house

The floor plan is an eight-by-six lot with 24 original floor squares. Select a tool and click or keyboard-activate a
square. **Add floor** costs 15 credits and must touch an existing square; choose its room first. **Room zoning** assigns
any built square to one of the four rooms for free; heavy borders show room boundaries. **Finish** applies oak, tile,
sage or terracotta for 3 credits per square. **Move furniture** selects an owned item, rotates it in quarter turns and
places it on an unoccupied floor square for free. Inspecting an occupied square also selects that item for moving.
**Remove floor** recovers 7 credits from an empty added square; original squares cannot be removed. Purchases find a
free floor square automatically and sales remove their placement. Each furnishing occupies one square. Construction
does not advance household time and can be used while the household is paused; the launcher must be playing.
Choosing a build tool switches automatic household time back to Manual.

Building commands validate occupancy, ownership and the budget before committing. Failed changes cost nothing. Room
zones and finishes are visual organization; furniture effects depend on ownership, and residents do not pathfind around
the plan. The house is session-only and resets on restart; it is not a 3D architectural editor or a saved blueprint.

Choose Manual, Play or Fast to control the pace. Play and Fast periodically submit a wait action, allowing autonomous
care, shifts and bills to unfold; the household pause and launcher pause stop this input. Restart returns to Manual.

Eating costs 5 credits and requires cooking furniture; sleeping requires sleep furniture, washing requires hygiene furniture. Work is limited to one shift per resident per day. Hosting costs 30 credits. Debt must be paid in full. The interface shows the latest result and event history; the simulation decides action validity. Needs decay as turns advance and weekly bills can create debt. Project descriptions and relationship scores are displayed in the interface.

The best owned piece in each sleep, cooking or hygiene category improves that care action: furniture costing at least
70 credits adds 8 to the relevant need recovery, and at least 100 adds 12. Multiple pieces of one category do not stack.
Any work furniture adds 10 credits to a shift before the low-needs penalty; seating adds 4 comfort to leisure and decor
adds another 2. Furnishings can therefore trade immediate cash for better care and income, not just change a label.

Energy or nourishment below 20 reduces a shift's pay to 80% and prevents career progress. Three successful shifts
earn a promotion, up to rank 3. Chat when either participant has energy or comfort below 20 causes an argument and
reduces their relationship by 12; a healthy chat increases it by 4. Below −20, chat is blocked until they reconcile;
reconciliation raises the relationship by 10 and requires both residents to have at least 20 energy and comfort.
Strained, disconnected residents can also lose relationship at midnight. Rest, food and washing enable recovery.
At a relationship score of 30, friends restore 20 connection on a successful chat instead of 15; the benefit is lost
if their relationship falls below 30.
Autonomous residents choose a preferred relationship for care and reconciliation, and the selected resident can act
autonomously during wait turns. After the gathering, paying debt and repairing relationships can improve its tier.

## Composition and limits

Enable `common/game` and `common/presentation`, the household content and the mechanic providers required by the game; select `common/presentation` for `sdk/experience`. The UI uses `Hearth` and optional `Ui`, and guards commands using `SessionControl`. Its pinned decorative furniture art is in `public/assetrizz/` with provenance in [the Assetrizz license](../../../public/assetrizz/LICENSE.txt).

There is no continuous world, saved household or spatial pathfinding. The editable top-down lot represents actual owned
furnishing placements, but residents' room labels and activities are simulated abstractly. The service exposes completed
project counters rather than intermediate meal, shift or conversation counts, and greeted guests rather than their positions.
See the Common Ground game tests for authoritative simulation behavior and run `npm run check` for project checks.
