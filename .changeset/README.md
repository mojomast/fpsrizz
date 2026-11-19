# Changesets

Every PR that changes a package under `packages/` adds a changeset: `npm run changeset`, pick the packages and the
bump (patch / minor / major), write one line for the changelog. See [docs/guide/releasing.md](../docs/guide/releasing.md).

The `@bulkhead/*` packages are versioned together (`fixed`) and their version is the SDK version (`SDK_VERSION`).
