# Game composition canvas and GameGraph v1

The composition canvas is a full-screen editor for the same preset foundation the runtime uses. It is deliberately a
**typed dependency graph with exclusive role slots**, not a runtime dataflow editor. The editable artifact is a
`GameGraph`; the executable artifact is an ordinary preset schema 1.

```
GameGraph JSON ──compileGraph──▶ preset JSON ──host.stage──▶ validation ──host.apply──▶ running game
      ▲                               │
      └───────── presetToGraph ◀──────┘
```

## Open it

- Press `` ` `` to open Creator tools, choose **Canvas**, then **Open composition canvas**.
- Or use the CLI described below.
- The canvas loads the active preset (or a built-in preset) and restores an autosaved editable draft from
  `localStorage` if one exists.
- `Esc` closes the canvas before it reaches the host pause handler.

## Graph model

`src/app/game-graph.ts` is pure and DOM-free. `GameGraph` schema 1 has:

| Field | Meaning |
|---|---|
| `id`, `name`, `seed`, `options`, `config` | Preset identity and exact authored configuration |
| plugin nodes (`plugin:<id>`) | Enabled plugins; presence means enabled |
| role nodes (`role:<id>`) | Exclusive role slots, selected or empty |
| dependency edges | Read-only projection of manifest dependencies |
| selection edges | Authored role selection; carry the explicit `provider` id and point at the owning plugin |
| `layout` on nodes | Optional `x`, `y`, `collapsed`; **never compiled** |

Stable node ids are `plugin:<id>`, `role:<id>`, `dependency:<dependent>-><prerequisite>` and
`selects:<role>-><owner>`. Coordinates are not required to compile or validate a graph; `autoLayout` is deterministic and
presentation-only.

Manifests remain authoritative for dependencies, versions, conflicts, required roles and typed config. The pure
compiler performs fast structural and typed-config preflight. The UI then stages through the real host before it offers
Apply; a staging failure leaves the running game untouched. Activation failure after commit is still reported by the
host and cannot be rolled back.

### Role providers

`src/app/catalog-providers.json` is generated from the reuse index's observed role registrations. It maps each owner
plugin to role/provider offers. The composer uses this generated metadata instead of guessing from plugin names. Run
`npm run index-reuse` after adding or changing a `ctx.provideRole(...)` registration.

## Human canvas

- Drag a plugin to reposition it; drag the background to pan; mouse wheel zooms.
- Drag a role node's gold output port onto a plugin node that offers that role to wire the selection.
- Or select a node and use the inspector dropdowns for required roles and providers.
- Click a plugin in the left palette to enable it. Press Delete/Backspace with a selected plugin node to remove it.
- Inspector shows manifest dependencies, role requirements, offered providers and typed config fields.
- Graph settings edits name, id, seed and the JSON options object.
- Validate stages the compiled preset without restarting. Apply restarts on success.
- Export downloads the editable `.graph.json`; Import accepts a graph or a preset. Autosave is local-only.
- Undo/redo buttons and `Ctrl/Cmd+Z` / `Ctrl/Cmd+Y`; `F` fits the graph; `+`/`-` zoom.
- The graph is also keyboard-selectable: nodes are focusable buttons; Delete removes a selected plugin.

Dependency edges are deliberately not draggable: deleting a display edge cannot remove a manifest dependency. Role
selections are the only authored edges.

## Agent workflow

Agents should treat graph JSON as the source of truth and never author coordinates. The stable semantic operations are
available in `src/app/game-graph.ts`:

```ts
presetToGraph(preset, catalog)
graphToPreset(graph)
compileGraph(graph, catalog) // { ok, preset?, issues }
autoLayout(graph)            // layout-only change
addPluginNode / removePluginNode / selectRoleProvider
setGraphOption / setPluginConfig
```

The CLI uses the generated `docs/reuse-index.json` catalog and supports:

```bash
npm run graph -- plugins
npm run graph -- from-preset src/content/presets/cinder-vault.json --out /tmp/cinder.graph.json
npm run graph -- validate /tmp/cinder.graph.json
npm run graph -- to-preset /tmp/cinder.graph.json --out /tmp/cinder.preset.json
npm run graph -- layout /tmp/cinder.graph.json --out /tmp/cinder.graph.json
npm run graph -- edit /tmp/cinder.graph.json --add-plugin mechanics/inventory \
  --role sdk/mechanic-inventory=mechanics/inventory \
  --option map=example/annex --config core/player.fov=88 --seed 42 --out /tmp/edited.graph.json
```

`to-preset` and `edit` compile structurally and print actionable source/path/message issues. Full host staging is still
`npm run validate-game -- <compiled-preset.json>` (or `--bundled`). This is intentionally two gates: the editor cannot
promise activation, and the kernel remains the authority.

## Human/agent contract

- Semantics are JSON, not DOM or pixels.
- Layout is optional; a graph written by an agent without layout still opens and compiles.
- No runtime code is generated or executed from a graph. Code plugins remain compiled-in and trusted.
- All IDs are deterministic; there are no counters or timestamps.
- Compile output is deterministic: plugins/roles are sorted, object keys are stable, and node/layout order is ignored.
- Preset options/config/seed/name/id round-trip through the graph.

## Limits / next steps

- The MVP edits the composition and typed preset config, not authored content rows, maps or game code.
- Dependency edges are a visualization projection; a future version can add a read-only activation-order lens.
- No graph grouping/frames, minimap, collaborative cursor or multiple instances per plugin.
- Full host staging requires the browser's catalog; the CLI preflight uses the generated reuse index.
- Import/export is file-based; there is no server-side project persistence.

## Verification

- `tests/game-graph.test.ts`: 18 deterministic model/compiler/round-trip/validation tests.
- `tests/composer-demo/run.mjs`: production-browser graph loading, role metadata/inspector, host staging and close flow.
- `tests/creator-demo/run.mjs`: 67 creator checks including the Canvas tab and generated map/provider metadata.
- Full `npm run check` on 2026-11-16: **773/773 tests**.

Research and sources are in [the composer research note](research/game-composer-2026-11-16.md).
