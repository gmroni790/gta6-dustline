import * as THREE from 'three';
import { damageVehicle } from './vehicles.js';

function hurtPerson(t, dmg, isCop) {
  t.hp = (t.hp == null ? 100 : t.hp) - dmg;
  if (t.hp <= 0) {
    if (isCop) t.alive = false;
    else { t.state = 'dead'; t.deadT = 0; }
  }
}

export function createCombat(scene) {
  const light = new THREE.PointLight(0xffcc66, 0, 9, 2);
  light.visible = false;
  scene.add(light);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true })
  );
  flash.visible = false;
  scene.add(flash);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  tracer.visible = false;
  scene.add(tracer);
  return {
    weapon: 'fists', ammo: { pistol: 48, smg: 150 },
    mag: { pistol: 12, smg: 30 }, magSize: { pistol: 12, smg: 30 },
    cooldown: 0, _reloadT: 0, _reloadW: '', _flashT: 0, _traceT: 0,
    _light: light, _flash: flash, _tracer: tracer, _geo: geo,
  };
}

export function updateCombat(C, input, dt, G) {
  if (G.state !== 'playing') return;
  C.cooldown = Math.max(0, C.cooldown - dt);
  if (C._reloadT > 0) {
    C._reloadT -= dt;
    if (C._reloadT <= 0) C.mag[C._reloadW] = C.magSize[C._reloadW];
  }
  if (C._flashT > 0) {
    C._flashT -= dt;
    if (C._flashT <= 0) { C._light.visible = false; C._flash.visible = false; }
  }
  if (C._traceT > 0) {
    C._traceT -= dt;
    C._tracer.material.opacity = Math.max(0, C._traceT / 0.08) * 0.9;
    if (C._traceT <= 0) C._tracer.visible = false;
  }
  const P = G.player;
  if (!P) return;
  if (input.pressed.has('Digit1')) C.weapon = 'fists';
  if (input.pressed.has('Digit2')) C.weapon = 'pistol';
  if (input.pressed.has('Digit3')) C.weapon = 'smg';
  if (input.wheel) {
    if (input.wheel > 0) C.weapon = C.weapon === 'pistol' ? 'smg' : 'pistol';
    else C.weapon = C.weapon === 'smg' ? 'pistol' : 'smg';
  }
  if (input.pressed.has('KeyR') && C.weapon !== 'fists' &&
      C.mag[C.weapon] < C.magSize[C.weapon] && C._reloadT <= 0) {
    C._reloadT = 1; C._reloadW = C.weapon;
  }
  if (!P.onFoot) {
    if (input.mouseClicked && G.audio) G.audio.honk();
    return;
  }
  const aim = G.input.aim;
  if ((C.weapon === 'pistol' || C.weapon === 'smg') && aim) {
    P.angle = Math.atan2(aim.z - P.z, aim.x - P.x);
    P.heading = P.angle;
    P.mesh.rotation.y = -P.angle;
  }
  if (!input.mouseClicked) return;

  if (C.weapon === 'fists') {
    if (C.cooldown > 0) return;
    C.cooldown = 0.35;
    const fx = Math.cos(P.angle), fz = Math.sin(P.angle);
    let best = null, bd = 2.2 * 2.2, isCop = false;
    const scan = (list, cop) => {
      for (const t of list) {
        if (cop ? !t.alive : t.state === 'dead') continue;
        const dx = t.x - P.x, dz = t.z - P.z, dd = dx * dx + dz * dz;
        if (dd > bd) continue;
        if ((dx * fx + dz * fz) / (Math.sqrt(dd) || 1) < 0.5) continue;
        bd = dd; best = t; isCop = cop;
      }
    };
    scan(G.traffic.peds, false);
    scan(G.police.cops, true);
    if (!best) return;
    best.x += fx * 1.2; best.z += fz * 1.2;
    hurtPerson(best, 34, isCop);
    if (G.audio) G.audio.punch();
    if (isCop) G.police.addWanted(1);
    return;
  }

  if (C._reloadT > 0 || C.cooldown > 0) return;
  const w = C.weapon;
  if (C.mag[w] <= 0) { C._reloadT = 1; C._reloadW = w; return; }
  C.mag[w]--;
  C.cooldown = w === 'pistol' ? 0.28 : 0.09;
  let dx = Math.cos(P.angle), dz = Math.sin(P.angle);
  if (aim) {
    const L = Math.hypot(aim.x - P.x, aim.z - P.z);
    if (L > 0.01) { dx = (aim.x - P.x) / L; dz = (aim.z - P.z) / L; }
  }
  const gx = P.x + dx * 0.7, gz = P.z + dz * 0.7;
  C._light.position.set(gx, 1.4, gz);
  C._light.intensity = 3; C._light.visible = true;
  C._flash.position.set(gx, 1.4, gz);
  if (G.camera) C._flash.lookAt(G.camera.position);
  C._flash.visible = true;
  C._flashT = 0.05;

  let bestT = 60, best = null, bestCop = false, bestCar = false;
  const ray = (list, rad, cop, car) => {
    for (const t of list) {
      if (car ? (!t.alive || t.driver === 'player') : (cop ? !t.alive : t.state === 'dead')) continue;
      const rx = t.x - P.x, rz = t.z - P.z;
      const t2 = rx * dx + rz * dz;
      if (t2 < 0 || t2 > 60 || t2 >= bestT) continue;
      if (rx * rx + rz * rz - t2 * t2 > rad * rad) continue;
      bestT = t2; best = t; bestCop = cop; bestCar = car;
    }
  };
  ray(G.traffic.peds, 2.2, false, false);
  ray(G.police.cops, 2.2, true, false);
  ray(G.vehicles, 2.5, false, true);
  const pos = C._geo.attributes.position.array;
  pos[0] = gx; pos[1] = 1.4; pos[2] = gz;
  pos[3] = P.x + dx * bestT; pos[4] = 1.25; pos[5] = P.z + dz * bestT;
  C._geo.attributes.position.needsUpdate = true;
  C._tracer.material.opacity = 0.9;
  C._tracer.visible = true;
  C._traceT = 0.08;

  if (G.audio) G.audio.gunshot(w);
  G.lastShot = { x: P.x, z: P.z, time: G.time };
  let wanted = false;
  if (best) {
    const dmg = w === 'pistol' ? 50 : 26;
    if (bestCar) damageVehicle(best, dmg);
    else { hurtPerson(best, dmg, bestCop); wanted = true; }
  }
  if (!wanted) {
    for (const c of G.police.cops) {
      if (!c.alive) continue;
      const cx = c.x - P.x, cz = c.z - P.z;
      if (cx * cx + cz * cz < 1600) { wanted = true; break; }
    }
  }
  if (wanted) G.police.addWanted(1);
}
