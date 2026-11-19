import type { AudioBus, AudioService, Listener, PlayOptions, SampleDef, SoundDef, VoiceHandle } from '@bulkhead/sdk/contracts/audio.ts';
import { AUDIO_BUSES } from '@bulkhead/sdk/contracts/audio.ts';

const MAX_VOICES = 24;

interface Voice {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  timer: ReturnType<typeof setTimeout> | undefined;
  gain: GainNode;
  panner: PannerNode | undefined;
}

export interface AudioHostOptions {
  /** Creates the AudioContext (tests pass a fake). Default: window.AudioContext. */
  createContext?: () => AudioContext;
  /** Cosmetic randomness for rate jitter (default Math.random). */
  random?: () => number;
}

export interface SampleSource {
  id: string;
  def: SampleDef;
  /** Bytes of def.url (the app reads them through the asset service). */
  load: () => Promise<Uint8Array>;
}

export type HostAudio = Required<Pick<AudioService, 'start' | 'setBusVolume' | 'getBusVolume' | 'setListener'>> & AudioService & {
  stopAll(): void;
  dispose(): void;
  /** Decodes samples (cached by id + url; already decoded ones are kept). Never rejects. */
  loadSamples(list: readonly SampleSource[]): Promise<void>;
  /** Forgets decoded samples whose id is not listed (call when a new session starts). */
  retainSamples(ids: Iterable<string>): void;
  readonly samples: { readonly loaded: number; readonly failed: number; readonly pending: number };
};

/**
 * Web Audio host service. Synth SoundDefs (theme sounds) are the fallback; SDK 3 adds decoded samples
 * (`AudioSamples`), mixer buses (music / sfx / ui / ambience -> master) and 3D positioning with PannerNodes relative to
 * the listener.
 */
export function createAudioService(lookup: (soundId: string) => SoundDef | undefined, options: AudioHostOptions = {}): HostAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  const buses = new Map<AudioBus, GainNode>();
  const busVolume = new Map<AudioBus, number>(AUDIO_BUSES.map((b) => [b, 1]));
  let noiseBuf: AudioBuffer | null = null;
  let volume = 0.7;
  const voices = new Set<Voice>();
  const warned = new Set<string>();
  const samples = new Map<string, { def: SampleDef; buffer: AudioBuffer }>();
  const pending = new Map<string, Promise<void>>();
  const failed = new Set<string>();
  let listener: Listener | undefined;
  const random = options.random ?? Math.random;

  const Ctor: (new () => AudioContext) | undefined = options.createContext
    ? (function F() { return options.createContext!(); } as unknown as new () => AudioContext)
    : typeof globalThis !== 'undefined'
      ? ((globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;

  function applyListener(): void {
    const c = ctx, l = listener;
    if (!c || !l) return;
    const L = c.listener;
    if (L.positionX) {
      L.positionX.value = l.position.x; L.positionY.value = l.position.y; L.positionZ.value = l.position.z;
      L.forwardX.value = l.forward.x; L.forwardY.value = l.forward.y; L.forwardZ.value = l.forward.z;
      L.upX.value = l.up.x; L.upY.value = l.up.y; L.upZ.value = l.up.z;
    } else {
      (L as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(l.position.x, l.position.y, l.position.z);
      (L as unknown as { setOrientation(...a: number[]): void }).setOrientation(l.forward.x, l.forward.y, l.forward.z, l.up.x, l.up.y, l.up.z);
    }
  }

  /** Creates the context on first need (it starts suspended until resume() runs from a user gesture). */
  function ensureContext(): AudioContext | null {
    if (ctx || !Ctor) return ctx;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      for (const b of AUDIO_BUSES) {
        const g = ctx.createGain();
        g.gain.value = busVolume.get(b)!;
        g.connect(master);
        buses.set(b, g);
      }
      applyListener();
    } catch {
      ctx = null;
      master = null;
      buses.clear();
    }
    return ctx;
  }

  function getNoise(c: AudioContext): AudioBuffer {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(c.sampleRate * 1.5);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let s = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 0x80000000) - 1;
    }
    noiseBuf = buf;
    return buf;
  }

  function endVoice(v: Voice, stop: boolean): void {
    if (!voices.has(v)) return;
    voices.delete(v);
    if (v.timer !== undefined) clearTimeout(v.timer);
    for (const s of v.sources) {
      if (stop) {
        try { s.stop(); } catch { /* already stopped */ }
      }
      s.onended = null;
    }
    for (const n of v.nodes) {
      try { n.disconnect(); } catch { /* ignore */ }
    }
  }

  function stopAll(): void {
    for (const v of [...voices]) endVoice(v, true);
  }

  const setPos = (p: PannerNode, at: Readonly<{ x: number; y: number; z: number }>): void => {
    if (p.positionX) { p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; }
    else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(at.x, at.y, at.z);
  };

  /** Voice output chain: gain -> (3D panner | stereo panner) -> bus. */
  function output(c: AudioContext, bus: AudioBus, gain: number, opts: PlayOptions | undefined, def?: SampleDef): Voice {
    const vg = c.createGain();
    vg.gain.value = gain;
    const voice: Voice = { nodes: [vg], sources: [], timer: undefined, gain: vg, panner: undefined };
    let tail: AudioNode = vg;
    if (opts?.position) {
      const p = c.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = def?.refDistance ?? 2;
      p.maxDistance = def?.maxDistance ?? 60;
      p.rolloffFactor = def?.rolloff ?? 1;
      setPos(p, opts.position);
      vg.connect(p);
      voice.nodes.push(p);
      voice.panner = p;
      tail = p;
    } else if (opts?.pan !== undefined && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = Math.min(1, Math.max(-1, opts.pan));
      vg.connect(p);
      voice.nodes.push(p);
      tail = p;
    }
    tail.connect(buses.get(bus) ?? master!);
    return voice;
  }

  function handle(v: Voice): VoiceHandle {
    return {
      get playing() { return voices.has(v); },
      stop(fade = 0) {
        if (!voices.has(v)) return;
        const c = ctx;
        if (fade > 0 && c) {
          v.gain.gain.setValueAtTime(v.gain.gain.value, c.currentTime);
          v.gain.gain.linearRampToValueAtTime(0, c.currentTime + fade);
          if (v.timer !== undefined) clearTimeout(v.timer);
          v.timer = setTimeout(() => endVoice(v, true), fade * 1000 + 30);
        } else endVoice(v, true);
      },
      setPosition(p) { if (v.panner) setPos(v.panner, p); },
      setGain(g) { v.gain.gain.value = Math.max(0, g); },
    };
  }

  function startSample(c: AudioContext, id: string, s: { def: SampleDef; buffer: AudioBuffer }, opts: PlayOptions | undefined): VoiceHandle | undefined {
    const voice = output(c, opts?.bus ?? s.def.bus ?? 'sfx', (s.def.gain ?? 1) * (opts?.gain ?? 1), opts, s.def);
    const src = c.createBufferSource();
    src.buffer = s.buffer;
    const loop = opts?.loop ?? s.def.loop ?? false;
    src.loop = loop;
    const j = s.def.rateJitter;
    src.playbackRate.value = (opts?.rate ?? 1) * (j ? j[0] + (j[1] - j[0]) * random() : 1);
    src.connect(voice.gain);
    voice.nodes.push(src);
    voice.sources.push(src);
    src.onended = () => endVoice(voice, false);
    src.start(c.currentTime + 0.005);
    voices.add(voice);
    if (!loop) voice.timer = setTimeout(() => endVoice(voice, true), (s.buffer.duration / Math.max(0.05, src.playbackRate.value) + 0.5) * 1000 + 250);
    void id;
    return handle(voice);
  }

  function startSynth(c: AudioContext, def: SoundDef, opts: PlayOptions | undefined): VoiceHandle | undefined {
    const t0 = c.currentTime + 0.005;
    const rate = opts?.rate ?? 1;
    const voice = output(c, opts?.bus ?? 'sfx', def.gain * (opts?.gain ?? 1), opts);
    const vg = voice.gain;
    let end = 0;
    let remaining = 0;
    for (const L of def.layers) {
      const delay = L.delay ?? 0;
      const dur = Math.max(0.01, L.duration ?? def.duration - delay);
      const start = t0 + delay;
      const stopT = start + dur;
      end = Math.max(end, delay + dur);
      let src: AudioScheduledSourceNode;
      if (L.kind === 'osc') {
        const o = c.createOscillator();
        o.type = L.wave ?? 'sine';
        const f0 = Math.max(1, (L.freq?.[0] ?? 440) * rate);
        const f1 = Math.max(1, (L.freq?.[1] ?? L.freq?.[0] ?? 440) * rate);
        o.frequency.setValueAtTime(f0, start);
        o.frequency.exponentialRampToValueAtTime(f1, stopT);
        src = o;
      } else {
        const b = c.createBufferSource();
        b.buffer = getNoise(c);
        b.loop = true;
        b.loopStart = 0;
        b.loopEnd = b.buffer.duration;
        b.playbackRate.value = rate;
        src = b;
      }
      const lg = c.createGain();
      lg.gain.setValueAtTime(Math.max(0.0001, L.gain[0]), start);
      lg.gain.linearRampToValueAtTime(Math.max(0.0001, L.gain[1]), stopT - 0.004 > start ? stopT - 0.004 : stopT);
      lg.gain.linearRampToValueAtTime(0, stopT);
      voice.nodes.push(src, lg);
      voice.sources.push(src);
      if (L.filter) {
        const fl = c.createBiquadFilter();
        fl.type = L.filter.type;
        fl.Q.value = L.filter.q ?? 1;
        fl.frequency.setValueAtTime(Math.max(10, L.filter.freq[0]), start);
        fl.frequency.exponentialRampToValueAtTime(Math.max(10, L.filter.freq[1]), stopT);
        src.connect(fl);
        fl.connect(lg);
        voice.nodes.push(fl);
      } else {
        src.connect(lg);
      }
      lg.connect(vg);
      remaining++;
      src.onended = () => {
        if (--remaining <= 0) endVoice(voice, false);
      };
      src.start(start);
      src.stop(stopT + 0.02);
    }
    if (remaining === 0) {
      for (const n of voice.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
      return undefined;
    }
    voices.add(voice);
    // Safety net in case onended never fires (e.g. suspended context).
    voice.timer = setTimeout(() => endVoice(voice, true), (end + 0.5) * 1000 + 250);
    return handle(voice);
  }

  function start(soundId: string, opts?: PlayOptions): VoiceHandle | undefined {
    const c = ctx;
    const m = master;
    if (!c || !m || c.state === 'closed') return undefined;
    if (voices.size >= MAX_VOICES) return undefined;
    try {
      const s = samples.get(soundId);
      if (s) return startSample(c, soundId, s, opts);
      const def = lookup(soundId);
      if (!def) {
        if (!warned.has(soundId) && !pending.has(soundId)) {
          warned.add(soundId);
          console.warn(`[audio] unknown sound "${soundId}"`);
        }
        return undefined;
      }
      return startSynth(c, def, opts);
    } catch {
      return undefined; // never throw from play
    }
  }

  const keyOf = (id: string, def: SampleDef): string => `${id}\u0000${def.url}`;
  const decodedKeys = new Map<string, string>();

  return {
    get activeVoices() {
      return voices.size;
    },
    get samples() {
      return { loaded: samples.size, failed: failed.size, pending: pending.size };
    },
    resume() {
      const c = ensureContext();
      if (c && c.state === 'suspended') void c.resume().catch(() => {});
    },
    setMasterVolume(v) {
      volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
      if (master) master.gain.value = volume;
    },
    getMasterVolume() {
      return volume;
    },
    setBusVolume(bus, v) {
      const value = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
      busVolume.set(bus, value);
      const g = buses.get(bus);
      if (g) g.gain.value = value;
    },
    getBusVolume: (bus) => busVolume.get(bus) ?? 1,
    setListener(l) {
      listener = l;
      applyListener();
    },
    play(soundId: string, opts?: PlayOptions) {
      start(soundId, opts);
    },
    start,
    async loadSamples(list) {
      const c = ensureContext();
      if (!c) return;
      await Promise.all(list.map(async ({ id, def, load }) => {
        const key = keyOf(id, def);
        if (decodedKeys.get(id) === key && samples.has(id)) return;
        if (pending.has(id)) return pending.get(id);
        const job = (async () => {
          try {
            const bytes = await load();
            const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
            const buffer = await c.decodeAudioData(copy);
            samples.set(id, { def, buffer });
            decodedKeys.set(id, key);
            failed.delete(id);
          } catch (e) {
            failed.add(id);
            console.warn(`[audio] sample "${id}" (${def.url}) failed to load, using the synth fallback: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            pending.delete(id);
          }
        })();
        pending.set(id, job);
        return job;
      }));
    },
    retainSamples(ids) {
      const keep = new Set(ids);
      for (const id of [...samples.keys()]) if (!keep.has(id)) { samples.delete(id); decodedKeys.delete(id); }
      for (const id of [...failed]) if (!keep.has(id)) failed.delete(id);
    },
    stopAll,
    dispose() {
      stopAll();
      const c = ctx;
      ctx = null;
      master = null;
      buses.clear();
      noiseBuf = null;
      samples.clear();
      if (c && c.state !== 'closed') void c.close().catch(() => {});
    },
  };
}
