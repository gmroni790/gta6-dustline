// Dustline — world.js
//
// Builds the whole desert highway city: a sand plain crossed by an
// asphalt road grid, adobe Old Town in the west, glass towers downtown,
// a canyon rim along the east edge, a quarry in the north-east and a
// truck stop in the south. Every placement comes from the shared seeded
// rng, so one seed always builds the same city.
//
// The factory returns a description of the city that the other modules
// drive on, walk through and collide with.

import * as THREE from '../vendor/three.module.min.js';
import { clamp } from './utils.js';

// Road centre lines, in world units. Roads run the full width of the
// playable area, so the blocks between them are 100 units apart.
const GRID = [-300, -200, -100, 0, 100, 200, 300];
const ROAD_HALF = 6; // half the asphalt width
const WALK_HALF = 8.5; // half the sidewalk width
const EDGE = 380; // where the north-south roads end
const EAST_END = 360; // where east-west roads stop, short of the canyon

export function createWorld(ctx) {
  const { scene, rng } = ctx;

  // --- sky, haze and light ------------------------------------------------
  // A hazy pale-blue sky, warm sun and dusty ground bounce. Only two
  // lights in the whole scene, to stay cheap on a software renderer.
  scene.background = new THREE.Color(0x9fc3d8);
  scene.fog = new THREE.Fog(0xd8c49a, 170, 720);

  const sun = new THREE.DirectionalLight(0xffe2b0, 1.25);
  sun.position.set(160, 240, 90);
  scene.add(sun);
  const sky = new THREE.HemisphereLight(0xbfd9e8, 0xc9a06b, 0.95);
  scene.add(sky);

  // --- ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(960, 960),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // --- road network ---------------------------------------------------------
  // North-south roads run the full depth; east-west roads stop short of
  // the canyon rim so no road ever runs under a rock formation.
  const roads = [];
  for (const x of GRID) roads.push({ ax: x, az: -EDGE, bx: x, bz: EDGE });
  for (const z of GRID) roads.push({ ax: -EDGE, az: z, bx: EAST_END, bz: z });

  // Every grid crossing is an intersection, for traffic to turn at.
  const intersections = [];
  for (const x of GRID) {
    for (const z of GRID) intersections.push({ x, z });
  }

  // True when (x, z) sits on a road, plus a safety margin.
  function nearRoad(x, z, pad) {
    for (const r of roads) {
      if (r.ax === r.bx) {
        if (Math.abs(x - r.ax) < ROAD_HALF + pad && z >= r.az - pad && z <= r.bz + pad) return true;
      } else if (Math.abs(z - r.az) < ROAD_HALF + pad && x >= r.ax - pad && x <= r.bx + pad) {
        return true;
      }
    }
    return false;
  }

  // --- named places and relic spots -----------------------------------------
  // Declared before the buildings so construction keeps clear of them.
  const places = {
    playerStart: { x: 0, z: 20 },
    paintShop: { x: -60, z: -140 },
    garage: { x: 60, z: 140 },
    diner: { x: -140, z: 60 },
    truckStop: { x: 0, z: 338 },
    quarry: { x: 268, z: -268 },
    canyonOverlook: { x: 352, z: 40 },
    downtown: { x: 0, z: 0 },
    highwayGate: { x: 0, z: 378 },
  };

  const relicSpots = [
    { x: -260, z: -140, label: 'Old Well' },
    { x: 60, z: -40, label: 'Downtown Plaza' },
    { x: 250, z: -250, label: 'Quarry Edge' },
    { x: 352, z: 60, label: 'Canyon Overlook' },
    { x: -25, z: 350, label: 'Truck Stop Sign' },
    { x: -320, z: 320, label: 'Dune Shrine' },
    { x: 40, z: -360, label: 'North Dune' },
    { x: 330, z: 250, label: 'Mesa Rock' },
    { x: -140, z: 130, label: 'Diner Alley' },
    { x: 180, z: -60, label: 'Highway Memorial' },
  ];

  // Circles that buildings and props must stay out of: the named places,
  // the relic spots and the quarry pit itself.
  const keepClear = [];
  for (const p of Object.values(places)) keepClear.push({ x: p.x, z: p.z, r: 24 });
  for (const s of relicSpots) keepClear.push({ x: s.x, z: s.z, r: 17 });
  keepClear.push({ x: 268, z: -268, r: 34 });

  function blocked(x, z, r) {
    for (const k of keepClear) {
      const dx = x - k.x;
      const dz = z - k.z;
      if (dx * dx + dz * dz < (r + k.r) * (r + k.r)) return true;
    }
    return false;
  }

  // --- road surfaces and centre dashes --------------------------------------
  // Each road gets a pale sidewalk base with a dark asphalt strip on top.
  // The centre dashes for every road live in one InstancedMesh.
  const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x35322e });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xbfae8e });
  const dashGeo = new THREE.PlaneGeometry(0.5, 3);
  dashGeo.rotateX(-Math.PI / 2);
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xe8d97a });

  let dashCount = 0;
  for (const r of roads) {
    const len = Math.abs(r.bx - r.ax) + Math.abs(r.bz - r.az);
    dashCount += Math.floor(len / 14);
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const dummy = new THREE.Object3D();
  let dashIndex = 0;

  for (const r of roads) {
    const vertical = r.ax === r.bx;
    const len = vertical ? r.bz - r.az : r.bx - r.ax;
    const cx = (r.ax + r.bx) / 2;
    const cz = (r.az + r.bz) / 2;

    const walk = new THREE.Mesh(
      new THREE.PlaneGeometry(vertical ? WALK_HALF * 2 : len, vertical ? len : WALK_HALF * 2),
      walkMat
    );
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(cx, 0.01, cz);
    scene.add(walk);

    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(vertical ? ROAD_HALF * 2 : len, vertical ? len : ROAD_HALF * 2),
      asphaltMat
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(cx, 0.02, cz);
    scene.add(strip);

    const n = Math.floor(len / 14);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      dummy.position.set(
        vertical ? cx : r.ax + (r.bx - r.ax) * t,
        0.03,
        vertical ? r.az + (r.bz - r.az) * t : cz
      );
      dummy.rotation.set(0, vertical ? 0 : Math.PI / 2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dashes.setMatrixAt(dashIndex++, dummy.matrix);
    }
  }
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  // --- buildings --------------------------------------------------------------
  // One box per building, sharing a small set of materials. Blocks near
  // the centre grow glass towers, the west stays low adobe, and the rest
  // is mid-rise sandstone. Colliders are circles that never reach a road:
  // footprints stay inside the block with room to spare.
  const colliders = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const matSet = (colors) => colors.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const adobeMats = matSet([0xc08a5e, 0xb57a4e, 0xcf9a6b]);
  const stoneMats = matSet([0xd2a679, 0xc99a6b, 0xb98a5f, 0xe0c090]);
  const glassMats = matSet([0x7fa8b8, 0x9db8c4, 0x6b8fa3, 0x8fa9b5]);

  for (let gx = 0; gx < GRID.length - 1; gx++) {
    for (let gz = 0; gz < GRID.length - 1; gz++) {
      const cx = (GRID[gx] + GRID[gx + 1]) / 2;
      const cz = (GRID[gz] + GRID[gz + 1]) / 2;
      const downtown = Math.abs(cx) <= 150 && Math.abs(cz) <= 150;
      const oldTown = cx < -200;
      const mats = downtown ? glassMats : oldTown ? adobeMats : stoneMats;
      const count = rng.int(2, 5);
      const placed = [];

      for (let n = 0; n < count; n++) {
        let ok = false;
        let bx = 0;
        let bz = 0;
        let w = 0;
        let d = 0;
        let h = 0;
        for (let attempt = 0; attempt < 9 && !ok; attempt++) {
          w = rng.range(10, 24);
          d = rng.range(10, 24);
          h = downtown ? rng.range(35, 85) : oldTown ? rng.range(6, 12) : rng.range(8, 26);
          bx = cx + rng.range(-26, 26);
          bz = cz + rng.range(-26, 26);
          if (blocked(bx, bz, Math.hypot(w / 2, d / 2))) continue;
          ok = true;
          for (const p of placed) {
            const overlapX = Math.abs(bx - p.x) < (w + p.w) / 2 + 4;
            const overlapZ = Math.abs(bz - p.z) < (d + p.d) / 2 + 4;
            if (overlapX && overlapZ) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;
        const mesh = new THREE.Mesh(unitBox, rng.pick(mats));
        mesh.scale.set(w, h, d);
        mesh.position.set(bx, h / 2, bz);
        scene.add(mesh);
        placed.push({ x: bx, z: bz, w, d });
        colliders.push({ x: bx, z: bz, radius: Math.hypot(w / 2, d / 2) * 0.8 });
      }
    }
  }

  // --- canyon rim ---------------------------------------------------------------
  // Tall rock slabs along the east edge, set between the east-west roads
  // so no formation ever stands on asphalt.
  const rockMats = matSet([0xa85f3c, 0x96543a, 0xb56a44]);
  const canyonZ = [-350, -250, -150, -50, 50, 150, 250, 350];
  for (const z of canyonZ) {
    for (const xBase of [372, 386]) {
      const w = rng.range(10, 16);
      const h = rng.range(18, 46);
      const d = rng.range(14, 26);
      const x = xBase + rng.range(-3, 3);
      const zz = z + rng.range(-12, 12);
      const slab = new THREE.Mesh(unitBox, rng.pick(rockMats));
      slab.scale.set(w, h, d);
      slab.position.set(x, h / 2 - 1, zz);
      slab.rotation.y = rng.range(-0.15, 0.15);
      scene.add(slab);
      colliders.push({ x, z: zz, radius: Math.hypot(w / 2, d / 2) * 0.8 });
    }
  }

  // --- quarry pit -----------------------------------------------------------------
  // A dark scooped disc in the north-east block, ringed with boulders.
  const pit = new THREE.Mesh(
    new THREE.CircleGeometry(24, 28),
    new THREE.MeshLambertMaterial({ color: 0x6b5a48 })
  );
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(268, 0.015, -268);
  scene.add(pit);

  const rimGeo = new THREE.DodecahedronGeometry(1.6, 0);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x8a7a66 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const rx = 268 + Math.cos(a) * 26;
    const rz = -268 + Math.sin(a) * 26;
    if (rx > 290) continue; // keep the boulders off the x = 300 road
    const rock = new THREE.Mesh(rimGeo, rimMat);
    rock.position.set(rx, 0.8, rz);
    rock.scale.setScalar(rng.range(0.8, 1.8));
    rock.rotation.y = rng.range(0, Math.PI);
    scene.add(rock);
    colliders.push({ x: rx, z: rz, radius: 2.2 });
  }

  // --- truck stop -------------------------------------------------------------------
  // A wide lot in the south with fuel pumps under a canopy, a shop and a
  // tall sign. The north-south road passes through the lot, as it should.
  const lot = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 46),
    new THREE.MeshLambertMaterial({ color: 0x9a938a })
  );
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(0, 0.012, 338);
  scene.add(lot);

  const pumpGeo = new THREE.BoxGeometry(1.2, 1.8, 0.8);
  const pumpMat = new THREE.MeshLambertMaterial({ color: 0xc23b2a });
  for (const px of [-30, -18, 18, 30]) {
    const pump = new THREE.Mesh(pumpGeo, pumpMat);
    pump.position.set(px, 0.9, 332);
    scene.add(pump);
    colliders.push({ x: px, z: 332, radius: 1.4 });
  }

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(70, 0.5, 14),
    new THREE.MeshLambertMaterial({ color: 0xe8e0cc })
  );
  canopy.position.set(0, 6, 332);
  scene.add(canopy);

  const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 6, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x55504a });
  for (const px of [-33, 33]) {
    for (const pz of [326, 338]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 3, pz);
      scene.add(post);
    }
  }

  const shop = new THREE.Mesh(unitBox, rng.pick(stoneMats));
  shop.scale.set(18, 6, 11);
  shop.position.set(48, 3, 350);
  scene.add(shop);
  colliders.push({ x: 48, z: 350, radius: 10 });

  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 6), postMat);
  signPole.position.set(-44, 7, 322);
  scene.add(signPole);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa8800 })
  );
  sign.position.set(-44, 14, 322);
  scene.add(sign);
  colliders.push({ x: -44, z: 322, radius: 1.5 });

  // --- streetlights -------------------------------------------------------------------
  // Poles and heads along the two main roads, two InstancedMeshes total.
  const lightSpots = [];
  for (let z = -360; z <= 360; z += 40) lightSpots.push({ x: 8, z, horiz: false });
  for (let x = -360; x <= 360; x += 40) lightSpots.push({ x, z: 8, horiz: true });

  const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 7, 6);
  const headGeo = new THREE.BoxGeometry(1.8, 0.25, 0.45);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffedb0 });
  const poles = new THREE.InstancedMesh(poleGeo, postMat, lightSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lightSpots.length);
  lightSpots.forEach((s, i) => {
    dummy.position.set(s.x, 3.5, s.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(s.horiz ? s.x : s.x - 0.9, 7, s.horiz ? s.z - 0.9 : s.z);
    dummy.rotation.set(0, s.horiz ? Math.PI / 2 : 0, 0);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(heads);

  // --- dunes: cacti and rocks -----------------------------------------------------------
  // Rejection-sampled spots that avoid roads, buildings and named places.
  // Trunks, arms and rocks are three InstancedMeshes between them.
  function duneSpot(pad) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = rng.range(-390, 390);
      const z = rng.range(-390, 390);
      if (nearRoad(x, z, pad)) continue;
      if (blocked(x, z, 6)) continue;
      let inside = false;
      for (const c of colliders) {
        const dx = x - c.x;
        const dz = z - c.z;
        if (dx * dx + dz * dz < (c.radius + 4) * (c.radius + 4)) {
          inside = true;
          break;
        }
      }
      if (!inside) return { x, z };
    }
    return null;
  }

  const cactusSpots = [];
  for (let i = 0; i < 36; i++) {
    const s = duneSpot(10);
    if (s) cactusSpots.push(s);
  }
  if (cactusSpots.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.45, 0.55, 1, 7);
    const armGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.6, 6);
    armGeo.rotateZ(Math.PI / 2);
    const cactusMat = new THREE.MeshLambertMaterial({ color: 0x4a7a3a });
    const trunks = new THREE.InstancedMesh(trunkGeo, cactusMat, cactusSpots.length);
    const arms = new THREE.InstancedMesh(armGeo, cactusMat, cactusSpots.length);
    cactusSpots.forEach((s, i) => {
      const h = rng.range(2.5, 5);
      dummy.position.set(s.x, h / 2, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      const a = rng.range(0, Math.PI * 2);
      dummy.position.set(s.x + Math.cos(a) * 0.9, h * 0.55, s.z - Math.sin(a) * 0.9);
      dummy.rotation.set(0, a, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      arms.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    scene.add(trunks);
    scene.add(arms);
  }

  const rockSpots = [];
  for (let i = 0; i < 28; i++) {
    const s = duneSpot(10);
    if (s) rockSpots.push(s);
  }
  if (rockSpots.length > 0) {
    const boulderGeo = new THREE.DodecahedronGeometry(1, 0);
    const boulderMat = new THREE.MeshLambertMaterial({ color: 0x9a8a72 });
    const boulders = new THREE.InstancedMesh(boulderGeo, boulderMat, rockSpots.length);
    rockSpots.forEach((s, i) => {
      const sc = rng.range(0.8, 2.6);
      dummy.position.set(s.x, sc * 0.4, s.z);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.set(sc, sc * 0.8, sc);
      dummy.updateMatrix();
      boulders.setMatrixAt(i, dummy.matrix);
    });
    boulders.instanceMatrix.needsUpdate = true;
    scene.add(boulders);
  }

  // --- relic markers ------------------------------------------------------------
  // A small glowing octahedron hovers over each relic spot so players can
  // spot one from a distance. They spin and bob gently in update().
  const markerGeo = new THREE.OctahedronGeometry(1.1, 0);
  const markerMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xcc9900 });
  const markers = [];
  for (const s of relicSpots) {
    const m = new THREE.Mesh(markerGeo, markerMat);
    m.position.set(s.x, 2.2, s.z);
    scene.add(m);
    markers.push(m);
  }

  // --- drifting dust ----------------------------------------------------------------------
  // One points cloud, blown east by the wind and wrapped around the map.
  const DUST_COUNT = 380;
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustBaseY = new Float32Array(DUST_COUNT);
  const dustSpeed = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPos[i * 3] = rng.range(-400, 400);
    dustPos[i * 3 + 1] = rng.range(0.5, 26);
    dustPos[i * 3 + 2] = rng.range(-400, 400);
    dustBaseY[i] = dustPos[i * 3 + 1];
    dustSpeed[i] = rng.range(4, 12);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xe8d5a8, size: 1.7, transparent: true, opacity: 0.55 })
  );
  scene.add(dust);

  let dustTime = 0;
  function update(dt) {
    dustTime += dt;
    for (let i = 0; i < DUST_COUNT; i++) {
      let x = dustPos[i * 3] + dustSpeed[i] * dt;
      if (x > 400) x -= 800;
      dustPos[i * 3] = x;
      dustPos[i * 3 + 1] = clamp(dustBaseY[i] + Math.sin(dustTime * 0.6 + i * 1.7) * 0.9, 0.3, 30);
    }
    dustGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < markers.length; i++) {
      markers[i].rotation.y += dt * 0.8;
      markers[i].position.y = 2.2 + Math.sin(dustTime * 1.5 + i) * 0.4;
    }
  }

  return {
    roads,
    intersections,
    colliders,
    places,
    relicSpots,
    bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
    groundHeight: () => 0,
    update,
  };
}
