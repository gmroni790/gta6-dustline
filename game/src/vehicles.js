// Dustline — vehicles.js
//
// Seven desert vehicle types, each built from boxes, cylinders and
// simple shapes in three.js. Every model faces positive z, so a
// vehicle's rotation about y is exactly its heading.
//
// The factory returns the type table, a spawn function and the live
// list of vehicles. Driving physics live on each vehicle object:
// throttle, steering that weakens at speed, drag, and collision
// against the world's colliders and bounds.

import * as THREE from '../vendor/three.module.min.js';
import { clamp } from './utils.js';

// id, display name, top speed (units/s), acceleration, turn rate
// (radians/s at low speed), length, width, paint colours.
const TYPES = [
  { id: 'buggy', name: 'Dune Buggy', topSpeed: 34, accel: 16, turnRate: 2.3, length: 3.6, width: 1.9, colors: [0xd8c24a, 0xc25a2e, 0x7ab648] },
  { id: 'pickup', name: 'Pickup Truck', topSpeed: 30, accel: 12, turnRate: 1.8, length: 5.0, width: 2.0, colors: [0x8a2f28, 0x2e5a8a, 0xd8d0c0] },
  { id: 'sedan', name: 'Sedan', topSpeed: 32, accel: 13, turnRate: 2.0, length: 4.6, width: 1.9, colors: [0x3a6ea5, 0xb8b0a0, 0x222222] },
  { id: 'taxi', name: 'Taxi Cab', topSpeed: 32, accel: 13, turnRate: 2.0, length: 4.6, width: 1.9, colors: [0xf2c230, 0xf2c230, 0xe8b020] },
  { id: 'van', name: 'Delivery Van', topSpeed: 26, accel: 9, turnRate: 1.5, length: 5.4, width: 2.1, colors: [0xe8e4da, 0x4a7a4a, 0x8a8a92] },
  { id: 'muscle', name: 'Muscle Car', topSpeed: 40, accel: 18, turnRate: 1.9, length: 4.8, width: 2.0, colors: [0xa01818, 0x181818, 0x1a3a6a] },
  { id: 'semi', name: 'Semi Hauler', topSpeed: 24, accel: 7, turnRate: 1.2, length: 12.0, width: 2.5, colors: [0x2a6a8a, 0x8a2a2a, 0xd8d8d8] },
];

// Materials shared by every vehicle, so a new spawn is cheap.
const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242c });
const tireMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xfff2a0 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0x550000 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const trailerMat = new THREE.MeshLambertMaterial({ color: 0xd8d4c8 });

// Paint colours repeat across spawns, so cache one material per colour
// instead of allocating a fresh material for every vehicle.
const paintCache = new Map();
function paintMat(color) {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    paintCache.set(color, m);
  }
  return m;
}

// Wheel geometry is pre-rotated so each wheel spins about the x axis.
const carWheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
carWheelGeo.rotateZ(Math.PI / 2);
const bigWheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.34, 10);
bigWheelGeo.rotateZ(Math.PI / 2);
const unitBox = new THREE.BoxGeometry(1, 1, 1);

// One small box, scaled and placed. Keeps the builders below terse.
function box(parent, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Build one vehicle's mesh. Returns the group plus its spinning wheels.
function buildVehicleMesh(type, paintColor) {
  const group = new THREE.Group();
  const wheels = [];
  const paint = paintMat(paintColor);
  const L = type.length;
  const W = type.width;

  function addWheel(geo, radius, x, z) {
    const wheel = new THREE.Mesh(geo, tireMat);
    wheel.position.set(x, radius, z);
    group.add(wheel);
    wheels.push({ mesh: wheel, radius });
  }

  function addLights(y) {
    box(group, headMat, 0.35, 0.18, 0.12, -W / 2 + 0.45, y, L / 2 + 0.02);
    box(group, headMat, 0.35, 0.18, 0.12, W / 2 - 0.45, y, L / 2 + 0.02);
    box(group, tailMat, 0.3, 0.15, 0.12, -W / 2 + 0.45, y, -L / 2 - 0.02);
    box(group, tailMat, 0.3, 0.15, 0.12, W / 2 - 0.45, y, -L / 2 - 0.02);
  }

  if (type.id === 'buggy') {
    // Open buggy: low tub, a seat, a roll cage, big knobbly wheels.
    box(group, paint, W, 0.5, L, 0, 0.55, 0);
    box(group, darkMat, W * 0.7, 0.5, 0.9, 0, 0.95, -0.3);
    box(group, darkMat, 0.12, 0.9, 0.12, -W / 2 + 0.25, 1.15, 0.3);
    box(group, darkMat, 0.12, 0.9, 0.12, W / 2 - 0.25, 1.15, 0.3);
    box(group, darkMat, W - 0.4, 0.12, 0.12, 0, 1.6, 0.3);
    addWheel(bigWheelGeo, 0.5, -W / 2 + 0.25, L / 2 - 0.7);
    addWheel(bigWheelGeo, 0.5, W / 2 - 0.25, L / 2 - 0.7);
    addWheel(bigWheelGeo, 0.5, -W / 2 + 0.25, -L / 2 + 0.7);
    addWheel(bigWheelGeo, 0.5, W / 2 - 0.25, -L / 2 + 0.7);
    addLights(0.6);
  } else if (type.id === 'van') {
    // Tall box van with a dark windshield slab on the nose.
    box(group, paint, W, 1.9, L, 0, 1.25, 0);
    box(group, glassMat, W * 0.9, 0.7, 0.12, 0, 1.7, L / 2 - 0.04);
    box(group, darkMat, W * 0.92, 0.25, 0.1, 0, 0.55, L / 2 + 0.02);
    addWheel(carWheelGeo, 0.36, -W / 2 + 0.2, L / 2 - 0.9);
    addWheel(carWheelGeo, 0.36, W / 2 - 0.2, L / 2 - 0.9);
    addWheel(carWheelGeo, 0.36, -W / 2 + 0.2, -L / 2 + 0.9);
    addWheel(carWheelGeo, 0.36, W / 2 - 0.2, -L / 2 + 0.9);
    addLights(0.75);
  } else if (type.id === 'semi') {
    // Cab up front, long trailer behind, six wheels, one exhaust stack.
    box(group, paint, W, 1.6, 2.6, 0, 0.95, 4.7);
    box(group, glassMat, W * 0.9, 0.7, 0.12, 0, 1.35, 5.95);
    box(group, darkMat, W, 0.35, 0.3, 0, 0.35, 5.9);
    box(group, trailerMat, W * 0.98, 2.6, 9.2, 0, 1.6, -1.4);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6), darkMat);
    stack.position.set(W / 2 - 0.2, 2.2, 3.4);
    group.add(stack);
    addWheel(bigWheelGeo, 0.5, -W / 2 + 0.25, 4.8);
    addWheel(bigWheelGeo, 0.5, W / 2 - 0.25, 4.8);
    addWheel(bigWheelGeo, 0.5, -W / 2 + 0.25, -1.5);
    addWheel(bigWheelGeo, 0.5, W / 2 - 0.25, -1.5);
    addWheel(bigWheelGeo, 0.5, -W / 2 + 0.25, -4.5);
    addWheel(bigWheelGeo, 0.5, W / 2 - 0.25, -4.5);
    addLights(0.9);
  } else {
    // Ordinary cars: body, cabin with a glass band, four wheels.
    box(group, paint, W, 0.7, L, 0, 0.6, 0);
    if (type.id === 'pickup') {
      // Cab forward, open bed behind with low side walls.
      box(group, paint, W * 0.85, 0.6, L * 0.3, 0, 1.25, L * 0.2);
      box(group, glassMat, W * 0.87, 0.4, L * 0.32, 0, 1.25, L * 0.2);
      box(group, paint, 0.12, 0.35, L * 0.42, -W / 2 + 0.06, 1.1, -L * 0.26);
      box(group, paint, 0.12, 0.35, L * 0.42, W / 2 - 0.06, 1.1, -L * 0.26);
    } else {
      box(group, paint, W * 0.85, 0.6, L * 0.45, 0, 1.25, -L * 0.05);
      box(group, glassMat, W * 0.87, 0.4, L * 0.47, 0, 1.25, -L * 0.05);
    }
    if (type.id === 'taxi') {
      box(group, headMat, 0.7, 0.22, 0.3, 0, 1.65, -L * 0.05);
    }
    if (type.id === 'muscle') {
      box(group, darkMat, 0.7, 0.12, 0.9, 0, 1.0, L * 0.28);
      box(group, darkMat, W * 0.9, 0.08, 0.4, 0, 1.05, -L / 2 + 0.25);
    }
    addWheel(carWheelGeo, 0.36, -W / 2 + 0.2, L / 2 - 0.9);
    addWheel(carWheelGeo, 0.36, W / 2 - 0.2, L / 2 - 0.9);
    addWheel(carWheelGeo, 0.36, -W / 2 + 0.2, -L / 2 + 0.9);
    addWheel(carWheelGeo, 0.36, W / 2 - 0.2, -L / 2 + 0.9);
    addLights(0.7);
  }

  return { group, wheels };
}

export function createVehicles(ctx) {
  const all = [];

  function spawn(typeId, x, z, heading) {
    let type = null;
    for (const t of TYPES) {
      if (t.id === typeId) type = t;
    }
    if (!type) type = ctx.rng.pick(TYPES);
    const paint = ctx.rng.pick(type.colors);
    const built = buildVehicleMesh(type, paint);
    built.group.position.set(x, 0, z);
    built.group.rotation.y = heading;
    ctx.scene.add(built.group);

    const vehicle = {
      group: built.group,
      type,
      speed: 0,
      heading,
      health: 100,
      driver: 'none',
      _wheels: built.wheels,
      _radius: ((type.length + type.width) / 4) * 0.9,

      drive(throttle, steering, brake, dt) {
        const top = type.topSpeed;
        // A wrecked vehicle (health zero) is dead: no throttle, and the
        // brakes drag it to a stop. Time to find another ride.
        if (vehicle.health <= 0) {
          throttle = 0;
          brake = true;
        }
        if (brake) {
          const decel = 26 * dt;
          if (Math.abs(vehicle.speed) <= decel) vehicle.speed = 0;
          else vehicle.speed -= Math.sign(vehicle.speed) * decel;
        } else {
          vehicle.speed += throttle * type.accel * dt;
        }
        // Air drag always pulls at speed; coasting slows down faster.
        vehicle.speed -= vehicle.speed * 0.25 * dt;
        if (!brake && throttle === 0) vehicle.speed -= vehicle.speed * 0.6 * dt;
        vehicle.speed = clamp(vehicle.speed, -top * 0.4, top);

        // Steering bites only while moving, and weakens as speed rises.
        // Reversing flips the steering sense, as in a real car.
        const grip = Math.min(1, Math.abs(vehicle.speed) / 3);
        const rate = type.turnRate / (1 + Math.abs(vehicle.speed) * 0.045);
        vehicle.heading += steering * rate * grip * dt * (vehicle.speed >= 0 ? 1 : -1);

        const fx = Math.sin(vehicle.heading);
        const fz = Math.cos(vehicle.heading);
        const step = vehicle.speed * dt;
        const nx = vehicle.group.position.x + fx * step;
        const nz = vehicle.group.position.z + fz * step;

        // Would this spot hit a wall, a building or the edge of the map?
        const world = ctx.world;
        const hits = (px, pz) => {
          if (!world) return false;
          const b = world.bounds;
          const m = vehicle._radius;
          if (px < b.minX + m || px > b.maxX - m || pz < b.minZ + m || pz > b.maxZ - m) return true;
          for (const c of world.colliders) {
            const rr = c.radius + vehicle._radius;
            const dx = px - c.x;
            const dz = pz - c.z;
            if (dx * dx + dz * dz < rr * rr) return true;
          }
          return false;
        };

        // Move one axis at a time so a glancing hit slides along the wall
        // instead of stopping the car dead.
        const impact = Math.abs(vehicle.speed);
        let crashed = false;
        if (!hits(nx, vehicle.group.position.z)) vehicle.group.position.x = nx;
        else crashed = true;
        if (!hits(vehicle.group.position.x, nz)) vehicle.group.position.z = nz;
        else crashed = true;
        vehicle.group.rotation.y = vehicle.heading;
        if (crashed) {
          if (impact > 9) vehicle.damage((impact - 9) * 1.1);
          vehicle.speed *= 0.35;
        }
      },

      place(x, z, heading) {
        vehicle.group.position.set(x, 0, z);
        vehicle.heading = heading;
        vehicle.group.rotation.y = heading;
        vehicle.speed = 0;
      },

      damage(amount) {
        vehicle.health = Math.max(0, vehicle.health - amount);
      },

      remove() {
        ctx.scene.remove(vehicle.group);
        const i = all.indexOf(vehicle);
        if (i >= 0) all.splice(i, 1);
      },
    };

    all.push(vehicle);
    return vehicle;
  }

  // Visual details only: spin every wheel to match its vehicle's speed.
  function update(dt) {
    for (const v of all) {
      const spin = v.speed * dt;
      for (const w of v._wheels) w.mesh.rotation.x += spin / w.radius;
    }
  }

  return { types: TYPES, spawn, all, update };
}
