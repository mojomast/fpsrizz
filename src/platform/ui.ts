import type { UiService } from '../sdk/contracts/game.ts';
import type { SessionContext } from '../kernel/host.ts';

export function createUiService(layers: { hud: HTMLElement; overlay: HTMLElement }): UiService & { readonly mounted: number } {
  let mounted = 0;
  return {
    get mounted() { return mounted; },
    mount(ctx: SessionContext, layer, className) {
      const el = document.createElement('div');
      if (className) el.className = className;
      el.dataset.owner = ctx.pluginId;
      layers[layer].appendChild(el);
      mounted++;
      ctx.scope.add(() => {
        mounted--;
        el.remove();
      }, 'ui-root');
      return el;
    },
    addStyles(ctx: SessionContext, css) {
      const el = document.createElement('style');
      el.dataset.owner = ctx.pluginId;
      el.textContent = css;
      document.head.appendChild(el);
      mounted++;
      ctx.scope.add(() => {
        mounted--;
        el.remove();
      }, 'style');
    },
  };
}
