import { SessionControl, Sky, ThemeRole, Ui, definePlugin } from '../../sdk/index.ts';
import { Render, THREE } from '../../sdk/render.ts';

export default definePlugin({
  activate(ctx) {
    const sky = ctx.services.get(Sky), render = ctx.services.tryGet(Render), ui = ctx.services.tryGet(Ui);
    const keys = new Set<string>();
    const pointers = new Map<number, { direction: string; button: HTMLButtonElement }>();
    const clearPointers = () => {
      for (const [id, held] of pointers) if (held.button.hasPointerCapture(id)) held.button.releasePointerCapture(id);
      pointers.clear();
    };
    const allowed = () => ctx.services.tryGet(SessionControl)?.playing !== false;
    const root = ui?.mount(ctx, 'hud', 'sky-ui');
    if (ui && root) {
      ui.addStyles(ctx, `.sky-ui{font-family:system-ui;color:#f4f8ed;pointer-events:none}.sky-header,.sky-panel,.sky-help,.sky-message,.sky-pad{position:absolute;background:#102d3ce8;border:1px solid #a9dfde66;border-radius:12px;padding:10px 14px;box-shadow:0 10px 30px #08212b55}.sky-header{top:12px;left:12px;max-width:35%}.sky-header h1{margin:0;font-size:22px;letter-spacing:.06em}.sky-header small,.sky-panel small{color:#94d9d7;letter-spacing:.12em}.sky-panel{top:12px;right:12px;max-width:44%;line-height:1.5}.sky-help{bottom:12px;left:12px;line-height:1.4;max-width:52%}.sky-message{bottom:12px;right:12px;max-width:25%;font-size:14px}.sky-ui button{pointer-events:auto;background:#c9f0df;color:#103345;border:0;border-radius:7px;padding:8px;margin:2px;font-weight:700;cursor:pointer}.sky-pad{display:none;touch-action:none}.sky-pad button{touch-action:none;min-width:42px;min-height:42px}.sky-pad .sky-north{grid-column:2}.sky-pad .sky-west{grid-column:1}.sky-pad .sky-south{grid-column:2}.sky-pad .sky-east{grid-column:3}@media(max-width:700px),(pointer:coarse){.sky-header{max-width:40%;padding:7px}.sky-header h1{font-size:16px}.sky-header small,.sky-header div{display:none}.sky-panel{max-width:48%;font-size:11px;padding:7px}.sky-panel small{display:none}.sky-help{left:auto;right:8px;bottom:8px;max-width:50%;padding:5px;font-size:11px}.sky-help .sky-keys{display:none}.sky-help button{font-size:11px;padding:7px}.sky-pad{display:grid;grid-template-columns:repeat(3,46px);bottom:8px;left:8px;padding:3px}.sky-message{bottom:125px;right:8px;max-width:48%;padding:7px;font-size:11px}}`);
      root.innerHTML = `<div class="sky-header"><small>THE CLOUDLINE SERVICE</small><h1>SKY SALVAGE</h1><div>Recovery &amp; delivery / flight 01</div></div><div class="sky-panel"><small>FLIGHT TELEMETRY</small><div data-stats></div></div><div class="sky-help"><div class="sky-keys">WASD / arrows · fly<br>E · collect / deliver &nbsp; SPACE · boost<br>F · repair &nbsp; R · restart</div><button data-action="interact">RECOVER / DELIVER</button><button data-action="boost">BOOST</button><button data-action="repair">REPAIR</button><button data-action="restart">RESTART</button></div><div class="sky-pad" aria-label="Flight direction controls"><button class="sky-north" data-direction="north" aria-label="Fly north">▲</button><button class="sky-west" data-direction="west" aria-label="Fly west">◀</button><button class="sky-south" data-direction="south" aria-label="Fly south">▼</button><button class="sky-east" data-direction="east" aria-label="Fly east">▶</button></div><div class="sky-message" role="status"></div>`;
      const action = (name: string) => {
        if (!allowed()) return;
        if (name === 'interact') sky.enqueue({ type: sky.state().cargo === null ? 'collect' : 'deliver' });
        else if (name === 'boost' || name === 'repair' || name === 'restart') sky.enqueue({ type: name });
      };
      const down = (e: KeyboardEvent) => {
        if (!allowed() || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('input,textarea,select,button,[contenteditable]'))) return;
        if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) { keys.add(e.code); e.preventDefault(); return; }
        if (e.repeat) return;
        const map: Record<string,string> = { KeyE:'interact', Space:'boost', KeyF:'repair', KeyR:'restart' };
        if (map[e.code]) { action(map[e.code]!); e.preventDefault(); }
      };
      const up = (e: KeyboardEvent) => { keys.delete(e.code); };
      const blur = () => { keys.clear(); clearPointers(); };
      const click = (e: Event) => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]'); if (button?.dataset.action) action(button.dataset.action); };
      const pointerDown = (e: PointerEvent) => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-direction]');
        if (!allowed() || !button?.dataset.direction || e.button !== 0) return;
        pointers.set(e.pointerId, { direction: button.dataset.direction, button }); button.setPointerCapture(e.pointerId); e.preventDefault();
      };
      const pointerEnd = (e: PointerEvent) => { pointers.delete(e.pointerId); };
      window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); root.addEventListener('click', click);
      root.addEventListener('pointerdown', pointerDown); root.addEventListener('pointerup', pointerEnd); root.addEventListener('pointercancel', pointerEnd); root.addEventListener('lostpointercapture', pointerEnd);
      ctx.scope.add(() => { blur(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); root.removeEventListener('click', click); root.removeEventListener('pointerdown', pointerDown); root.removeEventListener('pointerup', pointerEnd); root.removeEventListener('pointercancel', pointerEnd); root.removeEventListener('lostpointercapture', pointerEnd); }, 'sky-input');
    }
    ctx.systems.add({ id: 'sky/presentation.controls', phase: 'control', update() {
      if (!allowed()) { keys.clear(); clearPointers(); return; }
      const held = (direction: string) => [...pointers.values()].some(value => value.direction === direction);
      const x = Number(keys.has('KeyD') || keys.has('ArrowRight') || held('east')) - Number(keys.has('KeyA') || keys.has('ArrowLeft') || held('west'));
      const z = Number(keys.has('KeyS') || keys.has('ArrowDown') || held('south')) - Number(keys.has('KeyW') || keys.has('ArrowUp') || held('north'));
      if (x || z) sky.enqueue({ type:'move', x, z });
    } });
    let drone: THREE.Group | undefined, hazard: THREE.Mesh | undefined, camera: THREE.OrthographicCamera | undefined;
    const crates: THREE.Mesh[] = [], lights: THREE.Mesh[] = [];
    if (render) {
      const world = render.createRoot(ctx, 'world');
      render.setEnvironment({ background: 0x9dcbd2, fog: { color: 0x9dcbd2, near: 38, far: 90 } });
      world.add(new THREE.HemisphereLight(0xe7ffff, 0x45667c, 2.2));
      const sun = new THREE.DirectionalLight(0xffefd0, 2.5); sun.position.set(-5, 15, 8); world.add(sun);
      camera = new THREE.OrthographicCamera(-13, 13, 10, -10, 0.1, 100); camera.position.set(0, 23, 23); camera.lookAt(0, 0, 0); render.setWorldCamera(ctx, camera);
      const box = render.own(ctx, new THREE.BoxGeometry(1,1,1));
      const rock = render.own(ctx, new THREE.DodecahedronGeometry(1,0));
      const cylinder = render.own(ctx, new THREE.CylinderGeometry(1,1,1,24));
      const colors = [0xffca65,0x71e5d3,0xed9bc4,0xa7beff,0xff9d79,0xd0df84,0xe8b1ff,0xe8e7ba];
      const material = (color: number) => render.own(ctx, new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true }));
      const island = material(0x788d85), grass = material(0x8fb996), white = material(0xf5eee0), dark = material(0x274652), red = material(0xde584e);
      const accent = colors.map(material);
      const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: THREE.Object3D = world) => { const m = new THREE.Mesh(geometry, mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); parent.add(m); return m; };
      sky.route.deliveries.forEach((delivery, i) => {
        for (const p of [delivery.pickup, delivery.beacon]) { mesh(rock,island,p.x,-1.4,p.z,2.1,1.5,1.8); mesh(cylinder,grass,p.x,-0.35,p.z,1.65,0.25,1.5); }
        const p = delivery.pickup, b = delivery.beacon;
        crates.push(mesh(box,accent[i]!,p.x,0.5,p.z,0.7,0.7,0.7));
        mesh(cylinder,dark,b.x,0.3,b.z,0.18,1.1,0.18);
        lights.push(mesh(rock,accent[i]!,b.x,1.1,b.z,0.48,0.48,0.48));
        const texture = render.texture(ctx, `sky/number-${i + 1}`, { width: 128, height: 128, paint(g) { g.fillStyle = '#173e4b'; g.beginPath(); g.arc(64,64,59,0,Math.PI * 2); g.fill(); g.fillStyle = '#ffffff'; g.font = 'bold 82px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1),64,68); } });
        const labelMaterial = render.own(ctx, new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
        for (const point of [p,b]) { const label = new THREE.Sprite(labelMaterial); label.position.set(point.x,2.3,point.z); label.scale.set(0.9,0.9,1); world.add(label); }
      });
      drone = new THREE.Group(); world.add(drone);
      mesh(box,white,0,0,0,0.9,0.3,0.75,drone); mesh(box,dark,0,0.2,0,0.5,0.15,0.45,drone);
      for (const dx of [-0.7,0.7]) for (const dz of [-0.5,0.5]) { mesh(box,dark,dx/2,0,dz/2,0.8,0.08,0.08,drone); mesh(cylinder,dark,dx,0.1,dz,0.35,0.07,0.35,drone); }
      hazard = mesh(rock,red,0,0.9,0,0.65,0.65,0.65);
      // Reuse the selected theme's semantic floor painter on a distant floating platform.
      const painter = ctx.role(ThemeRole)?.provider.textures['puzzle-floor'];
      if (painter) { const themed = render.own(ctx, new THREE.MeshStandardMaterial({ map: render.texture(ctx, 'sky/island-floor', painter) })); mesh(box,themed,0,-2,0,3,0.15,3); }
    }
    ctx.systems.addFrame({ id:'sky/presentation.frame', update() {
      if (!allowed()) { keys.clear(); clearPointers(); }
      const s = sky.state();
      if (camera && render) { const aspect = render.width / Math.max(1, render.height); const halfHeight = Math.max(10, 11 / Math.max(0.1, aspect)); camera.top = halfHeight; camera.bottom = -halfHeight; camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.updateProjectionMatrix(); }
      if (drone) { drone.position.set(s.x,1,s.z); drone.rotation.z = Math.sin(s.time * 4) * 0.035; }
      if (hazard) { hazard.position.x = Math.sin(s.time * 0.9) * 4; hazard.rotation.y = s.time; }
      crates.forEach((m,i) => { m.visible = !s.collected[i]; m.rotation.y = s.time * 0.6; });
      lights.forEach((m,i) => { m.scale.setScalar(s.delivered[i] ? 0.7 : 0.48); });
      if (root) { const hull = sky.kit.resources.find(r => r.id === 'hull')!, energy = sky.kit.resources.find(r => r.id === 'energy')!; root.querySelector('[data-stats]')!.textContent = `HULL ${s.hull.toFixed(0)} / ${hull.max} · ENERGY ${s.energy.toFixed(0)} / ${energy.max} | CARGO ${s.cargo === null ? 'EMPTY' : s.cargo + 1} | DELIVERED ${s.delivered.filter(Boolean).length} / ${sky.route.deliveries.length} | BOOST ${s.boostRemaining.toFixed(1)}s`; root.querySelector('.sky-message')!.textContent = s.message; }
    } });
  },
});
