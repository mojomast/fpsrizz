// Import ONLY from the SDK entry point (and '../../sdk/render.ts' if the manifest lists the "render" capability).
import { Flow, definePlugin } from '../../sdk/index.ts';

export default definePlugin({
  // Definitions and factories: registries, content kinds, role providers, validators. Do not start anything here.
  register(_ctx) {},

  // Per-session behaviour. Everything acquired through `ctx` is cleaned up automatically when the session stops.
  activate(ctx) {
    ctx.services.tryGet(Flow)?.notify('__NAME__ is active');
    ctx.log.info('activated');
  },
});
