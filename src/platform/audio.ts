import type { AudioService, PlayOptions, SoundDef } from '../sdk/contracts/audio.ts';

const MAX_VOICES = 24;

interface Voice {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  timer: ReturnType<typeof setTimeout> | undefined;
}

export function createAudioService(
  lookup: (soundId: string) => SoundDef | undefined,
): AudioService & { stopAll(): void; dispose(): void } {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let volume = 0.7;
  const voices = new Set<Voice>();
  const warned = new Set<string>();

  const Ctor: typeof AudioContext | undefined =
    typeof globalThis !== 'undefined'
      ? ((globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;

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
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      s.onended = null;
    }
    for (const n of v.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  function stopAll(): void {
    for (const v of [...voices]) endVoice(v, true);
  }

  return {
    get activeVoices() {
      return voices.size;
    },
    resume() {
      if (!Ctor) return;
      try {
        if (!ctx) {
          ctx = new Ctor();
          master = ctx.createGain();
          master.gain.value = volume;
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      } catch {
        ctx = null;
        master = null;
      }
    },
    setMasterVolume(v) {
      volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
      if (master) master.gain.value = volume;
    },
    getMasterVolume() {
      return volume;
    },
    play(soundId: string, opts?: PlayOptions) {
      const c = ctx;
      const m = master;
      if (!c || !m || c.state === 'closed') return;
      const def = lookup(soundId);
      if (!def) {
        if (!warned.has(soundId)) {
          warned.add(soundId);
          console.warn(`[audio] unknown sound "${soundId}"`);
        }
        return;
      }
      if (voices.size >= MAX_VOICES) return;
      try {
        const t0 = c.currentTime + 0.005;
        const rate = opts?.rate ?? 1;
        const voice: Voice = { nodes: [], sources: [], timer: undefined };
        const vg = c.createGain();
        vg.gain.value = def.gain * (opts?.gain ?? 1);
        voice.nodes.push(vg);
        let tail: AudioNode = vg;
        if (opts?.pan !== undefined && typeof c.createStereoPanner === 'function') {
          const p = c.createStereoPanner();
          p.pan.value = Math.min(1, Math.max(-1, opts.pan));
          vg.connect(p);
          voice.nodes.push(p);
          tail = p;
        }
        tail.connect(m);

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
        if (remaining === 0) return;
        voices.add(voice);
        // Safety net in case onended never fires (e.g. suspended context).
        voice.timer = setTimeout(() => endVoice(voice, true), (end + 0.5) * 1000 + 250);
      } catch {
        /* never throw from play */
      }
    },
    stopAll,
    dispose() {
      stopAll();
      const c = ctx;
      ctx = null;
      master = null;
      noiseBuf = null;
      if (c && c.state !== 'closed') void c.close().catch(() => {});
    },
  };
}
