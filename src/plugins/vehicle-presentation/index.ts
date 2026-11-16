import { Audio, Race, ThemeRole, Ui, definePlugin } from '../../sdk/index.ts';
import { Render, THREE } from '../../sdk/render.ts';

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
        `.vehicle-hud {
          position: absolute; inset: 0; pointer-events: none; color: #fff;
          font-family: system-ui, sans-serif; text-transform: uppercase; text-shadow: 0 2px 12px #00b8dc;
        }
        .vehicle-hud .brand {
          position: absolute; top: 4%; left: 4%; font-weight: 900;
          font-size: clamp(20px, 3vw, 42px); letter-spacing: .15em;
        }
        .vehicle-hud .brand small { display: block; color: #52fff2; font-size: 11px; letter-spacing: .35em; }
        .vehicle-hud .data {
          position: absolute; right: 4%; top: 4%; text-align: right;
          font-weight: 900; font-size: clamp(22px, 4vw, 52px);
        }
        .vehicle-hud .data small { display: block; font-size: 12px; color: #fc70c4; letter-spacing: .2em; }
        .vehicle-hud .bottom {
          position: absolute; bottom: 5%; left: 4%; font-size: 14px;
          font-weight: 800; letter-spacing: .16em; color: #8efdf6;
        }
        .vehicle-hud .speed {
          position: absolute; right: 4%; bottom: 4%; font-size: clamp(38px, 7vw, 84px);
          font-weight: 900; font-style: italic; line-height: .8;
        }
        .vehicle-hud .speed small { font-size: 12px; letter-spacing: .2em; color: #ff75d2; }
        .vehicle-hud .alert { color: #ff8abe; }`,
      );
      const root = ui.mount(ctx, 'hud', 'vehicle-hud');
      root.innerHTML = `
        <div class="brand"><span></span><small>CIRCUIT TRIAL</small></div>
        <div class="data"></div><div class="bottom"></div><div class="speed"></div>
      `;
      root.querySelector('.brand span')!.textContent = race.track.name;
      const data = root.querySelector('.data')!,
        bottom = root.querySelector('.bottom')!,
        speed = root.querySelector('.speed')!;
      ctx.systems.addFrame({
        id: 'vehicle/presentation.hud',
        update() {
          data.innerHTML = `LAP ${race.lap} / ${race.track.laps}<small>${Math.max(0, race.track.timeLimit - race.elapsed).toFixed(1)} SEC REMAINING</small>`;
          bottom.textContent =
            race.status === 'won'
              ? 'CIRCUIT COMPLETE'
              : race.status === 'lost'
                ? 'TIME EXPIRED'
                : `${race.offTrack ? 'OFF TRACK • ' : race.drifting ? 'DRIFT • ' : ''}NEXT GATE ${race.nextGate + 1} / ${race.track.gates.length}`;
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
