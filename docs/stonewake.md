# Stonewake — a 3D escape puzzle

Choose **Creator tools → Load → Stonewake — 3D puzzle → Apply & restart → Play**. Preset: `puzzle/stonewake`.

Explore three low-poly ruin chambers, push boulders onto every glowing pressure plate, and walk through the golden
gate. The explorer, rocks, walls, gate and articulated golems are actual Three.js meshes in a lit 3D scene. The
orthographic camera orbits the diorama; movement follows discrete compass directions on its XZ plane.

## Controls and rules

| Input | Action |
|---|---|
| W / ↑, D / →, S / ↓, A / ← | Step north, east, south, west; a step into a boulder pushes it |
| Click a neighboring floor tile / on-screen arrows | The same single-cell step or push |
| Space / Wait | Spend one turn without moving |
| Z / Undo | Rewind a turn, including golems, boulders, counters and capture |
| R / Restart | Reset the current chamber |
| Q / E or orbit buttons | Rotate the camera; this never spends a turn |
| Escape | Pause / resume through the host menu |

- Golems move **one shortest-path step after every second accepted player turn**. The HUD shows the next beat.
  They route around walls and other golems, but cannot cross boulders or the exit. Touching a golem captures the explorer.
- Only boulders weight plates. Every plate must be weighted simultaneously to open the exit. Moving a rock away
  closes it again. Stones cannot enter the exit, push another stone, or move onto a golem.
- Walls, blocked pushes and locked exits reject the action without spending a turn. Idle animation never moves enemies.
- Undo keeps the last **256 turns** in the current chamber; restart always restores its initial layout. A chamber's
  completion panel offers Next; the last offers Play again. The target step count is optional, not a deadline.
- Campaign state and step totals are session-only. Host restart returns to the first chamber. There is no campaign save.

## Asset-driven mechanics and provenance

The new Assetrizz voxel cartographer, chalk golem, boulder cluster and boardwalk define the cast and interaction:
the cartographer explores; boulders act as weights and barriers; golems pursue; the boardwalk defines traversable cells.
`theme/board` supplies the semantic `puzzle-floor`, `puzzle-explorer`, `puzzle-golem` and `puzzle-boulder` painters.
The boardwalk becomes a weathered floor texture; explorer/golem art is used for HUD portraits. Models are original
procedural, volumetric geometry in `src/plugins/puzzle-presentation/scene.ts`, using the curated sprites as palette
and silhouette references. They are not exported or imported Assetrizz 3D models. Plates, gates, orbit marker, shadows
and synthesized cues are original procedural presentation.

The source images retain their pinned revision/hashes and upstream **“original, generated for Kyle Durepos”** provenance
in `scripts/experience-assets.json` and `assets/experiences/provenance.json`.

## Modular composition

- `puzzle/rules`: headless authority and `push-puzzle` loader. Publishes `PushPuzzle` and emits `PuzzleResolved` cues.
- `puzzle/presentation`: owned 3D scene, camera, ray picking, responsive HUD and keyboard/pointer listeners.
- `puzzle/chambers`: data-only authored campaign. `theme/board`: replaceable art/audio provider.
- `mechanics/navigation`: selected through `sdk/mechanic-navigation` for deterministic unit-edge route queries.
- No shooter, racing, tactics or adventure simulation plugins are required. Public types live in
  `src/sdk/contracts/puzzle.ts`; plugins cooperate only through SDK services and events.

The shared SDK [command queue](command-queues.md) accepts at most 32 well-formed commands. `puzzle/rules.commands`
resolves one per `control` tick; the helper rejects paused/disposed ingress and clears pending requests when it observes
`SessionControl.playing` is false. Input handlers also gate ingress. Restart, undo and chamber transitions clear pending
requests. The family owns command normalization and move legality. Snapshots are copies; registered campaign definitions
are frozen.

Golem pursuit constructs a fresh legal graph for each golem and delegates ordered search to the selected
[navigation provider](navigation.md). North/west/east/south route ties and sequential occupancy updates remain intact;
rocks, other golems and the exit stay forbidden destinations. Chamber connectivity validation remains a static loader
check. Custom puzzle presets must enable/select a navigation provider; chamber data and `PushPuzzle` remain unchanged.

## Authoring `push-puzzle`

Use the ordinary content-entry envelope:

```json
{
  "kind": "push-puzzle",
  "id": "my-pack/ruins",
  "data": {
    "name": "My Ruins",
    "chambers": [{
      "name": "First Weight",
      "hint": "Push the boulder east onto the plate.",
      "par": 10,
      "rows": ["#########", "#......E#", "#..#....#", "#..B.O..#", "#.P.....#", "#.......#", "#########"]
    }]
  }
}
```

Select the content ID in `options.campaign` and `puzzle/stonewake` in `roles["sdk/experience"]`. Enable the rules,
presentation, content pack and selected theme explicitly. The rules require a matching experience and reject mixed
game-family graphs during staging.

| Field / symbol | Meaning and limits |
|---|---|
| Campaign `name` / `chambers` | Nonempty, at most 80 characters / 1–16 chambers |
| Chamber `name`, `hint`, `par` | Nonempty names ≤60, hints ≤300 characters; integer target 1–1000 |
| `rows` | Rectangular 5–16 columns by 5–16 rows, surrounded by `#` walls |
| `#` / `.` | Wall / traversable boardwalk |
| `P` / `E` | Exactly one explorer start / exit |
| `O` / `B` | 1–8 plates / at least one boulder per plate, at most 12 boulders |
| `G` | Up to four golems, processed in authored row order |

Unknown properties/symbols, unequal row widths and objectives/pieces disconnected from the explorer are rejected with
field paths. Connectivity ignores movable pieces; it does **not** prove that a pushing puzzle is solvable. Verify a
complete legal route for every authored chamber. Golem shortest-path ties resolve north, west, east, south.

## Verification and completion routes

`tests/stonewake.test.ts` covers authored solutions, reversal, blockers, pursuit/capture, malformed/paused ingress,
bounded queues, content validation and restart ownership. `node tests/stonewake-demo/run.mjs` exercises the real
production UI and 3D picking/orbit, three viewport sizes, capture recovery, all chambers and shooter switching.

Spoilers: these compass routes complete the shipped campaign without waiting. The camera can face any direction.

1. **The First Weight:** N E E N N E E E — 8 steps.
2. **The Waking Watch:** N E E N N E E E E — 9 steps.
3. **The Twin Seal:** N N S S W S E E E E N N E E N N N E — 18 steps.

Total: **35 steps**. Browser artifacts are `.smoke/stonewake-*.png` and `.smoke/stonewake-report.json`.
