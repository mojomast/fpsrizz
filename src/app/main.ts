/**
 * Composition root. The only place that knows which plugins exist (via the catalog), wires platform adapters into
 * sessions as host services, and runs the frame loop. No gameplay rules live here.
 */
import { HostError, PluginHost, errText } from '../kernel/host.ts';
import type { Session } from '../kernel/host.ts';
import { createAudioService } from '../platform/audio.ts';
import { createFlow } from '../platform/flow.ts';
import { bindDomInput, createInputCore } from '../platform/input.ts';
import { isWebGL2Available } from '../platform/render/mini3/index.ts';
import { createRenderHost } from '../platform/render/service.ts';
import type { RenderHost } from '../platform/render/service.ts';
import { loadSelectedPreset, loadSettings, saveSelectedPreset, saveSettings } from '../platform/storage.ts';
import { createUiService } from '../platform/ui.ts';
import type { FlowResult, SettingsService, ThemeProvider } from '../sdk/index.ts';
import { Audio, Flow, FlowEnded, Input, InputActions, PHASES, SDK_VERSION, Settings, Ui } from '../sdk/index.ts';
import { Render } from '../sdk/render.ts';
import { catalog, presets } from './catalog.ts';
import type { ApplyResult, FrameStats } from './creator.ts';
import { createCreatorPanel } from './creator.ts';
import { createShell } from './shell.ts';
import type { ShellSettings } from './shell.ts';

type AppState = 'boot' | 'menu' | 'playing' | 'paused' | 'ending' | 'ended' | 'error';
const BASE_SENSITIVITY = 0.0024;
const END_SCREEN_DELAY = 1.1;

function boot(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app element missing');
  // ?test disables the pointer-lock requirement so automated browsers can drive the game.
  const testMode = new URLSearchParams(location.search).has('test');
  let settings = loadSettings();
  let state: AppState = 'boot';
  let sessionUsed = false;
  let endAt = 0;
  let pendingEnd: FlowResult | undefined;

  const shell = createShell(
    root,
    {
      onPlay: () => void play(),
      onResume: () => resume(),
      onRestart: () => void restart(),
      onQuitToMenu: () => toMenu(),
      onSettingsChange: (s) => applySettings(s),
      onOpenCreator: () => creator.toggle(),
    },
    settings,
  );
  const canvas = shell.canvas;

  if (!isWebGL2Available()) {
    shell.showUnsupported('This game needs WebGL2, which this browser or device does not provide. Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
    return;
  }
  let renderHost: RenderHost;
  try {
    renderHost = createRenderHost(canvas, { pixelRatioCap: settings.pixelRatioCap });
  } catch (e) {
    shell.showUnsupported(`The renderer could not start: ${errText(e)}`);
    return;
  }

  const inputCore = createInputCore();
  const ui = createUiService({ hud: shell.hudLayer, overlay: shell.overlayLayer });
  const settingsService: SettingsService = {
    get lookSensitivity() {
      return BASE_SENSITIVITY * settings.sensitivity;
    },
  };
  const themeOf = (): ThemeProvider | undefined => {
    const a = host.active;
    const id = a?.preset.roles['sdk/theme'];
    return a && id ? (a.registries.get({ kind: 'role:sdk/theme' }, id) as ThemeProvider | undefined) : undefined;
  };
  const audio = createAudioService((id) => themeOf()?.sounds[id]);
  audio.setMasterVolume(settings.volume);

  const host = new PluginHost({
    sdkVersion: SDK_VERSION,
    phases: PHASES,
    installHostServices(session, scope) {
      session.services.provide(Input, inputCore.service, 'host', scope);
      session.services.provide(Render, renderHost.service, 'host', scope);
      session.services.provide(Audio, audio, 'host', scope);
      session.services.provide(Ui, ui, 'host', scope);
      session.services.provide(Settings, settingsService, 'host', scope);
      session.services.provide(Flow, createFlow((r) => session.events.emit(FlowEnded, r), () => session.scheduler.time), 'host', scope);
      session.addBeforeTick(() => inputCore.beginTick(), scope);
      session.events.on(FlowEnded, (r) => onFlowEnded(session, r), 'host', scope);
      session.onFault = (f) => {
        state = 'error';
        releasePointer();
        shell.showError('Simulation paused', [`Plugin "${f.owner}" failed in ${f.systemId}:`, errText(f.error), '', 'The session was paused to avoid running with broken game state.', 'Return to the menu to restart, or open Creator tools to disable the plugin.'], true);
      };
      scope.add(() => {
        inputCore.clear();
        audio.stopAll();
      }, 'host-reset');
      session.scheduler.paused = true;
    },
    onLog: (e) => {
      if (e.level !== 'info') console.warn(`[${e.source}] ${e.message}`);
    },
  });
  const catalogIssues = host.setCatalog(catalog);
  for (const i of catalogIssues) console.error(`[catalog] ${i.source} ${i.path}: ${i.message}`);

  const captured = (): boolean => testMode || document.pointerLockElement === canvas;
  const domInput = bindDomInput(inputCore, {
    target: canvas,
    actions: () => host.active?.registries.entries(InputActions).map((e) => ({ id: e.id, keys: e.value.keys })) ?? [],
    isCaptured: () => state === 'playing' && captured(),
  });

  // ---- state transitions ---------------------------------------------------------------------------------------------
  const requestPointer = (): void => {
    if (testMode) return;
    try {
      const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => shell.setHint('Click the game view to capture the mouse — Esc releases it'));
    } catch {
      shell.setHint('Click the game view to capture the mouse — Esc releases it');
    }
  };
  const releasePointer = (): void => {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  };
  const setPaused = (p: boolean): void => {
    const s = host.session;
    if (s && s.state === 'running') {
      s.scheduler.paused = p;
      if (p) s.scheduler.resetAccumulator();
    }
    if (p) inputCore.clear();
  };

  function startInfo(): Parameters<typeof shell.showStart>[0] {
    const a = host.active;
    const s = host.session;
    const builtin = new Set((presets[0] as { plugins: string[] }).plugins);
    return {
      presetName: a?.preset.name ?? '(nothing loaded)',
      objective: s?.services.tryGet(Flow)?.objective ?? '',
      controls: describeControls(),
      extensions: a ? a.order.filter((id) => !builtin.has(id)).map((id) => a.manifests.get(id)?.name ?? id) : [],
    };
  }

  function describeControls(): [string, string][] {
    const out: [string, string][] = [['Mouse', 'Aim (yaw)']];
    const pretty = (k: string): string => k.replace(/^Key/, '').replace(/^Digit/, '').replace('Mouse0', 'Left click').replace('Mouse1', 'Middle click').replace('Mouse2', 'Right click').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('WheelUp', 'Wheel up').replace('WheelDown', 'Wheel down');
    const slots: string[] = [];
    for (const e of host.active?.registries.entries(InputActions) ?? []) {
      if (/weapon-\d+$/.test(e.id)) slots.push(...e.value.keys.map(pretty));
      else out.push([e.value.keys.map(pretty).join(' / '), e.value.label]);
    }
    if (slots.length) out.push([`${slots[0]}–${slots[slots.length - 1]}`, 'Select weapon']);
    out.push(['Esc', 'Release mouse / pause'], ['` (backquote)', 'Creator tools']);
    return out;
  }

  function showHostError(title: string, e: unknown): void {
    state = 'error';
    releasePointer();
    const lines = e instanceof HostError ? e.issues.map((i) => `[${i.source}] ${i.path}: ${i.message}`) : [errText(e)];
    shell.showError(title, lines, true);
  }

  function toMenu(): void {
    setPaused(true);
    releasePointer();
    state = 'menu';
    shell.setHint(null);
    shell.showStart(startInfo());
  }

  async function ensureFreshSession(): Promise<boolean> {
    try {
      if (!host.active) await host.apply(presets[0]);
      else if (!host.session || sessionUsed) await host.restart();
      sessionUsed = false;
      pendingEnd = undefined;
      return true;
    } catch (e) {
      if (e instanceof HostError && e.stage === 'superseded') return false;
      showHostError('The game could not start', e);
      return false;
    }
  }

  async function play(): Promise<void> {
    audio.resume();
    audio.play('ui-click');
    requestPointer(); // must happen inside the user gesture
    if (!(await ensureFreshSession())) return releasePointer();
    begin();
  }

  async function restart(): Promise<void> {
    audio.resume();
    requestPointer();
    sessionUsed = true;
    if (!(await ensureFreshSession())) return releasePointer();
    begin();
  }

  function begin(): void {
    state = 'playing';
    sessionUsed = true;
    shell.hide();
    shell.setHint(captured() ? null : 'Click the game view to capture the mouse — Esc releases it');
    domInput.refresh();
    setPaused(false);
  }

  function resume(): void {
    if (state !== 'paused') return;
    audio.resume();
    requestPointer();
    begin();
  }

  function pause(): void {
    if (state !== 'playing') return;
    state = 'paused';
    setPaused(true);
    releasePointer();
    shell.setHint(null);
    shell.showPause();
  }

  function onFlowEnded(session: Session, r: FlowResult): void {
    if (session !== host.session || state !== 'playing') return;
    state = 'ending';
    pendingEnd = r;
    endAt = performance.now() + END_SCREEN_DELAY * 1000;
    inputCore.clear();
  }

  function applySettings(s: ShellSettings): void {
    settings = { schema: 1, sensitivity: s.sensitivity, volume: s.volume, pixelRatioCap: s.pixelRatioCap };
    saveSettings(settings);
    audio.setMasterVolume(settings.volume);
    renderHost.setPixelRatioCap(settings.pixelRatioCap);
    renderHost.resize();
  }

  async function applyPreset(preset: unknown, extra: Parameters<PluginHost['apply']>[1] = []): Promise<ApplyResult> {
    try {
      await host.apply(preset, extra);
    } catch (e) {
      // Validation failures leave the running session untouched; only a failed activation leaves us without one.
      if (!host.session && !(e instanceof HostError && e.stage === 'superseded')) showHostError('The selected preset could not start', e);
      return { ok: false, error: e };
    }
    saveSelectedPreset(host.active!.preset);
    sessionUsed = false;
    domInput.refresh();
    toMenu();
    return { ok: true };
  }

  // ---- creator panel -------------------------------------------------------------------------------------------------
  const stats: FrameStats = { fps: 0, frameMs: 0, worstMs: 0, ticksLastFrame: 0, droppedTime: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, width: 0, height: 0, pixelRatio: 1 };
  const creator = createCreatorPanel(shell.creatorHost, {
    host,
    builtinPresets: presets,
    apply: applyPreset,
    frameStats: () => stats,
    assets: () => renderHost.assets.report(),
    counts: () => ({ uiRoots: ui.mounted, sceneRoots: renderHost.liveRoots(), audioVoices: audio.activeVoices }),
  });

  // ---- browser events ------------------------------------------------------------------------------------------------
  const onLockChange = (): void => {
    if (document.pointerLockElement === canvas) shell.setHint(null);
    else if (state === 'playing' && !testMode) pause();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Backquote') {
      e.preventDefault();
      if (state === 'playing') pause();
      creator.toggle();
    } else if (e.code === 'Escape' && testMode && state === 'playing') pause();
  };
  const onBlur = (): void => {
    if (state === 'playing') pause();
  };
  const onVisibility = (): void => {
    if (document.hidden && state === 'playing') pause();
  };
  const onCanvasClick = (): void => {
    if (state === 'playing' && !captured()) requestPointer();
  };
  const onResize = (): void => renderHost.resize();
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('click', onCanvasClick);
  window.addEventListener('resize', onResize);
  renderHost.resize();

  // ---- frame loop ----------------------------------------------------------------------------------------------------
  let last = performance.now();
  let frames = 0;
  let windowStart = last;
  let workMs = 0;
  let worst = 0;
  const frame = (t: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.25, Math.max(0, (t - last) / 1000));
    last = t;
    const t0 = performance.now();
    const s = host.session;
    if (s && s.state === 'running') {
      // Simulation only advances while the player actually has control.
      const run = (state === 'playing' && captured()) || state === 'ending';
      if (s.scheduler.paused === run) setPaused(!run);
      s.scheduler.advance(dt);
      stats.ticksLastFrame = s.scheduler.lastFrameTicks;
      stats.droppedTime = s.scheduler.droppedTime;
    }
    if (state === 'ending' && t >= endAt && pendingEnd) {
      state = 'ended';
      setPaused(true);
      releasePointer();
      shell.showEnd(pendingEnd);
    }
    renderHost.render();
    const work = performance.now() - t0;
    workMs += work;
    worst = Math.max(worst, dt * 1000);
    frames++;
    if (t - windowStart >= 500) {
      stats.fps = (frames * 1000) / (t - windowStart);
      stats.frameMs = workMs / frames;
      stats.worstMs = worst;
      const rs = renderHost.service.stats;
      stats.calls = rs.calls;
      stats.triangles = rs.triangles;
      stats.geometries = rs.geometries;
      stats.textures = rs.textures;
      stats.width = renderHost.service.width;
      stats.height = renderHost.service.height;
      stats.pixelRatio = renderHost.service.pixelRatio;
      frames = 0;
      workMs = 0;
      worst = 0;
      windowStart = t;
    }
  };
  let raf = requestAnimationFrame(frame);

  // Debug/automation handle (used by scripts/smoke.mjs). Not an API for plugins.
  (window as unknown as Record<string, unknown>)['__bulkhead'] = {
    host,
    inputCore,
    renderHost,
    audio,
    ui,
    stats,
    creator,
    get state() {
      return state;
    },
    play,
    pause,
    resume,
    restart,
    toMenu,
    applyPreset,
    stop() {
      cancelAnimationFrame(raf);
    },
  };

  // ---- initial load --------------------------------------------------------------------------------------------------
  shell.showLoading('Loading plugins…');
  void (async () => {
    const stored = loadSelectedPreset();
    let result = stored !== undefined ? await applyPreset(stored) : await applyPreset(presets[0]);
    if (!result.ok && stored !== undefined) {
      console.warn('Stored preset is no longer valid; falling back to the default preset.');
      result = await applyPreset(presets[0]);
    }
    if (!result.ok && (state as AppState) !== 'error') showHostError('The default preset is invalid', (result as { error: unknown }).error);
  })();
}

boot();
