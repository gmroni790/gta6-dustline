import * as THREE from 'three';
import { makeVehicle, driveVehicle, VEHICLE_TYPES } from './vehicles.js';

// main.js merges T.cars into G.vehicles at startup; the traffic cars live here.
const TAU = Math.PI * 2;
function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
const CAR_COLORS = [0xcc3333, 0x3366cc, 0xdddddd, 0x222222, 0xcc9933, 0x339966, 0x8844aa, 0x8899aa];
const SHIRT_COLORS = [0xd94f4f, 0x4f7dd9, 0x4fd98a, 0xd9c24f, 0xd94fc0, 0x8a5a2b, 0xe8e8e8, 0x3a3a3a];

function randomRoadPoint(W, R) {
  const road = W.roads[Math.floor(R() * W.roads.length)];
  const t = R();
  return { x: road.x1 + (road.x2 - road.x1) * t, z: road.z1 + (road.z2 - road.z1) * t, road, t };
}
function roadAngle(road) { return Math.atan2(road.z2 - road.z1, road.x2 - road.x1); }
function roadLength(road) { return Math.hypot(road.x2 - road.x1, road.z2 - road.z1); }
function nearestRoadTo(W, x, z) {
  let best = null, bestD = Infinity;
  for (const road of W.roads) {
    const dx = road.x2 - road.x1, dz = road.z2 - road.z1;
    const len2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - road.x1) * dx + (z - road.z1) * dz) / len2, 0, 1);
    const dd = dist2(x, z, road.x1 + dx * t, road.z1 + dz * t);
    if (dd < bestD) {
      bestD = dd;
      best = { road, t };
    }
  }
  return best;
}
function pointOnRoad(road, t, side) {
  const len = roadLength(road);
  const ux = (road.x2 - road.x1) / len, uz = (road.z2 - road.z1) / len;
  return { x: road.x1 + ux * len * t - uz * side, z: road.z1 + uz * len * t + ux * side };
}

function buildPerson(R) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({
    color: SHIRT_COLORS[Math.floor(R() * SHIRT_COLORS.length)], transparent: true,
  });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2e3440, transparent: true });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077, transparent: true });
  const mats = [shirt, pants, skin];
  function part(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  }
  function makeLeg(sideX) {
    // Geometry translated down so the mesh pivots at the hip for the walk swing.
    const geo = new THREE.BoxGeometry(0.16, 0.8, 0.18);
    geo.translate(0, -0.4, 0);
    const leg = new THREE.Mesh(geo, pants);
    leg.position.set(sideX, 0.8, 0);
    g.add(leg);
    return leg;
  }
  const legL = makeLeg(-0.11);
  const legR = makeLeg(0.11);
  part(0.52, 0.62, 0.3, shirt, 0, 1.11, 0);
  part(0.3, 0.3, 0.3, skin, 0, 1.6, 0);
  part(0.13, 0.55, 0.15, shirt, -0.34, 1.1, 0);
  part(0.13, 0.55, 0.15, shirt, 0.34, 1.1, 0);
  return { g, legL, legR, mats };
}

export function createTraffic(scene, world, rng) {
  const R = typeof rng === 'function' ? rng : Math.random;
  const cars = [];
  const peds = [];

  // 14 traffic cars on random roads, random types, random directions.
  for (let i = 0; i < 14; i++) {
    const p = randomRoadPoint(world, R);
    const type = VEHICLE_TYPES[Math.floor(R() * VEHICLE_TYPES.length)];
    const dir = R() < 0.5 ? 1 : -1;
    const V = makeVehicle(type.id, p.x, p.z,
      roadAngle(p.road) + (dir < 0 ? Math.PI : 0),
      CAR_COLORS[Math.floor(R() * CAR_COLORS.length)]);
    V.driver = 'traffic';
    V.road = p.road;
    V.dir = dir;
    scene.add(V.mesh);
    cars.push(V);
  }

  function startNewWalk(pd, snap) {
    const found = snap ? nearestRoadTo(world, pd.x, pd.z) : null;
    const rp = found || randomRoadPoint(world, R);
    pd.road = rp.road;
    pd.t = rp.t;
    pd.dir = R() < 0.5 ? 1 : -1;
    pd.side = (3.5 + R() * 1.5) * (R() < 0.5 ? -1 : 1);
    pd.timer = 12 + R() * 13;
  }

  function respawnPed(pd, farFrom) {
    let spot = null;
    for (let k = 0; k < 14; k++) {
      const cand = randomRoadPoint(world, R);
      if (!farFrom || dist2(cand.x, cand.z, farFrom.x, farFrom.z) > 1600) {
        spot = cand;
        break;
      }
    }
    spot = spot || randomRoadPoint(world, R);
    pd.x = spot.x;
    pd.z = spot.z;
    pd.hp = 100;
    pd.state = 'walk';
    pd.deadT = 0;
    pd.fleeT = 0;
    pd.mesh.rotation.x = 0;
    for (const m of pd.mats) m.opacity = 1;
    startNewWalk(pd, false);
    const q = pointOnRoad(pd.road, pd.t, pd.side);
    pd.x = q.x;
    pd.z = q.z;
    pd.angle = roadAngle(pd.road) + (pd.dir < 0 ? Math.PI : 0);
  }

  // 22 pedestrians walking the road sides.
  for (let i = 0; i < 22; i++) {
    const pm = buildPerson(R);
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
    const P = G.player;
    const PO = G.police;

    for (const V of cars) {
      if (V.driver !== 'traffic' || !V.alive) continue;

      // Teleport far-away cars back to a road 90-140 from the player.
      if (dist2(V.x, V.z, P.x, P.z) > 260 * 260) {
        let spot = null;
        for (let k = 0; k < 14; k++) {
          const cand = randomRoadPoint(world, R);
          const dd = Math.sqrt(dist2(cand.x, cand.z, P.x, P.z));
          if (dd > 90 && dd < 140) {
            spot = cand;
            break;
          }
        }
        if (spot) {
          V.road = spot.road;
          V.dir = R() < 0.5 ? 1 : -1;
          V.x = spot.x;
          V.z = spot.z;
          V.angle = roadAngle(spot.road) + (V.dir < 0 ? Math.PI : 0);
          V.speed = 0;
          V.mesh.position.set(V.x, 0, V.z);
          V.mesh.rotation.y = -V.angle;
        }
        continue;
      }

      // Follow the current road; at an end, switch roads (70%) or turn back.
      let road = V.road;
      let dx = road.x2 - road.x1, dz = road.z2 - road.z1;
      let len2 = dx * dx + dz * dz || 1;
      let t = ((V.x - road.x1) * dx + (V.z - road.z1) * dz) / len2;
      if ((V.dir > 0 && t > 0.96) || (V.dir < 0 && t < 0.04)) {
        const cands = world.roads.filter((r) =>
          r !== road && (dist2(V.x, V.z, r.x1, r.z1) < 225 || dist2(V.x, V.z, r.x2, r.z2) < 225));
        if (cands.length && R() < 0.7) {
          road = cands[Math.floor(R() * cands.length)];
          V.road = road;
          V.dir = dist2(V.x, V.z, road.x1, road.z1) < dist2(V.x, V.z, road.x2, road.z2) ? 1 : -1;
          dx = road.x2 - road.x1;
          dz = road.z2 - road.z1;
          len2 = dx * dx + dz * dz || 1;
          t = ((V.x - road.x1) * dx + (V.z - road.z1) * dz) / len2;
        } else {
          V.dir = -V.dir;
        }
      }

      // Steer toward a point a little way ahead on the road.
      const aheadT = clamp(t + V.dir * 0.12, 0, 1);
      const want = Math.atan2(road.z1 + dz * aheadT - V.z, road.x1 + dx * aheadT - V.x);
      const steer = clamp(wrapAngle(want - V.angle) * 2.2, -1, 1);

      // Slow for anything ahead, brake for the player's car ahead.
      const probeX = V.x + Math.cos(V.angle) * 6;
      const probeZ = V.z + Math.sin(V.angle) * 6;
      let slow = false;
      for (const o of G.vehicles) {
        if (o !== V && o.alive && dist2(probeX, probeZ, o.x, o.z) < 12.25) {
          slow = true;
          break;
        }
      }
      if (!slow) {
        for (const pd of peds) {
          if (pd.state !== 'dead' && dist2(probeX, probeZ, pd.x, pd.z) < 9) {
            slow = true;
            break;
          }
        }
      }
      const brake = !!(P.vehicle && P.vehicle !== V && dist2(probeX, probeZ, P.vehicle.x, P.vehicle.z) < 16);
      const wantThrottle = brake ? 0 : slow ? 0.15 : 0.5;

      // Unstuck behaviour: reverse briefly after 2s stuck, then flip direction.
      if (wantThrottle === 0.5 && Math.abs(V.speed) < 0.6) V.stuckT = (V.stuckT || 0) + dt;
      else V.stuckT = 0;
      let throttle = wantThrottle;
      let steerOut = steer;
      if (V.stuckT > 2) {
        throttle = -0.7;
        steerOut = -steer;
        if (V.stuckT > 2.9) {
          V.stuckT = 0;
          V.dir = -V.dir;
        }
      }
      driveVehicle(V, { throttle, steer: steerOut, brake }, dt, world);
    }

    for (const pd of peds) {
      if (pd.state === 'dead') {
        pd.deadT += dt;
        pd.mesh.rotation.x = -Math.PI / 2 * Math.min(1, pd.deadT / 0.3);
        if (pd.deadT > 11) respawnPed(pd, P);
        else if (pd.deadT > 10) {
          for (const m of pd.mats) m.opacity = 1 - (pd.deadT - 10);
        }
        continue;
      }

      let speed = pd.speed;
      if (pd.state === 'walk') {
        // Flee from a recent nearby gunshot, or from a high-wanted player.
        let threatX = 0, threatZ = 0, threat = false;
        if (G.lastShot && G.time - G.lastShot.time < 3 &&
            dist2(pd.x, pd.z, G.lastShot.x, G.lastShot.z) < 900) {
          threatX = G.lastShot.x;
          threatZ = G.lastShot.z;
          threat = true;
        } else if (PO && PO.wanted >= 3 && dist2(pd.x, pd.z, P.x, P.z) < 625) {
          threatX = P.x;
          threatZ = P.z;
          threat = true;
        }
        if (threat) {
          let dx = pd.x - threatX, dz = pd.z - threatZ;
          const len = Math.hypot(dx, dz) || 1;
          pd.fx = dx / len;
          pd.fz = dz / len;
          pd.fleeT = 4;
          pd.state = 'flee';
        }
      }

      if (pd.state === 'flee') {
        speed = 4.5;
        pd.fleeT -= dt;
        pd.x = clamp(pd.x + pd.fx * speed * dt, -229, 229);
        pd.z = clamp(pd.z + pd.fz * speed * dt, -229, 229);
        pd.angle = Math.atan2(pd.fz, pd.fx);
        if (pd.fleeT <= 0) {
          pd.state = 'walk';
          startNewWalk(pd, true);
        }
      } else {
        pd.timer -= dt;
        const len = roadLength(pd.road) || 1;
        pd.t += pd.dir * speed * dt / len;
        if (pd.t <= 0 || pd.t >= 1 || pd.timer <= 0) startNewWalk(pd, true);
        const q = pointOnRoad(pd.road, clamp(pd.t, 0, 1), pd.side);
        pd.x = q.x;
        pd.z = q.z;
        pd.angle = roadAngle(pd.road) + (pd.dir < 0 ? Math.PI : 0);
      }

      pd.phase += dt * speed * 3;
      const swing = Math.sin(pd.phase) * 0.55;
      pd.legL.rotation.x = swing;
      pd.legR.rotation.x = -swing;
      pd.mesh.position.set(pd.x, Math.abs(Math.sin(pd.phase)) * 0.05, pd.z);
      pd.mesh.rotation.y = -pd.angle;
    }
  }

  function nearestCar(x, z, maxD) {
    let best = null, bestD = maxD * maxD;
    for (const V of cars) {
      if (!V.alive) continue;
      const dd = dist2(x, z, V.x, V.z);
      if (dd < bestD) {
        bestD = dd;
        best = V;
      }
    }
    return best;
  }

  return { cars, peds, update, nearestCar };
}
