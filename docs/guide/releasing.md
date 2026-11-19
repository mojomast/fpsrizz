# Releasing and versioning (P3.4)

Bulkhead uses [Changesets](https://github.com/changesets/changesets) for semver, changelogs and migration notes.
Nothing is published yet: the `@bulkhead/*` packages are `"private": true` until the npm scope is claimed, and
`create-bulkhead` is publish-ready but unpublished.

## What is versioned

| Package | Versioning |
| --- | --- |
| `@bulkhead/kernel`, `@bulkhead/sdk`, `@bulkhead/platform-web`, `@bulkhead/std`, `@bulkhead/tools` | One **fixed** group: always the same version, which **is** the SDK version (`SDK_VERSION` in `packages/sdk/src/core.ts`, currently `3.0.0`). |
| `create-bulkhead` | Independent. |
| the root app (`fpsrizz`) | Not versioned (private, not a workspace package). |

`npm run check` runs `node scripts/sync-sdk-version.mjs --check`, and `tests/sync-sdk-version.test.ts` asserts the
fixed group and its internal dependency ranges all equal `SDK_VERSION`.

## In every PR

```sh
npm run changeset        # pick packages + bump, write a one-line summary -> .changeset/<name>.md
npm run release:status   # what the next release would contain (CI-safe; add -- --since origin/main off a local main)
```

Bump rules for the SDK group (they follow the plugin contract, not the amount of code):

- **major**: anything a plugin written against the previous SDK can notice: removed or renamed exports, changed
  component/service/event shapes, changed phase order, a stricter manifest schema. Also write
  `docs/migrations/sdk-<major>.md` and decide whether `SDK_COMPAT` keeps accepting the previous major's manifests.
- **minor**: new exports, new optional fields, new std plugins.
- **patch**: fixes with no API change.

## Cutting a release (maintainers only; not done yet)

```sh
npm run version-packages   # changeset version + sync SDK_VERSION + refresh package-lock.json
git diff                   # review CHANGELOG.md files, versions, SDK_VERSION/SDK_COMPAT, migration note
npm run check && npm run build
# commit "Version packages", tag, and (once the scope exists) npx changeset publish
```

Publishing needs an npm token in CI and is deliberately not wired up. When it is, add a `release.yml` running
`changesets/action` on `main`.

## Changelogs and migration notes

- `packages/sdk/CHANGELOG.md`: the SDK changelog (history up to 3.0.0 written by hand; Changesets appends from now on).
- `docs/migrations/`: one note per SDK major: [SDK 3](../migrations/sdk-3.md), [SDK 4 (pending)](../migrations/sdk-4.md).
