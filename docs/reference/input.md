# Input v2: axes, gamepads, touch and rebinding (SDK 3)

Builds on the action model (`InputActions`, `Input.tick`, `InputContexts` in `games/shooter/contracts/shooter.ts`).
Contract: `packages/sdk/src/contracts/input.ts`; host adapters: `packages/platform-web/src/{input,gamepad,touch,input-bindings}.ts`.

## Every device is a key

`InputActionDef.keys` takes keyboard codes, `Mouse0..2`, `WheelUp/Down`, and virtual keys for gamepads and touch:

| Virtual keys | Source |
|---|---|
| `GamepadA B X Y LB RB LT RT Back Start LS RS Up Down Left Right Home` | Gamepad API standard mapping (all connected pads merged), polled right before each tick's `beginTick()`; analog triggers press past 0.5 |
| `TouchA` .. `TouchD` | on-screen buttons, one per action that lists them (label = action label) |

So contexts, consumption, edges (`pressed` / `released` once per tick) and rebinding work the same for every device.

## Axes

```ts
ctx.register(InputAxes, 'mygame/move', { label: 'Move', x: ['mygame/left', 'mygame/right'], y: ['mygame/forward', 'mygame/back'], sticks: ['gamepad:left', 'touch:left'] });
// in a 'control' system:
const { x, y } = readAxis(ctx.services.get(Input).tick, 'mygame/move'); // length <= 1, forward = y -1
```

Digital composites are normalised (diagonals are not faster). Analog sources (`gamepad:left`, `gamepad:right`,
`gamepad:triggers` = (LT, RT), `touch:left`, `touch:right`) use a radial deadzone (`deadzone`, default 0.15) rescaled
so output starts at 0; the strongest source wins. Values are sampled once per tick like edges. Context ticks
(`InputContexts`) resolve axes over their own bindings. The gamepad right stick also feeds `lookX/lookY` (14 px per
tick at full tilt), and the right touch area feeds them while dragging, so mouse-look games work unchanged.

## Default map

`registerStandardControls(ctx, 'mygame')` registers `forward/back/left/right` (WASD, arrows, D-pad), `jump` (Space, A,
TouchA), `interact` (E, X, TouchB), and the axes `move` (keys + left stick + touch stick) and `look` (right stick +
touch drag). `games/sandbox` uses it.

## Touch

The touch layer (`bindTouchControls`) shows on coarse-pointer devices, or when forced with `?touch=1` (`?touch=0`
hides it): a floating left stick in the lower-left 40 %, a look-drag area on the right, and the Touch buttons. It sits
above the canvas and below menus, and only reacts while the game is playing.

## Rebinding

The pause menu lists every action of the session ("Key bindings"): *Change* waits for the next key, mouse button or
gamepad button (Esc cancels; capture runs before gameplay and menu shortcuts), *Reset bindings* restores defaults.
Plugins can do the same through the `InputBindings` service (`list()`, `rebind(action, keys)`, `reset(action?)`,
`capture({ timeoutMs })`, `lastDevice`). Overrides persist in their own local profile store
(`fpsrizz/input-bindings`, one `bind/<action>` value per action), so game profiles never clobber them.

Headless hosts: `createInputCore()` + `core.setAxes(() => registries.entries(InputAxes).map((e) => [e.id, e.value]))`;
drive gamepads in tests with `bindGamepads(core, { getPads: () => [...] })` (see `tests/input-v2.test.ts`).
