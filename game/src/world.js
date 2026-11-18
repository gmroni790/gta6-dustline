import * as THREE from 'three';

// Dustline: a sun-baked desert highway town. x runs east, z runs south, y is up,
// ground plane is y = 0 and the playable square spans [-B, B] on both axes.
const B = 230;
const TOWER_COLORS = [0xc96f4a, 0xb85c38, 0xd98d5f, 0xa8502e, 0xcf7a52, 0xe0a878];
const ADOBE_COLORS = [0xd9a066, 0xc98d54, 0xe0b184, 0xbd7f4e];
const NEON_COLORS = [0xff2e88, 0x22d3ee, 0xffcc00];

export function createWorld(scene, rng) {
  const rand = rng || Math.random;
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color(0xf0cf9e);
  scene.fog = new THREE.Fog(0xeccfa3, 140, 480);

  // Shared material cache: one material per (color, roughness) pair.
  const materialCache = new Map();
  function material(color, roughness = 0.9) {
    const key = color + '|' + roughness;
    if (!materialCache.has(key)) {
      materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
    }
    return materialCache.get(key);
  }

  const colliders = [];
  function addCollider(x, z, halfW, halfD) {
    colliders.push({ x, z, hw: halfW, hd: halfD });
  }

  function addBox(w, h, d, color, x, y, z, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Ground plane.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), material(0xd9b380, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- Roads ----
  const roads = [];
  const gridLines = [-80, -40, 0, 40, 80];
  for (const v of gridLines) {
    roads.push({ x1: v, z1: -100, x2: v, z2: 100 });
    roads.push({ x1: -100, z1: v, x2: 100, z2: v });
  }
  roads.push({ x1: -B, z1: -140, x2: B, z2: -140 }); // the highway
  const ring = [
    [-160, -160, 160, -160], [160, -160, 160, 160],
    [160, 160, -160, 160], [-160, 160, -160, -160],
  ];
  for (const seg of ring) roads.push({ x1: seg[0], z1: seg[1], x2: seg[2], z2: seg[3] });

  // One dashed yellow centre-line texture, tiled per road.
  const dashCanvas = document.createElement('canvas');
  dashCanvas.width = 16;
  dashCanvas.height = 64;
  const dashCtx = dashCanvas.getContext('2d');
  dashCtx.fillStyle = '#f5d76e';
  dashCtx.fillRect(6, 10, 4, 44);
  const dashTexture = new THREE.CanvasTexture(dashCanvas);
  dashTexture.wrapS = dashTexture.wrapT = THREE.RepeatWrapping;

  function renderRoad(road, width) {
    const len = Math.hypot(road.x2 - road.x1, road.z2 - road.z1);
    const cx = (road.x1 + road.x2) / 2;
    const cz = (road.z1 + road.z2) / 2;
    const horizontal = road.z1 === road.z2;
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? len : width, 0.06, horizontal ? width : len),
      material(0x4a4038, 1));
    strip.position.set(cx, 0.03, cz);
    strip.receiveShadow = true;
    group.add(strip);
    const lineTex = dashTexture.clone();
    lineTex.needsUpdate = true;
    lineTex.repeat.set(1, Math.max(1, Math.round(len / 8)));
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len),
      new THREE.MeshBasicMaterial({ map: lineTex, transparent: true, depthWrite: false }));
    line.rotation.set(-Math.PI / 2, 0, horizontal ? Math.PI / 2 : 0);
    line.position.set(cx, 0.08, cz);
    group.add(line);
  }
  for (let i = 0; i < roads.length; i++) renderRoad(roads[i], i === 10 ? 12 : 8);

  // ---- Canvas-texture signs ----
  function makeSignTexture(text, bg, fg, sub) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = bg;
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = fg;
    c.lineWidth = 10;
    c.strokeRect(12, 12, 488, 232);
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'bold 62px sans-serif';
    c.fillText(text, 256, sub ? 96 : 128);
    if (sub) {
      c.font = 'bold 34px sans-serif';
      c.fillText(sub, 256, 182);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function addSign(text, bg, fg, w, h, x, y, z, rotY, sub) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg, sub) }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
    return mesh;
  }

  // Neon strips that blink in update().
  const blinkMats = [];
  function addNeon(w, h, color, x, y, z, rotY) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2 }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
    blinkMats.push(mesh.material);
    return mesh;
  }

  // ---- Downtown towers; block (20, 20) stays a plaza (the spawn sits there). ----
  for (const bx of [-60, -20, 20, 60]) {
    for (const bz of [-60, -20, 20, 60]) {
      if (bx === 20 && bz === 20) continue;
      const twin = rand() < 0.5;
      const count = twin ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = twin ? between(10, 14) : between(14, 20);
        const d = twin ? between(10, 14) : between(14, 20);
        const h = between(20, 60);
        const x = bx + (twin ? (i === 0 ? -8.5 : 8.5) : 0) + between(-2, 2);
        const z = bz + between(-3, 3);
        addBox(w, h, d, pick(TOWER_COLORS), x, h / 2, z);
        addBox(w + 0.6, 0.8, d + 0.6, 0xf2e3c6, x, h + 0.4, z);
        for (let y = 6; y < h - 2; y += 12) addBox(w + 0.2, 0.7, d + 0.2, 0x33303a, x, y, z);
        addCollider(x, z, w / 2 + 0.5, d / 2 + 0.5);
        if (rand() < 0.4) {
          addNeon(between(4, 8), 1.2, pick(NEON_COLORS), x, between(8, h - 4), z + d / 2 + 0.15, 0);
        }
      }
    }
  }

  // ---- Old Town: low adobe blocks around (-120, -80), plazas kept clear. ----
  for (let gx = -150; gx <= -90; gx += 15) {
    for (let gz = -110; gz <= -50; gz += 15) {
      if (Math.hypot(gx + 120, gz + 80) < 14) continue;
      if (Math.hypot(gx + 110, gz + 70) < 10) continue;
      if (rand() < 0.3) continue;
      const w = between(8, 12), d = between(8, 12), h = between(4, 8);
      const x = gx + between(-2, 2), z = gz + between(-2, 2);
      addBox(w, h, d, pick(ADOBE_COLORS), x, h / 2, z);
      addBox(w + 0.8, 0.5, d + 0.8, 0x8a5a34, x, h + 0.25, z);
      addCollider(x, z, w / 2 + 0.5, d / 2 + 0.5);
    }
  }

  // ---- Truck stop at (170, -140): diner, gas pumps, canopy, GAS pole sign. ----
  addBox(16, 5, 9, 0xe8dcc0, 170, 2.5, -128);
  addCollider(170, -128, 8.5, 5);
  addSign('DINER', '#7a2e1d', '#ffd9a0', 10, 2.5, 170, 6.5, -132.6, Math.PI);
  for (let i = 0; i < 4; i++) {
    const px = 158 + i * 4;
    addBox(1, 1.6, 0.7, 0xc23b2e, px, 0.8, -134);
    addCollider(px, -134, 0.8, 0.6);
  }
  addBox(20, 0.5, 6, 0xf2e3c6, 164, 4.5, -134);
  addBox(0.4, 4.5, 0.4, 0x888888, 155, 2.25, -136.5);
  addBox(0.4, 4.5, 0.4, 0x888888, 173, 2.25, -136.5);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 14, 8), material(0x777777, 0.6));
  pole.position.set(182, 7, -130);
  pole.castShadow = true;
  group.add(pole);
  addSign('GAS', '#123a5c', '#ffe066', 9, 4.5, 182, 15, -130, Math.PI);
  addCollider(182, -130, 1, 1);

  // ---- Quarry at (-170, -170): terraced pit, stepped open rings descending inward. ----
  for (let i = 0; i < 4; i++) {
    const radius = 30 - i * 7;
    const height = 8 - i * 2;
    const ringMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius + 3, height, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xa97a4e, roughness: 1, side: THREE.DoubleSide }));
    ringMesh.position.set(-170, height / 2, -170);
    ringMesh.castShadow = true;
    ringMesh.receiveShadow = true;
    group.add(ringMesh);
  }

  // ---- Canyon Rim at (0, 190): tall rock formations plus an overlook platform. ----
  const crags = [[-28, 168], [24, 172], [-14, 208], [30, 205], [-38, 192], [42, 188], [8, 214], [-8, 166]];
  for (const [cx, cz] of crags) {
    const w = between(6, 10), d = between(6, 10), h = between(15, 32);
    addBox(w, h, d, pick([0xa85a36, 0x96502e, 0xb96a42]), cx, h / 2, cz, between(0, 0.6));
    addBox(w * 0.6, between(2, 5), d * 0.6, 0x8a4a28, cx + between(-1, 1), h + 1.5, cz + between(-1, 1));
    addCollider(cx, cz, w / 2 + 1, d / 2 + 1);
  }
  addBox(10, 1, 6, 0x9a7a5a, 0, 0.5, 178);
  addCollider(0, 178, 5, 3);

  // ---- Dunes at (-190, 60): smooth squashed sand mounds. ----
  for (let i = 0; i < 9; i++) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(between(9, 18), 16, 12), material(0xe3c184, 1));
    mound.scale.y = 0.22;
    mound.position.set(-190 + between(-25, 25), 0, 60 + between(-25, 25));
    mound.receiveShadow = true;
    group.add(mound);
  }

  // ---- Desert Rose paint shop at (30, 110); door faces north toward downtown. ----
  addBox(13, 5.5, 10, 0xf0e2c8, 30, 2.75, 110);
  addCollider(30, 110, 7, 5.5);
  addBox(9, 3.6, 0.3, 0x5a5a66, 30, 1.8, 104.9);
  addSign('DESERT ROSE', '#8e2f4b', '#ffd9e0', 11, 2.6, 30, 6.8, 104.8, Math.PI, 'AUTO PAINT');

  // ---- Rae's Garage hideout at (-110, -70); door faces south. ----
  addBox(11, 5, 9, 0xb0653a, -110, 2.5, -70);
  addCollider(-110, -70, 6, 5);
  addBox(8, 3.4, 0.3, 0x3a3a44, -110, 1.7, -65.4);
  addSign("RAE'S", '#2e4a2e', '#ffe9a8', 8, 2, -110, 6, -65.4, 0, 'GARAGE');

  // ---- Relic spots: on roads/plazas, never inside a collider. ----
  const relicSpots = [
    { x: 0, z: 0 }, { x: 40, z: -40 }, { x: -80, z: 80 }, { x: 0, z: -140 },
    { x: 120, z: -140 }, { x: 30, z: 100 }, { x: -110, z: -58 }, { x: -170, z: -170 },
    { x: 0, z: 190 }, { x: -190, z: 60 },
  ];

  // ---- Props ----
  function addCactus(x, z, scale) {
    const g = new THREE.Group();
    const green = material(0x4a7c3a, 1);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.45 * scale, 3 * scale, 8), green);
    trunk.position.y = 1.5 * scale;
    trunk.castShadow = true;
    g.add(trunk);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.25 * scale, 1.4 * scale, 8), green);
    arm.position.set(0.8 * scale, 2 * scale, 0);
    arm.rotation.z = Math.PI / 2;
    arm.castShadow = true;
    g.add(arm);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.25 * scale, 1.2 * scale, 8), green);
    up.position.set(1.4 * scale, 2.5 * scale, 0);
    up.castShadow = true;
    g.add(up);
    g.position.set(x, 0, z);
    g.rotation.y = between(0, Math.PI * 2);
    group.add(g);
  }
  function addRock(x, z, size, solid) {
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0),
      material(pick([0x9a7a5a, 0x8a6a4a, 0xa8855f]), 1));
    mesh.scale.y = 0.6;
    mesh.position.set(x, size * 0.4, z);
    mesh.rotation.y = between(0, 6.28);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) addCollider(x, z, size, size);
  }
  function addPalm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 7), material(0x8a6a44, 1));
    trunk.position.y = 3;
    trunk.rotation.z = 0.12;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const frond = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.7), material(0x3f7a34, 1));
      frond.position.set(Math.cos(a) * 1.6, 5.9, Math.sin(a) * 1.6);
      frond.rotation.set(0, -a, -0.35);
      frond.castShadow = true;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    group.add(g);
  }
  function addStreetlight(x, z) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), material(0x555555, 0.6));
    post.position.set(x, 3.5, z);
    post.castShadow = true;
    group.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe9a8, emissiveIntensity: 1.2 }));
    head.position.set(x + 0.7, 7, z);
    group.add(head);
  }
  function addBillboard(x, z, rotY, text, bg, fg, sub) {
    const dx = Math.cos(rotY) * 3;
    const dz = -Math.sin(rotY) * 3;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7, 6), material(0x666666, 0.6));
      post.position.set(x + dx * s, 3.5, z + dz * s);
      post.castShadow = true;
      group.add(post);
    }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.5),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg, sub) }));
    face.position.set(x, 8.5, z);
    face.rotation.y = rotY;
    group.add(face);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.5), material(0x3a3a3a));
    back.position.set(x, 8.5, z);
    back.rotation.y = rotY + Math.PI;
    group.add(back);
    addCollider(x, z, 1.5, 1.5);
  }
  addBillboard(60, -131, Math.PI, 'DUSTLINE', '#1d3557', '#ffd166', 'POP. 12,404');
  addBillboard(150, -131, Math.PI, 'GAS', '#7a2e1d', '#ffe9a8', 'LAST STOP 40 MI');
  addBillboard(-150, 40, Math.PI / 2, 'MOTEL', '#2e4a2e', '#ffd166', 'VACANCY');

  const palmSpots = [
    [14, 14], [26, 14], [14, 26], [26, 26], [6, -30],
    [-6, 30], [30, -6], [-30, 6], [46, 6], [-46, -6],
  ];
  for (const [px, pz] of palmSpots) addPalm(px, pz);
  for (let v = -80; v <= 80; v += 40) {
    addStreetlight(5.5, v);
    addStreetlight(v, 5.5);
  }

  // ---- Scattered cacti and rocks, kept clear of roads, colliders and relics. ----
  function distanceToRoad(x, z) {
    let best = Infinity;
    for (const r of roads) {
      const dx = r.x2 - r.x1, dz = r.z2 - r.z1;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - r.x1) * dx + (z - r.z1) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (r.x1 + dx * t), z - (r.z1 + dz * t)));
    }
    return best;
  }
  function isClear(x, z, margin) {
    if (distanceToRoad(x, z) < 7) return false;
    for (const c of colliders) {
      if (Math.abs(x - c.x) < c.hw + margin && Math.abs(z - c.z) < c.hd + margin) return false;
    }
    for (const s of relicSpots) if (Math.hypot(x - s.x, z - s.z) < 6) return false;
    if (Math.hypot(x - 10, z - 20) < 10) return false;
    return true;
  }
  let placed = 0, attempts = 0;
  while (placed < 46 && attempts++ < 800) {
    const x = between(-220, 220), z = between(-220, 220);
    if (!isClear(x, z, 1)) continue;
    addCactus(x, z, between(0.8, 1.6));
    placed++;
  }
  placed = 0;
  attempts = 0;
  while (placed < 30 && attempts++ < 800) {
    const x = between(-220, 220), z = between(-220, 220);
    if (!isClear(x, z, 2)) continue;
    addRock(x, z, between(0.8, 2.2), rand() < 0.4);
    placed++;
  }
  // Extra rocks ringing the quarry and the canyon.
  for (let i = 0; i < 8; i++) {
    const a = between(0, Math.PI * 2);
    addRock(-170 + Math.cos(a) * between(32, 40), -170 + Math.sin(a) * between(32, 40), between(1, 2.4), true);
    addRock(Math.cos(a) * between(44, 55), 190 + Math.sin(a) * between(18, 30), between(1, 2.4), true);
  }

  // ---- Drifting dust motes ----
  const DUST_COUNT = 380;
  const dustPos = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPos[i * 3] = between(-B, B);
    dustPos[i * 3 + 1] = between(0.5, 26);
    dustPos[i * 3 + 2] = between(-B, B);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xe8c88f, size: 0.9, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  group.add(dust);

  function collides(x, z, r) {
    if (Math.abs(x) + r > B || Math.abs(z) + r > B) return true;
    for (const c of colliders) {
      if (Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r) return true;
    }
    return false;
  }

  function update(dt, t) {
    for (let i = 0; i < DUST_COUNT; i++) {
      dustPos[i * 3] += dt * (2 + (i % 3));
      dustPos[i * 3 + 1] += Math.sin(t * 0.7 + i) * dt * 0.3;
      if (dustPos[i * 3] > B) dustPos[i * 3] = -B;
    }
    dustGeo.attributes.position.needsUpdate = true;
    blinkMats.forEach((m, i) => {
      m.emissiveIntensity = Math.sin(t * 2.5 + i * 1.7) > -0.2 ? 2.2 : 0.3;
    });
  }

  return {
    group, roads, colliders, collides, update,
    spawn: { x: 10, z: 20, angle: -Math.PI / 2 },
    paintShop: { x: 30, z: 110, r: 7 },
    hideout: { x: -110, z: -70, r: 8 },
    spots: {
      truckStop: { x: 170, z: -140 }, quarry: { x: -170, z: -170 }, canyon: { x: 0, z: 190 },
      downtown: { x: 0, z: 0 }, oldTown: { x: -120, z: -80 }, dunes: { x: -190, z: 60 },
      highway: { x: 0, z: -140 },
    },
    relicSpots,
    districts: [
      { name: 'Downtown', x: 0, z: 0 }, { name: 'Old Town', x: -120, z: -80 },
      { name: 'Truck Stop', x: 170, z: -140 }, { name: 'Quarry', x: -170, z: -170 },
      { name: 'Canyon Rim', x: 0, z: 190 }, { name: 'Dunes', x: -190, z: 60 },
      { name: 'Highway', x: 0, z: -140 },
    ],
    bounds: B,
  };
}
