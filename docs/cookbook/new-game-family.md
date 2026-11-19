# Start a new game family in `games/`

Fastest path: `npm run bulkhead -- create <family> --template fps|platformer|topdown|puzzle|cards|blank` scaffolds a
whole family (plugin, preset, tests, `AGENTS.md`) in `games/<family>/` and registers it; see the
[CLI guide](../guide/bulkhead-cli.md). The steps below are the manual route, for growing a family out of shared plugins.

1. Do reuse discovery first ([guide](../guide/reuse.md)): `npm run find-reuse -- "your mechanic"`.
2. Scaffold each plugin: `npm run new-plugin -- <namespace/name> "Display Name"`. It creates
   `packages/std/plugins/<namespace>-<name>/`; the catalog picks it up automatically.
3. If the game needs its own vocabulary (a service, registry or events only it uses), write it as an SDK contract in
   `packages/sdk/src/contracts/<name>.ts` while prototyping, then move it with the game.
4. Add a preset under `games/<family>/presets/` (create the folder) and list it in `src/app/catalog.ts`; play it with
   `npm run dev`.
5. Move everything into its own family when it settles:

   ```bash
   npm run move-to-game -- <family> --plugins <ns>-<a>,<ns>-<b> --contracts <name> --presets <preset> --tests <test> --dry-run
   npm run move-to-game -- <family> --plugins <ns>-<a>,<ns>-<b> --contracts <name> --presets <preset> --tests <test>
   npm run gen-catalog && npm run index-reuse && npm run check
   ```

   The script uses `git mv` and rewrites imports, Markdown links and repo-relative paths, then points imports of moved
   contract symbols at `games/<family>/contracts/` and removes their SDK re-export.
6. Add `games/<family>/README.md` and a row to [games/README.md](../../games/README.md). If the family uses another
   family's contracts, list it in `games/<family>/family.json` `"uses"`.

Boundaries (`npm run lint`) then hold the family to its own folder, the SDK entry point, the render SDK and its own
contracts. A contract used by more than one family belongs in `packages/sdk/src/contracts/` instead.
