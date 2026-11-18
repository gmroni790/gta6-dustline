import * as THREE from 'three';
import { mulberry32 } from './utils.js';
import { createWorld } from './world.js';
import { makeVehicle, VEHICLE_TYPES } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPlayer, updatePlayer } from './player.js';
import { createCombat, updateCombat } from './combat.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10);
const shot = params.get('shot');
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7d9a0);
scene.fog = new THREE.Fog(0xf0c489, 90, 430);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
camera.position.set(90, 55, 90);

const sun = new THREE.DirectionalLight(0xfff2d0, 2.4);
sun.position.set(140, 200, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(shot ? 1024 : 2048, shot ? 1024 : 2048);
sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffe6b8, 0x8a5a30, 0.85));

const world = createWorld(scene, rng);
const player = createPlayer(scene, world, world.spawn);
const traffic = createTraffic(scene, world, rng);
const police = createPolice(scene, world, rng);
const missions = createMissions(world);
const combat = createCombat(scene);
const hud = createHUD();
const audio = createAudio();

const G = {
  scene, camera, renderer, world, player, traffic, police, missions, combat, hud, audio,
  vehicles: [], input: { keys: new Set(), pressed: new Set(), mouseDown: false, mouseClicked: false, wheel: 0, aim: { x: 0, z: 0 } },
  state: shot ? 'playing' : 'title', time: 0, money: 0, shot, camYaw: 0, lastShot: null,
  objective: 'Free roam — find a mission marker', justCompletedMission: false,
  autoDrive: 0, lastMenu: 'title', downState: null, musicOn: true,
};
window.__game = G;

// Parked cars along the roads.
for (let i = 0; i < 8; i++) {
  const r = world.roads[Math.floor(rng() * world.roads.length)];
  const t = rng(), x = r.x1 + (r.x2 - r.x1) * t, z = r.z1 + (r.z2 - r.z1) * t;
  const a = Math.atan2(r.z2 - r.z1, r.x2 - r.x1) + (rng() < 0.5 ? 0 : Math.PI);
  const v = makeVehicle(VEHICLE_TYPES[Math.floor(rng() * VEHICLE_TYPES.length)].id,
    x - Math.sin(a) * 4, z + Math.cos(a) * 4, a);
  scene.add(v.mesh);
  G.vehicles.push(v);
}
for (const c of traffic.cars) G.vehicles.push(c);

// Input.
const mouseNDC = new THREE.Vector2(0, 0);
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!e.repeat) G.input.pressed.add(e.code);
  G.input.keys.add(e.code);
  if (e.code === 'Escape') {
    if (G.state === 'playing') { G.state = 'paused'; hud.showMenu('pause'); }
    else if (G.state === 'paused') { G.state = 'playing'; hud.hideAllMenus(); }
  }
  if (e.code === 'KeyM' && !e.repeat) { G.musicOn = !G.musicOn; audio.setMusic(G.musicOn); }
});
addEventListener('keyup', (e) => G.input.keys.delete(e.code));
addEventListener('mousemove', (e) => {
  mouseNDC.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
addEventListener('mousedown', (e) => { if (e.button === 0) { G.input.mouseDown = true; G.input.mouseClicked = true; } });
addEventListener('mouseup', (e) => { if (e.button === 0) G.input.mouseDown = false; });
addEventListener('wheel', (e) => { G.input.wheel += e.deltaY; }, { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
function updateAim() {
  raycaster.setFromCamera(mouseNDC, camera);
  if (raycaster.ray.intersectPlane(groundPlane, aimPoint)) {
    G.input.aim.x = aimPoint.x; G.input.aim.z = aimPoint.z;
  }
}

// Camera.
const camPos = new THREE.Vector3(90, 55, 90);
const camTarget = new THREE.Vector3();
const desired = new THREE.Vector3();
function updateCamera(dt) {
  const P = player;
  const tx = P.onFoot ? P.x : P.vehicle.x, tz = P.onFoot ? P.z : P.vehicle.z;
  const a = P.onFoot ? P.angle : P.vehicle.angle;
  const front = shot === 'chase';
  const dist = front ? -13 : (P.onFoot ? 7 : 11);
  const height = P.onFoot ? 3.2 : 4.5;
  const side = front ? 7 : 0;
  desired.set(
    tx - Math.cos(a) * dist - Math.sin(a) * side,
    height,
    tz - Math.sin(a) * dist + Math.cos(a) * side,
  );
  camPos.lerp(desired, 1 - Math.exp(-4 * dt));
  camera.position.copy(camPos);
  camTarget.set(tx + Math.cos(a) * 6, 1.6, tz + Math.sin(a) * 6);
  camera.lookAt(camTarget);
  G.camYaw = Math.atan2(camTarget.z - camera.position.z, camTarget.x - camera.position.x);
}

// Shot-mode staging.
function putPlayerInCar(typeId, x, z, angle, color) {
  const v = makeVehicle(typeId, x, z, angle, color);
  scene.add(v.mesh);
  G.vehicles.push(v);
  player.vehicle = v; v.driver = 'player';
  player.onFoot = false; player.mesh.visible = false;
  player.x = x; player.z = z; player.angle = angle;
  return v;
}
if (shot) {
  hud.hideAllMenus();
  if (shot === 'cover') {
    putPlayerInCar('muscle', 0, 110, -Math.PI / 2, 0xc23b22);
    G.autoDrive = 1;
    G.objective = 'Free roam — find a mission marker';
  } else if (shot === 'street') {
    player.x = 20; player.z = 40; player.angle = -Math.PI / 2;
  } else if (shot === 'chase') {
    putPlayerInCar('sedan', -20, -140, 0, 0x2e6fc2);
    G.autoDrive = 1;
    police.addWanted(3);
    G.objective = 'Lose the heat!';
  } else if (shot === 'mission') {
    player.x = 165; player.z = -138; player.angle = Math.PI;
    missions.start(0, G);
  }
}

// Menu actions.
function respawn() {
  const fee = G.downState === 'busted' ? 150 : 100;
  G.money = Math.max(0, G.money - fee);
  if (player.vehicle) { player.vehicle.driver = null; player.vehicle = null; }
  player.onFoot = true; player.mesh.visible = true;
  player.health = 100;
  police.clearWanted();
  if (G.downState === 'busted') { player.x = 40; player.z = -20; }
  else { player.x = 20; player.z = 60; }
  player.angle = -Math.PI / 2;
  G.state = 'playing';
  hud.hideAllMenus();
  hud.flash(G.downState === 'busted' ? 'Bail paid. -$' + fee : 'Patched up. -$' + fee);
}
function applySave(data) {
  if (!data) { hud.flash('No save found yet'); return false; }
  G.money = data.money || 0;
  player.health = data.health ?? 100;
  player.x = data.px ?? world.spawn.x; player.z = data.pz ?? world.spawn.z;
  player.angle = data.angle ?? world.spawn.angle;
  if (player.vehicle) { player.vehicle.driver = null; player.vehicle = null; }
  player.onFoot = true; player.mesh.visible = true;
  missions.done = Array.isArray(data.missionsDone) ? data.missionsDone.slice() : [];
  missions.relics.found = new Set(data.relicsFound || []);
  police.clearWanted();
  G.state = 'playing';
  hud.hideAllMenus();
  hud.flash('Save loaded');
  return true;
}
hud.onAction = (action) => {
  audio.uiClick();
  if (action === 'start') {
    audio.init(); audio.setMusic(true);
    G.state = 'playing'; hud.hideAllMenus();
  } else if (action === 'load') {
    if (hasSave()) { audio.init(); audio.setMusic(true); applySave(loadGame()); }
    else hud.flash('No save found yet');
  } else if (action === 'resume') {
    G.state = 'playing'; hud.hideAllMenus();
  } else if (action === 'save') {
    saveGame(G); hud.flash('Game saved');
  } else if (action === 'restart' || action === 'quit') {
    location.reload();
  } else if (action === 'help') {
    G.lastMenu = G.state === 'paused' ? 'pause' : 'title';
    hud.showMenu('help');
  } else if (action === 'help-back') {
    hud.showMenu(G.lastMenu);
  } else if (action === 'retry') {
    respawn();
  }
};
if (!shot) hud.showMenu('title');

// Main loop.
const clock = new THREE.Clock();
let prevState = G.state;
let frames = 0;
function tick() {
  requestAnimationFrame(tick);
  const rawDt = clock.getDelta();
  // In shot mode the renderer is slow (software GL), so the game advances on
  // a fixed step per frame: the shot staging is about game time, not wall time.
  const dt = shot ? 1 / 30 : Math.min(rawDt, 0.05);
  G.time += dt;
  updateAim();
  if (G.state === 'playing') {
    world.update(dt, G.time);
    traffic.update(dt, G);
    let inp = G.input;
    if (G.autoDrive) inp = { ...G.input, keys: new Set(G.input.keys).add('KeyW') };
    updatePlayer(player, inp, dt, G);
    updateCombat(combat, G.input, dt, G);
    police.update(dt, G);
    missions.update(dt, G);
    updateCamera(dt);
    hud.update(G);
    if (G.justCompletedMission) { G.justCompletedMission = false; saveGame(G); }
  } else if (G.state === 'title') {
    world.update(dt, G.time);
    traffic.update(dt, G);
    const t = G.time * 0.05;
    camera.position.set(Math.cos(t) * 95, 55, Math.sin(t) * 95);
    camera.lookAt(0, 10, 0);
  } else if (G.state === 'wasted' || G.state === 'busted') {
    world.update(dt, G.time);
    updateCamera(dt);
  }
  if (G.state !== prevState) {
    if (G.state === 'wasted' || G.state === 'busted') {
      G.downState = G.state;
      hud.showMenu(G.state);
    }
    prevState = G.state;
  }
  renderer.render(scene, camera);
  if (++frames === 30) window.__shotReady = true;
  G.input.pressed.clear();
  G.input.mouseClicked = false;
  G.input.wheel = 0;
}
tick();
