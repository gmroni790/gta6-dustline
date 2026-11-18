// Dustline — player module.
// Rae Calloway, courier and driver, on foot and behind the wheel.
// Owns the on-foot figure, walking, sprinting, entering and exiting cars,
// and the wasted check. The camera itself is driven by the coordinator.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, angleLerp, dist2 } from './utils.js';

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 10.4;
const PLAYER_RADIUS = 0.55;
const ENTER_RANGE = 4.5;
const EXIT_OFFSET = 2.4;

export function createPlayer(ctx) {
  const { scene, input, state } = ctx;

  // ----- Rae's figure, built from boxes, facing +z -----
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const vestMat = new THREE.MeshStandardMaterial({ color: 0xd97a2b, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x7a2e1d, roughness: 0.8 });
  const paleMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.9 });

  function box(w, h, d, mat, x, y, z, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    (parent || body).add(mesh);
    return mesh;
  }

  // Torso in a courier's orange vest, with a pale stripe across the chest.
  box(0.62, 0.78, 0.36, vestMat, 0, 1.18, 0);
  box(0.5, 0.1, 0.02, paleMat, 0, 1.3, 0.19);
  box(0.2, 0.3, 0.06, rustMat, 0, 1.05, 0.2); // satchel flap on the chest
  // Head, hair and a rust-red cap with a brim.
  box(0.34, 0.36, 0.34, skinMat, 0, 1.78, 0);
  box(0.38, 0.12, 0.38, rustMat, 0, 1.99, 0);
  box(0.36, 0.05, 0.22, rustMat, 0, 1.94, 0.26);
  // Legs hang from hip pivots so they can swing while walking.
  const legL = new THREE.Group();
  legL.position.set(-0.17, 0.82, 0);
  body.add(legL);
  box(0.22, 0.82, 0.26, darkMat, 0, -0.41, 0, legL);
  const legR = new THREE.Group();
  legR.position.set(0.17, 0.82, 0);
  body.add(legR);
  box(0.22, 0.82, 0.26, darkMat, 0, -0.41, 0, legR);
  // Arms hang from shoulder pivots and swing opposite the legs.
  const armL = new THREE.Group();
  armL.position.set(-0.42, 1.5, 0);
  body.add(armL);
  box(0.18, 0.72, 0.22, vestMat, 0, -0.36, 0, armL);
  const armR = new THREE.Group();
  armR.position.set(0.42, 1.5, 0);
  body.add(armR);
  box(0.18, 0.72, 0.22, vestMat, 0, -0.36, 0, armR);

  scene.add(group);

  // ----- State -----
  let car = null; // vehicle object while driving, otherwise null
  let heading = 0;
  let speed = 0;
  let bobPhase = 0;
  let placed = false; // true once we have taken the start position from world

  // Keep a ground position inside the bounds and out of every collider.
  // Pushing out radially lets the player slide along a building wall.
  function resolveCollisions(pos) {
    const world = ctx.world;
    if (!world) return;
    const b = world.bounds;
    if (b) {
      pos.x = clamp(pos.x, b.minX + PLAYER_RADIUS, b.maxX - PLAYER_RADIUS);
      pos.z = clamp(pos.z, b.minZ + PLAYER_RADIUS, b.maxZ - PLAYER_RADIUS);
    }
    const colliders = world.colliders || [];
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.radius + PLAYER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  function updateOnFoot(dt) {
    const cam = ctx.camHeading || 0;
    const fwd = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
    const strafe = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    // Camera-relative axes: forward is away from the camera, right is screen-right.
    const fx = Math.sin(cam);
    const fz = Math.cos(cam);
    const rx = -Math.cos(cam);
    const rz = Math.sin(cam);
    let mx = fx * fwd + rx * strafe;
    let mz = fz * fwd + rz * strafe;
    const len = Math.hypot(mx, mz);
    const targetSpeed = len > 0 ? (sprint ? SPRINT_SPEED : WALK_SPEED) : 0;
    if (len > 0) {
      mx /= len;
      mz /= len;
    }
    speed = damp(speed, targetSpeed, 8, dt);

    const p = group.position;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    resolveCollisions(p);

    if (len > 0) {
      heading = angleLerp(heading, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
    }
    group.rotation.y = heading;

    // Walk cycle: swinging limbs, a small bob and a slight forward lean.
    bobPhase += speed * dt * 1.4;
    const swing = clamp(speed / WALK_SPEED, 0, 1.6) * 0.55;
    const s = Math.sin(bobPhase);
    legL.rotation.x = s * swing;
    legR.rotation.x = -s * swing;
    armL.rotation.x = -s * swing * 0.8;
    armR.rotation.x = s * swing * 0.8;
    body.position.y = Math.abs(s) * 0.07 * clamp(speed / WALK_SPEED, 0, 1);
    body.rotation.x = damp(body.rotation.x, speed > 0.5 ? 0.09 : 0, 6, dt);
  }

  function updateDriving(dt) {
    // A wrecked car throws Rae out instead of trapping her in a dead shell.
    if (car.health <= 0) {
      group.position.copy(car.group.position);
      group.position.y = 0;
      resolveCollisions(group.position);
      car.driver = 'none';
      car = null;
      speed = 0;
      group.visible = true;
      return;
    }
    const throttle = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0);
    // Positive steering raises the heading, which turns the car left, so the
    // right-hand key feeds a negative value and the left-hand key positive.
    const steer = (input.keys.has('KeyA') ? 1 : 0) - (input.keys.has('KeyD') ? 1 : 0);
    const brake = input.keys.has('Space');
    car.drive(throttle, steer, brake, dt);
    speed = car.speed;
    heading = car.heading;
    // The hidden figure rides along so its position always means "the player".
    group.position.copy(car.group.position);
    group.rotation.y = heading;
  }

  function tryEnterExit() {
    // A mission start beats getting into a car.
    const missions = ctx.missions;
    if (missions && missions.startAvailable) {
      missions.start();
      return;
    }
    if (car) {
      // Step out on the car's right-hand side, clear of walls.
      const cp = car.group.position;
      const rx = -Math.cos(car.heading);
      const rz = Math.sin(car.heading);
      group.position.set(cp.x + rx * EXIT_OFFSET, 0, cp.z + rz * EXIT_OFFSET);
      resolveCollisions(group.position);
      heading = car.heading;
      group.rotation.y = heading;
      car.driver = 'none';
      car = null;
      speed = 0;
      group.visible = true;
      return;
    }
    // Find the nearest car within reach.
    let best = null;
    let bestD = ENTER_RANGE;
    const all = (ctx.vehicles && ctx.vehicles.all) || [];
    for (let i = 0; i < all.length; i++) {
      const v = all[i];
      const d = dist2(group.position.x, group.position.z, v.group.position.x, v.group.position.z);
      if (d < bestD) {
        best = v;
        bestD = d;
      }
    }
    if (!best) return;
    if (ctx.traffic) ctx.traffic.release(best);
    best.driver = 'player';
    car = best;
    group.visible = false;
  }

  function update(dt) {
    // First frame: take the start spot from the world module.
    if (!placed) {
      const start = ctx.world && ctx.world.places && ctx.world.places.playerStart;
      if (start) {
        group.position.set(start.x, 0, start.z);
        heading = 0;
        group.rotation.y = 0;
      }
      placed = true;
    }
    if (state.mode === 'playing') {
      if (input.pressed.has('KeyE')) tryEnterExit();
      if (car) updateDriving(dt);
      else updateOnFoot(dt);
      if (state.health <= 0) state.mode = 'wasted';
    } else if (car) {
      group.position.copy(car.group.position);
      speed = 0;
    } else {
      speed = damp(speed, 0, 8, dt);
    }
  }

  function place(x, z, h) {
    // An explicit placement counts as placed: the first update must not
    // drag Rae back to the start spot (shot staging depends on this).
    placed = true;
    heading = h;
    group.rotation.y = h;
    if (car) {
      car.place(x, z, h);
      group.position.copy(car.group.position);
    } else {
      group.position.set(x, 0, z);
      resolveCollisions(group.position);
    }
  }

  function heal() {
    state.health = 100;
  }

  return {
    group,
    get onFoot() {
      return car === null;
    },
    get car() {
      return car;
    },
    get speed() {
      return speed;
    },
    get heading() {
      return heading;
    },
    update,
    place,
    heal,
  };
}
