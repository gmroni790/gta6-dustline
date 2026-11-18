import * as THREE from 'three';

// 7 desert rides. top in m/s, accel in m/s^2, grip is steering rate.
export const VEHICLE_TYPES = [
  { id: 'buggy', name: 'Dune Buggy', top: 38, accel: 16, grip: 2.2, body: 'buggy', color: 0xe8a13a },
  { id: 'pickup', name: 'Pickup', top: 32, accel: 12, grip: 2.0, body: 'pickup', color: 0xb8542e },
  { id: 'muscle', name: 'Muscle Car', top: 42, accel: 17, grip: 1.7, body: 'muscle', color: 0x8e2f2f },
  { id: 'sedan', name: 'Sedan', top: 34, accel: 13, grip: 2.1, body: 'sedan', color: 0x4a6a8a },
  { id: 'van', name: 'Van', top: 28, accel: 10, grip: 1.8, body: 'van', color: 0xd8d0b8 },
  { id: 'hauler', name: 'Semi Hauler', top: 26, accel: 8, grip: 1.6, body: 'hauler', color: 0x3a5a3a },
  { id: 'lowrider', name: 'Lowrider', top: 33, accel: 12, grip: 2.0, body: 'lowrider', color: 0x7a2e8e },
];

const TIRE = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x141e28, roughness: 0.1, metalness: 0.8 });
const CHROME = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.2, metalness: 0.9 });
const HEAD = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2b0, emissiveIntensity: 1.5 });
const TAIL = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2222, emissiveIntensity: 1.2 });

// [length, width, body height, body center y] per body. Cars face local +X.
const DIM = {
  buggy: [3.6, 1.9, 0.5, 0.62], pickup: [4.8, 2.0, 0.7, 0.62], muscle: [4.9, 2.0, 0.62, 0.55],
  sedan: [4.6, 1.9, 0.65, 0.58], van: [5.0, 2.1, 1.5, 0.95], hauler: [7.6, 2.3, 0.8, 0.75],
  lowrider: [4.9, 2.0, 0.5, 0.45],
};
const WR = { buggy: [0.36, 0.5], hauler: [0.44, 0.44], lowrider: [0.34, 0.34] };

export function buildCarMesh(typeId, color) {
  const t = VEHICLE_TYPES.find(v => v.id === typeId) || VEHICLE_TYPES[3];
  const c = color === undefined ? t.color : color;
  const g = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.55 });
  const [L, W, BH, BY] = DIM[t.body];
  const b = (w, h, d, m, x, y, z) => {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mm.position.set(x, y, z); mm.castShadow = true; g.add(mm); return mm;
  };
  let body;
  if (t.body === 'buggy') {
    body = b(L, BH, W, bm, 0, BY, 0);
    b(L * 0.8, 0.18, W * 0.7, DARK, 0, BY - 0.32, 0);
    b(0.5, 0.5, 0.7, DARK, -0.4, BY + 0.45, -0.45);
    b(0.5, 0.5, 0.7, DARK, -0.4, BY + 0.45, 0.45);
    b(0.12, 1.1, 0.12, DARK, -0.5, BY + 0.9, -0.7);
    b(0.12, 1.1, 0.12, DARK, -0.5, BY + 0.9, 0.7);
    b(0.12, 0.12, 1.5, DARK, -0.5, BY + 1.45, 0);
  } else if (t.body === 'pickup') {
    body = b(L, BH, W, bm, 0, BY, 0);
    b(1.5, 0.8, 1.8, bm, 0.8, BY + 0.7, 0);
    b(0.9, 0.6, 1.7, GLASS, 0.95, BY + 0.7, 0);
    b(1.9, 0.45, 0.12, bm, -1.2, BY + 0.55, -0.9);
    b(1.9, 0.45, 0.12, bm, -1.2, BY + 0.55, 0.9);
    b(0.12, 0.45, 1.9, bm, -2.3, BY + 0.55, 0);
  } else if (t.body === 'muscle') {
    body = b(L, BH, W, bm, 0, BY, 0);
    b(1.0, 0.18, 0.8, DARK, 1.5, BY + BH / 2 + 0.08, 0);
    b(2.0, 0.55, 1.7, GLASS, -0.4, BY + 0.6, 0);
    b(2.1, 0.1, 1.75, bm, -0.4, BY + 0.92, 0);
    b(0.1, 0.3, 0.1, DARK, -2.2, BY + 0.7, -0.7);
    b(0.1, 0.3, 0.1, DARK, -2.2, BY + 0.7, 0.7);
    b(0.5, 0.08, 1.8, DARK, -2.25, BY + 0.9, 0);
  } else if (t.body === 'sedan') {
    body = b(L, BH, W, bm, 0, BY, 0);
    b(2.2, 0.55, 1.7, GLASS, -0.2, BY + 0.6, 0);
    b(2.3, 0.1, 1.75, bm, -0.2, BY + 0.92, 0);
    b(0.9, 0.25, 1.8, bm, -1.8, BY + 0.45, 0);
  } else if (t.body === 'van') {
    body = b(L, BH, W, bm, 0, BY, 0);
    b(0.1, 0.7, 1.8, GLASS, L / 2 - 0.05, BY + 0.35, 0);
    b(2.6, 0.6, 0.06, GLASS, -0.4, BY + 0.35, -W / 2 - 0.01);
    b(2.6, 0.6, 0.06, GLASS, -0.4, BY + 0.35, W / 2 + 0.01);
    b(0.06, 1.0, 0.9, DARK, -0.4, BY - 0.2, W / 2 + 0.01);
  } else if (t.body === 'hauler') {
    b(L, 0.5, 1.8, DARK, 0, 0.65, 0);
    body = b(1.9, 1.9, 2.2, bm, 2.7, 1.55, 0);
    b(0.1, 0.8, 1.9, GLASS, 3.65, 1.9, 0);
    b(1.4, 1.4, 2.2, bm, 1.1, 1.3, 0);
    b(0.3, 0.3, 2.0, CHROME, 3.6, 0.55, 0);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), CHROME);
    stack.position.set(1.85, 2.2, -0.95); stack.castShadow = true; g.add(stack);
    for (const s of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 12), CHROME);
      tank.rotation.z = Math.PI / 2; tank.position.set(0.2, 0.6, s * 1.05);
      tank.castShadow = true; g.add(tank);
    }
  } else { // lowrider
    body = b(L, BH, W, bm, 0, BY, 0);
    b(2.0, 0.5, 1.7, GLASS, -0.3, BY + 0.5, 0);
    b(2.1, 0.1, 1.75, bm, -0.3, BY + 0.78, 0);
    b(0.15, 0.22, 1.9, CHROME, L / 2 + 0.05, BY - 0.05, 0);
    b(0.15, 0.22, 1.9, CHROME, -L / 2 - 0.05, BY - 0.05, 0);
    b(0.08, 0.3, 1.2, CHROME, L / 2 + 0.02, BY + 0.1, 0);
  }
  // Headlights + taillights
  for (const s of [-1, 1]) {
    b(0.08, 0.18, 0.4, HEAD, L / 2 + 0.01, BY + 0.1, s * W * 0.32);
    b(0.08, 0.16, 0.35, TAIL, -L / 2 - 0.01, BY + 0.1, s * W * 0.32);
  }
  // Wheels: cylinder (sideways) inside a pivot group; pivot spins and yaws.
  const [rf, rr] = WR[t.body] || [0.37, 0.37];
  const wheels = [], pivots = [];
  const spots = [[L * 0.32, -1, rf], [L * 0.32, 1, rf], [-L * 0.32, -1, rr], [-L * 0.32, 1, rr]];
  for (const [wx, wz, r] of spots) {
    const pivot = new THREE.Group();
    const wdt = t.body === 'muscle' && wx < 0 ? 0.42 : t.body === 'hauler' ? 0.4 : 0.3;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wdt, 14), TIRE);
    tire.rotation.x = Math.PI / 2; tire.castShadow = true; pivot.add(tire);
    if (t.body === 'lowrider') {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, wdt + 0.04, 10), CHROME);
      hub.rotation.x = Math.PI / 2; pivot.add(hub);
    }
    pivot.position.set(wx, r, wz * (W / 2 - 0.02));
    g.add(pivot); pivots.push(pivot); wheels.push(tire);
  }
  g.userData.wheels = wheels;
  g.userData.pivots = pivots;
  g.userData.body = body;
  g.userData.wheelR = rf;
  return g;
}

let nextId = 1;

export function makeVehicle(typeId, x, z, angle, color) {
  const t = VEHICLE_TYPES.find(v => v.id === typeId) || VEHICLE_TYPES[3];
  const mesh = buildCarMesh(t.id, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = -angle;
  return {
    mesh, type: t, id: nextId++, x, z, angle,
    speed: 0, steer: 0, color: color === undefined ? t.color : color,
    driver: null, hp: 100, alive: true,
  };
}

export function driveVehicle(V, ctl, dt, world) {
  if (!V.alive) { V.speed = 0; return; }
  const t = V.type;
  let top = t.top;
  if (V.hp < 30) top *= 0.4 + 0.6 * (V.hp / 30);
  V.speed += ctl.throttle * t.accel * dt;
  if (ctl.brake) {
    const d = 30 * dt;
    V.speed -= Math.sign(V.speed) * Math.min(Math.abs(V.speed), d);
  } else if (!ctl.throttle) {
    const d = (2 + Math.abs(V.speed) * 0.25) * dt;
    V.speed -= Math.sign(V.speed) * Math.min(Math.abs(V.speed), d);
  }
  V.speed = Math.max(-8, Math.min(top, V.speed));
  if (Math.abs(V.speed) < 0.02 && !ctl.throttle) V.speed = 0;
  V.steer = ctl.steer;
  const f = Math.max(0.15, Math.min(1, Math.abs(V.speed) / t.top));
  V.angle += ctl.steer * t.grip * f * dt * Math.sign(V.speed);
  const nx = V.x + Math.cos(V.angle) * V.speed * dt;
  const nz = V.z + Math.sin(V.angle) * V.speed * dt;
  if (world && world.collides(nx, nz, 1.7)) {
    V.speed *= -0.25;
  } else {
    V.x = nx; V.z = nz;
  }
  V.mesh.position.set(V.x, 0, V.z);
  V.mesh.rotation.y = -V.angle;
  const piv = V.mesh.userData.pivots;
  const spin = V.speed * dt / (V.mesh.userData.wheelR || 0.36);
  for (let i = 0; i < piv.length; i++) {
    piv[i].rotation.z -= spin;
    if (i < 2) piv[i].rotation.y = -V.steer * 0.45;
  }
}

export function damageVehicle(V, dmg) {
  V.hp -= dmg;
  if (V.hp <= 0 && V.alive) { V.alive = false; V.speed = 0; V.hp = 0; }
}
