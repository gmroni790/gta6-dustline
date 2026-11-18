import * as THREE from 'three';
import { driveVehicle } from './vehicles.js';

const TAU = Math.PI * 2;
function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function makeRae() {
  const g = new THREE.Group();
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2b3a55 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x0f766e });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077 });
  const capM = new THREE.MeshStandardMaterial({ color: 0x8a2f2f });
  const box = (w, h, d, m, x, y, z) => {
    const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    q.position.set(x, y, z); g.add(q); return q;
  };
  const legGeo = (sx) => {
    const geo = new THREE.BoxGeometry(0.17, 0.8, 0.19);
    geo.translate(0, -0.4, 0);
    const q = new THREE.Mesh(geo, jeans); q.position.set(sx, 0.8, 0); g.add(q); return q;
  };
  const legL = legGeo(-0.11), legR = legGeo(0.11);
  box(0.52, 0.62, 0.3, jacket, 0, 1.11, 0);
  box(0.3, 0.3, 0.3, skin, 0, 1.6, 0);
  box(0.34, 0.12, 0.34, capM, 0, 1.76, 0);
  box(0.24, 0.05, 0.26, capM, 0.24, 1.72, 0);
  box(0.13, 0.55, 0.15, jacket, -0.34, 1.1, 0);
  box(0.13, 0.55, 0.15, jacket, 0.34, 1.1, 0);
  return { g, legL, legR };
}

function exitCar(P, G) {
  const V = P.vehicle;
  if (!V) { P.onFoot = true; P.mesh.visible = true; return; }
  const lx = Math.sin(V.angle), lz = -Math.cos(V.angle);
  let nx = V.x + lx * 2.5, nz = V.z + lz * 2.5;
  if (G.world.collides(nx, nz, 0.6)) { nx = V.x - lx * 2.5; nz = V.z - lz * 2.5; }
  P.x = clamp(nx, -229, 229); P.z = clamp(nz, -229, 229);
  P.angle = V.angle; P.heading = V.angle; P.speed = 0;
  V.driver = null;
  P.vehicle = null; P.onFoot = true; P.mesh.visible = true;
  P.mesh.position.set(P.x, 0, P.z);
  P.mesh.rotation.y = -P.angle;
}

function tryEnter(P, G) {
  let best = null, bd = 4.5 * 4.5;
  for (const V of G.vehicles) {
    if (!V.alive || V.driver === 'player') continue;
    const dx = V.x - P.x, dz = V.z - P.z, dd = dx * dx + dz * dz;
    if (dd < bd) { bd = dd; best = V; }
  }
  if (!best) return;
  if (best.driver === 'traffic' && G.traffic) {
    const i = G.traffic.cars.indexOf(best);
    if (i >= 0) G.traffic.cars.splice(i, 1);
  }
  if (best.driver === 'cop') G.police.addWanted(1);
  best.driver = 'player';
  P.vehicle = best; P.onFoot = false; P.mesh.visible = false;
}

export function createPlayer(scene, world, spawn) {
  const rm = makeRae();
  const P = {
    mesh: rm.g, legL: rm.legL, legR: rm.legR,
    x: spawn.x, z: spawn.z, angle: spawn.angle || 0, heading: spawn.angle || 0,
    speed: 0, health: 100, onFoot: true, vehicle: null,
    camX: spawn.x, camY: 2.2, camZ: spawn.z, phase: 0, _G: null,
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
  const A = G.audio;
  if (P.vehicle && !P.vehicle.alive) exitCar(P, G);
  if (input.pressed.has('KeyE') && G.state === 'playing') {
    if (P.onFoot) tryEnter(P, G); else exitCar(P, G);
  }
  if (G.state !== 'playing') {
    if (A) A.engine(0, false);
    P.camX = P.x; P.camY = 2.2; P.camZ = P.z;
    return;
  }
  if (P.onFoot) {
    if (A) A.engine(0, false);
    const k = input.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    let bob = 0;
    if (f || r) {
      const yaw = G.camYaw;
      const fx = Math.cos(yaw), fz = Math.sin(yaw);
      const rx = -Math.sin(yaw), rz = Math.cos(yaw);
      let mx = fx * f + rx * r, mz = fz * f + rz * r;
      const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
      const sp = (k.has('ShiftLeft') || k.has('ShiftRight')) ? 8 : 5;
      P.speed = sp;
      const nx = P.x + mx * sp * dt, nz = P.z + mz * sp * dt;
      if (!G.world.collides(nx, P.z, 0.6)) P.x = clamp(nx, -229, 229);
      if (!G.world.collides(P.x, nz, 0.6)) P.z = clamp(nz, -229, 229);
      const want = Math.atan2(mz, mx);
      P.angle += clamp(wrap(want - P.angle), -10 * dt, 10 * dt);
      P.phase += dt * sp * 1.4;
      const sw = Math.sin(P.phase) * 0.6;
      P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
      bob = Math.abs(Math.sin(P.phase)) * 0.04;
    } else {
      P.speed = 0;
      const e = Math.min(1, 10 * dt);
      P.legL.rotation.x += (0 - P.legL.rotation.x) * e;
      P.legR.rotation.x += (0 - P.legR.rotation.x) * e;
    }
    P.heading = P.angle;
    P.mesh.position.set(P.x, bob, P.z);
    P.mesh.rotation.y = -P.angle;
  } else {
    const V = P.vehicle, k = input.keys;
    const ctl = {
      throttle: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      steer: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      brake: k.has('Space'),
    };
    driveVehicle(V, ctl, dt, G.world);
    P.x = V.x; P.z = V.z; P.angle = V.angle; P.heading = V.angle; P.speed = V.speed;
    P.mesh.position.set(P.x, 0, P.z);
    P.mesh.rotation.y = -P.angle;
    if (A) A.engine(clamp(Math.abs(V.speed) / (V.type.top || 30), 0, 1), true);
  }
  P.camX = P.x; P.camY = 2.2; P.camZ = P.z;
}
