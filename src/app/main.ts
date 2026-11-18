/**
 * Composition root. The only place that knows which plugins exist (via the catalog), wires platform adapters into
 * sessions as host services, and runs the frame loop. No gameplay rules live here.
 */
import { HostError, PluginHost, errText } from '../kernel/host.ts';
import type { Session } from '../kernel/host.ts';
import { createAssetService, preloadManifestAssets } from '../platform/assets.ts';
import { createAudioService } from '../platform/audio.ts';
import { createFlow } from '../platform/flow.ts';
import { bindDomInput, createInputCore, isInputEditableTarget } from '../platform/input.ts';
import { bindGamepads } from '../platform/gamepad.ts';
import { createInputBindings } from '../platform/input-bindings.ts';
import { bindTouchControls } from '../platform/touch.ts';
import { createProfileStore } from '../platform/profile-store.ts';
import type { ProfileStorage } from '../platform/profile-store.ts';
import { isWebGL2Available } from '../platform/render/mini3/index.ts';
import { createRenderHost } from '../platform/render/service.ts';
import type { RenderHost } from '../platform/render/service.ts';
import { loadSelectedPreset, loadSettings, saveSelectedPreset, saveSettings } from '../platform/storage.ts';
import { createUiService } from '../platform/ui.ts';
import type { ExperienceProvider, FlowResult, SettingsService, ThemeProvider } from '../sdk/index.ts';
import { Assets, Audio, AudioSamples, ExperienceRole, Flow, FlowEnded, Input, InputActions, InputAxes, InputBindings, InputContexts, prettyKey, PHASES, Profile, SDK_COMPAT, SDK_VERSION, SessionControl, Settings, Ui } from '../sdk/index.ts';
import { Render } from '../sdk/render.ts';
import { catalog, presets } from './catalog.ts';
import type { ApplyResult, FrameStats } from './creator.ts';
import { createCreatorPanel } from './creator.ts';
import { installLiveReload, seedOverride, takeResumeRequest, withSeed } from './dev-loop.ts';
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
      bindings: {
        list: () => inputBindings.list().map((r) => ({ action: r.action, label: r.label, keys: r.keys.map(prettyKey).join(' / ') || '(unbound)', overridden: r.overridden })),
        rebind: (action) => captureBinding(action),
        reset: () => inputBindings.reset(),
      },
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
  let profileStorage: ProfileStorage | null = null;
  try { profileStorage = globalThis.localStorage ?? null; } catch { /* access denied */ }
  const profile = createProfileStore(profileStorage);
  // Input v2: rebinding overrides (own profile store so game profiles never clobber them), gamepads, touch, axes.
  const refreshInput = (): void => { domInput.refresh(); gamepads.refresh(); touch.refresh(); };
  const inputBindings = createInputBindings({
    core: inputCore,
    store: createProfileStore(profileStorage, 'fpsrizz/input-bindings'),
    actions: () => host.active?.registries.entries(InputActions) ?? [],
    onChange: () => refreshInput(),
  });
  inputCore.setAxes(() => host.active?.registries.entries(InputAxes).map((e) => [e.id, e.value] as const) ?? []);
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
  const applyVolumes = (): void => {
    audio.setMasterVolume(settings.volume);
    audio.setBusVolume('music', settings.musicVolume);
    for (const b of ['sfx', 'ui', 'ambience'] as const) audio.setBusVolume(b, settings.effectsVolume);
  };
  applyVolumes();

  const assets = createAssetService();
  const host = new PluginHost({
    sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT,
    phases: PHASES,
    async beforeActivate(ctx) {
      await preloadManifestAssets(assets)(ctx);
      // Samples decode in the background; the synth fallback plays until they are ready.
      const mine = ctx.registries.entries(AudioSamples).filter((e) => e.owner === ctx.pluginId);
      if (mine.length) void audio.loadSamples(mine.map((e) => ({ id: e.id, def: e.value, load: () => assets.bytes(ctx, e.value.url) })));
    },
    installHostServices(session, scope) {
      session.services.provide(Assets, assets, 'host', scope);
      audio.retainSamples(session.registries.entries(AudioSamples).map((e) => e.id));
      session.services.provide(Input, inputCore.service, 'host', scope);
      session.services.provide(InputContexts, inputCore.contexts, 'host', scope);
      session.services.provide(SessionControl, {
        get playing() { return session === host.session && session.state === 'running' && state === 'playing' && captured(); },
      }, 'host', scope);
      session.services.provide(Render, renderHost.service, 'host', scope);
      session.services.provide(Audio, audio, 'host', scope);
      session.services.provide(Ui, ui, 'host', scope);
      session.services.provide(Settings, settingsService, 'host', scope);
      session.services.provide(Profile, profile, 'host', scope);
      session.services.provide(Flow, createFlow((r) => session.events.emit(FlowEnded, r), () => session.scheduler.time), 'host', scope);
      session.services.provide(InputBindings, inputBindings, 'host', scope);
      session.addBeforeTick(() => { gamepads.poll(); inputCore.beginTick(); }, scope);
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

  const experience = (): ExperienceProvider | undefined => {
    const a = host.active;
    const id = a?.preset.roles[ExperienceRole.id];
    return a && id ? a.registries.get<ExperienceProvider>({ kind: `role:${ExperienceRole.id}` }, id) : undefined;
  };
  const needsPointerLock = (): boolean => (experience()?.pointer ?? 'locked') === 'locked';
  const captured = (): boolean => !needsPointerLock() || testMode || document.pointerLockElement === canvas;
  const inputActive = (): boolean => state === 'playing' && captured();
  const domInput = bindDomInput(inputCore, { target: canvas, actions: () => inputBindings.effective(), isCaptured: inputActive });
  const gamepads = bindGamepads(inputCore, { actions: () => inputBindings.effective(), isCaptured: inputActive });
  const touchParam = new URLSearchParams(location.search).get('touch');
  const touch = bindTouchControls(inputCore, {
    mount: (layer) => shell.hudLayer.after(layer),
    actions: () => inputBindings.effective(),
    isCaptured: inputActive,
    ...(touchParam !== null ? { enabled: touchParam !== '0' } : {}),
  });
  /** Pause-menu rebinding: waits for the next key / button (gamepads are polled while the session is paused). */
  async function captureBinding(action: string): Promise<string | undefined> {
    let polling = true;
    const pollPads = (): void => { if (!polling) return; gamepads.poll(); requestAnimationFrame(pollPads); };
    const pending = inputBindings.capture();
    requestAnimationFrame(pollPads);
    const key = await pending;
    polling = false;
    if (key) inputBindings.rebind(action, [key]);
    return key;
  }

  // ---- state transitions ---------------------------------------------------------------------------------------------
  const requestPointer = (): void => {
    if (testMode || !needsPointerLock()) return;
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
    const selected = experience();
    const out: [string, string][] = selected?.controls?.map(([key, label]) => [key, label]) ?? (needsPointerLock() ? [['Mouse', 'Aim (yaw)']] : []);
    const pretty = prettyKey;
    const slots: string[] = [];
    for (const e of selected?.controls ? [] : inputBindings.effective()) {
      // Gamepad / touch virtual keys are listed in the pause menu's key bindings, not the keyboard summary.
      const keys = e.keys.filter((k) => !/^(Gamepad|Touch)/.test(k));
      if (/weapon-\d+$/.test(e.id)) slots.push(...keys.map(pretty));
      else if (keys.length) out.push([keys.map(pretty).join(' / '), e.label]);
    }
    if (slots.length) out.push([`${slots[0]}–${slots[slots.length - 1]}`, 'Select weapon']);
    out.push(['Esc', needsPointerLock() ? 'Release mouse / pause' : 'Pause'], ['` (backquote)', 'Creator tools']);
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
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    state = 'playing';
    sessionUsed = true;
    shell.hide();
    shell.setHint(captured() ? null : 'Click the game view to capture the mouse — Esc releases it');
    refreshInput();
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
    settings = { schema: 1, sensitivity: s.sensitivity, volume: s.volume, musicVolume: s.musicVolume, effectsVolume: s.effectsVolume, pixelRatioCap: s.pixelRatioCap };
    saveSettings(settings);
    applyVolumes();
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
    refreshInput();
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
    else if (state === 'playing' && needsPointerLock() && !testMode) pause();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.isComposing || e.repeat) return;
    // Pause remains reachable after clicking a free-cursor game's native UI button.
    if (e.code === 'Escape' && !e.defaultPrevented && (testMode || !needsPointerLock()) && state === 'playing') {
      pause();
      return;
    }
    if (isInputEditableTarget(e.target)) return;
    if (e.code === 'Backquote') {
      e.preventDefault();
      if (state === 'playing') pause();
      creator.toggle();
    }
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
    // 3D audio: the listener is the world camera.
    const cam = renderHost.activeCamera().matrixWorld.elements;
    audio.setListener({ position: { x: cam[12]!, y: cam[13]!, z: cam[14]! }, forward: { x: -cam[8]!, y: -cam[9]!, z: -cam[10]! }, up: { x: cam[4]!, y: cam[5]!, z: cam[6]! } });
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
    inputBindings,
    gamepads,
    renderHost,
    audio,
    ui,
    stats,
    creator,
    shell,
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
    const requestedId = new URLSearchParams(location.search).get('preset');
    const requested = presets.find(p => p !== null && typeof p === 'object' && 'id' in p && p.id === requestedId);
    const stored = loadSelectedPreset();
    // `?seed=N` overrides the preset seed so a run can be reproduced from a URL.
    let result = await applyPreset(withSeed(requested ?? stored ?? presets[0], seedOverride(location.search)));
    if (!result.ok && stored !== undefined && requested === undefined) {
      console.warn('Stored preset is no longer valid; falling back to the default preset.');
      result = await applyPreset(presets[0]);
    }
    if (!result.ok && (state as AppState) !== 'error') showHostError('The default preset is invalid', (result as { error: unknown }).error);
    if (__DEV__) {
      // Edit loop: reload on every rebuild and drop straight back into the game that was running.
      if (result.ok && takeResumeRequest() && (await ensureFreshSession())) begin();
      installLiveReload({ shouldResume: () => state === 'playing' || state === 'paused' || state === 'ending' });
    }
  })();
}

boot();
