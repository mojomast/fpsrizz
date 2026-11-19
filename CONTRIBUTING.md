# Contributing

1. Node >= 22.18. `npm ci`.
2. Before implementing a mechanic, follow [docs/guide/reuse.md](docs/guide/reuse.md): search existing capabilities and inspect a consumer/test.
   Make changes respecting the import boundaries (`npm run lint`); plugins talk to the engine only through `@bulkhead/sdk`.
3. Add or update tests next to the behaviour you change. Do not weaken a test to make it pass.
4. Update relevant `reuse.json`/recipes and run `npm run index-reuse` after source changes. `npm run check` (including
   inventory freshness) must be green. For rendering or UI changes also run `npm run build && npm run test:browser`
   (and `npm run test:visual` if a golden screenshot may change; update goldens deliberately with `-- --update-snapshots`).
5. For changes under `packages/`, add a changeset (`npm run changeset`); see [docs/guide/releasing.md](docs/guide/releasing.md).
6. Keep the docs in sync: `docs/guide/plugins.md` for SDK changes, `docs/reference/content-format.md` for data formats, `docs/reference/architecture.md` for design.

New plugin: `npm run new-plugin -- <namespace/name> "Display Name"`, then see [docs/guide/plugins.md](docs/guide/plugins.md).
