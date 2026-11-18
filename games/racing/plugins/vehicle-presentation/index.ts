import { Audio, ThemeRole, Ui, definePlugin } from '../../../../src/sdk/index.ts';
import { Race } from '../../contracts/racing.ts';
import { Render, THREE } from '../../../../src/sdk/render.ts';

export default definePlugin({
  activate(ctx) {
    const race = ctx.services.get(Race),
      render = ctx.services.tryGet(Render),
      ui = ctx.services.tryGet(Ui),
      audio = ctx.services.tryGet(Audio);
    if (render) {
      const root = render.createRoot(ctx, 'world');
      const pts = race.track.points;
      const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
      const minZ = Math.min(...pts.map(p => p.z)), maxZ = Math.max(...pts.map(p => p.z));
      const centerX = (minX + maxX) / 2, centerZ = (minZ + maxZ) / 2;
      const spanX = maxX - minX + race.track.width * 2, spanZ = maxZ - minZ + race.track.width * 2;
      const camera = new THREE.OrthographicCamera(-35, 35, 25, -25, 0.1, 200);
      camera.position.set(centerX, 65, centerZ);
      camera.up.set(0, 0, -1);
      camera.lookAt(centerX, 0, centerZ);
      render.setWorldCamera(ctx, camera);
      let viewport = '';
      const frameTrack = (): void => {
        const next = `${render.width}:${render.height}`;
        if (next === viewport) return;
        viewport = next;
        const aspect = render.width / render.height;
        const halfHeight = Math.max(spanZ, spanX / aspect) * 0.59;
        camera.top = halfHeight; camera.bottom = -halfHeight;
        camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
        camera.updateProjectionMatrix();
      };
      frameTrack();
      render.setEnvironment({ background: 0x08091c, fog: null });
      const theme = ctx.role(ThemeRole)?.provider;
      const box = (
        w: number,
        h: number,
        d: number,
        color: number,
        x: number,
        y: number,
        z: number,
        rotation = 0,
        parent: THREE.Object3D = root,
        key?: string,
      ): THREE.Mesh => {
        const geo = render.own(ctx, new THREE.BoxGeometry(w, h, d));
        const painter = key ? theme?.textures[key] : undefined;
        const material = render.own(
          ctx,
          new THREE.MeshBasicMaterial({
            color,
            ...(painter ? { map: render.texture(ctx, `vehicle/${key}`, painter) } : {}),
          }),
        );
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(x, y, z);
        mesh.rotation.y = rotation;
        parent.add(mesh);
        return mesh;
      };
      box(spanX * 3, 0.1, spanZ * 3, 0x10102a, centerX, -0.2, centerZ);
      // The simulation measures distance to a closed polyline: round caps make the visible road match that union.
      const rimGeometry = render.own(ctx, new THREE.CircleGeometry((race.track.width + 0.5) / 2, 48));
      const roadGeometry = render.own(ctx, new THREE.CircleGeometry(race.track.width / 2, 48));
      const rimMaterial = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0x04b6cb }));
      const roadMaterial = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0x142433 }));
      for (const point of pts) {
        for (const [geometry, material, y] of [[rimGeometry, rimMaterial, 0.06], [roadGeometry, roadMaterial, 0.151]] as const) {
          const cap = new THREE.Mesh(geometry, material);
          cap.rotation.x = -Math.PI / 2;
          cap.position.set(point.x, y, point.z);
          root.add(cap);
        }
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!,
          b = pts[(i + 1) % pts.length]!,
          dx = b.x - a.x,
          dz = b.z - a.z,
          len = Math.hypot(dx, dz),
          angle = Math.atan2(dx, dz),
          x = (a.x + b.x) / 2,
          z = (a.z + b.z) / 2;
        box(race.track.width + 0.5, 0.12, len, 0x04b6cb, x, 0, z, angle);
        // Keep the curated metal detail subordinate to the racing line and the car's silhouette.
        box(race.track.width, 0.14, len, 0x142433, x, 0.08, z, angle, root, 'track-surface');
        for (let j = 1; j < Math.floor(len / 3); j++)
          box(
            0.13,
            0.04,
            1.1,
            0xffb5ed,
            a.x + (dx * j) / Math.floor(len / 3),
            0.18,
            a.z + (dz * j) / Math.floor(len / 3),
            angle,
          );
      }
      if (theme?.textures['race-backdrop']) box(17, 0.04, 9.5, 0x77839e, centerX, 0, centerZ, 0, root, 'race-backdrop');
      if (theme?.textures['race-vehicle-badge']) box(6, 0.04, 4.5, 0xffffff, centerX, 0.04, centerZ + 7, 0, root, 'race-vehicle-badge');
      const markers = race.track.gates.map((g, i) => {
        const group = new THREE.Group();
        root.add(group);
        group.position.set(g.x, 0.25, g.z);
        group.rotation.y = Math.atan2(g.dx, g.dz);
        box(
          g.width,
          0.12,
          0.22,
          i === race.track.gates.length - 1 ? 0xffffff : 0xff4ab3,
          0,
          0,
          0,
          0,
          group,
          'race-marker',
        );
        box(0.35, 1, 0.35, 0xff4ab3, -g.width / 2, 0.5, 0, 0, group);
        box(0.35, 1, 0.35, 0x54fff1, g.width / 2, 0.5, 0, 0, group);
        const arrow = new THREE.Mesh(
          render.own(ctx, new THREE.ConeGeometry(0.55, 1.2, 3)),
          render.own(ctx, new THREE.MeshBasicMaterial({ color: 0xffffff })),
        );
        arrow.rotation.x = Math.PI / 2;
        arrow.position.set(0, 0.3, 0.8);
        group.add(arrow);
        return group;
      });
      const car = new THREE.Group();
      root.add(car);
      box(1.6, 0.5, 2.8, 0xffffff, 0, 0.55, 0, 0, car, 'race-vehicle');
      box(1.18, 0.4, 1.1, 0x1be7ef, 0, 1, -0.15, 0, car);
      box(1.4, 0.12, 0.22, 0xffeaa3, 0, 0.7, -1.42, 0, car);
      box(1.4, 0.12, 0.2, 0xff347f, 0, 0.6, 1.43, 0, car);
      for (const x of [-0.9, 0.9]) for (const z of [-0.85, 0.85]) box(0.35, 0.38, 0.55, 0x09091a, x, 0.4, z, 0, car);
      ctx.systems.addFrame({
        id: 'vehicle/presentation.scene',
        update(alpha) {
          frameTrack();
          car.position.set(race.prevX + (race.x - race.prevX) * alpha, 0, race.prevZ + (race.z - race.prevZ) * alpha);
          car.rotation.y = race.yaw;
          markers.forEach((m, i) => {
            m.scale.y = i === race.nextGate ? 1.5 : 0.7;
            const arrow = m.children.at(-1)!;
            arrow.visible = race.status === 'racing' && i === race.nextGate;
          });
        },
      });
    }
    if (ui) {
      ui.addStyles(
        ctx,
        `.vehicle-hud { position:absolute; inset:0; pointer-events:none; color:#f8fdff;
          font-family:system-ui,sans-serif; text-transform:uppercase; }
        .vehicle-hud .brand, .vehicle-hud .data, .vehicle-hud .bottom, .vehicle-hud .speed {
          position:absolute; background:rgba(5,12,28,.88); border:1px solid #477384; border-radius:8px;
          padding:10px 14px; box-shadow:0 4px 20px #0008; }
        .vehicle-hud .brand { top:3%; left:3%; max-width:52%; font-weight:850;
          font-size:clamp(14px,2vw,24px); letter-spacing:.05em; }
        .vehicle-hud small { display:block; color:#a8f9f0; font-size:11px; letter-spacing:.08em; font-weight:700; }
        .vehicle-hud .brand small { margin-bottom:4px; }
        .vehicle-hud .data { right:3%; top:3%; text-align:right; font-weight:850; font-size:clamp(17px,2.5vw,28px); }
        .vehicle-hud .bottom { bottom:3%; left:3%; max-width:65%; font-size:clamp(12px,1.3vw,15px); font-weight:800; }
        .vehicle-hud .bottom small { margin-top:5px; line-height:1.4; text-transform:none; }
        .vehicle-hud .speed { right:3%; bottom:3%; font-size:clamp(24px,4vw,44px); font-weight:900; line-height:1; text-align:right; }
        .vehicle-hud .speed small { margin-top:4px; }
        .vehicle-hud .alert { border-color:#ff9baf; color:#ffd0d9; }
        @media (max-width:600px), (max-height:500px) {
          .vehicle-hud .brand, .vehicle-hud .data, .vehicle-hud .bottom, .vehicle-hud .speed { padding:6px 8px; }
          .vehicle-hud .brand { max-width:55%; font-size:12px; }
          .vehicle-hud small { font-size:10px; letter-spacing:0; }
        }`,
      );
      const root = ui.mount(ctx, 'hud', 'vehicle-hud');
      root.innerHTML = `
        <div class="brand"><small>TIME TRIAL</small><span></span></div>
        <div class="data"></div><div class="bottom"><div class="guidance"></div><small>W / ↑ accelerate · S / ↓ brake &amp; reverse<br>A D / ← → steer · Space drift</small></div><div class="speed"></div>
      `;
      root.querySelector('.brand span')!.textContent = race.track.name;
      const data = root.querySelector('.data')!,
        bottom = root.querySelector('.bottom')!,
        guidance = root.querySelector('.guidance')!,
        speed = root.querySelector('.speed')!;
      ctx.systems.addFrame({
        id: 'vehicle/presentation.hud',
        update() {
          const remaining = Math.max(0, race.track.timeLimit - race.elapsed);
          data.innerHTML = `LAP ${race.lap} / ${race.track.laps}<small>${remaining.toFixed(1)}s remaining · Gold ≤ ${(race.track.timeLimit * .5).toFixed(0)}s</small>`;
          data.classList.toggle('alert', remaining <= 10);
          const gate = race.track.gates[race.nextGate];
          const distance = gate ? Math.round(Math.hypot(gate.x - race.x, gate.z - race.z)) : 0;
          const wrongSide = gate && (race.x - gate.x) * gate.dx + (race.z - gate.z) * gate.dz >= 0;
          guidance.textContent =
            race.status === 'won'
              ? 'CIRCUIT COMPLETE'
              : race.status === 'lost'
                ? 'TIME EXPIRED'
                : `${race.offTrack ? 'OFF ROAD — SLOW DOWN · ' : race.drifting ? 'DRIFT · ' : ''}GATE ${race.nextGate + 1} / ${race.track.gates.length} · ${distance}m${wrongSide ? ' · APPROACH FROM OTHER SIDE' : ''}`;
          bottom.classList.toggle('alert', race.offTrack);
          speed.innerHTML = `${Math.round(race.speed * 3.6)} <small>KM/H</small>`;
        },
      });
    }
    if (audio) {
      let revision = race.revision,
        engine = 0,
        skid = 0;
      ctx.systems.add({
        id: 'vehicle/presentation.audio',
        phase: 'presentation',
        update(dt) {
          engine -= dt;
          skid -= dt;
          if (race.revision !== revision) {
            revision = race.revision;
            if (race.status === 'won') audio.play('race-finish');
            else if (race.status === 'racing') audio.play('race-checkpoint');
          }
          if (race.status === 'racing' && race.speed > 1 && engine <= 0) {
            audio.play('race-engine', { gain: 0.18, rate: 0.7 + race.speed / 30 });
            engine = 0.35;
          }
          if (race.status === 'racing' && (race.drifting || race.offTrack) && race.speed > 4 && skid <= 0) {
            audio.play('race-skid', { gain: 0.18 });
            skid = 0.5;
          }
        },
      });
    }
  },
});
