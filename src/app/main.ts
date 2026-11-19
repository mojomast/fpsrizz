/**
 * Composition root. The only place that knows which plugins exist (via the catalog), wires platform adapters into
 * sessions as host services, and runs the frame loop. No gameplay rules live here.
 */
import { HostError, PluginHost, errText } from '@bulkhead/kernel/host.ts';
import { hashSnapshot } from '@bulkhead/kernel/snapshot.ts';
import type { Session } from '@bulkhead/kernel/host.ts';
import { createAssetService, preloadManifestAssets } from '@bulkhead/platform-web/assets.ts';
import { createAudioService } from '@bulkhead/platform-web/audio.ts';
import { createFlow } from '@bulkhead/platform-web/flow.ts';
import { bindDomInput, createActionLookup, createInputCore, isInputEditableTarget } from '@bulkhead/platform-web/input.ts';
import { bindGamepads } from '@bulkhead/platform-web/gamepad.ts';
import { createInputBindings } from '@bulkhead/platform-web/input-bindings.ts';
import { bindTouchControls } from '@bulkhead/platform-web/touch.ts';
import { createProfileStore } from '@bulkhead/platform-web/profile-store.ts';
import type { ProfileStorage } from '@bulkhead/platform-web/profile-store.ts';
import { isWebGL2Available } from '@bulkhead/platform-web/render/mini3/index.ts';
import { createRenderHost, createWebGpuRenderHost } from '@bulkhead/platform-web/render/service.ts';
import { chooseRenderer } from '@bulkhead/platform-web/render/webgpu-gate.ts';
import type { RenderHost } from '@bulkhead/platform-web/render/service.ts';
import { loadSelectedPreset, loadSettings, saveSelectedPreset, saveSettings } from '@bulkhead/platform-web/storage.ts';
import { createUiService } from '@bulkhead/platform-web/ui.ts';
import { recordInput } from '@bulkhead/platform-web/replay.ts';
import { createDebugDraw } from '@bulkhead/platform-web/debug-draw.ts';
import { createGpuTimer, createPerfHud } from '@bulkhead/platform-web/perf-hud.ts';
import type { DevEnv, DevSim, DevTools } from '@bulkhead/platform-web/devtools.ts';
import { invertMatrix, mat4, multiplyMatrices } from '@bulkhead/platform-web/render/mini3/math.ts';
import type { ReplayRecorder } from '@bulkhead/platform-web/replay.ts';
import type { ExperienceProvider, FlowResult, SettingsService, ThemeProvider } from '@bulkhead/sdk';
import { Assets, Audio, DebugDraw, PhysicsCollider, worldPose, AudioSamples, ExperienceRole, Flow, FlowEnded, Input, InputActions, InputAxes, InputBindings, InputContexts, prettyKey, PHASES, Profile, SDK_COMPAT, SDK_VERSION, SessionControl, Settings, Ui } from '@bulkhead/sdk';
import { Render } from '@bulkhead/sdk/render.ts';
import { catalog, presets } from './catalog.ts';
import type { ApplyResult, FrameStats } from './creator.ts';
import { createCreatorPanel } from './creator.ts';
import { installLiveReload, seedOverride, takeResumeRequest, takeResumeSnapshot, withSeed } from './dev-loop.ts';
import { createShell } from './shell.ts';
import type { ShellSettings } from './shell.ts';

type AppState = 'boot' | 'menu' | 'playing' | 'paused' | 'ending' | 'ended' | 'error';
const BASE_SENSITIVITY = 0.0024;
const END_SCREEN_DELAY = 1.1;

async function boot(): Promise<void> {
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
    // P3.2: ?renderer=webgpu opts into three.js WebGPURenderer for presets that passed the parity suite.
    const choice = chooseRenderer(location.search);
    if (choice.refused) console.warn(choice.refused);
    renderHost = choice.backend === 'webgpu'
      ? await createWebGpuRenderHost(canvas, { pixelRatioCap: settings.pixelRatioCap, forceWebGL: choice.forceWebGL })
      : createRenderHost(canvas, { pixelRatioCap: settings.pixelRatioCap });
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
  // Dev tools (P2.5): debug drawing (`?debugdraw` or the Inspect tab) and time controls (pause/step/speed).
  const params = new URLSearchParams(location.search);
  const debugDraw = createDebugDraw(params.has('debugdraw'));
  const overlays = { colliders: false };
  const devSim: DevSim = { mode: 'auto', speed: 1 };
  // P2.7: perf HUD (F3 or ?perf) with GPU time when EXT_disjoint_timer_query_webgl2 exists.
  const perfHud = createPerfHud(root);
  if (params.has('perf')) perfHud.toggle(true);
  // `?record` records every session's input for a `.replay.json` (F8 or __bulkhead.replay.download()).
  const recording = new URLSearchParams(location.search).has('record');
  let recorder: ReplayRecorder | undefined;
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
      session.services.provide(DebugDraw, debugDraw.service, 'host', scope);
      session.scheduler.timeScale = devSim.speed;
      session.addBeforeTick(() => { gamepads.poll(); inputCore.beginTick(); debugDraw.beginTick(session.scheduler.time); }, scope);
      if (recording) {
        recorder?.stop();
        const rec = recordInput(inputCore, { sdk: SDK_VERSION, preset: session.preset.id, seed: session.preset.seed });
        recorder = rec;
        scope.add(() => { rec.stop(); if (recorder === rec) recorder = undefined; }, 'replay-recorder');
      }
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
    dev: () => dev(),
  });

  // ---- quicksave / replays (SDK 3) ----------------------------------------------------------------------------------
  // Snapshots are only complete when every active plugin follows the SDK 3 rule "state outside components goes
  // through ctx.persist()", so quicksave is offered for all-SDK-3 presets only (older games keep closure state).
  const snapshotReady = (): boolean => {
    const a = host.active, s = host.session;
    return !!a && !!s && s.state === 'running' && s.order.every((id) => /^\^?3\./.test(a.manifests.get(id)?.sdk ?? ''));
  };
  const saveKey = (): string => `fpsrizz/quicksave/${host.session?.preset.id ?? ''}`;
  const flash = (text: string): void => { shell.setHint(text); setTimeout(() => shell.setHint(null), 1500); };
  const quicksave = (): boolean => {
    if (!snapshotReady()) return false;
    try { localStorage.setItem(saveKey(), JSON.stringify(host.snapshot())); flash('Quicksaved (F9 to load)'); return true; } catch (e) { console.warn('quicksave failed', e); return false; }
  };
  const quickload = (): boolean => {
    const raw = snapshotReady() ? localStorage.getItem(saveKey()) : null;
    if (!raw) return false;
    try { inputCore.clear(); host.restore(JSON.parse(raw)); flash('Quickloaded'); return true; } catch (e) { console.warn('quickload failed', e); flash('Quicksave does not fit this game version'); return false; }
  };
  const downloadReplay = (): boolean => {
    if (!recorder) return false;
    const file = recorder.toFile({ hash: hashSnapshot(host.snapshot()), meta: { recorded: new Date().toISOString() } });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    a.download = `${file.preset.replace(/\W+/g, '-')}-${file.seed}.replay.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  };

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
    if (e.code === 'F3') {
      e.preventDefault();
      perfHud.toggle();
      return;
    }
    if ((e.code === 'F6' || e.code === 'F9' || e.code === 'F8') && (state === 'playing' || state === 'paused')) {
      const done = e.code === 'F6' ? quicksave() : e.code === 'F9' ? quickload() : downloadReplay();
      if (done) e.preventDefault();
      return;
    }
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

  // ---- debug overlay + dev tools (P2.5 / P2.6) ----------------------------------------------------------------------
  let overlay: HTMLCanvasElement | undefined;
  const viewProj = mat4(), view = mat4();
  let pendingShots: ((url: string) => void)[] = [];
  function drawDebugOverlay(): void {
    const s = host.session;
    if (debugDraw.enabled && overlays.colliders && s) {
      s.entities.each(PhysicsCollider, (id, c) => {
        const p = worldPose(s.entities, id)?.position;
        if (!p) return;
        const o = c.offset ?? { x: 0, y: 0, z: 0 }, at = { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z };
        const size = c.size ?? { x: 1, y: 1, z: 1 }, color = c.sensor ? 0xffcc00 : 0x44ddff;
        if (c.shape === 'ball') debugDraw.service.sphere(at, size.x / 2, { frame: true, color });
        else debugDraw.service.box(at, c.shape === 'box' ? size : { x: size.x, y: size.y, z: size.x }, { frame: true, color });
      });
    }
    const want = debugDraw.enabled && debugDraw.primitives().length > 0;
    if (!want && !overlay) return;
    if (!overlay) {
      overlay = document.createElement('canvas');
      overlay.className = 'debug-draw-overlay';
      overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
      canvas.parentElement?.append(overlay);
    }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
    const g = overlay.getContext('2d');
    if (!g) return;
    // mini3 cameras keep `_proj` and a raw matrixWorld; Three.js cameras (render-three adapter) use `.elements`.
    const cam = renderHost.activeCamera() as unknown as { matrixWorld: Float32Array | { elements: ArrayLike<number> }; _proj?: Float32Array; projectionMatrix?: { elements: ArrayLike<number> } };
    const world = 'elements' in cam.matrixWorld ? cam.matrixWorld.elements : cam.matrixWorld;
    const proj = cam._proj ?? cam.projectionMatrix?.elements;
    if (!proj) return;
    invertMatrix(view, world as Float32Array);
    multiplyMatrices(viewProj, proj as Float32Array, view);
    debugDraw.render(g, viewProj, w, h);
  }
  function takeShot(): void {
    if (!pendingShots.length) return;
    const shot = document.createElement('canvas');
    shot.width = canvas.width; shot.height = canvas.height;
    const g = shot.getContext('2d')!;
    g.drawImage(canvas, 0, 0);
    if (overlay && debugDraw.enabled) g.drawImage(overlay, 0, 0, shot.width, shot.height);
    const url = shot.toDataURL('image/png');
    for (const r of pendingShots) r(url);
    pendingShots = [];
  }
  const devEnv: DevEnv = {
    host, sim: devSim, debugDraw, overlays, snapshotReady: () => snapshotReady(),
    applyPreset: (p) => applyPreset(p),
    resume: () => begin(),
    input: (() => {
      const lookup = createActionLookup(() => inputBindings.effective());
      return { press: (key: string, down: boolean) => { lookup.refresh(); if (down) inputCore.pressKey(key, lookup.get(key)); else inputCore.releaseKey(key); } };
    })(),
    screenshot: () => new Promise<string>((res) => { pendingShots.push(res); }),
    async runReplay(file) {
      const m = await import('@bulkhead/platform-web/replay-run.ts');
      return m.runReplayHeadless({ catalog, presets, file });
    },
  };
  let devTools: Promise<DevTools> | undefined;
  const dev = (): Promise<DevTools> => (devTools ??= import('@bulkhead/platform-web/devtools.ts').then((m) => m.createDevTools(devEnv)));

  // ---- frame loop ----------------------------------------------------------------------------------------------------
  let last = performance.now();
  let frames = 0;
  let windowStart = last;
  let workMs = 0;
  let worst = 0;
  let gpu: ReturnType<typeof createGpuTimer> | undefined;
  const frame = (t: number): void => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.25, Math.max(0, (t - last) / 1000));
    last = t;
    const t0 = performance.now();
    const s = host.session;
    if (s && s.state === 'running') {
      // Simulation only advances while the player actually has control.
      const auto = (state === 'playing' && captured()) || state === 'ending';
      const run = devSim.mode === 'auto' ? auto : devSim.mode === 'run' && state !== 'ended' && state !== 'error';
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
    if (perfHud.visible) gpu ??= createGpuTimer(renderHost.backend === 'webgl' ? canvas.getContext('webgl2') : null);
    if (perfHud.visible) gpu?.begin();
    renderHost.render();
    if (perfHud.visible) gpu?.end();
    drawDebugOverlay();
    takeShot();
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
      stats.gpuMs = gpu?.ms;
      if (perfHud.visible) perfHud.update({ ...stats, backend: renderHost.backend, entities: host.session?.entities.count() ?? 0, systems: host.session?.scheduler.describe() ?? [] });
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
    perfHud,
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
    snapshots: { ready: snapshotReady, quicksave, quickload, take: () => host.snapshot(), restore: (s: unknown) => host.restore(s) },
    replay: { get recorder() { return recorder; }, download: downloadReplay },
    /** Dev tools (same methods as the JSON-RPC protocol): `(await __bulkhead.dev())['world.query']({})`. */
    dev,
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
      // P2.1 step 2: the run's snapshot survives the reload when it is complete (all-SDK-3 presets).
      if (result.ok && takeResumeRequest() && (await ensureFreshSession())) {
        begin();
        const snap = takeResumeSnapshot();
        if (snap) try { host.restore(snap); flash('Reloaded — state kept'); } catch (e) { console.info('state not kept across reload:', errText(e)); }
      }
      installLiveReload({ shouldResume: () => state === 'playing' || state === 'paused' || state === 'ending', snapshot: () => (snapshotReady() ? host.snapshot() : undefined) });
      // P2.6: the dev server's JSON-RPC bridge (port + 1). `?devrpc=off` opts out, `?devrpc=ws://…` points elsewhere.
      const rpc = params.get('devrpc');
      if (rpc !== 'off') void import('./dev-rpc.ts').then((m) => m.connectDevRpc(dev, rpc || `ws://${location.hostname}:${Number(location.port || 80) + 1}/game`));
    }
  })();
}

void boot();
