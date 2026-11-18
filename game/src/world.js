import * as THREE from 'three';

// Dustline: sun-baked desert highway city. x east, z south, y up, ground y=0.
const B = 230;
const PAL = [0xc96f4a, 0xb85c38, 0xd98d5f, 0xa8502e, 0xcf7a52, 0xe0a878];
const ADOBE = [0xd9a066, 0xc98d54, 0xe0b184, 0xbd7f4e];

export function createWorld(scene, rng) {
  const R = rng || Math.random;
  const rr = (a, b) => a + R() * (b - a);
  const pick = (a) => a[(R() * a.length) | 0];
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color(0xf0cf9e);
  scene.fog = new THREE.Fog(0xeccfa3, 140, 480);

  const mats = new Map();
  function mat(c, rough = 0.9) {
    const k = c + '|' + rough;
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }));
    return mats.get(k);
  }
  function box(w, h, d, c, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); return m;
  }

  const colliders = [];
  const col = (x, z, hw, hd) => colliders.push({ x, z, hw, hd });

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat(0xd9b380, 1));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // Roads
  const roads = [];
  const grid = [-80, -40, 0, 40, 80];
  for (const v of grid) {
    roads.push({ x1: v, z1: -100, x2: v, z2: 100 });
    roads.push({ x1: -100, z1: v, x2: 100, z2: v });
  }
  roads.push({ x1: -B, z1: -140, x2: B, z2: -140 });
  [[-160, -160, 160, -160], [160, -160, 160, 160], [160, 160, -160, 160], [-160, 160, -160, -160]]
    .forEach(s => roads.push({ x1: s[0], z1: s[1], x2: s[2], z2: s[3] }));

  const dashCv = document.createElement('canvas');
  dashCv.width = 16; dashCv.height = 64;
  const dc = dashCv.getContext('2d');
  dc.fillStyle = '#f5d76e'; dc.fillRect(6, 10, 4, 44);
  const dashTex = new THREE.CanvasTexture(dashCv);
  dashTex.wrapS = dashTex.wrapT = THREE.RepeatWrapping;

  function roadMesh(r, w) {
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    const hz = r.z1 === r.z2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(hz ? len : w, 0.06, hz ? w : len), mat(0x4a4038, 1));
    m.position.set(cx, 0.03, cz); m.receiveShadow = true; group.add(m);
    const t = dashTex.clone(); t.needsUpdate = true;
    t.repeat.set(1, Math.max(1, Math.round(len / 8)));
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    line.rotation.set(-Math.PI / 2, 0, hz ? Math.PI / 2 : 0);
    line.position.set(cx, 0.08, cz); group.add(line);
  }
  for (let i = 0; i < roads.length; i++) roadMesh(roads[i], i === 10 ? 12 : 8);

  // Canvas-texture signs
  function signTex(text, bg, fg, sub) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, 512, 256);
    c.strokeStyle = fg; c.lineWidth = 10; c.strokeRect(12, 12, 488, 232);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 62px sans-serif'; c.fillText(text, 256, sub ? 96 : 128);
    if (sub) { c.font = 'bold 34px sans-serif'; c.fillText(sub, 256, 182); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function sign(text, bg, fg, w, h, x, y, z, ry, sub) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: signTex(text, bg, fg, sub) }));
    m.position.set(x, y, z); m.rotation.y = ry; group.add(m); return m;
  }
  const blinkers = [];
  function neon(w, h, c, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 2 }));
    m.position.set(x, y, z); m.rotation.y = ry; group.add(m);
    blinkers.push(m.material); return m;
  }

  // Downtown towers (block (20,20) stays a plaza: player spawn lives there)
  for (const bx of [-60, -20, 20, 60]) for (const bz of [-60, -20, 20, 60]) {
    if (bx === 20 && bz === 20) continue;
    const n = R() < 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const w = n === 2 ? rr(10, 14) : rr(14, 20);
      const d = n === 2 ? rr(10, 14) : rr(14, 20);
      const h = rr(20, 60);
      const x = bx + (n === 2 ? (i === 0 ? -8.5 : 8.5) : 0) + rr(-2, 2);
      const z = bz + rr(-3, 3);
      box(w, h, d, pick(PAL), x, h / 2, z);
      box(w + 0.6, 0.8, d + 0.6, 0xf2e3c6, x, h + 0.4, z);
      for (let y = 6; y < h - 2; y += 12) box(w + 0.2, 0.7, d + 0.2, 0x33303a, x, y, z);
      col(x, z, w / 2 + 0.5, d / 2 + 0.5);
      if (R() < 0.4) neon(rr(4, 8), 1.2, pick([0xff2e88, 0x22d3ee, 0xffcc00]), x, rr(8, h - 4), z + d / 2 + 0.15, 0);
    }
  }

  // Old Town: low adobe blocks around (-120,-80), plaza kept clear
  for (let gx = -150; gx <= -90; gx += 15) for (let gz = -110; gz <= -50; gz += 15) {
    if (Math.hypot(gx + 120, gz + 80) < 14) continue;
    if (Math.hypot(gx + 110, gz + 70) < 10) continue;
    if (R() < 0.3) continue;
    const w = rr(8, 12), d = rr(8, 12), h = rr(4, 8);
    const x = gx + rr(-2, 2), z = gz + rr(-2, 2);
    box(w, h, d, pick(ADOBE), x, h / 2, z);
    box(w + 0.8, 0.5, d + 0.8, 0x8a5a34, x, h + 0.25, z);
    col(x, z, w / 2 + 0.5, d / 2 + 0.5);
  }

  // Truck Stop at (170,-140)
  box(16, 5, 9, 0xe8dcc0, 170, 2.5, -128); col(170, -128, 8.5, 5);
  sign('DINER', '#7a2e1d', '#ffd9a0', 10, 2.5, 170, 6.5, -132.6, Math.PI);
  for (let i = 0; i < 4; i++) { const px = 158 + i * 4; box(1, 1.6, 0.7, 0xc23b2e, px, 0.8, -134); col(px, -134, 0.8, 0.6); }
  box(20, 0.5, 6, 0xf2e3c6, 164, 4.5, -134);
  box(0.4, 4.5, 0.4, 0x888888, 155, 2.25, -136.5);
  box(0.4, 4.5, 0.4, 0x888888, 173, 2.25, -136.5);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 14, 8), mat(0x777777, 0.6));
  pole.position.set(182, 7, -130); pole.castShadow = true; group.add(pole);
  sign('GAS', '#123a5c', '#ffe066', 9, 4.5, 182, 15, -130, Math.PI); col(182, -130, 1, 1);

  // Quarry at (-170,-170): terraced pit, stepped open rings descending inward
  for (let i = 0; i < 4; i++) {
    const r = 30 - i * 7, h = 8 - i * 2;
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r + 3, h, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xa97a4e, roughness: 1, side: THREE.DoubleSide }));
    ring.position.set(-170, h / 2, -170);
    ring.castShadow = true; ring.receiveShadow = true; group.add(ring);
  }

  // Canyon Rim at (0,190): tall rock formations + overlook platform
  const crag = [[-28, 168], [24, 172], [-14, 208], [30, 205], [-38, 192], [42, 188], [8, 214], [-8, 166]];
  for (const [cx, cz] of crag) {
    const w = rr(6, 10), d = rr(6, 10), h = rr(15, 32);
    box(w, h, d, pick([0xa85a36, 0x96502e, 0xb96a42]), cx, h / 2, cz, rr(0, 0.6));
    box(w * 0.6, rr(2, 5), d * 0.6, 0x8a4a28, cx + rr(-1, 1), h + 1.5, cz + rr(-1, 1));
    col(cx, cz, w / 2 + 1, d / 2 + 1);
  }
  box(10, 1, 6, 0x9a7a5a, 0, 0.5, 178); col(0, 178, 5, 3);

  // Dunes at (-190,60): smooth sand mounds
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(rr(9, 18), 16, 12), mat(0xe3c184, 1));
    m.scale.y = 0.22;
    m.position.set(-190 + rr(-25, 25), 0, 60 + rr(-25, 25));
    m.receiveShadow = true; group.add(m);
  }

  // Paint shop at (30,110), door faces north toward downtown
  box(13, 5.5, 10, 0xf0e2c8, 30, 2.75, 110); col(30, 110, 7, 5.5);
  box(9, 3.6, 0.3, 0x5a5a66, 30, 1.8, 104.9);
  sign('DESERT ROSE', '#8e2f4b', '#ffd9e0', 11, 2.6, 30, 6.8, 104.8, Math.PI, 'AUTO PAINT');

  // Hideout "Rae's Garage" at (-110,-70), door faces south
  box(11, 5, 9, 0xb0653a, -110, 2.5, -70); col(-110, -70, 6, 5);
  box(8, 3.4, 0.3, 0x3a3a44, -110, 1.7, -65.4);
  sign("RAE'S", '#2e4a2e', '#ffe9a8', 8, 2, -110, 6, -65.4, 0, 'GARAGE');

  // Relic spots: on roads/plazas, never inside a collider
  const relicSpots = [
    { x: 0, z: 0 }, { x: 40, z: -40 }, { x: -80, z: 80 }, { x: 0, z: -140 },
    { x: 120, z: -140 }, { x: 30, z: 100 }, { x: -110, z: -58 }, { x: -170, z: -170 },
    { x: 0, z: 190 }, { x: -190, z: 60 },
  ];

  // Props
  function cactus(x, z, s) {
    const g = new THREE.Group();
    const gm = mat(0x4a7c3a, 1);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.45 * s, 3 * s, 8), gm);
    trunk.position.y = 1.5 * s; trunk.castShadow = true; g.add(trunk);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.25 * s, 1.4 * s, 8), gm);
    arm.position.set(0.8 * s, 2 * s, 0); arm.rotation.z = Math.PI / 2; arm.castShadow = true; g.add(arm);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.25 * s, 1.2 * s, 8), gm);
    up.position.set(1.4 * s, 2.5 * s, 0); up.castShadow = true; g.add(up);
    g.position.set(x, 0, z); g.rotation.y = rr(0, Math.PI * 2); group.add(g);
  }
  function rock(x, z, s, big) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(pick([0x9a7a5a, 0x8a6a4a, 0xa8855f]), 1));
    m.scale.y = 0.6; m.position.set(x, s * 0.4, z); m.rotation.y = rr(0, 6.28);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
    if (big) col(x, z, s, s);
  }
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 7), mat(0x8a6a44, 1));
    trunk.position.y = 3; trunk.rotation.z = 0.12; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const f = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.7), mat(0x3f7a34, 1));
      f.position.set(Math.cos(a) * 1.6, 5.9, Math.sin(a) * 1.6);
      f.rotation.set(0, -a, -0.35); f.castShadow = true; g.add(f);
    }
    g.position.set(x, 0, z); group.add(g);
  }
  function streetlight(x, z) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), mat(0x555555, 0.6));
    p.position.set(x, 3.5, z); p.castShadow = true; group.add(p);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe9a8, emissiveIntensity: 1.2 }));
    head.position.set(x + 0.7, 7, z); group.add(head);
  }
  function billboard(x, z, ry, text, bg, fg, sub) {
    const dx = Math.cos(ry) * 3, dz = -Math.sin(ry) * 3;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7, 6), mat(0x666666, 0.6));
      p.position.set(x + dx * s, 3.5, z + dz * s); p.castShadow = true; group.add(p);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.5),
      new THREE.MeshBasicMaterial({ map: signTex(text, bg, fg, sub) }));
    m.position.set(x, 8.5, z); m.rotation.y = ry; group.add(m);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.5), mat(0x3a3a3a));
    back.position.set(x, 8.5, z); back.rotation.y = ry + Math.PI; group.add(back);
    col(x, z, 1.5, 1.5);
  }
  billboard(60, -131, Math.PI, 'DUSTLINE', '#1d3557', '#ffd166', 'POP. 12,404');
  billboard(150, -131, Math.PI, 'GAS', '#7a2e1d', '#ffe9a8', 'LAST STOP 40 MI');
  billboard(-150, 40, Math.PI / 2, 'MOTEL', '#2e4a2e', '#ffd166', 'VACANCY');

  [[14, 14], [26, 14], [14, 26], [26, 26], [6, -30], [-6, 30], [30, -6], [-30, 6], [46, 6], [-46, -6]]
    .forEach(p => palm(p[0], p[1]));
  for (let v = -80; v <= 80; v += 40) { streetlight(5.5, v); streetlight(v, 5.5); }

  function roadDist(x, z) {
    let best = 1e9;
    for (const r of roads) {
      const dx = r.x2 - r.x1, dz = r.z2 - r.z1;
      const l2 = dx * dx + dz * dz || 1;
      let t = ((x - r.x1) * dx + (z - r.z1) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (r.x1 + dx * t), z - (r.z1 + dz * t)));
    }
    return best;
  }
  function clearOf(x, z, m) {
    if (roadDist(x, z) < 7) return false;
    for (const c of colliders) if (Math.abs(x - c.x) < c.hw + m && Math.abs(z - c.z) < c.hd + m) return false;
    for (const s of relicSpots) if (Math.hypot(x - s.x, z - s.z) < 6) return false;
    if (Math.hypot(x - 10, z - 20) < 10) return false;
    return true;
  }
  let placed = 0, tries = 0;
  while (placed < 46 && tries++ < 800) {
    const x = rr(-220, 220), z = rr(-220, 220);
    if (!clearOf(x, z, 1)) continue;
    cactus(x, z, rr(0.8, 1.6)); placed++;
  }
  placed = 0; tries = 0;
  while (placed < 30 && tries++ < 800) {
    const x = rr(-220, 220), z = rr(-220, 220);
    if (!clearOf(x, z, 2)) continue;
    rock(x, z, rr(0.8, 2.2), R() < 0.4); placed++;
  }
  // Extra rocks ringing the quarry and canyon
  for (let i = 0; i < 8; i++) {
    const a = rr(0, Math.PI * 2);
    rock(-170 + Math.cos(a) * rr(32, 40), -170 + Math.sin(a) * rr(32, 40), rr(1, 2.4), true);
    rock(Math.cos(a) * rr(44, 55), 190 + Math.sin(a) * rr(18, 30), rr(1, 2.4), true);
  }

  // Drifting dust motes
  const DN = 380;
  const dPos = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) {
    dPos[i * 3] = rr(-B, B); dPos[i * 3 + 1] = rr(0.5, 26); dPos[i * 3 + 2] = rr(-B, B);
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({
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
    for (let i = 0; i < DN; i++) {
      dPos[i * 3] += dt * (2 + (i % 3));
      dPos[i * 3 + 1] += Math.sin(t * 0.7 + i) * dt * 0.3;
      if (dPos[i * 3] > B) dPos[i * 3] = -B;
    }
    dGeo.attributes.position.needsUpdate = true;
    blinkers.forEach((m, i) => { m.emissiveIntensity = Math.sin(t * 2.5 + i * 1.7) > -0.2 ? 2.2 : 0.3; });
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
