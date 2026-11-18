// Dustline — combat module.
// Three weapons (fists, pistol, SMG), hitscan shooting down the camera's
// view, tracers and a muzzle flash, and a small target registry that other
// modules (missions) use to make things shootable. Never draws HUD text.

import * as THREE from '../vendor/three.module.min.js';
import { dist2 } from './utils.js';

const WEAPONS = {
  fists: { range: 2.6, damage: 18, delay: 0.35, mag: Infinity, reload: 0 },
  pistol: { range: 70, damage: 34, delay: 0.28, mag: 12, reload: 1.1 },
  smg: { range: 45, damage: 16, delay: 0.09, mag: 30, reload: 1.5 },
};
const ORDER = ['fists', 'pistol', 'smg'];
// Which state field holds the reserve ammo for each gun.
const RESERVE_KEY = { pistol: 'ammoPistol', smg: 'ammoSmg' };

export function createCombat(ctx) {
  const { scene, camera, input, state } = ctx;

  // ----- Tracer line and muzzle flash, reused every shot -----
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.frustumCulled = false;
  scene.add(tracer);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd23f,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), flashMat);
  flash.visible = false;
  scene.add(flash);

  // ----- State -----
  const targets = []; // { id, group, radius, health, onDestroyed }
  let nextId = 1;
  const mags = { pistol: WEAPONS.pistol.mag, smg: WEAPONS.smg.mag };
  let cooldown = 0;
  let reloading = null; // weapon word while a reload is running
  let reloadTimer = 0;
  let tracerLife = 0;
  let flashLife = 0;

  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpHit = new THREE.Vector3();
  const tmpMuzzle = new THREE.Vector3();

  function addTarget(t) {
    const rec = {
      id: nextId++,
      group: t.group,
      radius: t.radius,
      health: t.health,
      onDestroyed: t.onDestroyed,
    };
    targets.push(rec);
    return rec;
  }

  function removeTarget(handle) {
    const i = targets.indexOf(handle);
    if (i >= 0) targets.splice(i, 1);
  }

  function damageTarget(rec, amount) {
    rec.health -= amount;
    if (rec.health <= 0) {
      removeTarget(rec);
      if (typeof rec.onDestroyed === 'function') rec.onDestroyed(rec);
    }
  }

  // Where the player's feet are, on foot or in a car.
  function playerPos(out) {
    const p = ctx.player;
    if (p) return out.copy(p.group.position);
    return out.set(0, 0, 0);
  }

  function muzzlePos(out) {
    const p = ctx.player;
    playerPos(out);
    out.y = 1.45;
    if (p) {
      out.x += Math.sin(p.heading) * 0.9;
      out.z += Math.cos(p.heading) * 0.9;
    }
    return out;
  }

  function showShot(from, to) {
    const pos = tracerGeo.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    tracerLife = 1;
    tracerMat.opacity = 0.9;
    flash.position.copy(from);
    flash.quaternion.copy(camera.quaternion);
    flash.visible = true;
    flashLife = 1;
    flashMat.opacity = 0.95;
    // A random roll keeps the flash from looking like a stamped square.
    flash.rotateZ(ctx.rng ? ctx.rng.range(0, Math.PI) : 0);
  }

  function playShot(weapon) {
    if (ctx.audio && typeof ctx.audio.shot === 'function') ctx.audio.shot(weapon);
  }

  // Hitscan along the camera's forward ray; returns the hit point.
  function fireGun(weapon, cfg) {
    const origin = muzzlePos(tmpMuzzle);
    camera.getWorldDirection(tmpDir);
    let best = null;
    let bestT = cfg.range;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      // Aim at the middle of the target, about chest height for a figure.
      tmpTo.set(t.group.position.x, t.group.position.y + 1, t.group.position.z);
      tmpTo.sub(origin);
      const along = tmpTo.dot(tmpDir);
      if (along < 0 || along > bestT) continue;
      tmpHit.copy(tmpDir).multiplyScalar(along).add(origin);
      const dx = t.group.position.x - tmpHit.x;
      const dy = t.group.position.y + 1 - tmpHit.y;
      const dz = t.group.position.z - tmpHit.z;
      if (dx * dx + dy * dy + dz * dz <= t.radius * t.radius) {
        best = t;
        bestT = along;
      }
    }
    const end = tmpHit.copy(tmpDir).multiplyScalar(bestT).add(origin);
    showShot(origin, end);
    if (best) damageTarget(best, cfg.damage);
    playShot(weapon);
  }

  function swingFists(cfg) {
    const p = ctx.player;
    if (!p) return;
    const px = p.group.position.x;
    const pz = p.group.position.z;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    let best = null;
    let bestD = cfg.range;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const tx = t.group.position.x;
      const tz = t.group.position.z;
      const d = dist2(px, pz, tx, tz);
      // Reach is measured to the target's edge, so wide targets are hittable.
      const edge = d - (t.radius || 0);
      if (edge > bestD) continue;
      // Must be in front of the player, not behind.
      const dot = ((tx - px) * fx + (tz - pz) * fz) / (d || 1);
      if (dot < 0.5) continue;
      best = t;
      bestD = edge;
    }
    if (best) damageTarget(best, cfg.damage);
    playShot('fists');
  }

  function setWeapon(name) {
    if (state.weapon === name) return;
    state.weapon = name;
    reloading = null;
    reloadTimer = 0;
  }

  function cycleWeapon(step) {
    const i = ORDER.indexOf(state.weapon);
    const next = ORDER[(i + step + ORDER.length) % ORDER.length];
    setWeapon(next);
  }

  function startReload() {
    const w = state.weapon;
    if (w === 'fists' || reloading) return;
    const key = RESERVE_KEY[w];
    if (mags[w] >= WEAPONS[w].mag || state[key] <= 0) return;
    reloading = w;
    reloadTimer = WEAPONS[w].reload;
  }

  function finishReload() {
    const w = reloading;
    const key = RESERVE_KEY[w];
    const need = WEAPONS[w].mag - mags[w];
    const take = Math.min(need, state[key]);
    mags[w] += take;
    state[key] -= take;
    reloading = null;
    reloadTimer = 0;
  }

  function tryFire() {
    if (cooldown > 0 || reloading) return;
    const w = state.weapon;
    const cfg = WEAPONS[w];
    if (!cfg) return;
    if (w === 'fists') {
      swingFists(cfg);
      cooldown = cfg.delay;
      return;
    }
    if (mags[w] <= 0) {
      startReload();
      return;
    }
    mags[w] -= 1;
    fireGun(w, cfg);
    cooldown = cfg.delay;
    // Gunfire draws attention: a quiet street stops being quiet.
    if (state.wanted === 0) state.wanted = 1;
  }

  function update(dt) {
    // Fade the tracer and flash whether or not the game is running.
    if (tracerLife > 0) {
      tracerLife = Math.max(0, tracerLife - dt * 7);
      tracerMat.opacity = tracerLife * 0.9;
    }
    if (flashLife > 0) {
      flashLife = Math.max(0, flashLife - dt * 9);
      flashMat.opacity = flashLife * 0.95;
      if (flashLife <= 0) flash.visible = false;
    }
    if (cooldown > 0) cooldown -= dt;
    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) finishReload();
    }
    if (state.mode !== 'playing') return;
    // Shooting is an on-foot activity; driving has its own controls.
    const onFoot = !ctx.player || ctx.player.onFoot;
    if (!onFoot) return;

    if (input.pressed.has('Digit1')) setWeapon('fists');
    else if (input.pressed.has('Digit2')) setWeapon('pistol');
    else if (input.pressed.has('Digit3')) setWeapon('smg');
    if (input.wheel > 0) cycleWeapon(1);
    else if (input.wheel < 0) cycleWeapon(-1);
    if (input.pressed.has('KeyR')) startReload();
    if (input.firing) tryFire();
  }

  return {
    update,
    addTarget,
    removeTarget,
    // Read by the hud to show magazine counts and the reload state.
    get mags() {
      return mags;
    },
    get reloading() {
      return reloading !== null;
    },
  };
}
