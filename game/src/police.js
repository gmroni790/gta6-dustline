// The law: a wanted level from 0 to 5 that spawns foot cops, patrol cars and,
// at the top, a helicopter. Heat fades when the cops lose sight of Rae, and
// a fresh paint job or a quiet spell at the garage clears it outright.
import * as THREE from 'three';
import { makeVehicle, driveVehicle } from './vehicles.js';

const FULL_TURN = Math.PI * 2;
const EDGE = 229;

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const distSq = (ax, az, bx, bz) => {
  const x = ax - bx;
  const z = az - bz;
  return x * x + z * z;
};
const wrapAngle = (a) => {
  while (a > Math.PI) a -= FULL_TURN;
  while (a < -Math.PI) a += FULL_TURN;
  return a;
};

const NAVY = new THREE.MeshLambertMaterial({ color: 0x1a2440 });
const SKIN = new THREE.MeshLambertMaterial({ color: 0xc8976a });
const BADGE = new THREE.MeshLambertMaterial({
  color: 0xffd75e,
  emissive: 0xaa8800,
  emissiveIntensity: 0.8,
});
const HELI_BODY = new THREE.MeshLambertMaterial({ color: 0x223344 });
const DARK = new THREE.MeshLambertMaterial({ color: 0x111111 });

function makeBox(w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// Navy uniform, skin head, cap and a gold badge on the chest.
function buildCop() {
  const group = new THREE.Group();
  group.add(makeBox(0.5, 0.75, 0.32, NAVY, 0, 1.05, 0));
  group.add(makeBox(0.3, 0.3, 0.3, SKIN, 0, 1.62, 0));
  group.add(makeBox(0.36, 0.1, 0.36, NAVY, 0, 1.8, 0));
  group.add(makeBox(0.06, 0.08, 0.08, BADGE, 0.27, 1.15, 0));
  group.add(makeBox(0.22, 0.65, 0.2, NAVY, 0, 0.33, 0.13));
  group.add(makeBox(0.22, 0.65, 0.2, NAVY, 0, 0.33, -0.13));
  return group;
}

export function createPolice(scene, world, rng) {
  const rand = rng || Math.random;
  const PO = { wanted: 0, cops: [], cars: [], heli: null, addWanted, clearWanted, update };
  let hideTimer = 0;
  let unseenTimer = 0;
  let decayTimer = 0;
  let lastG = null;
  const downVec = new THREE.Vector3(0, -1, 0);
  const aimVec = new THREE.Vector3();

  function addWanted(n) {
    PO.wanted = Math.min(5, PO.wanted + n);
  }

  function clearWanted() {
    clearAll(lastG);
  }

  function clearAll(G) {
    for (const cop of PO.cops) scene.remove(cop.mesh);
    PO.cops.length = 0;
    for (const car of PO.cars) {
      scene.remove(car.mesh);
      if (G && G.vehicles) {
        const idx = G.vehicles.indexOf(car);
        if (idx >= 0) G.vehicles.splice(idx, 1);
      }
    }
    PO.cars.length = 0;
    removeHeli();
    PO.wanted = 0;
    hideTimer = 0;
    unseenTimer = 0;
    decayTimer = 0;
    if (G && G.audio) G.audio.siren(false);
  }

  // Pick a clear spot in a ring around the player, a few tries then give up.
  function spawnSpot(P, minD, maxD) {
    for (let i = 0; i < 8; i++) {
      const angle = rand() * FULL_TURN;
      const dist = minD + rand() * (maxD - minD);
      const x = clampNum(P.x + Math.cos(angle) * dist, -228, 228);
      const z = clampNum(P.z + Math.sin(angle) * dist, -228, 228);
      if (!world.collides(x, z, 1)) return { x, z };
    }
    return { x: clampNum(P.x + minD, -228, 228), z: clampNum(P.z, -228, 228) };
  }

  function spawnCopAt(x, z) {
    const mesh = buildCop();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const cop = {
      mesh,
      x,
      z,
      angle: 0,
      speed: 0,
      hp: 100,
      alive: true,
      arrestT: 0,
      shootT: 0.9 + rand() * 0.5,
      deadT: 0,
    };
    PO.cops.push(cop);
    return cop;
  }

  function spawnCop(P) {
    const spot = spawnSpot(P, 40, 70);
    return spawnCopAt(spot.x, spot.z);
  }

  function spawnCar(P, G) {
    const spot = spawnSpot(P, 50, 90);
    const angle = Math.atan2(P.z - spot.z, P.x - spot.x);
    const car = makeVehicle('sedan', spot.x, spot.z, angle, 0xffffff);
    car.driver = 'cop';
    const redMat = new THREE.MeshLambertMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 1,
    });
    const blueMat = new THREE.MeshLambertMaterial({
      color: 0x2266ff,
      emissive: 0x0044ff,
      emissiveIntensity: 1,
    });
    const bar = new THREE.Group();
    bar.add(makeBox(0.3, 0.12, 0.3, redMat, 0, 0, -0.25));
    bar.add(makeBox(0.3, 0.12, 0.3, blueMat, 0, 0, 0.25));
    bar.position.set(-0.2, 1.6, 0);
    car.mesh.add(bar);
    car.lightBar = { red: redMat, blue: blueMat };
    scene.add(car.mesh);
    PO.cars.push(car);
    G.vehicles.push(car);
    return car;
  }

  function removeCar(i, G) {
    const car = PO.cars[i];
    scene.remove(car.mesh);
    PO.cars.splice(i, 1);
    if (G && G.vehicles) {
      const idx = G.vehicles.indexOf(car);
      if (idx >= 0) G.vehicles.splice(idx, 1);
    }
  }

  function makeHeli() {
    const group = new THREE.Group();
    group.add(makeBox(3.2, 1.4, 1.6, HELI_BODY, 0, 0, 0));
    group.add(makeBox(3.4, 0.3, 0.3, HELI_BODY, -3, 0.3, 0));
    group.add(makeBox(0.2, 0.9, 0.1, HELI_BODY, -4.5, 0.7, 0));
    group.add(makeBox(2.6, 0.08, 0.12, DARK, 0, -0.95, 0.7));
    group.add(makeBox(2.6, 0.08, 0.12, DARK, 0, -0.95, -0.7));
    const rotor = new THREE.Group();
    rotor.add(makeBox(7, 0.06, 0.25, DARK, 0, 0, 0));
    rotor.add(makeBox(0.25, 0.06, 7, DARK, 0, 0, 0));
    rotor.position.y = 1;
    group.add(rotor);
    scene.add(group);
    const spot = new THREE.Mesh(
      new THREE.ConeGeometry(6, 55, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffcc,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    scene.add(spot);
    return { mesh: group, rotor, spot, angle: rand() * FULL_TURN };
  }

  function removeHeli() {
    if (!PO.heli) return;
    scene.remove(PO.heli.mesh);
    scene.remove(PO.heli.spot);
    PO.heli = null;
  }

  function update(dt, G) {
    lastG = G;
    if (G.state !== 'playing') return;
    const P = G.player;
    const audio = G.audio;

    if (
      PO.wanted === 0 &&
      PO.cops.length === 0 &&
      PO.cars.length === 0 &&
      !PO.heli
    ) {
      audio.siren(false);
      return;
    }

    // Top the force up to match the wanted level.
    const wantFoot = PO.wanted >= 1 ? Math.min(6, PO.wanted + 1) : 0;
    const wantCars = PO.wanted >= 2 ? Math.min(4, PO.wanted - 1) : 0;
    let aliveCops = 0;
    for (const cop of PO.cops) if (cop.alive) aliveCops++;
    for (let i = aliveCops; i < wantFoot; i++) spawnCop(P);
    let drivenCars = 0;
    for (const car of PO.cars) if (car.driver === 'cop') drivenCars++;
    for (let i = drivenCars; i < wantCars; i++) spawnCar(P, G);

    if (PO.wanted >= 5 && !PO.heli) PO.heli = makeHeli();
    if (PO.wanted < 5 && PO.heli) removeHeli();

    // Foot cops: chase, arrest a slow player up close, shoot at 3+ stars.
    for (let i = PO.cops.length - 1; i >= 0; i--) {
      const cop = PO.cops[i];
      if (!cop.alive) {
        cop.deadT += dt;
        if (cop.deadT > 6) {
          scene.remove(cop.mesh);
          PO.cops.splice(i, 1);
        }
        continue;
      }
      if (cop.hp <= 0) {
        cop.alive = false;
        cop.mesh.rotation.z = Math.PI / 2;
        cop.mesh.position.y = 0.3;
        continue;
      }
      const dx = P.x - cop.x;
      const dz = P.z - cop.z;
      const d = Math.hypot(dx, dz) || 0.001;
      cop.angle = Math.atan2(dz, dx);
      const stepX = Math.cos(cop.angle) * 6.5 * dt;
      const stepZ = Math.sin(cop.angle) * 6.5 * dt;
      if (!world.collides(cop.x + stepX, cop.z, 0.5)) cop.x += stepX;
      if (!world.collides(cop.x, cop.z + stepZ, 0.5)) cop.z += stepZ;
      cop.x = clampNum(cop.x, -EDGE, EDGE);
      cop.z = clampNum(cop.z, -EDGE, EDGE);
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = -cop.angle;

      if (d < 1.6 && P.onFoot && P.speed < 2) {
        cop.arrestT += dt;
        if (cop.arrestT >= 1.2) {
          G.state = 'busted';
          audio.busted();
          return;
        }
      } else {
        cop.arrestT = 0;
      }

      if (PO.wanted >= 3 && d < 35) {
        const facing = Math.cos(cop.angle) * (dx / d) + Math.sin(cop.angle) * (dz / d);
        if (facing > 0.5) {
          cop.shootT -= dt;
          if (cop.shootT <= 0) {
            cop.shootT = 0.9 + rand() * 0.5;
            if (d < 45 && rand() > 0.25) P.hurt(6);
            audio.gunshot('pistol');
          }
        }
      }

      if (d > 300) {
        scene.remove(cop.mesh);
        PO.cops.splice(i, 1);
      }
    }

    // Patrol cars: pursue with a lead on a driving player, flashing lights.
    for (let i = PO.cars.length - 1; i >= 0; i--) {
      const car = PO.cars[i];
      const d = Math.hypot(P.x - car.x, P.z - car.z);
      if (d > 300 || !car.alive) {
        removeCar(i, G);
        continue;
      }
      // A stolen cruiser stays in the world but leaves the police fleet.
      if (car.driver === 'player') {
        PO.cars.splice(i, 1);
        continue;
      }
      const phase = Math.floor(G.time * 4) % 2;
      car.lightBar.red.emissiveIntensity = phase === 0 ? 2.2 : 0.2;
      car.lightBar.blue.emissiveIntensity = phase === 0 ? 0.2 : 2.2;
      if (!car.driver) continue;
      const lead = P.onFoot ? 0 : (P.speed || 0) * 0.6;
      const targetX = P.x + Math.cos(P.angle) * lead;
      const targetZ = P.z + Math.sin(P.angle) * lead;
      const diff = wrapAngle(Math.atan2(targetZ - car.z, targetX - car.x) - car.angle);
      driveVehicle(
        car,
        {
          throttle: 0.9,
          steer: clampNum(diff * 2.2, -1, 1),
          brake: d < 8 && P.speed < 2,
        },
        dt,
        world
      );
      // Pull up beside a player on foot and send the officer out on foot.
      if (P.onFoot && d < 6 && Math.abs(car.speed) < 1) {
        spawnCopAt(car.x, car.z);
        car.driver = null;
      }
    }

    // The helicopter circles overhead, spotlight tracking the player.
    if (PO.heli) {
      const heli = PO.heli;
      heli.angle += dt * 0.35;
      const hx = P.x + Math.cos(heli.angle) * 35;
      const hz = P.z + Math.sin(heli.angle) * 35;
      heli.mesh.position.set(hx, 42, hz);
      heli.mesh.rotation.y = -(heli.angle + Math.PI / 2);
      heli.rotor.rotation.y += dt * 30;
      aimVec.set(P.x - hx, -42, P.z - hz).normalize();
      heli.spot.position.set((hx + P.x) / 2, 21, (hz + P.z) / 2);
      heli.spot.quaternion.setFromUnitVectors(downVec, aimVec);
    }

    // Out of sight for a while and the heat cools, one star at a time.
    // The helicopter's eye in the sky stops the cooldown entirely.
    if (PO.wanted > 0 && !PO.heli) {
      let nearest = 1e9;
      for (const cop of PO.cops) {
        if (cop.alive) nearest = Math.min(nearest, Math.hypot(P.x - cop.x, P.z - cop.z));
      }
      for (const car of PO.cars) {
        if (car.driver) nearest = Math.min(nearest, Math.hypot(P.x - car.x, P.z - car.z));
      }
      if (nearest > 70) {
        unseenTimer += dt;
        if (unseenTimer > 8) {
          decayTimer += dt;
          if (decayTimer >= 5) {
            decayTimer = 0;
            PO.wanted -= 1;
            if (PO.wanted <= 0) {
              PO.wanted = 0;
              clearAll(G);
            }
          }
        }
      } else {
        unseenTimer = 0;
        decayTimer = 0;
      }
    }

    // Lose the heat for good: a repaint, or lying low at the garage.
    if (PO.wanted > 0) {
      const shop = world.paintShop;
      if (P.vehicle && distSq(P.x, P.z, shop.x, shop.z) < shop.r * shop.r) {
        if (G.money >= 50) {
          G.money -= 50;
          G.hud.flash('Fresh paint. Heat gone. -$50', 2500);
        } else {
          G.hud.flash('Fresh paint. Heat gone.', 2500);
        }
        clearAll(G);
      } else {
        const hideout = world.hideout;
        if (P.onFoot && distSq(P.x, P.z, hideout.x, hideout.z) < hideout.r * hideout.r) {
          hideTimer += dt;
          if (hideTimer >= 3) {
            G.hud.flash('Laid low at the garage.', 2500);
            clearAll(G);
          }
        } else {
          hideTimer = 0;
        }
      }
    }

    audio.siren(PO.wanted > 0 && PO.cars.length > 0);
  }

  return PO;
}
