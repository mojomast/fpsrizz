# Game composition canvas: research and MVP recommendation

Research/access date: **2026-11-16**. Scope: a visual canvas that composes Bulkhead plugins, exclusive roles,
options and typed config into a valid preset, for humans and agents. This report proposes a design; it does not
implement one or change runtime code. Version labels identify the documentation consulted, not a claim about the latest
release.

> **Concurrent work.** The working tree contains an uncommitted `src/app/game-graph.ts` and
> `tests/game-graph.test.ts` implementing a pure `GameGraph v1` model/compiler. It was not modified. If retained, it
> should be the base: it already has stable IDs, role slots, deterministic normalization/auto-layout and preset
> round-trips. This report aligns with it and calls out refinements instead of proposing a competing model.

## Decision

Build a **full-screen, JSON-first composition editor whose semantics are a typed dependency graph plus exclusive role
slots**. Do not build a runtime dataflow editor.

- The graph is authoring data; it compiles to the existing preset schema 1. The compiled preset is the only artifact the
  host consumes.
- Dependency edges are a **read-only projection of manifest dependencies**. Manifests stay authoritative; adding or
  removing a plugin node is the semantic edit.
- Role-selection edges are **authored** because provider registration is code, not manifest data. A role edge points from
  the role slot to the owner plugin and carries an explicit provider ID.
- `host.stage()` is the validation authority. The canvas does fast structural checks, then stages before offering
  Apply. A staging failure leaves the running game untouched.
- Layout is optional and compile-ignored. Agents never need coordinates.
- Human UI and CLI share one pure compiler. The UI is a view of the same JSON an agent edits.
- Implement with vanilla DOM + SVG in `src/app`. There is no React dependency and bundled presets have 4–20 plugins;
  a framework-sized graph library is not justified.

```text
graph JSON ──compileGraph──▶ preset JSON ──host.stage──▶ validation ──apply──▶ running game
     ▲                         │
     └──── presetToGraph ◀─────┘        layout is never compiled
```

## 1. Existing foundation

| Facility | Consequence for the canvas | Source |
|---|---|---|
| Preset schema 1: `plugins`, `roles`, `options`, `config`, `seed` | Compile to this; do not invent a runtime format. | `src/kernel/manifest.ts`; presets |
| Manifests: dependencies, optional deps, conflicts, `requiresRoles`, `roleDependencies`, typed config | Most graph facts are declared, not editor guesses. | `src/kernel/manifest.ts`; `docs/guide/plugins.md` |
| Staged host validation | A bad composition cannot damage the running session. Errors already carry source/path/message. | `src/kernel/host.ts`; `docs/reference/architecture.md` §4 |
| `host.survey()` | Discovers registered role providers without activating. Manifests declare requirements, not every offered role. | `src/kernel/host.ts` |
| Creator validate/apply/import/export | Reuse the same apply path and error presentation. | `src/app/creator.ts` |
| `host.apply` / `CreatorApi.apply` | Staging failure preserves the session; activation failure after commit does not roll back. Say so. | `src/app/main.ts` |
| Uncommitted `GameGraph v1` | Pure model/compiler, preset round-trip, role selection, deterministic auto-layout. Natural base if retained. | `src/app/game-graph.ts`; tests |

Two rules follow:

1. **Do not duplicate the host resolver in the UI.** Version/SDK ranges, cycles, conflicts and role ambiguity are
   resolved by `src/kernel/resolver.ts` and `host.stage()`. A pure compiler may preflight them for speed, but
   `host.stage()` remains the contract. Add conformance tests if `GameGraph v1` keeps its own resolver logic.
2. **Role discovery requires staging or registration metadata.** `GameGraph v1` takes an explicit
   `PluginDescriptor.providers` map; populate it from `host.survey()` or registration metadata. Missing metadata is
   reported, never guessed.

## 2. Dataflow vs dependency graph

A **dataflow graph** has edges carrying values or messages. Evaluation follows the edges: a consumer requests an input,
the producer runs, and the result flows forward. Node-RED wires pass messages; n8n connections pass data; ComfyUI links
carry latents/images/conditioning; Blender sockets carry values; Unreal's colored data pins pass values while its white
execution pins order statements. [7][13][18][21][25]

A **dependency graph** has edges meaning "must exist before", "requires", or "is selected by". It resolves once into an
order or configuration. GitHub Actions `needs` is a clean example: jobs wait, while data passes separately through
outputs. [41]

Bulkhead composition is dependency/selection: enabling a mode requires `core/world`; selecting `sdk/mode` chooses one
provider; activation order is derived from manifests and selected role owners. Gameplay data already moves through
runtime events/commands/services. Drawing those flows here would create a second, non-authoritative wiring model.

| Question | Dataflow | Dependency/selection (recommended) |
|---|---|---|
| Edge means | value/message/trigger | requires / provides role |
| Evaluation | per-event or per-frame | once, during staging/activation |
| Cycles | feedback is meaningful | rejected by the resolver |
| UI emphasis | typed sockets, live values | requirements, missing edges, role conflicts |
| Examples | Node-RED, n8n, ComfyUI, Blender, Unreal data pins | GitHub Actions `needs`, plugin resolvers |
| Bulkhead fit | implies runtime wiring that does not exist | matches manifests, roles, preset |

Use node/port visual grammar, but keep the semantics dependency-based. A read-only **activation-order lens** can show the
host-derived order. If runtime logic authoring is ever needed, add a separate logic-graph contract; do not overload this
one.

**Dependency edges vs role edges.** Dependency edges (`type: "dependency"`) are a projection of manifests: add/remove a
plugin node, and projection edges update when both endpoints exist. Deleting one must not change compilation. Role edges
(`type: "selects"`) are the source of truth for `preset.roles`; these are the edges humans and agents author. This avoids
duplicating manifest facts and then letting the copies disagree.

## 3. What to borrow

| Tool | Adopt | Avoid | Transfer |
|---|---|---|---|
| **Blender** [1][2][3][4][5][6] | Typed sockets; drag-to-empty compatible-node search; frames/groups; pan/zoom; undo; autosave/save versions | Editor document as interchange format | Typed affordances; frames; fit-all/selection; recovery UX |
| **Unreal Blueprints** [7][8][9][10][11][12] | Execution vs data pins; explicit Compile; Compiler Results links to nodes; comments/reroute/collapse; zoom extents/selection | Unreadable graph sprawl | Validate/compile panel; error-to-node navigation; organization tools |
| **ComfyUI** [13][14][15] | Versioned Workflow JSON with JSON Schema; separate API format excludes layout/colors/groups | Numeric IDs and `lastNodeId`/`lastLinkId` counters | Graph vs preset; stable semantic IDs; layout excluded from execution |
| **n8n** [16][17][19][20] | JSON import/export; `versionId` optimistic locking; sub-workflows/groups | Name-keyed connections (rename hazard); positions beside semantics | Stable IDs; `--expect-hash`; visual groups |
| **Node-RED** [21][22][23][24] | Simple flow JSON; tabs/subflows; Git projects; modifier-assisted wiring | `x/y/z` mixed with wiring | Separate/optional layout; Git-friendly JSON |
| **Godot** [25][26][27] | `GraphEdit`/`GraphNode` typed ports, connection signals, minimap/zoom/frames; undo merge modes | Widget only requests; app must validate | Validate every connection; coalesce undo steps |
| **VS Code** [28][29] | Schema-driven IntelliSense/validation and generated Settings UI over JSON | Separate UI/JSON models | Manifest-driven inspector; one model |
| **CWL / GitHub Actions / JSON Canvas** [40][41][42] | Versioned workflow docs, unique IDs, `needs`, explicit canvas node/edge IDs | JSON Canvas requires x/y/width/height on every node | Version graph; stable IDs; optional layout |

Key lessons: compile is an explicit step; ports prevent invalid connections; organization (frames, collapse, search, fit)
is part of the product; keep executable and editor representations separate; schema-driven forms and JSON reinforce each
other; drag needs a non-drag alternative.

## 4. Versioning, determinism, IDs, layout

### Two artifacts

| Artifact | Purpose | Layout? | Consumer |
|---|---|---|---|
| `*.graph.json` | Editable source of truth | Optional per-node `layout`; semantic operations ignore it | UI, CLI |
| `*.preset.json` | Existing preset schema 1 | No | `host.stage`, `host.apply`, `validate-game` |

This is ComfyUI's workflow-vs-API split adapted to Bulkhead. [13][14] Never add graph fields to the preset.

Graph documents use `schema: 1`. A `$schema` URL is an optional editor hint, not the semantic version. Publish a JSON
Schema 2020-12 document for agents/editors. [36] CWL's required `cwlVersion` is a useful precedent for a root version
field. [40]

### Stable IDs

- Plugin node: `plugin:<plugin-id>`.
- Role slot: `role:<role-id>`.
- Dependency edge: `dependency:<dependent>-><prerequisite>`.
- Role-selection edge: `selects:<role-id>-><owner-plugin>` plus `provider: "<provider-id>"`.
- Node IDs must match their semantic key; duplicate plugin/role nodes are errors.

Plugin IDs are stable and a preset enables each plugin once, so semantic IDs are readable and diff-friendly. They avoid
the counter/renumbering class of bugs in ComfyUI. [13] Use UUIDv7 only for future non-semantic annotations or multiple
instances; it is time-ordered and lexicographically sortable. [38]

### Layout separation

`GameGraph v1` puts optional `layout: { x?, y?, collapsed? }` on nodes. This is acceptable for the MVP because compile,
validation and ordering ignore it, and tests verify layout-only changes do not change the preset. Agents may omit it;
`autoLayout` supplies deterministic positions.

For a future schema version, prefer one top-level `layout` keyed by stable IDs, or a sidecar, so a semantic graph can be
written with no layout at all. Never put layout in the preset. Node-RED, n8n, ComfyUI and JSON Canvas show how quickly
layout and semantics become entangled in one object. [13][17][21][42]

### Deterministic compile

1. Validate shape, IDs, node/edge references, edge kinds and role arity; report all issues.
2. Normalize node/edge order and object keys.
3. Resolve plugin nodes against the catalog.
4. Build the preset from schema fields only.
5. Sort `plugins`; omit config values equal to manifest defaults (recommended; `GameGraph v1` currently emits authored
   values as-is).
6. Validate with `host.stage()` in the UI/CLI pipeline; the pure compiler is preflight only.
7. Hash the compiled preset with RFC 8785 JCS + SHA-256. [37]

Determinism rules: sorted arrays/keys; no timestamps, generated IDs or layout in the preset; `seed` in
`[0, 0xffffffff]`; `compile --check` compares semantic hashes, not whitespace. A layout-only edit must not change the
hash.

Round-trip acceptance:

```text
preset -> graph -> preset'   (semantically equal)
graph  -> preset -> graph'   (semantically equal)
compile twice                (byte-identical preset)
move node                    (same semantic hash)
```

## 5. MVP

### 5.1 Model

Use the existing `GameGraph v1` shape. Top-level fields: `schema`, `id`, `name`, `seed`, `nodes`, `edges`, `options`,
`config`. `options` and `config` match the preset exactly; config is keyed by plugin ID, not stored on nodes.

```json
{
  "schema": 1,
  "id": "core/default",
  "name": "Bulkhead Station",
  "seed": 1337,
  "options": { "map": "core/arena" },
  "config": { "core/player": { "fov": 80 } },
  "nodes": [
    { "id": "plugin:core/world", "type": "plugin", "plugin": "core/world" },
    { "id": "plugin:core/modes", "type": "plugin", "plugin": "core/modes" },
    { "id": "role:sdk/mode", "type": "role", "role": "sdk/mode" }
  ],
  "edges": [
    {
      "id": "dependency:core/modes->core/world",
      "type": "dependency",
      "from": "plugin:core/modes",
      "to": "plugin:core/world"
    },
    {
      "id": "selects:sdk/mode->core/modes",
      "type": "selects",
      "from": "role:sdk/mode",
      "to": "plugin:core/modes",
      "provider": "core/objective"
    }
  ]
}
```

Presence in `nodes` means enabled; there is no `enabled` flag. Removing a plugin is the semantic disable; undo restores
it. Dependency edge direction is **dependent -> prerequisite** ("A requires B"), matching `GameGraph v1`. Visually lay
prerequisites left and dependents right, label edges "requires", and do not use arrow direction to imply activation
order. If a future version reverses model direction to provider -> consumer, migrate once; do not mix conventions.

Ports are visual, not serialized:

| Node | Visual handles | Edges |
|---|---|---|
| `plugin` | `provider-in` for role selection; dependency anchors from `requires-out` | incoming `selects`; projected `dependency` |
| `role` | `provider-out` | outgoing `selects` to owner |

Invariants:

- IDs are unique and match `plugin:<id>`/`role:<id>`.
- Edges reference existing nodes; `dependency` connects two plugin nodes; `selects` goes from a role node to a plugin and
  carries a namespaced provider ID.
- A dependency edge is valid only if the `from` plugin declares `to` as required or optional. Do not require one edge per
  manifest dependency; manifests stay authoritative.
- A role slot may be empty while authoring. Required and selected roles need exactly one selection. Two enabled
  providers for an unselected, non-required role are ambiguous.
- Unknown plugins are preserved as "missing" nodes so imported presets can be repaired; compile reports them.
- Conflicting plugins cannot both be nodes.

### 5.2 Compile rules

1. **Graph pass.** Validate schema, IDs, IDs-vs-semantic-key, duplicate nodes/edges, endpoints, edge kinds and role
   arity. Return all issues; never throw for graph data.
2. **Presence.** Every required dependency must have an enabled plugin node. Projection edges may be absent. Optional
   deps may be absent; if present, include them and let the host order them.
3. **Conflicts.** Reject conflicting plugin nodes; never silently choose one.
4. **Config.** Validate every key/type/range/option against the manifest. Unknown keys are errors. Apply to
   `config[pluginId]`; omit defaults on compile if practical.
5. **Roles.** Emit `roles[role] = provider` from the selection edge. Empty role slots are allowed. Report missing
   required roles, duplicate selections, ambiguous unselected roles and providers not offered by the target owner.
6. **Options.** Emit as authored. Options are free-form in the current preset schema; plugin validators and
   `host.stage()` are the authority. Do not invent an option schema for MVP.
7. **Preset build.** Emit only `{ schema, id, name, plugins, roles, options, config, seed }`, sorted.
8. **Host validation (UI/CLI pipeline, not inside the pure module).** `parsePreset` -> `host.stage` -> `host.discard`.
   This is authoritative for installed versions, SDK ranges, cycles, conflicts, role providers, content cross-references
   and validators. Do not emit until it passes.
9. **Hash.** Return the semantic hash in the compile report; do not store it in the preset.

`presetToGraph` imports existing presets: create plugin nodes for all entries (including unknown), role nodes for
preset roles and required/offered roles, dependency projections when both endpoints exist, preserve config/options, and
auto-layout deterministically. Never auto-enable an absent dependency; offer an explicit "Add missing dependency" fix.

### 5.3 Validation and error surfacing

| Tier | When | Catches |
|---|---|---|
| Pure `compileGraph`/`validateGraph` | Every edit, synchronous | Schema, IDs, endpoints, edge truthfulness, role selection/ambiguity, config, missing plugins/deps, cycles |
| `host.stage()` | Validate, before Apply, optional idle debounce | Installed/version/SDK errors, host resolver behavior, providers, content validators, role dependencies |

`host.stage()` is the authority. Do not call a graph "valid" because the pure pass succeeded. Staging failure leaves the
running session untouched; activation failure after commit does not roll back. State that distinction.

Issue shape (extend `GameGraphIssue` at the presentation layer if you do not want to change the pure API):

```ts
interface ComposerIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;                 // plugin/dependency-missing
  message: string;
  stage?: 'graph' | 'preset' | 'catalog' | 'load' | 'register' | 'validate' | 'activation';
  nodeId?: string;
  edgeId?: string;
  path?: string;
  fixes?: Fix[];
}
```

Surface issues in three places:

- **Inline:** node/edge badges, missing handle highlighted; icon + text, never color alone.
- **Problems panel:** grouped by node, with stage/path; click focuses/selects. This follows Unreal's compiler-results
  pattern. [8]
- **Summary:** persistent status plus `aria-live` ("3 errors, 1 warning; Apply disabled").

Apply gating: errors block Apply/export; warnings are visible but allow Apply. Validate only stages/discards. Apply
compiles, stages, shows a diff (plugins, roles, config, seed), then calls `CreatorApi.apply`; it always restarts. If
activation fails after commit, show the existing error screen and do not claim rollback. Quick fixes are explicit and
undoable: add missing plugin, create/select role slot, reset config, remove conflict. Never auto-fix on validate.

### 5.4 Human UX

**Placement.** Full-screen "Game Composer" launched from the creator panel (later `?compose` for tests). Do not squeeze
the graph into the narrow creator aside. `src/app/shell.ts` currently exposes `creatorHost`; add a sibling full-screen
host/overlay rather than nesting the canvas in the aside. The creator stays a quick-edit form; both should share one
model/compiler/apply path.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Back · graph name · dirty/autosaved · Undo Redo · Validate · Apply   │
├──────────────┬─────────────────────────────────────────┬─────────────┤
│ Plugin       │                                         │ Inspector   │
│ palette      │              Canvas                    │ (node /     │
│ (search)     │   nodes + handles + edges + frames     │  role /     │
│ Roles        │                                         │  graph)     │
│              │                         minimap         │             │
├──────────────┴─────────────────────────────────────────┴─────────────┤
│ Problems / Diff / Compile output                                     │
└──────────────────────────────────────────────────────────────────────┘
```

**Add/connect.** Searchable palette shows name, id, version, kind, deps, roles and conflicts; click/Enter adds, drag adds
at cursor. "Add with dependencies" adds the closure as one undo step. Drag from a dependency anchor to empty space opens
a compatible-dependency search and **adds that plugin node**; the projection edge appears automatically. Role selection is
the authored connection: drag role `provider-out` to a plugin, or use the inspector's provider combobox / keyboard
`C` flow. Compatible targets highlight; invalid drops explain why and create nothing. Dependency edges are read-only and
labelled "manifest dependency". [1][10][34]

**Role slots.** A distinct node showing role id, required-by plugins, selected provider and status. Empty is allowed
while authoring; required unbound roles show an error. Selection replaces the `selects` edge atomically.

**Inspector.** Driven by manifests: plugin metadata, dependencies, offered roles, typed config fields with
type/min/max/options/default and reset; role provider combobox plus required-by; graph id/name/seed/options. Options are
free-form, with string/number/boolean/JSON value types. This is the VS Code settings model: one schema drives form and
validation. [28][29]

**Readability.** Visual frames by subsystem (visual only; collapse shows error counts). Low-emphasis read-only
dependency edges; stronger role edges; focus dims unrelated nodes. Hover labels only. Search/filter by name/id/role/status;
"show problems" and "focus neighbors". Deterministic layered auto-layout; no force layout by default. Minimap, fit-all,
fit-selection, 100%, frame breadcrumb. [12][25]

**Pan/zoom.** Wheel/trackpad zooms at cursor (25%–200%); Space+left or middle drag pans; `F` fit all, `Shift+F` fit
selection, `0` 100%, `+/-` zoom. Auto-pan near edges, respect reduced motion. 16px grid, optional 8px snap, no rotation.
Low zoom hides handles/details and collapses to labeled blocks; labels/status remain legible. [4][9]

**Keyboard/a11y.** The canvas is not the only UI.

| Keys | Action |
|---|---|
| `Tab`/`Shift+Tab` | Cycle canvas nodes or outline list |
| Arrows / `Alt+Arrows` | Move focus / nudge selected node |
| `Enter`/`Space` | Open/select focused node |
| `C` | Begin keyboard role selection; choose provider; `Enter` commits |
| `Delete`/`Backspace` | Remove selection (confirm if dependents/roles break) |
| `Ctrl/Cmd+Z`, `Shift+Ctrl/Cmd+Z` or `Ctrl+Y` | Undo/redo |
| `Ctrl/Cmd+S`, `Ctrl/Cmd+Enter` | Export graph, Validate |
| `/`, `F`, `Shift+F`, `0`, `+`, `-`, `?`, `Esc` | Search, fit, fit selection, 100%, zoom, help, cancel/close |

WCAG 2.2 AA target: keyboard operable, visible focus, 24×24 CSS px targets, non-text contrast, and a single-pointer
non-drag path for every drag action. [33][34][35] Provide a synchronized **Composition outline** (table of plugins, roles,
edges, status) where every create/connect/configure/remove action is possible. Do not claim the graph is a tree. Canvas
nodes expose names including id/kind/status; validation and connection outcomes go to a polite live region; errors that
block Apply may be assertive. Status uses icon + text. Scope keyboard handling and stop game shortcuts while composing.
Manual screen-reader verification is still required. React Flow's focus/live-region patterns are a benchmark, not a
dependency. [30]

**Undo/autosave.** Command layer with one transaction per action; coalesce a node drag on pointer-up and a multi-node
move into one entry. Store semantic + layout snapshots (small at 5–30 nodes) with labels; 100 entries. Undo/redo never
validates or applies. Autosave the draft to `localStorage` under
`shooter-foundation/composer/<graph-id>` after ~1s idle (max every 5s): `{ schema, graph, savedAt, basePresetHash }`.
Never autosave or auto-apply the compiled preset. On open, offer Restore/Discard if the draft differs. Distinguish
semantic dirty (compiled hash changed) from layout dirty (only coordinates). Explicit Export graph and Compile & export
preset are durable; browser storage is recovery. [6][17]

**Apply flow.** Edit -> local issues -> Validate (`host.stage`) -> review diff -> Apply & restart (only with no errors).
Stage failure preserves the session. Activation failure shows the existing error screen; no false rollback claim.

### 5.5 Agent/CLI

The CLI wraps the same pure model/compiler. Never implement a second compiler.

| Command | Purpose |
|---|---|
| `catalog [--json]` | Plugins, manifests, config fields, providers/content via metadata and/or `host.survey()`. |
| `new <id> --from-preset <id|file>` / `import-preset <file> --out <graph>` | Start from an existing game. |
| `list [--json]` / `show <graph> --json` | Discover/read canonical documents. |
| `add-plugin <graph> <plugin-id> [--with-dependencies]` | Add plugin; dependency projections update. |
| `remove-plugin <graph> <plugin-id> [--cascade]` | Refuse if required dependents/roles break; cascade explicit. |
| `bind-role <graph> <role-id> <provider-id> [--owner <plugin-id>]` / `unbind-role` | Create/replace/remove the single selection edge. |
| `set-config <graph> <plugin-id> <key> <json>` / `unset-config` | Typed config override. |
| `set-option <graph> <key> <json>` / `unset-option`, `set-seed <graph> <uint32>` | Options/seed. |
| `validate <graph> [--json]` | Pure checks + `host.stage`, no apply. |
| `compile <graph> --out <preset> [--check] [--json]` | Compile/stage; `--check` compares hash, writes nothing. |
| `layout <graph> [--write]` | Deterministic layout only. |
| `patch <graph> --file <patch.json>` | Optional RFC 6902 bulk edit, atomic. Domain commands preferred. |
| `schema` | Print the graph JSON Schema 2020-12. |

Flags: `--json` (stdout result), `--dry-run`, `--expect-hash <sha256>` (exit 3 on conflict), `--no-layout`, `--out`,
`--force`, `--quiet`.

Contract: atomic writes (temp + rename); failed command changes nothing; idempotent domain commands; no coordinates or
array indices for semantic operations; refer to nodes by ID and roles by id. Structured errors:

```json
{
  "ok": false,
  "code": "plugin/dependency-missing",
  "message": "plugin \"core/modes\" requires \"core/world\", which is installed but not enabled",
  "stage": "graph",
  "nodeId": "plugin:core/modes",
  "edgeId": null,
  "path": "dependencies.core/world",
  "fixes": [{ "code": "add-plugin", "args": { "plugin": "core/world" } }]
}
```

Exit codes: `0` success, `1` validation/compile failure, `2` usage/IO, `3` optimistic-concurrency conflict. Full-document
`put` is allowed but must use the same parser/validator. `patch` uses RFC 6902 and `test` to reject stale edits. [39]
`compile --check` is the CI gate; RFC 8785 hashing makes formatting/whitespace irrelevant. [37]

Example:

```bash
npm run compose -- import-preset core/default --out src/content/compositions/my-game.graph.json
npm run compose -- add-plugin src/content/compositions/my-game.graph.json example/ricochet --with-dependencies
npm run compose -- bind-role src/content/compositions/my-game.graph.json sdk/hud example/visor-hud
npm run compose -- set-config src/content/compositions/my-game.graph.json core/player maxHealth 125
npm run compose -- validate src/content/compositions/my-game.graph.json --json
npm run compose -- compile src/content/compositions/my-game.graph.json --out src/content/presets/my-game.json
npm run validate-game -- src/content/presets/my-game.json
```

### 5.6 Storage/export

| Thing | Path/key | Notes |
|---|---|---|
| Graph | `src/content/compositions/<slug>.graph.json` | Source of truth; no code. Slug is filename-safe; `id` stays namespaced. |
| Compiled preset | `src/content/presets/<slug>.json` | Checked in only when shipping; otherwise temp/export. |
| Catalog | `src/app/catalog.ts` | Add the preset when shipping; graph files need not be bundled. |
| Autosave | `shooter-foundation/composer/<graph-id>` | Recovery only. |
| Export | `.graph.json` / `.preset.json` download | JSON only; no fetch, no executable content. |

The graph is data, like a content pack. Compiling only selects installed code; it cannot install code. When shipping a
compiled preset, add it to the catalog/presets array, run `validate-game`, `npm run check`, and browser smoke for
browser-facing changes. Update `docs/reference/content-format.md` only if the graph becomes a runtime/persistence format.

### 5.7 Test strategy

**Unit (`node:test`):** valid/invalid schema; duplicate IDs; dangling/wrong-kind/duplicate edges; node-id vs semantic-key
mismatch; role arity; optional layout; seed range; config key/type/range; default omission; deterministic compile (twice,
reordered arrays, layout-only); every bundled preset round-trip; missing plugin/dependency; unbound/duplicate/ambiguous/
unoffered roles; conflicts; dependency and role-dependency cycles; unknown imported plugin.

**Integration:** stage every compiled bundled preset and discard; apply a small graph via `tests/helpers/game.ts` and
assert session/restart/disposal/no leaks; failed stage leaves `host.session`/`host.active` unchanged; `compile --check`
fails without writing; conformance matrix comparing `GameGraph v1` resolver behavior to `src/kernel/resolver.ts` and
`host.stage()`.

**Browser (`tests/composer-demo/run.mjs`, modeled on creator demo):** import `core/default`; add `example/ricochet`; bind
`example/visor-hud`; set config; validate/compile/apply and assert the new mode/HUD is active; trigger a missing
dependency/role and assert badge, problems panel, live text and disabled Apply; quick-fix; drag a role edge, undo/redo,
layout-only dirty state; dependency edges cannot be deleted as semantics; autosave restore/discard; keyboard-only
add/bind/validate/export; game hotkeys do not fire; no console/page errors; screenshots.

**Accessibility:** focusability, accessible names, outline/table alternative, visible focus, 24×24 targets, live
announcements, reduced motion. Manual NVDA/VoiceOver pass before claiming WCAG 2.2 AA. [33][34][35]

**Performance:** 50 nodes/200 edges smooth pan/zoom and <100ms pure validation; test 100/400 for the DOM/SVG limit. Do not
add canvas/WebGL until measured. React Flow's own limits illustrate the DOM trade-off. [31][32]

### 5.8 Acceptance criteria

1. Human can import `core/default`, change map/mode/HUD/theme, edit config, validate, review diff, apply; game restarts.
2. Agent can do the same with CLI and IDs only, no coordinates/UI.
3. Every bundled preset round-trips semantically; compile is deterministic and layout-independent.
4. Pure and host errors map to nodes/edges with stage/path; failed stage preserves the session; Apply blocked on errors.
5. Undo/redo covers add/remove/bind-role/config/move; autosave restores/discards; semantic vs layout dirty is distinct.
6. Keyboard-only create/bind-role/validate/export works; outline/table is equivalent; WCAG 2.2 AA checks pass.
7. 50/200 performance target, `npm run check`, `validate-game -- --bundled`, and composer demo pass.

## 6. Decision table

| Decision | MVP choice | Why | Rejected/deferred |
|---|---|---|---|
| Semantics | Typed dependency graph + role slots | Matches manifests/roles/preset; no runtime wiring model | Dataflow/logic graph |
| Model | Build on `GameGraph v1` if retained | Already pure, versioned, tested, round-tripping | Parallel schema |
| Dependency edges | Manifest projection, read-only, dependent -> prerequisite | Manifests authoritative; no duplicate declaration | Authored dependency edges that can disagree |
| Role edges | Authored `selects`, role -> owner, explicit `provider` | Provider registration is code; provider may differ from owner | Hidden dropdown only |
| Executable artifact | Existing preset schema 1 | Host already stages/applies it | New runtime format |
| Graph schema | `schema: 1` + JSON Schema 2020-12 tooling schema | Stable, diffable, agent-readable [13][40] | YAML/binary/opaque DB |
| IDs | `plugin:<id>`, `role:<id>`, stable edge IDs | Readable, diff-friendly, no counters [13] | Random UUIDs/numeric counters |
| Layout | Optional per-node `layout`, compile-ignored; future top-level | Human coordinates without semantic contamination | Layout in preset; hash churn [17][21][42] |
| Compile | Pure compileGraph -> preset; sorted; defaults omitted; JCS hash | Reproducible, layout-independent, CI-checkable | Arbitrary order/timestamps/hash in preset |
| Validation | Pure checks + `host.stage` authority; Apply after stage | Reuses staged safety and validators | Reimplement host/trust canvas |
| Apply | Explicit diff + `CreatorApi.apply`; staging failure preserves session | Existing lifecycle; activation caveat | Auto-apply/silent restart |
| UI | Vanilla DOM + SVG, full-screen from creator | No React; 4–20 nodes; no new dependency | React Flow/canvas engine for MVP |
| Add/connect | Palette, role drag, drag-to-empty, inspector, keyboard `C` | Efficient + non-drag path; deps stay derived | Drag-only; authored dependency edges |
| A11y | WCAG 2.2 AA target; outline/table, focus, live region, 24px | Real human tooling; WCAG 2.5.7 [33][34] | Canvas-only/color-only |
| Undo/autosave | Command snapshots + localStorage draft; explicit export | Recovery without touching runtime | Auto-apply/no undo/browser-only persistence |
| Agent | Domain CLI + schema + `--json`, `--expect-hash`, `--check`; no coords | Stable IDs, atomic edits, concurrency | Screen-scraping/coordinate CLI |
| Large graphs | Frames/collapse/focus/filter/search/minimap/layered layout | Enough for expected graphs; no semantic subgraphs | Subgraphs/CRDT in MVP |
| Storage | `src/content/compositions`; compiled in `src/content/presets` | Separates authoring from shipped presets | Graph files in catalog; layout in preset |
| Collaboration | Git-friendly JSON + semantic hash | Fits repo workflow | CRDT/realtime |

## 7. Out of scope and risks

- **No runtime dataflow authoring.** A logic graph needs its own contract, validation, ordering and ownership model.
- **Options are untyped.** The canvas cannot know valid option keys/types; plugin validators and staging do. A typed
  option registry would be an SDK contract, not a canvas convention.
- **Role discovery needs staging/metadata.** `host.survey()` can be slow or fail for incompatible sets. Keep graphs
  editable with explicit provider IDs; report missing metadata. `PluginDescriptor.providers` is the right seam.
- **Activation cannot be proven by staging.** A graph can pass staging and fail activation; state this and keep the
  existing error screen. A headless activation smoke with fake services reduces but does not eliminate the risk.
- **Resolver drift.** `GameGraph v1` has its own dependency/version/cycle logic. Add conformance tests against the kernel
  resolver/host, or reuse kernel logic where practical. The pure compiler is fast feedback, not the contract.
- **Two views of one model.** Creator and composer must share compile/apply and config/role rules, or they will diverge.
- **DOM/SVG scale.** Fine for tens, not thousands; measure before adding a canvas renderer/library. [31][32]
- **No multi-user editing.** Git + atomic JSON + semantic hash is the collaboration model; merges still need discipline.

## Sources

Accessed **2026-11-16**. Version labels identify the documentation consulted, not the latest release.

1. **Blender Foundation — Node Editors.** Blender 5.2 LTS Manual. https://docs.blender.org/manual/en/latest/interface/controls/nodes/node_editors.html
2. **Blender Foundation — Editing Nodes.** Blender 5.2 LTS Manual. https://docs.blender.org/manual/en/latest/interface/controls/nodes/editing.html
3. **Blender Foundation — Node Groups.** Blender 5.3 Manual. https://docs.blender.org/manual/en/latest/interface/controls/nodes/groups.html
4. **Blender Foundation — Frame Node.** Blender 5.2 LTS Manual. https://docs.blender.org/manual/en/latest/interface/controls/nodes/types/layout/frame.html
5. **Blender Foundation — Undo & Redo.** Blender 5.2 LTS Manual. https://docs.blender.org/manual/en/latest/interface/undo_redo.html
6. **Blender Foundation — Recovering Data.** Blender 5.2 LTS Manual. https://docs.blender.org/manual/en/latest/troubleshooting/recover.html
7. **Epic Games — Overview of Blueprints Visual Scripting.** Unreal Engine 5.8. https://dev.epicgames.com/documentation/unreal-engine/overview-of-blueprints-visual-scripting-in-unreal-engine
8. **Epic Games — Compiler Results.** Unreal Engine 4.27. https://dev.epicgames.com/documentation/en-us/unreal-engine/compiler-results?application_version=4.27
9. **Epic Games — Comments.** Unreal Engine 5.8. https://dev.epicgames.com/documentation/unreal-engine/comments-in-unreal-engine?application_version=5.8
10. **Epic Games — Connecting Nodes.** Unreal Engine 5.8. https://dev.epicgames.com/documentation/unreal-engine/connecting-nodes-in-unreal-engine
11. **Epic Games — Collapsing Graphs.** Unreal Engine 5.8. https://dev.epicgames.com/documentation/unreal-engine/collapsing-graphs-in-unreal-engine
12. **Epic Games — Blueprint Editor Menu.** Unreal Engine 5.9. https://dev.epicgames.com/documentation/unreal-engine/menu-for-the-blueprints-visual-scripting-editor-in-unreal-engine
13. **ComfyUI — Workflow JSON (v1.0).** https://docs.comfy.org/specs/workflow_json
14. **ComfyUI — Workflow API Format.** https://docs.comfy.org/development/api-development/workflow-api-format
15. **ComfyUI — Workflow Metadata.** https://docs.comfy.org/development/api-development/workflow-metadata
16. **n8n — Export and import.** https://docs.n8n.io/workflows/export-import
17. **n8n — Workflow API schema.** https://docs.n8n.io/connect/n8n-api/workflow
18. **n8n — Connect nodes together.** https://docs.n8n.io/build/understand-workflows/workflow-components/connect-nodes-together
19. **n8n — Sub-workflows.** https://docs.n8n.io/build/flow-logic/break-workflows-into-smaller-parts
20. **n8n — Canvas Groups.** https://docs.n8n.io/build/understand-workflows/workflow-components/canvas-groups
21. **Node-RED — Types (flow configuration).** https://nodered.org/docs/api/admin/types
22. **Node-RED — Flow structure.** https://nodered.org/docs/developing-flows/flow-structure
23. **Node-RED — Projects (Git).** https://nodered.org/docs/user-guide/projects/
24. **Node-RED — Wires.** https://nodered.org/docs/user-guide/editor/workspace/wires
25. **Godot — GraphEdit.** Godot 4.7 stable. https://docs.godotengine.org/en/stable/classes/class_graphedit.html
26. **Godot — GraphNode.** Godot 4.7 stable. https://docs.godotengine.org/en/stable/classes/class_graphnode.html
27. **Godot — EditorUndoRedoManager.** https://docs.godotengine.org/en/stable/classes/class_editorundoredomanager.html
28. **VS Code — User and workspace settings.** https://code.visualstudio.com/docs/configure/settings
29. **VS Code — Editing JSON.** https://code.visualstudio.com/docs/languages/json
30. **React Flow — Accessibility.** https://reactflow.dev/learn/advanced-use/accessibility
31. **React Flow — Performance.** https://reactflow.dev/learn/advanced-use/performance
32. **React Flow — ReactFlow component.** https://reactflow.dev/api-reference/react-flow
33. **W3C — WCAG 2.2.** Recommendation, 2024-12-12. https://www.w3.org/TR/WCAG22/
34. **W3C WAI — Understanding SC 2.5.7: Dragging Movements.** https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements
35. **W3C WAI — Understanding SC 2.5.8: Target Size (Minimum).** https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
36. **JSON Schema — 2020-12 specification and `$schema` dialect.** https://json-schema.org/specification and https://json-schema.org/understanding-json-schema/reference/schema
37. **IETF — RFC 8785: JSON Canonicalization Scheme.** June 2020. https://www.rfc-editor.org/rfc/rfc8785
38. **IETF — RFC 9562: UUIDs.** May 2024. https://www.rfc-editor.org/rfc/rfc9562
39. **IETF — RFC 6902: JSON Patch.** April 2013. https://www.rfc-editor.org/rfc/rfc6902
40. **Common Workflow Language — Workflow Description v1.2.1.** https://www.commonwl.org/v1.2/Workflow.html
41. **GitHub — Workflow syntax: `jobs.<job_id>.needs`.** https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
42. **JSON Canvas — Specification 1.0.** https://jsoncanvas.org/spec/1.0/

### Repository evidence

- `src/kernel/manifest.ts`, `src/kernel/resolver.ts`, `src/kernel/host.ts` — preset/manifest schemas, dependency
  resolution, staged validation, `survey()` and apply semantics.
- `src/app/creator.ts`, `src/app/catalog.ts`, `src/app/shell.ts`, `src/app/main.ts` — creator
  draft/validate/apply/import/export, catalog, shell host areas/overlays, apply and keyboard behavior.
- `src/app/game-graph.ts`, `tests/game-graph.test.ts` — uncommitted `GameGraph v1` model/compiler and tests.
- `src/content/presets/*.json` — real preset compositions; `tests/creator-demo/run.mjs` — browser test pattern.
