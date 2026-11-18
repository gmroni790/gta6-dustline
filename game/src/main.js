// Dustline boot and game loop: builds the renderer, the shared context and
// every module, then runs the frame loop. Input is gathered from DOM events,
// the world advances in fixed steps, and the camera follows Rae.
//
// ?seed=N fixes the city's random layout. ?shot=cover|street|chase|mission
// (with &seed=N) stages that scene for a screenshot: the game starts
// playing at once, advances on a fixed one-thirtieth step several steps per
// frame, and sets window.__shotReady once the scene is painted.
import * as THREE from '../vendor/three.module.min.js';
import { Rng, clamp, damp, angleLerp } from './utils.js';
import { createWorld } from './world.js';
import { createVehicles } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPlayer } from './player.js';
import { createCombat } from './combat.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';
import { createHUD } from './hud.js';

const STEP = 1 / 30;
const SHOT_STEPS_PER_FRAME = 5;
const MAX_REAL_DT = 0.05;

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const isShot = shotMode === 'cover' || shotMode === 'street' || shotMode === 'chase' || shotMode === 'mission';

// ------------------------------------------------------------ game state

const state = {
  mode: isShot ? 'playing' : 'title',
  time: 0,
  money: 250,
  wanted: 0,
  health: 100,
  weapon: 'fists',
  ammoPistol: 48,
  ammoSmg: 90,
  objective: '',
  missionIndex: 0,
  relicsFound: 0,
  shotMode: isShot ? shotMode : null,
  seed,
  muted: false,
};

const input = {
  keys: new Set(),
  pressed: new Set(),
  lookX: 0,
  lookY: 0,
  firing: false,
  wheel: 0,
};

// ------------------------------------------------------------ renderer

const mount = document.getElementById('gameMount');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------ input

const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyM', 'Digit1', 'Digit2', 'Digit3', 'Escape', 'ShiftLeft', 'ShiftRight']);

window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (!e.repeat) input.pressed.add(e.code);
  input.keys.add(e.code);
  if (e.code === 'Escape' && !e.repeat) {
    if (state.mode === 'playing') state.mode = 'paused';
    else if (state.mode === 'paused') state.mode = 'playing';
    else if (state.mode === 'help') state.mode = 'title';
  }
  if (e.code === 'KeyM' && !e.repeat && ctx.audio) ctx.audio.toggleMusic();
  // The M key toggles music itself, so it must not also trigger the
  // first-gesture music start below (which would undo the toggle).
  wakeAudio(e.code !== 'KeyM');
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
window.addEventListener('blur', () => input.keys.clear());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) input.firing = true;
  wakeAudio(true);
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) input.firing = false;
});
window.addEventListener('mousemove', (e) => {
  input.lookX += e.movementX || 0;
  input.lookY += e.movementY || 0;
});
window.addEventListener('wheel', (e) => {
  input.wheel += e.deltaY > 0 ? 1 : -1;
}, { passive: true });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing') state.mode = 'paused';
});

// The wasted and busted screens restart the run with a fresh page load.
for (const id of ['btnRestartWasted', 'btnRestartBusted']) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', () => window.location.reload());
}

// ------------------------------------------------------------ modules

const rng = new Rng(seed);
const ctx = {
  scene,
  camera,
  input,
  state,
  rng,
  camHeading: 0,
  world: null,
  vehicles: null,
  traffic: null,
  player: null,
  combat: null,
  police: null,
  missions: null,
  hud: null,
  audio: null,
  save: null,
};

ctx.world = createWorld(ctx);
ctx.vehicles = createVehicles(ctx);
ctx.traffic = createTraffic(ctx);
ctx.player = createPlayer(ctx);
ctx.combat = createCombat(ctx);
ctx.police = createPolice(ctx);
ctx.missions = createMissions(ctx);
ctx.audio = createAudio(ctx);
ctx.save = createSave(ctx);
ctx.hud = createHUD(ctx);

let musicStarted = false;
function wakeAudio(allowMusicStart) {
  if (!ctx.audio) return;
  ctx.audio.resume();
  // Only count the music as started when it really started: while the
  // context is still suspended the start is a no-op and the next gesture
  // must retry it.
  if (!musicStarted && allowMusicStart && state.mode === 'playing') {
    musicStarted = ctx.audio.toggleMusic();
  }
}

// A few parked cars near the start so Rae can grab a ride at once.
(function parkCars() {
  const spots = ctx.world.intersections;
  for (let i = 0; i < 6 && spots.length > 0; i++) {
    const at = spots[Math.floor(rng.next() * spots.length)];
    ctx.vehicles.spawn('random', at.x + rng.range(-14, 14), at.z + rng.range(-14, 14), rng.range(0, Math.PI * 2));
  }
})();

ctx.player.place(ctx.world.places.playerStart.x, ctx.world.places.playerStart.z, 0);

// The state the screenshot tool and any debugger read. Getters keep it live.
window.__game = {
  get state() { return state.mode; },
  get time() { return state.time; },
  get money() { return state.money; },
  get objective() { return state.objective; },
  get police() { return ctx.police; },
  get vehicles() { return ctx.vehicles ? ctx.vehicles.all : []; },
  get traffic() { return ctx.traffic; },
};

// ------------------------------------------------------------ camera

let camYaw = Math.PI * 0.25;
let camPitch = 0.32;
let camPos = new THREE.Vector3(0, 40, 120);
let lastMouseMove = -10;
const camTarget = new THREE.Vector3();

function focusPoint(out) {
  const p = ctx.player;
  if (p && !p.onFoot && p.car) {
    out.copy(p.car.group.position);
    out.y += 2.2;
  } else if (p) {
    out.copy(p.group.position);
    out.y += 1.8;
  } else {
    out.set(0, 2, 0);
  }
  return out;
}

function updateCamera(dt) {
  if (input.lookX !== 0 || input.lookY !== 0) lastMouseMove = state.time;
  camYaw -= input.lookX * 0.0028;
  camPitch = clamp(camPitch + input.lookY * 0.0022, 0.08, 0.9);
  ctx.camHeading = camYaw;

  const driving = ctx.player && !ctx.player.onFoot && ctx.player.car;
  if (driving && state.time - lastMouseMove > 2.5) {
    // Hands off the mouse while driving: ease the camera in behind the car.
    camYaw = angleLerp(camYaw, ctx.player.car.heading, 1 - Math.exp(-0.8 * dt));
  }
  const dist = driving ? 12.5 : 9.5;
  const height = driving ? 4.6 : 3.8;
  focusPoint(camTarget);
  const want = new THREE.Vector3(
    camTarget.x - Math.sin(camYaw) * Math.cos(camPitch) * dist,
    camTarget.y + Math.sin(camPitch) * dist + height * 0.4,
    camTarget.z - Math.cos(camYaw) * Math.cos(camPitch) * dist,
  );
  camPos.x = damp(camPos.x, want.x, 6, dt);
  camPos.y = damp(camPos.y, want.y, 6, dt);
  camPos.z = damp(camPos.z, want.z, 6, dt);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

// ------------------------------------------------------------ shot staging

let fixedCam = null;

function stageShot() {
  const places = ctx.world.places;
  if (shotMode === 'cover') {
    // High over downtown, looking across the whole city.
    fixedCam = {
      pos: new THREE.Vector3(places.downtown.x + 70, 120, places.downtown.z + 150),
      look: new THREE.Vector3(places.downtown.x, 8, places.downtown.z),
    };
    ctx.player.place(places.downtown.x, places.downtown.z, 0);
  } else if (shotMode === 'street') {
    // Street level at a downtown intersection, traffic rolling past.
    let best = ctx.world.intersections[0];
    let bestD = Infinity;
    for (const cross of ctx.world.intersections) {
      const d = (cross.x - places.downtown.x) ** 2 + (cross.z - places.downtown.z) ** 2;
      if (d < bestD) { bestD = d; best = cross; }
    }
    fixedCam = {
      pos: new THREE.Vector3(best.x + 14, 3.6, best.z + 14),
      look: new THREE.Vector3(best.x - 10, 2, best.z - 10),
    };
    ctx.player.place(best.x + 3, best.z + 2, Math.PI * 0.75);
  } else if (shotMode === 'chase') {
    // Rae in a muscle car with the law on her tail. The throttle stays
    // down for the whole shot: in shot mode no real keyboard ever clears
    // it, so the car genuinely drives and the patrol cars genuinely chase.
    const road = ctx.world.roads[0];
    const x = (road.ax + road.bx) / 2;
    const z = (road.az + road.bz) / 2;
    ctx.vehicles.spawn('muscle', x, z, 0);
    ctx.player.place(x + 3, z, 0);
    input.pressed.add('KeyE');
    input.keys.add('KeyW');
    ctx.police.addHeat(3);
  } else if (shotMode === 'mission') {
    // At the diner, Mama Rosa's job marker glowing ahead. Close enough
    // that the job could start (inside the nine-unit start radius).
    ctx.player.place(places.diner.x + 5, places.diner.z + 4, 0);
    camYaw = Math.atan2(places.diner.x - (places.diner.x + 5), places.diner.z - (places.diner.z + 4));
  }
}

// ------------------------------------------------------------ loop

function stepWorld(dt) {
  ctx.world.update(dt);
  ctx.vehicles.update(dt);
  ctx.traffic.update(dt);
  if (state.mode !== 'playing') return;
  ctx.missions.update(dt);
  ctx.player.update(dt);
  ctx.combat.update(dt);
  ctx.police.update(dt);
  if (ctx.audio) {
    const driving = ctx.player && !ctx.player.onFoot && ctx.player.car;
    const frac = driving ? clamp(Math.abs(ctx.player.car.speed) / ctx.player.car.type.topSpeed, 0, 1) : 0;
    ctx.audio.setEngine(frac);
  }
  ctx.save.update(dt);
  state.time += dt;
}

// Chase shot: the camera rides ahead of the car and looks back at it, so
// the car drives toward the lens with the pursuit trailing behind it.
function updateChaseCamera(dt) {
  const p = ctx.player;
  if (!p || !p.car) {
    updateCamera(dt);
    return;
  }
  const car = p.car;
  const heading = car.heading;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = -Math.cos(heading);
  const rz = Math.sin(heading);
  const at = car.group.position;
  const want = new THREE.Vector3(
    at.x + fx * 20 + rx * 7,
    4.6,
    at.z + fz * 20 + rz * 7,
  );
  camPos.x = damp(camPos.x, want.x, 5, dt);
  camPos.y = damp(camPos.y, want.y, 5, dt);
  camPos.z = damp(camPos.z, want.z, 5, dt);
  camera.position.copy(camPos);
  camera.lookAt(at.x, 1.6, at.z);
  ctx.camHeading = heading;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - (frame.last ?? now)) / 1000, MAX_REAL_DT);
  frame.last = now;

  if (isShot) {
    for (let i = 0; i < SHOT_STEPS_PER_FRAME; i++) {
      stepWorld(STEP);
      // A key pressed this frame acts on the first step only, never five times.
      if (i === 0) input.pressed.clear();
    }
  } else if (state.mode === 'playing') {
    stepWorld(dtReal);
  } else if (state.mode === 'title' || state.mode === 'wasted' || state.mode === 'busted') {
    ctx.world.update(dtReal);
    ctx.vehicles.update(dtReal);
    ctx.traffic.update(dtReal);
  }

  if (fixedCam) {
    camera.position.copy(fixedCam.pos);
    camera.lookAt(fixedCam.look);
    ctx.camHeading = camYaw;
  } else if (state.mode === 'title' && !isShot) {
    // Slow orbit over downtown behind the title menu.
    const t = now / 1000;
    const c = ctx.world.places.downtown;
    camera.position.set(c.x + Math.sin(t * 0.05) * 130, 85, c.z + Math.cos(t * 0.05) * 130);
    camera.lookAt(c.x, 5, c.z);
  } else if (isShot && shotMode === 'chase') {
    updateChaseCamera(isShot ? STEP * SHOT_STEPS_PER_FRAME : dtReal);
  } else {
    updateCamera(isShot ? STEP * SHOT_STEPS_PER_FRAME : dtReal);
  }

  ctx.hud.update(isShot ? STEP * SHOT_STEPS_PER_FRAME : dtReal);
  renderer.render(scene, camera);

  input.pressed.clear();
  input.lookX = 0;
  input.lookY = 0;
  input.wheel = 0;

  frame.painted = (frame.painted ?? 0) + 1;
  // Ready means painted: the page is fit to screenshot in any mode, shot
  // or title, once two frames have rendered.
  if (frame.painted >= 2 && !window.__shotReady) window.__shotReady = true;
}

if (isShot) stageShot();
requestAnimationFrame(frame);
