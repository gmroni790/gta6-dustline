// Rae, the player character: a boxy on-foot figure who can steal and drive cars.
// Movement on foot is relative to the camera yaw; driving hands control to the
// vehicle physics in vehicles.js and mirrors the car back onto the player.
import * as THREE from 'three';
import { driveVehicle } from './vehicles.js';

const FULL_TURN = Math.PI * 2;
const EDGE = 229;

function clampNum(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= FULL_TURN;
  while (a < -Math.PI) a += FULL_TURN;
  return a;
}

// Build the figure: dark jeans, teal jacket, skin-tone head and a red cap.
// Each leg hangs from a pivot at hip height so it can swing while walking.
function buildFigure() {
  const group = new THREE.Group();
  const denim = new THREE.MeshStandardMaterial({ color: 0x2b3a55 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x0f766e });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8a2f2f });

  const addBox = (w, h, d, mat, x, y, z) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };
  const addLeg = (side) => {
    const geo = new THREE.BoxGeometry(0.17, 0.8, 0.19);
    geo.translate(0, -0.4, 0);
    const leg = new THREE.Mesh(geo, denim);
    leg.position.set(side, 0.8, 0);
    group.add(leg);
    return leg;
  };

  const leftLeg = addLeg(-0.11);
  const rightLeg = addLeg(0.11);
  addBox(0.52, 0.62, 0.3, teal, 0, 1.11, 0); // torso
  addBox(0.3, 0.3, 0.3, skin, 0, 1.6, 0); // head
  addBox(0.34, 0.12, 0.34, red, 0, 1.76, 0); // cap crown
  addBox(0.24, 0.05, 0.26, red, 0.24, 1.72, 0); // cap brim
  addBox(0.13, 0.55, 0.15, teal, -0.34, 1.1, 0); // left arm
  addBox(0.13, 0.55, 0.15, teal, 0.34, 1.1, 0); // right arm
  return { group, leftLeg, rightLeg };
}

// Step out of the car to its left; if that side is blocked, use the right.
function stepOut(P, G) {
  const car = P.vehicle;
  if (!car) {
    P.onFoot = true;
    P.mesh.visible = true;
    return;
  }
  const sideX = Math.sin(car.angle);
  const sideZ = -Math.cos(car.angle);
  let outX = car.x + sideX * 2.5;
  let outZ = car.z + sideZ * 2.5;
  if (G.world.collides(outX, outZ, 0.6)) {
    outX = car.x - sideX * 2.5;
    outZ = car.z - sideZ * 2.5;
  }
  P.x = clampNum(outX, -EDGE, EDGE);
  P.z = clampNum(outZ, -EDGE, EDGE);
  P.angle = car.angle;
  P.heading = car.angle;
  P.speed = 0;
  car.driver = null;
  P.vehicle = null;
  P.onFoot = true;
  P.mesh.visible = true;
  P.mesh.position.set(P.x, 0, P.z);
  P.mesh.rotation.y = -P.angle;
}

// Climb into the closest drivable car. Taking a traffic car pulls it out of
// the traffic flow; taking a cop car draws one star of heat.
function stepIn(P, G) {
  let closest = null;
  let closestSq = 4.5 * 4.5;
  for (const car of G.vehicles) {
    if (!car.alive || car.driver === 'player') continue;
    const dx = car.x - P.x;
    const dz = car.z - P.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < closestSq) {
      closestSq = distSq;
      closest = car;
    }
  }
  if (!closest) return;
  if (closest.driver === 'traffic' && G.traffic) {
    const idx = G.traffic.cars.indexOf(closest);
    if (idx >= 0) G.traffic.cars.splice(idx, 1);
  }
  if (closest.driver === 'cop') G.police.addWanted(1);
  closest.driver = 'player';
  P.vehicle = closest;
  P.onFoot = false;
  P.mesh.visible = false;
}

export function createPlayer(scene, world, spawn) {
  const figure = buildFigure();
  const P = {
    mesh: figure.group,
    legL: figure.leftLeg,
    legR: figure.rightLeg,
    x: spawn.x,
    z: spawn.z,
    angle: spawn.angle || 0,
    heading: spawn.angle || 0,
    speed: 0,
    health: 100,
    onFoot: true,
    vehicle: null,
    camX: spawn.x,
    camY: 2.2,
    camZ: spawn.z,
    phase: 0,
    _G: null,
    hurt(dmg) {
      this.health -= dmg;
      if (this.health <= 0 && this._G && this._G.state === 'playing') {
        this._G.state = 'wasted';
        if (this._G.audio) this._G.audio.wasted();
      }
    },
  };
  P.mesh.position.set(P.x, 0, P.z);
  P.mesh.rotation.y = -P.angle;
  scene.add(P.mesh);
  return P;
}

export function updatePlayer(P, input, dt, G) {
  P._G = G;
  const audio = G.audio;

  // A wrecked car dumps its driver on the spot.
  if (P.vehicle && !P.vehicle.alive) stepOut(P, G);

  if (input.pressed.has('KeyE') && G.state === 'playing') {
    if (P.onFoot) stepIn(P, G);
    else stepOut(P, G);
  }

  if (G.state !== 'playing') {
    if (audio) audio.engine(0, false);
    P.camX = P.x;
    P.camY = 2.2;
    P.camZ = P.z;
    return;
  }

  if (P.onFoot) {
    if (audio) audio.engine(0, false);
    const keys = input.keys;
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let bob = 0;
    if (forward || strafe) {
      // W walks away from the camera; A/D strafe across the view.
      const yaw = G.camYaw;
      const fwdX = Math.cos(yaw);
      const fwdZ = Math.sin(yaw);
      const rightX = -Math.sin(yaw);
      const rightZ = Math.cos(yaw);
      let moveX = fwdX * forward + rightX * strafe;
      let moveZ = fwdZ * forward + rightZ * strafe;
      const len = Math.hypot(moveX, moveZ) || 1;
      moveX /= len;
      moveZ /= len;
      const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const pace = sprinting ? 8 : 5;
      P.speed = pace;
      // Move one axis at a time so walls slide instead of snagging.
      const nextX = P.x + moveX * pace * dt;
      const nextZ = P.z + moveZ * pace * dt;
      if (!G.world.collides(nextX, P.z, 0.6)) P.x = clampNum(nextX, -EDGE, EDGE);
      if (!G.world.collides(P.x, nextZ, 0.6)) P.z = clampNum(nextZ, -EDGE, EDGE);
      const target = Math.atan2(moveZ, moveX);
      P.angle += clampNum(wrapAngle(target - P.angle), -10 * dt, 10 * dt);
      P.phase += dt * pace * 1.4;
      const swing = Math.sin(P.phase) * 0.6;
      P.legL.rotation.x = swing;
      P.legR.rotation.x = -swing;
      bob = Math.abs(Math.sin(P.phase)) * 0.04;
    } else {
      P.speed = 0;
      const settle = Math.min(1, 10 * dt);
      P.legL.rotation.x += (0 - P.legL.rotation.x) * settle;
      P.legR.rotation.x += (0 - P.legR.rotation.x) * settle;
    }
    P.heading = P.angle;
    P.mesh.position.set(P.x, bob, P.z);
    P.mesh.rotation.y = -P.angle;
  } else {
    const car = P.vehicle;
    const keys = input.keys;
    const controls = {
      throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      steer: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      brake: keys.has('Space'),
    };
    driveVehicle(car, controls, dt, G.world);
    P.x = car.x;
    P.z = car.z;
    P.angle = car.angle;
    P.heading = car.angle;
    P.speed = car.speed;
    P.mesh.position.set(P.x, 0, P.z);
    P.mesh.rotation.y = -P.angle;
    if (audio) {
      const fraction = clampNum(Math.abs(car.speed) / (car.type.top || 30), 0, 1);
      audio.engine(fraction, true);
    }
  }

  P.camX = P.x;
  P.camY = 2.2;
  P.camZ = P.z;
}
