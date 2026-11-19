/**
 * Perf HUD (P2.7): a small always-on-top readout of FPS, CPU and GPU frame time, draw calls and the slowest systems,
 * coloured against the 60 Hz frame budget. Toggle with F3 or `?perf`. GPU time comes from
 * EXT_disjoint_timer_query_webgl2 around the render call when the browser exposes it (it is often missing on
 * software GL and some mobile GPUs: the HUD then shows "n/a"). No dependencies, renderer-agnostic.
 */
export interface GpuTimer { readonly supported: boolean; readonly ms: number | undefined; begin(): void; end(): void }

export function createGpuTimer(gl: WebGL2RenderingContext | null): GpuTimer {
  const ext = gl?.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null | undefined;
  if (!gl || !ext) return { supported: false, ms: undefined, begin() {}, end() {} };
  const inflight: WebGLQuery[] = [];
  let current: WebGLQuery | null = null, ms: number | undefined, avg = 0;
  return {
    supported: true,
    get ms() { return ms; },
    begin() {
      if (current || inflight.length > 3) return;
      current = gl.createQuery();
      if (current) gl.beginQuery(ext.TIME_ELAPSED_EXT, current);
    },
    end() {
      if (current) { gl.endQuery(ext.TIME_ELAPSED_EXT); inflight.push(current); current = null; }
      while (inflight.length && gl.getQueryParameter(inflight[0]!, gl.QUERY_RESULT_AVAILABLE)) {
        const q = inflight.shift()!;
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const v = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; avg = avg ? avg * 0.9 + v * 0.1 : v; ms = avg; }
        gl.deleteQuery(q);
      }
    },
  };
}

export interface PerfSample {
  fps: number; frameMs: number; worstMs: number; gpuMs?: number; ticksLastFrame: number; calls: number; triangles: number;
  entities: number; systems: readonly { id: string; ms: number }[];
}

const BUDGET_MS = 1000 / 60;
const tone = (ms: number | undefined): string => (ms === undefined ? '#9aa' : ms < BUDGET_MS * 0.5 ? '#6f6' : ms < BUDGET_MS ? '#fd4' : '#f66');

export function createPerfHud(parent: HTMLElement): { readonly visible: boolean; toggle(on?: boolean): void; update(s: PerfSample): void } {
  let el: HTMLElement | undefined;
  let visible = false;
  return {
    get visible() { return visible; },
    toggle(on = !visible) {
      visible = on;
      if (on && !el) {
        el = parent.ownerDocument.createElement('div');
        el.className = 'perf-hud';
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'position:absolute;top:6px;left:6px;z-index:40;pointer-events:none;font:11px/1.35 ui-monospace,monospace;color:#dfe;background:#000b;padding:6px 8px;border:1px solid #fff2;white-space:pre;min-width:190px';
        parent.append(el);
      }
      if (el) el.hidden = !on;
    },
    update(s) {
      if (!visible || !el) return;
      const top = [...s.systems].sort((a, b) => b.ms - a.ms).slice(0, 4);
      const line = (label: string, value: string, color = '#dfe'): string => `<span style="color:#8a9">${label.padEnd(9)}</span><span style="color:${color}">${value}</span>`;
      el.innerHTML = [
        line('FPS', s.fps.toFixed(0), s.fps >= 55 ? '#6f6' : s.fps >= 30 ? '#fd4' : '#f66'),
        line('CPU', `${s.frameMs.toFixed(2)} ms`, tone(s.frameMs)),
        line('GPU', s.gpuMs === undefined ? 'n/a' : `${s.gpuMs.toFixed(2)} ms`, tone(s.gpuMs)),
        line('worst', `${s.worstMs.toFixed(0)} ms`, tone(s.worstMs)),
        line('ticks', String(s.ticksLastFrame)),
        line('draws', `${s.calls} · ${(s.triangles / 1000).toFixed(1)}k tris`),
        line('entities', String(s.entities)),
        ...top.map((t) => line(t.id.length > 24 ? `…${t.id.slice(-23)}` : t.id, `${t.ms.toFixed(3)} ms`, tone(t.ms * 10))),
      ].join('\n');
    },
  };
}
