// Missions and turquoise relics for Dustline.
//
// Six jobs, each given by a named character at a map spot. A mission is a
// list of steps — 'goto' (reach a spot), 'wait' (stand still a few seconds)
// or 'escape' (drop the wanted level to zero). Finishing a step may add
// heat; finishing the last step pays out. Ten relics are hidden around the
// map, worth $50 each, and tracked separately from missions.

import * as THREE from 'three';

const TAU = Math.PI * 2;

// Squared distance on the ground plane.
function distSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

const MISSION_LIST = [
  {
    id: 'first-run', title: 'First Run', giver: 'Mama Rosa', spot: 'truckStop', letter: 'R',
    briefing: 'Rosa needs a parcel run downtown. Take it to the city, quick and clean.',
    pay: 150,
    steps: [
      { kind: 'goto', spot: 'truckStop', text: 'Meet Mama Rosa at the truck stop', radius: 10 },
      { kind: 'goto', spot: 'downtown', text: 'Deliver the package downtown', radius: 10 },
    ],
  },
  {
    id: 'quarry-dust', title: 'Quarry Dust', giver: 'Deke', spot: 'quarry', letter: 'D',
    briefing: 'Deke has a crate waiting at the quarry. Haul it to Old Town.',
    pay: 200,
    steps: [
      { kind: 'goto', spot: 'quarry', text: 'Reach the quarry', radius: 10 },
      { kind: 'wait', secs: 2, text: 'Loading the crate...' },
      { kind: 'goto', spot: 'oldTown', text: 'Deliver the crate to Old Town', radius: 10 },
    ],
  },
  {
    id: 'canyon-call', title: 'Canyon Call', giver: 'Sal', spot: 'canyon', letter: 'S',
    briefing: 'Sal flagged a pickup at the canyon overlook. The law will be watching — shake them after.',
    pay: 250,
    steps: [
      { kind: 'goto', spot: 'canyon', text: 'Reach the canyon overlook', radius: 10, heat: 2 },
      { kind: 'escape', text: 'Lose the heat' },
    ],
  },
  {
    id: 'dune-dash', title: 'Dune Dash', giver: 'Nadia', spot: 'dunes', letter: 'N',
    briefing: 'Nadia timed the run: dunes to highway to the truck stop, 100 seconds. Beat the clock.',
    pay: 300, timer: 100,
    steps: [
      { kind: 'goto', spot: 'dunes', text: 'Checkpoint 1: the dunes', radius: 12 },
      { kind: 'goto', spot: 'highway', text: 'Checkpoint 2: the highway', radius: 12 },
      { kind: 'goto', spot: 'truckStop', text: 'Checkpoint 3: the truck stop', radius: 12 },
    ],
  },
  {
    id: 'long-haul', title: 'The Long Haul', giver: 'Old Pete', spot: 'highway', letter: 'P',
    briefing: 'Pete has a trailer that has to reach downtown. Expect company halfway there.',
    pay: 400,
    steps: [
      { kind: 'goto', spot: 'highway', text: 'Meet Old Pete on the highway', radius: 10 },
      { kind: 'goto', spot: 'truckStop', text: 'Haul the trailer to the truck stop', radius: 10, heat: 2 },
      { kind: 'goto', spot: 'downtown', text: 'Deliver downtown', radius: 10 },
    ],
  },
  {
    id: 'rim-runner', title: 'Rim Runner', giver: 'The Broker', spot: 'downtown', letter: 'B',
    briefing: "The Broker's final job: canyon pickup, truck stop drop, and a three-star goodbye.",
    pay: 600,
    steps: [
      { kind: 'goto', spot: 'canyon', text: 'Pick up at the canyon', radius: 10 },
      { kind: 'goto', spot: 'truckStop', text: 'Deliver to the truck stop', radius: 10, heat: 3 },
      { kind: 'escape', text: 'Lose the heat' },
    ],
  },
];

// A 64x64 canvas with a single amber letter, used as a billboard texture.
function makeLetterTexture(letter) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const c = canvas.getContext('2d');
  c.fillStyle = '#ffb020';
  c.font = 'bold 44px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(letter, 32, 34);
  return new THREE.CanvasTexture(canvas);
}

// A tall, open-ended glowing cylinder — a light pillar marking a spot.
function makeBeacon(color, height) {
  const group = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, height, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  column.position.y = height / 2;
  group.add(column);
  return group;
}

export function createMissions(world) {
  const missions = {
    list: MISSION_LIST,
    active: null,
    done: [],
    start,
    update,
    relics: { found: new Set(), total: 10 },
    activeTarget: null,
  };

  let built = false;
  let lastG = null;
  let giverBeacons = [];
  let targetBeacon = null;
  let relicGroups = [];

  // Build the 3D markers once: an amber beacon + floating letter per
  // giver, one tall cyan beacon for the current objective, and the relics.
  function build(G) {
    const scene = G.scene;

    for (const def of MISSION_LIST) {
      const spot = world.spots[def.spot];
      const beacon = makeBeacon(0xffb020, 12);
      const letter = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 1.6),
        new THREE.MeshBasicMaterial({
          map: makeLetterTexture(def.letter), transparent: true,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      letter.position.y = 7;
      beacon.add(letter);
      beacon.position.set(spot.x, 0, spot.z);
      scene.add(beacon);
      giverBeacons.push({ def, group: beacon, letter, phase: Math.random() * TAU });
    }

    targetBeacon = makeBeacon(0x33e0ff, 18);
    targetBeacon.visible = false;
    scene.add(targetBeacon);

    const rockMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
    const gemMat = new THREE.MeshLambertMaterial({
      color: 0x2fd8c8, emissive: 0x18b8a8, emissiveIntensity: 1.4,
    });
    for (const spot of world.relicSpots) {
      const group = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55), rockMat);
      rock.position.y = 0.3;
      rock.scale.y = 0.7;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), gemMat);
      gem.position.y = 1.1;
      group.add(rock, gem);
      group.position.set(spot.x, 0, spot.z);
      scene.add(group);
      relicGroups.push({ group, gem, x: spot.x, z: spot.z });
    }
  }

  // Start mission `i` (index into the list). Fails unless the player is
  // standing by the giver, the job is still open, and nothing is running.
  function start(i, G) {
    G = G || lastG;
    if (!G || missions.active) return false;
    const def = MISSION_LIST[i];
    if (!def || missions.done.includes(def.id)) return false;
    const spot = world.spots[def.spot];
    const player = G.player;
    if (Math.hypot(player.x - spot.x, player.z - spot.z) > 6) return false;

    missions.active = { def, step: 0, timer: def.timer || 0, t: 0 };
    G.objective = def.steps[0].text;
    G.hud.flash(def.briefing, 4000);
    G.audio.uiClick();
    return true;
  }

  // The active mission is finished: pay up, mark it done, reset the HUD.
  function completeMission(G) {
    const def = missions.active.def;
    G.money += def.pay;
    missions.done.push(def.id);
    missions.active = null;
    missions.activeTarget = null;
    targetBeacon.visible = false;
    G.audio.missionOk();
    G.audio.cash();
    G.hud.flash('Mission complete! +$' + def.pay, 3000);
    G.objective = 'Free roam — find a mission marker';
    G.justCompletedMission = true;
  }

  // The active mission failed (only the timed one can fail): clear it.
  function failMission(G) {
    missions.active = null;
    missions.activeTarget = null;
    targetBeacon.visible = false;
    G.audio.missionFail();
    G.hud.flash('Mission failed — try again', 3000);
    G.objective = 'Free roam — find a mission marker';
  }

  // Hide a used target beacon and clear the minimap marker.
  function clearTarget() {
    missions.activeTarget = null;
    targetBeacon.visible = false;
  }

  function update(dt, G) {
    lastG = G;
    if (!built) {
      build(G);
      built = true;
    }
    if (G.state !== 'playing') return;

    const player = G.player;
    const t = G.time;

    // Giver beacons: hidden for finished jobs and the active one;
    // their letters bob and face the camera.
    for (const b of giverBeacons) {
      const visible = !missions.done.includes(b.def.id) &&
        (!missions.active || missions.active.def !== b.def);
      b.group.visible = visible;
      if (visible) {
        b.letter.position.y = 7 + Math.sin(t * 2 + b.phase) * 0.4;
        b.letter.lookAt(G.camera.position);
      }
    }

    // Relics: gems spin and hover; walking close picks one up.
    for (let i = 0; i < relicGroups.length; i++) {
      const relic = relicGroups[i];
      if (missions.relics.found.has(i)) {
        relic.group.visible = false;
        continue;
      }
      relic.gem.rotation.y += dt * 1.5;
      relic.gem.position.y = 1.1 + Math.sin(t * 2 + i) * 0.15;
      if (distSq(player.x, player.z, relic.x, relic.z) < 2.5 * 2.5) {
        missions.relics.found.add(i);
        relic.group.visible = false;
        G.money += 50;
        G.audio.pickup();
        G.hud.flash('Turquoise Relic found! +$50 (' + missions.relics.found.size + '/10)', 2500);
      }
    }

    // No mission running: E near a giver starts their job.
    if (!missions.active) {
      clearTarget();
      if (G.input.pressed.has('KeyE')) {
        for (let i = 0; i < MISSION_LIST.length; i++) {
          const def = MISSION_LIST[i];
          if (missions.done.includes(def.id)) continue;
          const spot = world.spots[def.spot];
          if (Math.hypot(player.x - spot.x, player.z - spot.z) <= 6) {
            start(i, G);
            break;
          }
        }
      }
      return;
    }

    const active = missions.active;
    const def = active.def;

    // Timed missions count down; running out fails the job.
    if (def.timer) {
      active.timer -= dt;
      if (active.timer <= 0) {
        failMission(G);
        return;
      }
    }

    const step = def.steps[active.step];

    // 'goto' steps point the cyan beacon and minimap marker at the spot.
    if (step.kind === 'goto') {
      const spot = world.spots[step.spot];
      missions.activeTarget = { x: spot.x, z: spot.z };
      targetBeacon.visible = true;
      targetBeacon.position.set(spot.x, 0, spot.z);
    } else {
      clearTarget();
    }

    G.objective = step.text + (def.timer ? ' — ' + Math.ceil(active.timer) + 's' : '');

    // Has the current step been completed?
    let finished = false;
    if (step.kind === 'goto') {
      const spot = world.spots[step.spot];
      const radius = step.radius || 10;
      if (distSq(player.x, player.z, spot.x, spot.z) < radius * radius) finished = true;
    } else if (step.kind === 'wait') {
      active.t += dt;
      if (active.t >= step.secs) finished = true;
    } else if (step.kind === 'escape') {
      if (G.police.wanted === 0) finished = true;
    }
    if (!finished) return;

    // Step done: apply its heat, then advance or pay out.
    if (step.heat) G.police.addWanted(step.heat);
    active.step++;
    active.t = 0;
    if (active.step >= def.steps.length) {
      completeMission(G);
    } else {
      G.objective = def.steps[active.step].text;
    }
  }

  return missions;
}
