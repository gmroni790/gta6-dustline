import * as THREE from 'three';

// Seven desert rides. top is top speed in m/s, accel in m/s^2, grip is steering rate.
export const VEHICLE_TYPES = [
  { id: 'buggy', name: 'Dune Buggy', top: 38, accel: 16, grip: 2.2, body: 'buggy', color: 0xe8a13a },
  { id: 'pickup', name: 'Pickup', top: 32, accel: 12, grip: 2.0, body: 'pickup', color: 0xb8542e },
  { id: 'muscle', name: 'Muscle Car', top: 42, accel: 17, grip: 1.7, body: 'muscle', color: 0x8e2f2f },
  { id: 'sedan', name: 'Sedan', top: 34, accel: 13, grip: 2.1, body: 'sedan', color: 0x4a6a8a },
  { id: 'van', name: 'Van', top: 28, accel: 10, grip: 1.8, body: 'van', color: 0xd8d0b8 },
  { id: 'hauler', name: 'Semi Hauler', top: 26, accel: 8, grip: 1.6, body: 'hauler', color: 0x3a5a3a },
  { id: 'lowrider', name: 'Lowrider', top: 33, accel: 12, grip: 2.0, body: 'lowrider', color: 0x7a2e8e },
];

// Shared part materials.
const TIRE_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
const TRIM_MAT = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 });
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x141e28, roughness: 0.1, metalness: 0.8 });
const CHROME_MAT = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.2, metalness: 0.9 });
const HEADLIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff2b0, emissiveIntensity: 1.5 });
const TAILLIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2222, emissiveIntensity: 1.2 });

// [length, width, body height, body center height] per body style. Cars face local +X.
const BODY_DIM = {
  buggy: [3.6, 1.9, 0.5, 0.62], pickup: [4.8, 2.0, 0.7, 0.62], muscle: [4.9, 2.0, 0.62, 0.55],
  sedan: [4.6, 1.9, 0.65, 0.58], van: [5.0, 2.1, 1.5, 0.95], hauler: [7.6, 2.3, 0.8, 0.75],
  lowrider: [4.9, 2.0, 0.5, 0.45],
};
// [front wheel radius, rear wheel radius] for bodies that differ from the default 0.37.
const WHEEL_RADIUS = { buggy: [0.36, 0.5], hauler: [0.44, 0.44], lowrider: [0.34, 0.34] };

export function buildCarMesh(typeId, color) {
  const type = VEHICLE_TYPES.find((v) => v.id === typeId) || VEHICLE_TYPES[3];
  const paint = color === undefined ? type.color : color;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.35, metalness: 0.55 });
  const [len, wid, bodyH, bodyY] = BODY_DIM[type.body];

  function part(w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  let mainBody;
  if (type.body === 'buggy') {
    mainBody = part(len, bodyH, wid, bodyMat, 0, bodyY, 0);
    part(len * 0.8, 0.18, wid * 0.7, TRIM_MAT, 0, bodyY - 0.32, 0);
    part(0.5, 0.5, 0.7, TRIM_MAT, -0.4, bodyY + 0.45, -0.45);
    part(0.5, 0.5, 0.7, TRIM_MAT, -0.4, bodyY + 0.45, 0.45);
    part(0.12, 1.1, 0.12, TRIM_MAT, -0.5, bodyY + 0.9, -0.7);
    part(0.12, 1.1, 0.12, TRIM_MAT, -0.5, bodyY + 0.9, 0.7);
    part(0.12, 0.12, 1.5, TRIM_MAT, -0.5, bodyY + 1.45, 0);
  } else if (type.body === 'pickup') {
    mainBody = part(len, bodyH, wid, bodyMat, 0, bodyY, 0);
    part(1.5, 0.8, 1.8, bodyMat, 0.8, bodyY + 0.7, 0);
    part(0.9, 0.6, 1.7, GLASS_MAT, 0.95, bodyY + 0.7, 0);
    part(1.9, 0.45, 0.12, bodyMat, -1.2, bodyY + 0.55, -0.9);
    part(1.9, 0.45, 0.12, bodyMat, -1.2, bodyY + 0.55, 0.9);
    part(0.12, 0.45, 1.9, bodyMat, -2.3, bodyY + 0.55, 0);
  } else if (type.body === 'muscle') {
    mainBody = part(len, bodyH, wid, bodyMat, 0, bodyY, 0);
    part(1.0, 0.18, 0.8, TRIM_MAT, 1.5, bodyY + bodyH / 2 + 0.08, 0);
    part(2.0, 0.55, 1.7, GLASS_MAT, -0.4, bodyY + 0.6, 0);
    part(2.1, 0.1, 1.75, bodyMat, -0.4, bodyY + 0.92, 0);
    part(0.1, 0.3, 0.1, TRIM_MAT, -2.2, bodyY + 0.7, -0.7);
    part(0.1, 0.3, 0.1, TRIM_MAT, -2.2, bodyY + 0.7, 0.7);
    part(0.5, 0.08, 1.8, TRIM_MAT, -2.25, bodyY + 0.9, 0);
  } else if (type.body === 'sedan') {
    mainBody = part(len, bodyH, wid, bodyMat, 0, bodyY, 0);
    part(2.2, 0.55, 1.7, GLASS_MAT, -0.2, bodyY + 0.6, 0);
    part(2.3, 0.1, 1.75, bodyMat, -0.2, bodyY + 0.92, 0);
    part(0.9, 0.25, 1.8, bodyMat, -1.8, bodyY + 0.45, 0);
  } else if (type.body === 'van') {
    mainBody = part(len, bodyH, wid, bodyMat, 0, bodyY, 0);
    part(0.1, 0.7, 1.8, GLASS_MAT, len / 2 - 0.05, bodyY + 0.35, 0);
    part(2.6, 0.6, 0.06, GLASS_MAT, -0.4, bodyY + 0.35, -wid / 2 - 0.01);
    part(2.6, 0.6, 0.06, GLASS_MAT, -0.4, bodyY + 0.35, wid / 2 + 0.01);
    part(0.06, 1.0, 0.9, TRIM_MAT, -0.4, bodyY - 0.2, wid / 2 + 0.01);
  } else if (type.body === 'hauler') {
    part(len, 0.5, 1.8, TRIM_MAT, 0, 0.65, 0);
    mainBody = part(1.9, 1.9, 2.2, bodyMat, 2.7, 1.55, 0);
    part(0.1, 0.8, 1.9, GLASS_MAT, 3.65, 1.9, 0);
    part(1.4, 1.4, 2.2, bodyMat, 1.1, 1.3, 0);
    part(0.3, 0.3, 2.0, CHROME_MAT, 3.6, 0.55, 0);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), CHROME_MAT);
    stack.position.set(1.85, 2.2, -0.95);
    stack.castShadow = true;
    group.add(stack);
    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 12), CHROME_MAT);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0.2, 0.6, side * 1.05);
      tank.castShadow = true;
      group.add(tank);
    }
  } else { // lowrider
    mainBody = part(len, bodyH, wid, bodyMat, 0, bodyY, 0);
    part(2.0, 0.5, 1.7, GLASS_MAT, -0.3, bodyY + 0.5, 0);
    part(2.1, 0.1, 1.75, bodyMat, -0.3, bodyY + 0.78, 0);
    part(0.15, 0.22, 1.9, CHROME_MAT, len / 2 + 0.05, bodyY - 0.05, 0);
    part(0.15, 0.22, 1.9, CHROME_MAT, -len / 2 - 0.05, bodyY - 0.05, 0);
    part(0.08, 0.3, 1.2, CHROME_MAT, len / 2 + 0.02, bodyY + 0.1, 0);
  }

  // Headlights at the front, taillights at the rear.
  for (const side of [-1, 1]) {
    part(0.08, 0.18, 0.4, HEADLIGHT_MAT, len / 2 + 0.01, bodyY + 0.1, side * wid * 0.32);
    part(0.08, 0.16, 0.35, TAILLIGHT_MAT, -len / 2 - 0.01, bodyY + 0.1, side * wid * 0.32);
  }

  // Wheels: a sideways cylinder inside a pivot group. The pivot spins with
  // speed and the front pivots yaw with steering.
  const [frontR, rearR] = WHEEL_RADIUS[type.body] || [0.37, 0.37];
  const wheels = [];
  const pivots = [];
  const wheelSpots = [
    [len * 0.32, -1, frontR], [len * 0.32, 1, frontR],
    [-len * 0.32, -1, rearR], [-len * 0.32, 1, rearR],
  ];
  for (const [wx, wz, radius] of wheelSpots) {
    const pivot = new THREE.Group();
    const width = type.body === 'muscle' && wx < 0 ? 0.42 : type.body === 'hauler' ? 0.4 : 0.3;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), TIRE_MAT);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    pivot.add(tire);
    if (type.body === 'lowrider') {
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.04, 10), CHROME_MAT);
      hub.rotation.x = Math.PI / 2;
      pivot.add(hub);
    }
    pivot.position.set(wx, radius, wz * (wid / 2 - 0.02));
    group.add(pivot);
    pivots.push(pivot);
    wheels.push(tire);
  }

  group.userData.wheels = wheels;
  group.userData.pivots = pivots;
  group.userData.body = mainBody;
  group.userData.wheelR = frontR;
  return group;
}

let nextVehicleId = 1;

export function makeVehicle(typeId, x, z, angle, color) {
  const type = VEHICLE_TYPES.find((v) => v.id === typeId) || VEHICLE_TYPES[3];
  const mesh = buildCarMesh(type.id, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = -angle;
  return {
    mesh, type, id: nextVehicleId++, x, z, angle,
    speed: 0, steer: 0, color: color === undefined ? type.color : color,
    driver: null, hp: 100, alive: true,
  };
}

export function driveVehicle(V, ctl, dt, world) {
  if (!V.alive) {
    V.speed = 0;
    return;
  }
  const type = V.type;
  let topSpeed = type.top;
  if (V.hp < 30) topSpeed *= 0.4 + 0.6 * (V.hp / 30);

  V.speed += ctl.throttle * type.accel * dt;
  if (ctl.brake) {
    const decel = 30 * dt;
    V.speed -= Math.sign(V.speed) * Math.min(Math.abs(V.speed), decel);
  } else if (!ctl.throttle) {
    const drag = (2 + Math.abs(V.speed) * 0.25) * dt;
    V.speed -= Math.sign(V.speed) * Math.min(Math.abs(V.speed), drag);
  }
  V.speed = Math.max(-8, Math.min(topSpeed, V.speed));
  if (Math.abs(V.speed) < 0.02 && !ctl.throttle) V.speed = 0;

  V.steer = ctl.steer;
  const speedFrac = Math.max(0.15, Math.min(1, Math.abs(V.speed) / type.top));
  V.angle += ctl.steer * type.grip * speedFrac * dt * Math.sign(V.speed);

  const nx = V.x + Math.cos(V.angle) * V.speed * dt;
  const nz = V.z + Math.sin(V.angle) * V.speed * dt;
  if (world && world.collides(nx, nz, 1.7)) {
    V.speed *= -0.25; // bounce back off the obstacle
  } else {
    V.x = nx;
    V.z = nz;
  }

  V.mesh.position.set(V.x, 0, V.z);
  V.mesh.rotation.y = -V.angle;

  const pivots = V.mesh.userData.pivots;
  const spin = V.speed * dt / (V.mesh.userData.wheelR || 0.36);
  for (let i = 0; i < pivots.length; i++) {
    pivots[i].rotation.z -= spin;
    if (i < 2) pivots[i].rotation.y = -V.steer * 0.45;
  }
}

export function damageVehicle(V, dmg) {
  V.hp -= dmg;
  if (V.hp <= 0 && V.alive) {
    V.alive = false;
    V.speed = 0;
    V.hp = 0;
  }
}
