// Hand-to-hand and gun combat: fists, pistol and SMG, with a muzzle flash,
// a tracer line and a point light for each shot. Shots and punches that land
// on people (or ring out near a cop) raise the wanted level.
import * as THREE from 'three';
import { damageVehicle } from './vehicles.js';

const MELEE_RANGE = 2.2;
const SHOT_RANGE = 60;

// Cops fall over and stop (alive=false); peds switch to the 'dead' state.
function damagePerson(target, dmg, isCop) {
  target.hp = (target.hp == null ? 100 : target.hp) - dmg;
  if (target.hp <= 0) {
    if (isCop) target.alive = false;
    else {
      target.state = 'dead';
      target.deadT = 0;
    }
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
  const tracer = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 })
  );
  tracer.visible = false;
  scene.add(tracer);

  return {
    weapon: 'fists',
    ammo: { pistol: 48, smg: 150 },
    mag: { pistol: 12, smg: 30 },
    magSize: { pistol: 12, smg: 30 },
    cooldown: 0,
    _reloadT: 0,
    _reloadW: '',
    _flashT: 0,
    _traceT: 0,
    _light: light,
    _flash: flash,
    _tracer: tracer,
    _geo: geo,
  };
}

export function updateCombat(C, input, dt, G) {
  if (G.state !== 'playing') return;

  C.cooldown = Math.max(0, C.cooldown - dt);

  // A finished reload tops the magazine back up.
  if (C._reloadT > 0) {
    C._reloadT -= dt;
    if (C._reloadT <= 0) C.mag[C._reloadW] = C.magSize[C._reloadW];
  }
  if (C._flashT > 0) {
    C._flashT -= dt;
    if (C._flashT <= 0) {
      C._light.visible = false;
      C._flash.visible = false;
    }
  }
  if (C._traceT > 0) {
    C._traceT -= dt;
    C._tracer.material.opacity = Math.max(0, C._traceT / 0.08) * 0.9;
    if (C._traceT <= 0) C._tracer.visible = false;
  }

  const P = G.player;
  if (!P) return;

  // Weapon select: number keys pick directly, the wheel swaps the two guns.
  if (input.pressed.has('Digit1')) C.weapon = 'fists';
  if (input.pressed.has('Digit2')) C.weapon = 'pistol';
  if (input.pressed.has('Digit3')) C.weapon = 'smg';
  if (input.wheel) {
    if (input.wheel > 0) C.weapon = C.weapon === 'pistol' ? 'smg' : 'pistol';
    else C.weapon = C.weapon === 'smg' ? 'pistol' : 'smg';
  }
  if (
    input.pressed.has('KeyR') &&
    C.weapon !== 'fists' &&
    C.mag[C.weapon] < C.magSize[C.weapon] &&
    C._reloadT <= 0
  ) {
    C._reloadT = 1;
    C._reloadW = C.weapon;
  }

  // Behind the wheel the click is the horn, not a weapon.
  if (!P.onFoot) {
    if (input.mouseClicked && G.audio) G.audio.honk();
    return;
  }

  // With a gun drawn, Rae faces the mouse aim point.
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
    const fwdX = Math.cos(P.angle);
    const fwdZ = Math.sin(P.angle);
    let target = null;
    let targetSq = MELEE_RANGE * MELEE_RANGE;
    let targetIsCop = false;
    const scan = (list, isCop) => {
      for (const t of list) {
        if (isCop ? !t.alive : t.state === 'dead') continue;
        const dx = t.x - P.x;
        const dz = t.z - P.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > targetSq) continue;
        // Only hit what is in front of the swing.
        if ((dx * fwdX + dz * fwdZ) / (Math.sqrt(distSq) || 1) < 0.5) continue;
        targetSq = distSq;
        target = t;
        targetIsCop = isCop;
      }
    };
    scan(G.traffic.peds, false);
    scan(G.police.cops, true);
    if (!target) return;
    target.x += fwdX * 1.2;
    target.z += fwdZ * 1.2;
    damagePerson(target, 34, targetIsCop);
    if (G.audio) G.audio.punch();
    if (targetIsCop) G.police.addWanted(1);
    return;
  }

  // Guns: respect the fire rate and any reload in progress.
  if (C._reloadT > 0 || C.cooldown > 0) return;
  const gun = C.weapon;
  if (C.mag[gun] <= 0) {
    C._reloadT = 1;
    C._reloadW = gun;
    return;
  }
  C.mag[gun]--;
  C.cooldown = gun === 'pistol' ? 0.28 : 0.09;

  let dirX = Math.cos(P.angle);
  let dirZ = Math.sin(P.angle);
  if (aim) {
    const aimLen = Math.hypot(aim.x - P.x, aim.z - P.z);
    if (aimLen > 0.01) {
      dirX = (aim.x - P.x) / aimLen;
      dirZ = (aim.z - P.z) / aimLen;
    }
  }
  const gunX = P.x + dirX * 0.7;
  const gunZ = P.z + dirZ * 0.7;
  C._light.position.set(gunX, 1.4, gunZ);
  C._light.intensity = 3;
  C._light.visible = true;
  C._flash.position.set(gunX, 1.4, gunZ);
  if (G.camera) C._flash.lookAt(G.camera.position);
  C._flash.visible = true;
  C._flashT = 0.05;

  // Raycast along the shot; the nearest thing in the path takes the hit.
  let hitDist = SHOT_RANGE;
  let hit = null;
  let hitCop = false;
  let hitCar = false;
  const cast = (list, radius, isCop, isCar) => {
    for (const t of list) {
      if (isCar) {
        if (!t.alive || t.driver === 'player') continue;
      } else if (isCop ? !t.alive : t.state === 'dead') continue;
      const relX = t.x - P.x;
      const relZ = t.z - P.z;
      const along = relX * dirX + relZ * dirZ;
      if (along < 0 || along > SHOT_RANGE || along >= hitDist) continue;
      const offSq = relX * relX + relZ * relZ - along * along;
      if (offSq > radius * radius) continue;
      hitDist = along;
      hit = t;
      hitCop = isCop;
      hitCar = isCar;
    }
  };
  cast(G.traffic.peds, 2.2, false, false);
  cast(G.police.cops, 2.2, true, false);
  cast(G.vehicles, 2.5, false, true);

  const points = C._geo.attributes.position.array;
  points[0] = gunX;
  points[1] = 1.4;
  points[2] = gunZ;
  points[3] = P.x + dirX * hitDist;
  points[4] = 1.25;
  points[5] = P.z + dirZ * hitDist;
  C._geo.attributes.position.needsUpdate = true;
  C._tracer.material.opacity = 0.9;
  C._tracer.visible = true;
  C._traceT = 0.08;

  if (G.audio) G.audio.gunshot(gun);
  G.lastShot = { x: P.x, z: P.z, time: G.time };

  let heat = false;
  if (hit) {
    const dmg = gun === 'pistol' ? 50 : 26;
    if (hitCar) damageVehicle(hit, dmg);
    else {
      damagePerson(hit, dmg, hitCop);
      heat = true;
    }
  }
  // Even a miss draws heat if a cop is close enough to hear the shot.
  if (!heat) {
    for (const cop of G.police.cops) {
      if (!cop.alive) continue;
      const cx = cop.x - P.x;
      const cz = cop.z - P.z;
      if (cx * cx + cz * cz < 1600) {
        heat = true;
        break;
      }
    }
  }
  if (heat) G.police.addWanted(1);
}
