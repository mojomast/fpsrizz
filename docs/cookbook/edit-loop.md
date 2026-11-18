# The edit loop: live reload, resume and `?seed=`

```bash
npm run dev            # http://localhost:5173, rebuilds on save
```

- **Live reload.** `npm run dev` serves esbuild's `/esbuild` change stream. Saving any file under `src/` or `games/`
  rebuilds and reloads the page; adding or removing a plugin folder regenerates `src/app/catalog.generated.ts` first.
- **Resume.** If a game was running when the reload fired, the page restarts the same preset and enters play again, so
  you land back in the game rather than on the title screen. (Development builds only; the production build has no
  reload hook.)
- **Deterministic runs.** Append `?seed=1234` to override the preset's seed, e.g.
  `http://localhost:5173/?seed=1234`. The same seed plus the same inputs gives the same run, which is what the browser
  suites rely on.
- **Inspect.** `window.__bulkhead` is a debugging and automation handle (not API).

Verify the loop end to end with `node tests/dev-reload-demo/run.mjs` (it edits and restores a file and checks the
game resumes).
