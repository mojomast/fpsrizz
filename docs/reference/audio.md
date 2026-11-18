# Audio: samples, buses and 3D sound (SDK 3)

The host `Audio` service (`src/platform/audio.ts`, contract `src/sdk/contracts/audio.ts`) plays two kinds of sound:

- **Synth `SoundDef`s** from the active theme (oscillator / noise layers) - the zero-asset placeholder and fallback.
- **Samples** (SDK 3): `AudioSamples` registry entries `{ url, gain?, bus?, loop?, rateJitter?, refDistance?,
  maxDistance?, rolloff? }`. The host decodes them in the background when their plugin activates, reading the bytes
  through the asset service (`sdk/assets`). A sample replaces the synth sound with the same id once decoded; if it
  fails to load (warning logged) or is still loading, the synth plays.

```ts
register(ctx) {
  ctx.register(AudioSamples, 'mygame/door', { url: 'sounds/door.ogg', bus: 'sfx', rateJitter: [0.95, 1.05] });
  ctx.register(AudioSamples, 'mygame/theme', { url: 'sounds/theme.ogg', bus: 'music', loop: true });
},
activate(ctx) {
  const audio = ctx.services.get(Audio);
  audio.play('mygame/door', { position: { x: 3, y: 1, z: -4 } });   // 3D, fire and forget
  const music = audio.start?.('mygame/theme');                      // handle: stop(fade?), setGain, setPosition
  ctx.scope.add(() => music?.stop(1), 'music');
},
```

| Feature | API |
|---|---|
| Buses | `music`, `sfx` (default), `ui`, `ambience`, all into master. `setBusVolume(bus, v)` / `getBusVolume(bus)`; the pause/start menu has Volume (master), Music and Effects (sfx + ui + ambience) sliders, saved with the settings. |
| 3D | `PlayOptions.position` adds an equal-power `PannerNode` (inverse distance: full volume within `refDistance` 2 m, `rolloff` 1, `maxDistance` 60 m). The listener follows the world camera every frame (`setListener` to override). Without `position`, `pan` still gives stereo panning. |
| Handles | `start(id, opts)` returns `{ stop(fadeSeconds?), setPosition, setGain, playing }` for loops, music and moving emitters; `play` is fire-and-forget. |
| Variety | `rateJitter` picks a random playback rate per play (cosmetic randomness, never simulation). |
| Diagnostics | `activeVoices`, `samples { loaded, failed, pending }`; at most 24 voices. |

Audio stays silent until the first user gesture (`resume()` from Play). New `PlayOptions` fields and `start`,
`setBusVolume`, `setListener`, `samples` are optional on the interface so existing fakes keep type-checking.
Example: `games/sandbox/plugins/sandbox-presentation` (pad chime and crate thuds at their positions, a wind loop on the
ambience bus; files from `assets/sounds/build-sandbox-sounds.mjs`). Howler.js was not needed: plain Web Audio covers
buses, decoding and panning in ~300 lines.
