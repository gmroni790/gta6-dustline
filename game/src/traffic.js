// Dustline — traffic.js
//
// The living city: self-driving cars on the road grid and pedestrians
// on the sidewalks. Cars keep right, turn at intersections, slow for
// the vehicle ahead and brake for the player. Pedestrians stroll the
// sidewalk line, turn corners and bob as they walk. Everything starts
// lazily on the first update, because the factory must not touch other
// modules: ones attached after this one do not exist yet when it runs.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, wrapAngle, angleLerp, dist2 } from './utils.js';

const TARGET_CARS = 14;
const TARGET_PEDS = 18;
const DESPAWN_DIST = 280;
const SHIRTS = [0xc23b2a, 0x2e6ea6, 0x4a9a4a, 0xe8c33a, 0x8a5aa6, 0xe88a3a, 0x3aa69a, 0xd8d0c0];
const SKINS = [0xe8b88a, 0xc08a5e, 0x8a5a3a, 0xf0c8a0];

export function createTraffic(ctx) {
  const { scene, rng } = ctx;
  const cars = [];
  const peds = [];
  let started = false;

  // Where the player is, as best we can tell. The player module owns
  // the truth; the camera follows the player, so it is a fair fallback.
  function playerPos() {
    const p = ctx.player;
    if (p && p.group && p.group.position) return { x: p.group.position.x, z: p.group.position.z };
    if (p && p.position) return { x: p.position.x, z: p.position.z };
    if (ctx.camera) return { x: ctx.camera.position.x, z: ctx.camera.position.z };
    return { x: 0, z: 0 };
  }

  // --- road helpers ------------------------------------------------------------
  function roadEnd(seg, dir) {
    return dir > 0 ? { x: seg.bx, z: seg.bz } : { x: seg.ax, z: seg.az };
  }
  function roadPoint(seg, t) {
    return { x: seg.ax + (seg.bx - seg.ax) * t, z: seg.az + (seg.bz - seg.az) * t };
  }
  // Heading that points along a segment in the given direction.
  function roadHeading(seg, dir) {
    return Math.atan2((seg.bx - seg.ax) * dir, (seg.bz - seg.az) * dir);
  }
  // The vector pointing to the right of a heading (driver's right side).
  function rightOf(h) {
    return { x: -Math.cos(h), z: Math.sin(h) };
  }
  function objPos(o) {
    return o.vehicle ? o.vehicle.group.position : o.group.position;
  }

  // At an intersection not just turned at, a car or pedestrian may
  // switch onto the crossing road, which keeps the grid alive instead
  // of every car driving to the map edge and back.
  function tryTurn(o, chance) {
    const pos = objPos(o);
    const pts = ctx.world.intersections;
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      if (dist2(pt.x, pt.z, pos.x, pos.z) > 7) continue;
      if (o.lastTurn && o.lastTurn.x === pt.x && o.lastTurn.z === pt.z) return;
      o.lastTurn = { x: pt.x, z: pt.z };
      if (!rng.chance(chance)) return;
      const options = [];
      for (const s of ctx.world.roads) {
        if (s === o.seg) continue;
        const vertical = s.ax === s.bx;
        const through = vertical
          ? s.ax === pt.x && pt.z >= s.az && pt.z <= s.bz
          : s.az === pt.z && pt.x >= s.ax && pt.x <= s.bx;
        if (through) options.push(s);
      }
      if (options.length === 0) return;
      o.seg = rng.pick(options);
      o.dir = rng.chance(0.5) ? 1 : -1;
      return;
    }
    if (o.lastTurn && dist2(o.lastTurn.x, o.lastTurn.z, pos.x, pos.z) > 20) o.lastTurn = null;
  }

  // True when (x, z) sits ahead of a vehicle within range and lane width.
  function aheadOf(pos, fx, fz, x, z, range, halfWidth) {
    const ox = x - pos.x;
    const oz = z - pos.z;
    const along = ox * fx + oz * fz;
    if (along <= 0 || along >= range) return false;
    return Math.abs(ox * fz - oz * fx) < halfWidth;
  }

  // --- traffic cars --------------------------------------------------------------
  function spawnCar(near) {
    const roads = ctx.world.roads;
    let seg = rng.pick(roads);
    if (near) {
      // Prefer a road whose middle is a fair way from the player, so
      // new cars appear in the distance rather than on top of them.
      for (let attempt = 0; attempt < 12; attempt++) {
        const cand = rng.pick(roads);
        const d = dist2((cand.ax + cand.bx) / 2, (cand.az + cand.bz) / 2, near.x, near.z);
        if (d > 60 && d < 240) {
          seg = cand;
          break;
        }
      }
    }
    const dir = rng.chance(0.5) ? 1 : -1;
    const heading = roadHeading(seg, dir);
    const right = rightOf(heading);
    // Pick a spot along the road, and re-roll it while it would land
    // close to the player: the midpoint check above is not enough on a
    // long road, where one end can sit right next to the player.
    let pt = roadPoint(seg, rng.range(0.15, 0.85));
    if (near) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const sx = pt.x + right.x * 3;
        const sz = pt.z + right.z * 3;
        if (dist2(sx, sz, near.x, near.z) > 30) break;
        pt = roadPoint(seg, rng.range(0.15, 0.85));
      }
    }
    const vehicle = ctx.vehicles.spawn(
      'random',
      pt.x + right.x * 3,
      pt.z + right.z * 3,
      heading
    );
    vehicle.driver = 'traffic';
    const car = { vehicle, seg, dir, cruise: rng.range(9, 14), lastTurn: null };
    cars.push(car);
    return car;
  }

  function updateCar(car, dt) {
    const v = car.vehicle;
    const pos = v.group.position;
    tryTurn(car, 0.35);

    // Aim at the far end of the road, offset right so opposing traffic passes.
    let end = roadEnd(car.seg, car.dir);
    if (dist2(end.x, end.z, pos.x, pos.z) < 10) {
      car.dir = -car.dir; // reached the road end: turn around and drive back
      car.lastTurn = null;
      end = roadEnd(car.seg, car.dir);
    }
    const heading = roadHeading(car.seg, car.dir);
    const right = rightOf(heading);
    const tx = end.x + right.x * 3;
    const tz = end.z + right.z * 3;
    const desired = Math.atan2(tx - pos.x, tz - pos.z);
    const steer = clamp(wrapAngle(desired - v.heading) * 2.5, -1, 1);

    let throttle = v.speed < car.cruise ? 0.7 : 0.05;
    let brake = false;

    // Slow down for another vehicle close ahead, in our lane, and brake
    // for the player on foot (or in a car) just ahead of us.
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    for (const other of ctx.vehicles.all) {
      if (other === v) continue;
      const op = other.group.position;
      if (aheadOf(pos, fx, fz, op.x, op.z, 13, 3.4)) {
        brake = true;
        break;
      }
    }
    if (!brake) {
      const pp = playerPos();
      if (aheadOf(pos, fx, fz, pp.x, pp.z, 8, 3)) brake = true;
    }

    if (brake) throttle = 0;
    v.drive(throttle, steer, brake, dt);
  }

  // --- pedestrians ------------------------------------------------------------------
  function buildPedMesh() {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
    const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
    const pants = new THREE.MeshLambertMaterial({ color: 0x3a3a4a });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.7, 0.24), pants);
    legs.position.y = 0.35;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.65, 0.3), shirt);
    body.position.y = 1.02;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin);
    head.position.y = 1.55;

    // Arms hang from the shoulder: the geometry is shifted so its top
    // sits at the origin, and swinging rotates around the shoulder.
    const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.12);
    armGeo.translate(0, -0.275, 0);
    const armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set(-0.33, 1.28, 0);
    const armR = new THREE.Mesh(armGeo, shirt);
    armR.position.set(0.33, 1.28, 0);

    group.add(legs, body, head, armL, armR);
    return { group, armL, armR };
  }

  function spawnPed() {
    const seg = rng.pick(ctx.world.roads);
    const dir = rng.chance(0.5) ? 1 : -1;
    const side = rng.chance(0.5) ? 1 : -1;
    const t = rng.range(0.1, 0.9);
    const pt = roadPoint(seg, t);
    const h = roadHeading(seg, dir);
    const right = rightOf(h);
    const built = buildPedMesh();
    built.group.position.set(pt.x + right.x * side * 8.2, 0, pt.z + right.z * side * 8.2);
    built.group.rotation.y = h;
    scene.add(built.group);
    const ped = {
      group: built.group, armL: built.armL, armR: built.armR,
      speed: rng.range(1.1, 2.1), heading: h, seg, dir, side,
      phase: rng.range(0, Math.PI * 2), lastTurn: null,
    };
    peds.push(ped);
    return ped;
  }

  function updatePed(ped, dt) {
    const pos = ped.group.position;
    tryTurn(ped, 0.5);

    // Walk toward the far end, keeping the sidewalk offset on the same
    // side. Steering toward the target each frame rounds the corners.
    let end = roadEnd(ped.seg, ped.dir);
    if (dist2(end.x, end.z, pos.x, pos.z) < 5) {
      ped.dir = -ped.dir;
      ped.lastTurn = null;
      end = roadEnd(ped.seg, ped.dir);
    }
    const right = rightOf(ped.heading);
    const tx = end.x + right.x * ped.side * 8.2;
    const tz = end.z + right.z * ped.side * 8.2;
    const desired = Math.atan2(tx - pos.x, tz - pos.z);
    ped.heading = angleLerp(ped.heading, desired, Math.min(1, 4 * dt));

    pos.x += Math.sin(ped.heading) * ped.speed * dt;
    pos.z += Math.cos(ped.heading) * ped.speed * dt;

    // Stay inside the playable area: turn back at the edge.
    const b = ctx.world.bounds;
    if (pos.x < b.minX + 4 || pos.x > b.maxX - 4 || pos.z < b.minZ + 4 || pos.z > b.maxZ - 4) {
      pos.x = clamp(pos.x, b.minX + 4, b.maxX - 4);
      pos.z = clamp(pos.z, b.minZ + 4, b.maxZ - 4);
      ped.dir = -ped.dir;
      ped.heading = roadHeading(ped.seg, ped.dir);
    }

    ped.group.rotation.y = ped.heading;
    ped.phase += dt * ped.speed * 3.2;
    ped.group.position.y = Math.abs(Math.sin(ped.phase)) * 0.12;
    ped.armL.rotation.x = Math.sin(ped.phase) * 0.55;
    ped.armR.rotation.x = -Math.sin(ped.phase) * 0.55;
  }

  // --- release and main update ---------------------------------------------------------
  // Hand a traffic car back: it stops being driven by traffic, which
  // is what happens when the player climbs into one.
  function release(vehicle) {
    const i = cars.findIndex((c) => c.vehicle === vehicle);
    if (i < 0) return false;
    cars.splice(i, 1);
    vehicle.driver = 'none';
    return true;
  }

  function update(dt) {
    if (!ctx.world || !ctx.vehicles) return;
    if (!started) {
      started = true;
      for (let i = 0; i < TARGET_CARS; i++) spawnCar(null);
      for (let i = 0; i < TARGET_PEDS; i++) spawnPed();
    }

    // Cars far from the player despawn; fresh ones spawn at a distance
    // to keep the streets at a steady count.
    const pp = playerPos();
    for (let i = cars.length - 1; i >= 0; i--) {
      const pos = cars[i].vehicle.group.position;
      if (dist2(pos.x, pos.z, pp.x, pp.z) > DESPAWN_DIST) {
        cars[i].vehicle.remove();
        cars.splice(i, 1);
      }
    }
    while (cars.length < TARGET_CARS) spawnCar(pp);

    for (const car of cars) updateCar(car, dt);
    for (const ped of peds) updatePed(ped, dt);
  }

  return { cars, peds, update, release };
}
