// Dustline — police module.
// The wanted system: foot officers, patrol cars and, at five stars, a
// helicopter. Also owns every way the heat comes off: the paint shop, the
// garage, and simply staying out of sight long enough.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, wrapAngle, dist2 } from './utils.js';

const COP_SPEED = 6.8;
const BUST_RANGE = 1.6;
const BUST_TIME = 1.0;
const PAINT_RADIUS = 12;
const GARAGE_RADIUS = 10;
const GARAGE_TIME = 5;
const DECAY_RANGE = 60;
const DECAY_TIME = 25;
const PAINT_COST = 100;
const HELI_HEIGHT = 40;
const HELI_RADIUS = 24;

// How many of each unit each wanted level fields.
const COPS_WANTED = [0, 2, 2, 2, 2, 3];
const CARS_WANTED = [0, 0, 2, 3, 4, 4];

export function createPolice(ctx) {
  const { scene, state, rng } = ctx;

  const cops = []; // { group, legL, legR, phase, closeTime }
  const cars = []; // { vehicle, redMat, blueMat }
  let heli = null; // { group, rotor, angle }
  let spawnTimer = 0;
  let garageTimer = 0;
  let unseenTimer = 0;

  function toast(text) {
    if (ctx.hud && typeof ctx.hud.showToast === 'function') ctx.hud.showToast(text);
  }

  function setSiren(on) {
    // Siren is a function on the audio module: call it, never assign over it.
    if (ctx.audio && typeof ctx.audio.siren === 'function') ctx.audio.siren(on);
  }

  // ----- Builders -----

  // One box helper shared by the officer and helicopter builders.
  function addBox(parent, w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function buildOfficer() {
    const g = new THREE.Group();
    const uniform = new THREE.MeshStandardMaterial({ color: 0x232c3d, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb98a68, roughness: 0.8 });
    const badge = new THREE.MeshStandardMaterial({ color: 0xd8c25a, roughness: 0.4, metalness: 0.6 });
    addBox(g, 0.6, 0.76, 0.34, uniform, 0, 1.18, 0);
    addBox(g, 0.1, 0.12, 0.02, badge, 0.16, 1.32, 0.18); // badge on the chest
    addBox(g, 0.34, 0.34, 0.34, skin, 0, 1.76, 0);
    addBox(g, 0.4, 0.1, 0.4, dark, 0, 1.97, 0); // cap
    addBox(g, 0.36, 0.05, 0.2, dark, 0, 1.92, 0.26); // cap brim
    for (const sx of [-0.4, 0.4]) addBox(g, 0.16, 0.66, 0.2, uniform, sx, 1.2, 0);
    const legs = [];
    for (const sx of [-0.16, 0.16]) {
      const leg = new THREE.Group();
      leg.position.set(sx, 0.82, 0);
      g.add(leg);
      addBox(leg, 0.2, 0.82, 0.24, dark, 0, -0.41, 0);
      legs.push(leg);
    }
    return { group: g, legL: legs[0], legR: legs[1], phase: rng ? rng.range(0, 6) : 0, closeTime: 0 };
  }

  function buildHeli() {
    const g = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.2 });
    addBox(g, 2.2, 1.2, 3.4, hull, 0, 0, 0); // body
    addBox(g, 1.8, 0.7, 0.9, glass, 0, 0.15, 1.5); // cockpit glass
    addBox(g, 0.45, 0.45, 3.6, hull, 0, 0.2, -3.2); // tail boom
    addBox(g, 0.1, 1.1, 0.6, hull, 0, 0.5, -4.8); // tail fin
    addBox(g, 2.6, 0.08, 0.3, hull, 0, -0.75, 0.6); // skid
    addBox(g, 2.6, 0.08, 0.3, hull, 0, -0.75, -0.6); // skid
    const rotor = addBox(g, 8.5, 0.08, 0.4, hull, 0, 0.85, 0);
    // Spotlight cone: apex at the helicopter, wide end on the ground.
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, HELI_HEIGHT, 20, 1, true), coneMat);
    cone.position.y = -HELI_HEIGHT / 2;
    g.add(cone);
    return { group: g, rotor, angle: 0 };
  }

  // ----- Spawning -----

  function spawnCop() {
    const world = ctx.world;
    const p = ctx.player ? ctx.player.group.position : { x: 0, z: 0 };
    let x = p.x + 30;
    let z = p.z;
    if (world && world.intersections && world.intersections.length) {
      const near = world.intersections.filter((pt) => {
        const d = dist2(p.x, p.z, pt.x, pt.z);
        return d > 20 && d < 90;
      });
      const spot = rng.pick(near.length ? near : world.intersections);
      x = spot.x;
      z = spot.z;
    }
    const cop = buildOfficer();
    cop.group.position.set(x, 0, z);
    scene.add(cop.group);
    cops.push(cop);
  }

  function spawnCar() {
    const world = ctx.world;
    const vehicles = ctx.vehicles;
    if (!vehicles) return;
    const p = ctx.player ? ctx.player.group.position : { x: 0, z: 0 };
    let x = p.x + 40;
    let z = p.z;
    let heading = 0;
    if (world && world.roads && world.roads.length) {
      for (let i = 0; i < 12; i++) {
        const r = rng.pick(world.roads);
        const t = rng.next();
        const cx = r.ax + (r.bx - r.ax) * t;
        const cz = r.az + (r.bz - r.az) * t;
        const d = dist2(p.x, p.z, cx, cz);
        if (d > 25 && d < 80) {
          x = cx;
          z = cz;
          heading = Math.atan2(r.bx - r.ax, r.bz - r.az);
          break;
        }
      }
    }
    const vehicle = vehicles.spawn('sedan', x, z, heading);
    if (!vehicle) return;
    vehicle.driver = 'police';
    // Light bar: two small emissive boxes on the roof, flashed alternately.
    // The sedan cabin tops out at y 1.55, so the bar sits just above it.
    const redMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2040ff, emissiveIntensity: 0.2 });
    addBox(vehicle.group, 0.34, 0.14, 0.2, redMat, -0.34, 1.62, 0);
    addBox(vehicle.group, 0.34, 0.14, 0.2, blueMat, 0.34, 1.62, 0);
    cars.push({ vehicle, redMat, blueMat });
  }

  function spawnHeli() {
    heli = buildHeli();
    const p = ctx.player ? ctx.player.group.position : { x: 0, z: 0 };
    heli.group.position.set(p.x + HELI_RADIUS, HELI_HEIGHT, p.z);
    scene.add(heli.group);
  }

  // ----- Removal -----

  function removeCop(cop) {
    scene.remove(cop.group);
    const i = cops.indexOf(cop);
    if (i >= 0) cops.splice(i, 1);
  }
  function removeCar(rec) {
    rec.vehicle.remove();
    const i = cars.indexOf(rec);
    if (i >= 0) cars.splice(i, 1);
  }
  function removeHeli() {
    if (!heli) return;
    scene.remove(heli.group);
    heli = null;
  }
  function disperseAll() {
    while (cops.length) removeCop(cops[0]);
    while (cars.length) removeCar(cars[0]);
    removeHeli();
  }

  // ----- Pursuit -----

  function updateCop(cop, dt, px, pz, onFoot) {
    const g = cop.group;
    const dx = px - g.position.x;
    const dz = pz - g.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      const h = Math.atan2(dx, dz);
      g.rotation.y = h;
      g.position.x += Math.sin(h) * COP_SPEED * dt;
      g.position.z += Math.cos(h) * COP_SPEED * dt;
      cop.phase += dt * 9;
      const s = Math.sin(cop.phase) * 0.6;
      cop.legL.rotation.x = s;
      cop.legR.rotation.x = -s;
    }
    // A grab needs a full second of close contact with a player on foot.
    if (onFoot && d < BUST_RANGE) {
      cop.closeTime += dt;
      if (cop.closeTime >= BUST_TIME && state.mode === 'playing') state.mode = 'busted';
    } else cop.closeTime = 0;
  }

  function updateCar(rec, dt, px, pz, playerCar) {
    const v = rec.vehicle;
    const dx = px - v.group.position.x;
    const dz = pz - v.group.position.z;
    const d = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    const err = wrapAngle(desired - v.heading);
    const steer = clamp(err * 2.2, -1, 1);
    if (!playerCar && d < 5) {
      // Don't run the player over: pull up and let the officers move in.
      v.drive(0, steer, true, dt);
    } else {
      // Higher wanted levels drive harder: no braking for corners.
      const brake = state.wanted < 3 && Math.abs(err) > 2.4 && v.speed > 4;
      v.drive(d > 6 ? 1 : 0.55, steer, brake, dt);
    }
    // Ramming: grind against the player's car and shake the driver.
    if (playerCar && d < 4.2) {
      playerCar.damage(14 * dt);
      state.health = Math.max(0, state.health - 4 * dt);
    }
    // Flash the light bar red/blue, about five swaps a second.
    const phase = Math.floor(state.time * 5) % 2 === 0;
    rec.redMat.emissiveIntensity = phase ? 2.2 : 0.15;
    rec.blueMat.emissiveIntensity = phase ? 0.15 : 2.2;
  }

  function updateHeli(dt, px, pz) {
    heli.angle += dt * 0.32;
    const a = heli.angle;
    heli.group.position.set(px + Math.cos(a) * HELI_RADIUS, HELI_HEIGHT, pz + Math.sin(a) * HELI_RADIUS);
    heli.group.rotation.y = Math.atan2(px - heli.group.position.x, pz - heli.group.position.z);
    heli.rotor.rotation.y += dt * 26;
  }

  // Keep the unit count matched to the wanted level, spawning one at a time.
  function maintain(dt) {
    const w = clamp(state.wanted, 0, 5);
    const wantCops = COPS_WANTED[w];
    const wantCars = CARS_WANTED[w];
    spawnTimer -= dt;
    if (spawnTimer <= 0 && cops.length < wantCops) { spawnCop(); spawnTimer = 0.5; }
    else if (spawnTimer <= 0 && cars.length < wantCars) { spawnCar(); spawnTimer = 0.5; }
    while (cops.length > wantCops) removeCop(cops[cops.length - 1]);
    while (cars.length > wantCars) removeCar(cars[cars.length - 1]);
    if (w >= 5 && !heli) spawnHeli();
    if (w < 5 && heli) removeHeli();
  }

  // ----- Evasion -----

  function updateEvasion(dt, px, pz, onFoot, playerCar) {
    if (state.wanted <= 0) return;
    const places = ctx.world ? ctx.world.places : null;
    if (!places) return;
    // Paint shop: drive through in a car and the heat is gone, for $100.
    const paint = places.paintShop;
    if (playerCar && paint && dist2(px, pz, paint.x, paint.z) < PAINT_RADIUS) {
      if (state.money >= PAINT_COST) state.money -= PAINT_COST;
      clearHeat();
      toast('Fresh paint — the heat is off');
      return;
    }
    // Garage: hide on foot for five unbroken seconds.
    const garage = places.garage;
    if (onFoot && garage && dist2(px, pz, garage.x, garage.z) < GARAGE_RADIUS) {
      garageTimer += dt;
      if (garageTimer >= GARAGE_TIME) { clearHeat(); toast('Laid low in the garage — heat cleared'); }
    } else garageTimer = 0;
  }

  function updateDecay(dt, nearest) {
    if (state.wanted <= 0) { unseenTimer = 0; return; }
    if (nearest > DECAY_RANGE) {
      unseenTimer += dt;
      if (unseenTimer >= DECAY_TIME) {
        state.wanted = Math.max(0, state.wanted - 1);
        unseenTimer = 0;
        toast('The heat is cooling off');
      }
    } else unseenTimer = 0;
  }

  function addHeat(amount) {
    state.wanted = clamp(Math.round(state.wanted + amount), 0, 5);
  }

  function clearHeat() {
    state.wanted = 0;
    garageTimer = 0;
    unseenTimer = 0;
    disperseAll();
  }

  function update(dt) {
    const player = ctx.player;
    if (!player) return;
    const px = player.group.position.x;
    const pz = player.group.position.z;
    const onFoot = player.onFoot;
    const playerCar = player.car;

    if (state.mode === 'busted' || state.mode === 'wasted') {
      disperseAll();
      setSiren(false);
      return;
    }
    if (state.mode !== 'playing') { setSiren(false); return; }

    maintain(dt);

    // A stolen patrol car stops being a pursuer.
    for (let i = cars.length - 1; i >= 0; i--) {
      if (cars[i].vehicle.driver === 'player') cars.splice(i, 1);
    }

    let nearest = Infinity;
    for (const c of cops) {
      updateCop(c, dt, px, pz, onFoot);
      nearest = Math.min(nearest, dist2(px, pz, c.group.position.x, c.group.position.z));
    }
    for (const rec of cars) {
      updateCar(rec, dt, px, pz, playerCar);
      const v = rec.vehicle;
      nearest = Math.min(nearest, dist2(px, pz, v.group.position.x, v.group.position.z));
    }
    if (heli) {
      updateHeli(dt, px, pz);
      nearest = Math.min(nearest, dist2(px, pz, heli.group.position.x, heli.group.position.z));
    }

    updateEvasion(dt, px, pz, onFoot, playerCar);
    updateDecay(dt, nearest);
    setSiren(state.wanted > 0);
  }

  return {
    get wanted() {
      return state.wanted;
    },
    cops,
    cars,
    get heli() {
      return heli;
    },
    update,
    addHeat,
    clearHeat,
  };
}
