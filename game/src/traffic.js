import * as THREE from 'three';
import { makeVehicle, driveVehicle, VEHICLE_TYPES } from './vehicles.js';

// main.js merges T.cars into G.vehicles at startup; traffic cars live here.
const TAU = Math.PI * 2;
function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function d2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
const COLORS = [0xcc3333, 0x3366cc, 0xdddddd, 0x222222, 0xcc9933, 0x339966, 0x8844aa, 0x8899aa];
const SHIRTS = [0xd94f4f, 0x4f7dd9, 0x4fd98a, 0xd9c24f, 0xd94fc0, 0x8a5a2b, 0xe8e8e8, 0x3a3a3a];

function roadPt(W, R) {
  const r = W.roads[(R() * W.roads.length) | 0], t = R();
  return { x: r.x1 + (r.x2 - r.x1) * t, z: r.z1 + (r.z2 - r.z1) * t, road: r, t };
}
function roadAng(r) { return Math.atan2(r.z2 - r.z1, r.x2 - r.x1); }
function roadLen(r) { return Math.hypot(r.x2 - r.x1, r.z2 - r.z1); }
function nearestRoad(W, x, z) {
  let best = null, bd = Infinity;
  for (const r of W.roads) {
    const dx = r.x2 - r.x1, dz = r.z2 - r.z1, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - r.x1) * dx + (z - r.z1) * dz) / L2, 0, 1);
    const dd = d2(x, z, r.x1 + dx * t, r.z1 + dz * t);
    if (dd < bd) { bd = dd; best = { road: r, t }; }
  }
  return best;
}
function posOnRoad(road, t, side) {
  const L = roadLen(road), ux = (road.x2 - road.x1) / L, uz = (road.z2 - road.z1) / L;
  return { x: road.x1 + ux * L * t - uz * side, z: road.z1 + uz * L * t + ux * side };
}

function makePerson(R) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[(R() * SHIRTS.length) | 0], transparent: true });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2e3440, transparent: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077, transparent: true });
  const mats = [shirt, pants, skin];
  const box = (w, h, d, m, x, y, z) => {
    const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    q.position.set(x, y, z); g.add(q); return q;
  };
  const legGeo = (sx) => {
    const geo = new THREE.BoxGeometry(0.16, 0.8, 0.18);
    geo.translate(0, -0.4, 0);
    const q = new THREE.Mesh(geo, pants); q.position.set(sx, 0.8, 0); g.add(q); return q;
  };
  const legL = legGeo(-0.11), legR = legGeo(0.11);
  box(0.52, 0.62, 0.3, shirt, 0, 1.11, 0);
  box(0.3, 0.3, 0.3, skin, 0, 1.6, 0);
  box(0.13, 0.55, 0.15, shirt, -0.34, 1.1, 0);
  box(0.13, 0.55, 0.15, shirt, 0.34, 1.1, 0);
  return { g, legL, legR, mats };
}

export function createTraffic(scene, world, rng) {
  const R = typeof rng === 'function' ? rng : Math.random;
  const cars = [], peds = [];

  for (let i = 0; i < 14; i++) {
    const p = roadPt(world, R);
    const ty = VEHICLE_TYPES[(R() * VEHICLE_TYPES.length) | 0];
    const dir = R() < 0.5 ? 1 : -1;
    const V = makeVehicle(ty.id, p.x, p.z, roadAng(p.road) + (dir < 0 ? Math.PI : 0), COLORS[(R() * COLORS.length) | 0]);
    V.driver = 'traffic';
    V.road = p.road; V.dir = dir;
    scene.add(V.mesh);
    cars.push(V);
  }

  function newWalk(pd, snap) {
    const n = snap ? nearestRoad(world, pd.x, pd.z) : null;
    const rp = n || roadPt(world, R);
    pd.road = rp.road; pd.t = rp.t;
    pd.dir = R() < 0.5 ? 1 : -1;
    pd.side = (3.5 + R() * 1.5) * (R() < 0.5 ? -1 : 1);
    pd.timer = 12 + R() * 13;
  }
  function respawnPed(pd, farFrom) {
    let p = null;
    for (let k = 0; k < 14; k++) {
      const c = roadPt(world, R);
      if (!farFrom || d2(c.x, c.z, farFrom.x, farFrom.z) > 1600) { p = c; break; }
    }
    p = p || roadPt(world, R);
    pd.x = p.x; pd.z = p.z; pd.hp = 100; pd.state = 'walk'; pd.deadT = 0; pd.fleeT = 0;
    pd.mesh.rotation.x = 0;
    for (const m of pd.mats) m.opacity = 1;
    newWalk(pd, false);
    const q = posOnRoad(pd.road, pd.t, pd.side);
    pd.x = q.x; pd.z = q.z;
    pd.angle = roadAng(pd.road) + (pd.dir < 0 ? Math.PI : 0);
  }

  for (let i = 0; i < 22; i++) {
    const pm = makePerson(R);
    const pd = {
      mesh: pm.g, legL: pm.legL, legR: pm.legR, mats: pm.mats,
      x: 0, z: 0, angle: 0, speed: 1.2 + R() * 0.6, state: 'walk', deadT: 0,
      hp: 100, road: null, t: 0, dir: 1, side: 4, timer: 12 + R() * 13,
      phase: R() * 6, fleeT: 0, fx: 1, fz: 0,
    };
    respawnPed(pd, null);
    scene.add(pd.mesh);
    peds.push(pd);
  }

  function update(dt, G) {
    const P = G.player, PO = G.police;
    for (const V of cars) {
      if (V.driver !== 'traffic' || !V.alive) continue;
      if (d2(V.x, V.z, P.x, P.z) > 260 * 260) {
        let p = null;
        for (let k = 0; k < 14; k++) {
          const c = roadPt(world, R), dd = Math.sqrt(d2(c.x, c.z, P.x, P.z));
          if (dd > 90 && dd < 140) { p = c; break; }
        }
        if (p) {
          V.road = p.road; V.dir = R() < 0.5 ? 1 : -1;
          V.x = p.x; V.z = p.z; V.angle = roadAng(p.road) + (V.dir < 0 ? Math.PI : 0); V.speed = 0;
          V.mesh.position.set(V.x, 0, V.z); V.mesh.rotation.y = -V.angle;
        }
        continue;
      }
      let rd = V.road, dx = rd.x2 - rd.x1, dz = rd.z2 - rd.z1, L2 = dx * dx + dz * dz || 1;
      let t = ((V.x - rd.x1) * dx + (V.z - rd.z1) * dz) / L2;
      if ((V.dir > 0 && t > 0.96) || (V.dir < 0 && t < 0.04)) {
        const cands = world.roads.filter(r => r !== rd && (d2(V.x, V.z, r.x1, r.z1) < 225 || d2(V.x, V.z, r.x2, r.z2) < 225));
        if (cands.length && R() < 0.7) {
          rd = cands[(R() * cands.length) | 0];
          V.road = rd;
          V.dir = d2(V.x, V.z, rd.x1, rd.z1) < d2(V.x, V.z, rd.x2, rd.z2) ? 1 : -1;
          dx = rd.x2 - rd.x1; dz = rd.z2 - rd.z1; L2 = dx * dx + dz * dz || 1;
          t = ((V.x - rd.x1) * dx + (V.z - rd.z1) * dz) / L2;
        } else V.dir = -V.dir;
      }
      const nt = clamp(t + V.dir * 0.12, 0, 1);
      const want = Math.atan2(rd.z1 + dz * nt - V.z, rd.x1 + dx * nt - V.x);
      const steer = clamp(wrap(want - V.angle) * 2.2, -1, 1);
      const px = V.x + Math.cos(V.angle) * 6, pz = V.z + Math.sin(V.angle) * 6;
      let slow = false;
      for (const o of G.vehicles) {
        if (o !== V && o.alive && d2(px, pz, o.x, o.z) < 12.25) { slow = true; break; }
      }
      if (!slow) for (const pd of peds) {
        if (pd.state !== 'dead' && d2(px, pz, pd.x, pd.z) < 9) { slow = true; break; }
      }
      const brake = !!(P.vehicle && P.vehicle !== V && d2(px, pz, P.vehicle.x, P.vehicle.z) < 16);
      const wantThrottle = brake ? 0 : slow ? 0.15 : 0.5;
      if (wantThrottle === 0.5 && Math.abs(V.speed) < 0.6) V.stuckT = (V.stuckT || 0) + dt;
      else V.stuckT = 0;
      let throttle = wantThrottle, steerV = steer;
      if (V.stuckT > 2) {
        throttle = -0.7; steerV = -steer;
        if (V.stuckT > 2.9) { V.stuckT = 0; V.dir = -V.dir; }
      }
      driveVehicle(V, { throttle, steer: steerV, brake }, dt, world);
    }

    for (const pd of peds) {
      if (pd.state === 'dead') {
        pd.deadT += dt;
        pd.mesh.rotation.x = -Math.PI / 2 * Math.min(1, pd.deadT / 0.3);
        if (pd.deadT > 11) respawnPed(pd, P);
        else if (pd.deadT > 10) for (const m of pd.mats) m.opacity = 1 - (pd.deadT - 10);
        continue;
      }
      let sp = pd.speed;
      if (pd.state === 'walk') {
        let tx = 0, tz = 0, threat = false;
        if (G.lastShot && G.time - G.lastShot.time < 3 && d2(pd.x, pd.z, G.lastShot.x, G.lastShot.z) < 900) {
          tx = G.lastShot.x; tz = G.lastShot.z; threat = true;
        } else if (PO && PO.wanted >= 3 && d2(pd.x, pd.z, P.x, P.z) < 625) {
          tx = P.x; tz = P.z; threat = true;
        }
        if (threat) {
          let dx = pd.x - tx, dz = pd.z - tz;
          const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
          pd.fx = dx; pd.fz = dz; pd.fleeT = 4; pd.state = 'flee';
        }
      }
      if (pd.state === 'flee') {
        sp = 4.5;
        pd.fleeT -= dt;
        pd.x = clamp(pd.x + pd.fx * sp * dt, -229, 229);
        pd.z = clamp(pd.z + pd.fz * sp * dt, -229, 229);
        pd.angle = Math.atan2(pd.fz, pd.fx);
        if (pd.fleeT <= 0) { pd.state = 'walk'; newWalk(pd, true); }
      } else {
        pd.timer -= dt;
        const L = roadLen(pd.road) || 1;
        pd.t += pd.dir * sp * dt / L;
        if (pd.t <= 0 || pd.t >= 1 || pd.timer <= 0) newWalk(pd, true);
        const q = posOnRoad(pd.road, clamp(pd.t, 0, 1), pd.side);
        pd.x = q.x; pd.z = q.z;
        pd.angle = roadAng(pd.road) + (pd.dir < 0 ? Math.PI : 0);
      }
      pd.phase += dt * sp * 3;
      const sw = Math.sin(pd.phase) * 0.55;
      pd.legL.rotation.x = sw; pd.legR.rotation.x = -sw;
      pd.mesh.position.set(pd.x, Math.abs(Math.sin(pd.phase)) * 0.05, pd.z);
      pd.mesh.rotation.y = -pd.angle;
    }
  }

  function nearestCar(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const V of cars) {
      if (!V.alive) continue;
      const dd = d2(x, z, V.x, V.z);
      if (dd < bd) { bd = dd; best = V; }
    }
    return best;
  }

  return { cars, peds, update, nearestCar };
}
