import * as THREE from 'three';
import { makeVehicle, driveVehicle } from './vehicles.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const d2 = (ax, az, bx, bz) => { const x = ax - bx, z = az - bz; return x * x + z * z; };
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

const NAVY = new THREE.MeshLambertMaterial({ color: 0x1a2440 });
const SKIN = new THREE.MeshLambertMaterial({ color: 0xc8976a });
const BADGE = new THREE.MeshLambertMaterial({ color: 0xffd75e, emissive: 0xaa8800, emissiveIntensity: 0.8 });
const HELI_MAT = new THREE.MeshLambertMaterial({ color: 0x223344 });
const DARK = new THREE.MeshLambertMaterial({ color: 0x111111 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function copMesh() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.75, 0.32, NAVY, 0, 1.05, 0));
  g.add(box(0.3, 0.3, 0.3, SKIN, 0, 1.62, 0));
  g.add(box(0.36, 0.1, 0.36, NAVY, 0, 1.8, 0));
  g.add(box(0.06, 0.08, 0.08, BADGE, 0.27, 1.15, 0));
  g.add(box(0.22, 0.65, 0.2, NAVY, 0, 0.33, 0.13));
  g.add(box(0.22, 0.65, 0.2, NAVY, 0, 0.33, -0.13));
  return g;
}

export function createPolice(scene, world, rng) {
  const R = rng || Math.random;
  const PO = { wanted: 0, cops: [], cars: [], heli: null, addWanted, clearWanted, update };
  let hideT = 0, hiddenT = 0, decayT = 0, G0 = null;
  const _down = new THREE.Vector3(0, -1, 0);
  const _dir = new THREE.Vector3();

  function addWanted(n) { PO.wanted = Math.min(5, PO.wanted + n); }

  function clearWanted() { clearAll(G0); }

  function clearAll(G) {
    for (const c of PO.cops) scene.remove(c.mesh);
    PO.cops.length = 0;
    for (const v of PO.cars) {
      scene.remove(v.mesh);
      if (G && G.vehicles) { const i = G.vehicles.indexOf(v); if (i >= 0) G.vehicles.splice(i, 1); }
    }
    PO.cars.length = 0;
    removeHeli();
    PO.wanted = 0;
    hideT = 0; hiddenT = 0; decayT = 0;
    if (G && G.audio) G.audio.siren(false);
  }

  function spawnSpot(P, lo, hi) {
    for (let i = 0; i < 8; i++) {
      const a = R() * TAU, d = lo + R() * (hi - lo);
      const x = clamp(P.x + Math.cos(a) * d, -228, 228);
      const z = clamp(P.z + Math.sin(a) * d, -228, 228);
      if (!world.collides(x, z, 1)) return { x, z };
    }
    return { x: clamp(P.x + lo, -228, 228), z: clamp(P.z, -228, 228) };
  }

  function spawnCopAt(x, z) {
    const mesh = copMesh();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const c = { mesh, x, z, angle: 0, speed: 0, hp: 100, alive: true, arrestT: 0, shootT: 0.9 + R() * 0.5, deadT: 0 };
    PO.cops.push(c);
    return c;
  }

  function spawnCop(P) {
    const s = spawnSpot(P, 40, 70);
    return spawnCopAt(s.x, s.z);
  }

  function spawnCar(P, G) {
    const s = spawnSpot(P, 50, 90);
    const a = Math.atan2(P.z - s.z, P.x - s.x);
    const V = makeVehicle('sedan', s.x, s.z, a, 0xffffff);
    V.driver = 'cop';
    const rm = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 });
    const bm = new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x0044ff, emissiveIntensity: 1 });
    const bar = new THREE.Group();
    const r = box(0.3, 0.12, 0.3, rm, 0, 0, -0.25);
    const b = box(0.3, 0.12, 0.3, bm, 0, 0, 0.25);
    bar.add(r, b);
    bar.position.set(-0.2, 1.6, 0);
    V.mesh.add(bar);
    V.lightBar = { red: rm, blue: bm };
    scene.add(V.mesh);
    PO.cars.push(V);
    G.vehicles.push(V);
    return V;
  }

  function removeCar(i, G) {
    const v = PO.cars[i];
    scene.remove(v.mesh);
    PO.cars.splice(i, 1);
    if (G && G.vehicles) { const j = G.vehicles.indexOf(v); if (j >= 0) G.vehicles.splice(j, 1); }
  }

  function makeHeli() {
    const g = new THREE.Group();
    g.add(box(3.2, 1.4, 1.6, HELI_MAT, 0, 0, 0));
    g.add(box(3.4, 0.3, 0.3, HELI_MAT, -3, 0.3, 0));
    g.add(box(0.2, 0.9, 0.1, HELI_MAT, -4.5, 0.7, 0));
    g.add(box(2.6, 0.08, 0.12, DARK, 0, -0.95, 0.7));
    g.add(box(2.6, 0.08, 0.12, DARK, 0, -0.95, -0.7));
    const rotor = new THREE.Group();
    rotor.add(box(7, 0.06, 0.25, DARK, 0, 0, 0));
    rotor.add(box(0.25, 0.06, 7, DARK, 0, 0, 0));
    rotor.position.y = 1;
    g.add(rotor);
    scene.add(g);
    const spot = new THREE.Mesh(
      new THREE.ConeGeometry(6, 55, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
    );
    scene.add(spot);
    return { mesh: g, rotor, spot, angle: R() * TAU };
  }

  function removeHeli() {
    if (!PO.heli) return;
    scene.remove(PO.heli.mesh);
    scene.remove(PO.heli.spot);
    PO.heli = null;
  }

  function update(dt, G) {
    G0 = G;
    if (G.state !== 'playing') return;
    const P = G.player, A = G.audio;
    if (PO.wanted === 0 && PO.cops.length === 0 && PO.cars.length === 0 && !PO.heli) {
      A.siren(false);
      return;
    }

    const wantFoot = PO.wanted >= 1 ? Math.min(6, PO.wanted + 1) : 0;
    const wantCars = PO.wanted >= 2 ? Math.min(4, PO.wanted - 1) : 0;
    let alive = 0;
    for (const c of PO.cops) if (c.alive) alive++;
    for (let i = alive; i < wantFoot; i++) spawnCop(P);
    let driven = 0;
    for (const v of PO.cars) if (v.driver === 'cop') driven++;
    for (let i = driven; i < wantCars; i++) spawnCar(P, G);

    if (PO.wanted >= 5 && !PO.heli) PO.heli = makeHeli();
    if (PO.wanted < 5 && PO.heli) removeHeli();

    for (let i = PO.cops.length - 1; i >= 0; i--) {
      const c = PO.cops[i];
      if (!c.alive) {
        c.deadT += dt;
        if (c.deadT > 6) { scene.remove(c.mesh); PO.cops.splice(i, 1); }
        continue;
      }
      if (c.hp <= 0) {
        c.alive = false;
        c.mesh.rotation.z = Math.PI / 2;
        c.mesh.position.y = 0.3;
        continue;
      }
      const dx = P.x - c.x, dz = P.z - c.z;
      const d = Math.hypot(dx, dz) || 0.001;
      c.angle = Math.atan2(dz, dx);
      const mx = Math.cos(c.angle) * 6.5 * dt, mz = Math.sin(c.angle) * 6.5 * dt;
      if (!world.collides(c.x + mx, c.z, 0.5)) c.x += mx;
      if (!world.collides(c.x, c.z + mz, 0.5)) c.z += mz;
      c.x = clamp(c.x, -229, 229);
      c.z = clamp(c.z, -229, 229);
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = -c.angle;
      if (d < 1.6 && P.onFoot && P.speed < 2) {
        c.arrestT += dt;
        if (c.arrestT >= 1.2) { G.state = 'busted'; A.busted(); return; }
      } else c.arrestT = 0;
      if (PO.wanted >= 3 && d < 35) {
        const facing = Math.cos(c.angle) * (dx / d) + Math.sin(c.angle) * (dz / d);
        if (facing > 0.5) {
          c.shootT -= dt;
          if (c.shootT <= 0) {
            c.shootT = 0.9 + R() * 0.5;
            if (d < 45 && R() > 0.25) P.hurt(6);
            A.gunshot('pistol');
          }
        }
      }
      if (d > 300) { scene.remove(c.mesh); PO.cops.splice(i, 1); }
    }

    for (let i = PO.cars.length - 1; i >= 0; i--) {
      const V = PO.cars[i];
      const d = Math.hypot(P.x - V.x, P.z - V.z);
      if (d > 300 || !V.alive) { removeCar(i, G); continue; }
      if (V.driver === 'player') { PO.cars.splice(i, 1); continue; }
      const ph = Math.floor(G.time * 4) % 2;
      V.lightBar.red.emissiveIntensity = ph === 0 ? 2.2 : 0.2;
      V.lightBar.blue.emissiveIntensity = ph === 0 ? 0.2 : 2.2;
      if (!V.driver) continue;
      const lead = P.onFoot ? 0 : (P.speed || 0) * 0.6;
      const tx = P.x + Math.cos(P.angle) * lead, tz = P.z + Math.sin(P.angle) * lead;
      const diff = wrapA(Math.atan2(tz - V.z, tx - V.x) - V.angle);
      driveVehicle(V, { throttle: 0.9, steer: clamp(diff * 2.2, -1, 1), brake: d < 8 && P.speed < 2 }, dt, world);
      if (P.onFoot && d < 6 && Math.abs(V.speed) < 1) {
        spawnCopAt(V.x, V.z);
        V.driver = null;
      }
    }

    if (PO.heli) {
      const h = PO.heli;
      h.angle += dt * 0.35;
      const hx = P.x + Math.cos(h.angle) * 35, hz = P.z + Math.sin(h.angle) * 35;
      h.mesh.position.set(hx, 42, hz);
      h.mesh.rotation.y = -(h.angle + Math.PI / 2);
      h.rotor.rotation.y += dt * 30;
      _dir.set(P.x - hx, -42, P.z - hz).normalize();
      h.spot.position.set((hx + P.x) / 2, 21, (hz + P.z) / 2);
      h.spot.quaternion.setFromUnitVectors(_down, _dir);
    }

    if (PO.wanted > 0 && !PO.heli) {
      let near = 1e9;
      for (const c of PO.cops) if (c.alive) near = Math.min(near, Math.hypot(P.x - c.x, P.z - c.z));
      for (const v of PO.cars) if (v.driver) near = Math.min(near, Math.hypot(P.x - v.x, P.z - v.z));
      if (near > 70) {
        hiddenT += dt;
        if (hiddenT > 8) {
          decayT += dt;
          if (decayT >= 5) {
            decayT = 0;
            PO.wanted -= 1;
            if (PO.wanted <= 0) { PO.wanted = 0; clearAll(G); }
          }
        }
      } else { hiddenT = 0; decayT = 0; }
    }

    if (PO.wanted > 0) {
      const ps = world.paintShop;
      if (P.vehicle && d2(P.x, P.z, ps.x, ps.z) < ps.r * ps.r) {
        if (G.money >= 50) { G.money -= 50; G.hud.flash('Fresh paint. Heat gone. -$50', 2500); }
        else G.hud.flash('Fresh paint. Heat gone.', 2500);
        clearAll(G);
      } else {
        const ho = world.hideout;
        if (P.onFoot && d2(P.x, P.z, ho.x, ho.z) < ho.r * ho.r) {
          hideT += dt;
          if (hideT >= 3) { G.hud.flash('Laid low at the garage.', 2500); clearAll(G); }
        } else hideT = 0;
      }
    }

    A.siren(PO.wanted > 0 && PO.cars.length > 0);
  }

  return PO;
}
