// Dustline story missions and hidden relics.
//
// Six missions in a fixed order, each handed out by a character at a named
// place, plus ten turquoise relics hidden around the map. This module owns
// the checkpoint rings, the objective diamond, the start marker and the
// relic meshes. It never touches the DOM or storage; it talks to the audio,
// hud and save modules only through guarded calls, because those modules
// are attached after this one.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, dist2 } from './utils.js';

// ---------------------------------------------------------------------------
// Mission definitions
// ---------------------------------------------------------------------------

// id, giver, start place, title, briefing, kind, stops, reward
const MISSION_ROWS = [
  ['parcels', 'Mama Rosa', 'diner', 'Parcels for Rosa', 'Mama Rosa needs parcels run around Old Town. Hit all three drop-offs.', 'drive', 3, 300],
  ['timed', 'Deke', 'garage', "Deke's Dare", 'Deke bets you cannot run five gates before the clock dies. Prove him wrong.', 'timed', 5, 450],
  ['escape', 'Sal', 'truckStop', 'Shake the Heat', 'Sal set the law on you. Lose the two-star pursuit and come back clean.', 'escape', 0, 400],
  ['packages', 'Nadia', 'downtown', "Nadia's Drops", 'Five packages are stashed downtown. Pick them all up.', 'collect', 5, 500],
  ['crates', 'Old Pete', 'quarry', 'Quarry Practice', 'Old Pete wants eight target crates shot to splinters at the quarry.', 'shoot', 8, 600],
  ['finale', 'The Broker', 'canyonOverlook', 'The Final Run', 'Four stars, one overlook. Reach the canyon and hold it for thirty seconds.', 'finale', 1, 1200],
];
const MISSION_DEFS = MISSION_ROWS.map(([id, giver, place, title, briefing, kind, stops, reward]) => (
  { id, giver, place, title, briefing, kind, stops, reward }
));

const PLACE_LABELS = {
  playerStart: 'the start',
  paintShop: 'the paint shop',
  garage: "Deke's garage",
  diner: "Mama Rosa's diner",
  truckStop: 'the truck stop',
  quarry: 'the quarry',
  canyonOverlook: 'the canyon overlook',
  downtown: 'downtown',
  highwayGate: 'the highway gate',
};

// The timed run sends the player through gates near these places, in order.
const TIMED_GATE_PLACES = ['downtown', 'highwayGate', 'truckStop', 'quarry', 'canyonOverlook'];

const RING_COLOR = 0xffb020;
const DIAMOND_COLOR = 0xff7a1a;
const START_COLOR = 0x39d353;
const RELIC_COLOR = 0x2de2c5;
const PACKAGE_COLOR = 0x9dff3f;
const TARGET_COLOR = 0xff3b30;

const START_RADIUS = 9; // how close the player must stand to begin a mission
const CHECKPOINT_RADIUS = 7; // how close counts as reaching a checkpoint
const PACKAGE_RADIUS = 3.5; // how close counts as picking up a package
const RELIC_RADIUS = 3; // how close counts as collecting a relic
const RELIC_BONUS = 50; // cash paid per relic
const FINALE_HOLD_TIME = 30; // seconds to survive at the overlook
const FINALE_HOLD_RADIUS = 45; // stray further and the hold timer pauses

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMissions(ctx) {
  const scene = ctx.scene;
  const state = ctx.state;

  let built = false;
  let index = 0;
  let done = 0;
  let active = null; // the running mission, or null
  let startAvailable = false;
  let markerPos = null; // {x, z} of the current goal, for the minimap
  let spin = 0;
  // Relic flags from a save loaded before the relics are built: applied
  // when buildRelics runs, so a Continue keeps collected relics collected.
  let pendingRelics = null;

  let startMarker = null;
  let startMarkerGem = null;
  let objectiveMarker = null;
  let objectiveMarkerGem = null;
  const relics = [];

  // -- small mesh builders ---------------------------------------------------

  function beamMesh(color, height, radius) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8, 1, true), mat);
    mesh.position.y = height / 2;
    return mesh;
  }

  function diamondMesh(color, size) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.4,
      metalness: 0.1,
    });
    return new THREE.Mesh(new THREE.OctahedronGeometry(size), mat);
  }

  // A ground ring plus a tall thin beam: the look of a drive-to checkpoint.
  function ringGroup(x, z, color) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4, 0.28, 8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    group.add(ring);
    group.add(beamMesh(color, 26, 0.4));
    group.position.set(x, 0, z);
    return group;
  }

  // Turn a list of {x, z} spots into ring checkpoints, added to the scene.
  function spawnCheckpoints(spots) {
    return spots.map((s) => {
      const group = ringGroup(s.x, s.z, RING_COLOR);
      scene.add(group);
      return { x: s.x, z: s.z, group };
    });
  }

  // A glowing crate (a package or a shooting target) with a short beam.
  function crateGroup(x, z, size, color, beamHeight) {
    const group = new THREE.Group();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 1.2, roughness: 0.6 })
    );
    crate.position.y = size / 2;
    group.add(crate);
    group.add(beamMesh(color, beamHeight, 0.18));
    group.position.set(x, 0, z);
    scene.add(group);
    return group;
  }

  // -- guarded calls into modules attached after this one --------------------
  // One guarded hop: a missing or throwing module is silently skipped.

  function callModule(mod, method, arg) {
    try {
      const m = ctx[mod];
      if (m && typeof m[method] === 'function') m[method](arg);
    } catch (e) { /* that module is optional */ }
  }

  function jingle() { callModule('audio', 'jingle'); }
  function chime() { callModule('audio', 'chime'); }
  function showBanner(text) { callModule('hud', 'showBanner', text); }
  function showToast(text) { callModule('hud', 'showToast', text); }
  function autosave() { callModule('save', 'save'); }

  // -- helpers ---------------------------------------------------------------

  function playerPos() {
    const p = ctx.player;
    if (!p) return { x: 0, z: 0 };
    const g = p.car ? p.car.group : p.group;
    if (g && g.position) return { x: g.position.x, z: g.position.z };
    return { x: 0, z: 0 };
  }

  // Pick `count` road intersections near (x, z), spread at least `minGap`
  // apart. Falls back to a ring of offsets if the world has no intersections.
  function nearestIntersections(x, z, count, minGap) {
    const world = ctx.world;
    const spots = [];
    if (world && Array.isArray(world.intersections) && world.intersections.length > 0) {
      const sorted = world.intersections
        .slice()
        .sort((a, b) => dist2(x, z, a.x, a.z) - dist2(x, z, b.x, b.z));
      for (const p of sorted) {
        if (spots.length >= count) break;
        if (spots.every((s) => dist2(s.x, s.z, p.x, p.z) >= minGap)) {
          spots.push({ x: p.x, z: p.z });
        }
      }
    }
    let i = 0;
    while (spots.length < count) {
      const angle = i * 2.39996; // golden angle spreads the fallback points out
      const radius = 50 + i * 30;
      spots.push({ x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius });
      i += 1;
    }
    return spots;
  }

  function setWanted(stars) {
    state.wanted = stars;
    try {
      if (ctx.police) {
        if (ctx.police.clearHeat) ctx.police.clearHeat();
        if (ctx.police.addHeat) ctx.police.addHeat(stars);
      }
    } catch (e) { /* police is optional */ }
  }

  function buildRelics() {
    const world = ctx.world;
    const spots = (world && world.relicSpots) || [];
    spots.forEach((spot, i) => {
      const group = new THREE.Group();
      const gem = diamondMesh(RELIC_COLOR, 0.55);
      gem.position.y = 1.6;
      group.add(gem);
      group.add(beamMesh(RELIC_COLOR, 12, 0.18));
      group.position.set(spot.x, 0, spot.z);
      scene.add(group);
      relics.push({
        x: spot.x,
        z: spot.z,
        label: spot.label || `Relic ${i + 1}`,
        collected: !!(pendingRelics && pendingRelics[i]),
        group,
        gem,
      });
    });
  }

  function buildMarkers() {
    startMarker = new THREE.Group();
    startMarkerGem = diamondMesh(START_COLOR, 1.1);
    startMarkerGem.position.y = 3.2;
    startMarker.add(startMarkerGem);
    startMarker.add(beamMesh(START_COLOR, 30, 0.35));
    startMarker.visible = false;
    scene.add(startMarker);

    objectiveMarker = new THREE.Group();
    objectiveMarkerGem = diamondMesh(DIAMOND_COLOR, 1.2);
    objectiveMarkerGem.position.y = 4;
    objectiveMarker.add(objectiveMarkerGem);
    objectiveMarker.add(beamMesh(DIAMOND_COLOR, 34, 0.4));
    objectiveMarker.visible = false;
    scene.add(objectiveMarker);
  }

  function cleanupRun(run) {
    run.checkpoints.forEach((c) => scene.remove(c.group));
    run.packages.forEach((p) => scene.remove(p.group));
    run.targets.forEach((t) => {
      if (!t.dead) {
        try {
          if (ctx.combat && ctx.combat.removeTarget && t.handle) ctx.combat.removeTarget(t.handle);
        } catch (e) { /* target may already be gone */ }
        scene.remove(t.group);
      }
    });
    run.checkpoints = [];
    run.packages = [];
    run.targets = [];
  }

  function completeMission() {
    if (!active) return;
    const def = active.def;
    cleanupRun(active);
    active = null;
    done += 1;
    index += 1;
    state.money = (state.money || 0) + def.reward;
    jingle();
    showBanner(`Mission complete: ${def.title} (+$${def.reward})`);
    autosave();
  }

  function failMission(reason) {
    if (!active) return;
    cleanupRun(active);
    active = null;
    showBanner(reason);
  }

  // -- starting a mission ----------------------------------------------------

  function start() {
    if (active || index >= MISSION_DEFS.length) return;
    const def = MISSION_DEFS[index];
    const world = ctx.world;
    if (!world || !world.places) return;
    const home = world.places[def.place];
    if (!home) return;
    // Only begin when the player is actually standing at the start marker.
    const p = playerPos();
    if (dist2(p.x, p.z, home.x, home.z) > START_RADIUS + 4) return;

    const run = {
      def,
      step: 0,
      checkpoints: [],
      packages: [],
      targets: [],
      hits: 0,
      timeLeft: 0,
      survived: 0,
      phase: 'drive',
      grace: 0,
    };

    if (def.kind === 'drive') {
      run.checkpoints = spawnCheckpoints(nearestIntersections(home.x, home.z, def.stops, 50));
    } else if (def.kind === 'timed') {
      const anchors = TIMED_GATE_PLACES.map((key) => world.places[key]).filter(Boolean);
      let spots = anchors.map((a) => nearestIntersections(a.x, a.z, 1, 0)[0]);
      if (spots.length < def.stops) spots = nearestIntersections(home.x, home.z, def.stops, 50);
      run.checkpoints = spawnCheckpoints(spots);
      // Time budget from the route length: about 16 units/s plus slack.
      let length = dist2(home.x, home.z, spots[0].x, spots[0].z);
      for (let i = 1; i < spots.length; i += 1) {
        length += dist2(spots[i - 1].x, spots[i - 1].z, spots[i].x, spots[i].z);
      }
      run.timeLeft = length / 16 + 25;
    } else if (def.kind === 'escape') {
      setWanted(2);
      run.grace = 3; // a same-frame wanted reset must not complete it instantly
    } else if (def.kind === 'collect') {
      run.packages = nearestIntersections(home.x, home.z, def.stops, 35).map((s) => ({
        x: s.x,
        z: s.z,
        group: crateGroup(s.x, s.z, 1.4, PACKAGE_COLOR, 14),
        taken: false,
      }));
    } else if (def.kind === 'shoot') {
      for (let i = 0; i < def.stops; i += 1) {
        const angle = (i / def.stops) * Math.PI * 2 + 0.4;
        const radius = 14 + (i % 3) * 9;
        const x = home.x + Math.cos(angle) * radius;
        const z = home.z + Math.sin(angle) * radius;
        const group = crateGroup(x, z, 2, TARGET_COLOR, 10);
        const target = { x, z, group, handle: null, dead: false };
        if (ctx.combat && ctx.combat.addTarget) {
          try {
            target.handle = ctx.combat.addTarget({
              group,
              radius: 2.2,
              health: 20,
              onDestroyed: () => {
                target.dead = true;
                run.hits += 1;
                scene.remove(group);
                chime();
              },
            });
          } catch (e) {
            target.handle = null;
          }
        }
        run.targets.push(target);
      }
    } else if (def.kind === 'finale') {
      setWanted(4);
      const group = ringGroup(home.x, home.z, RING_COLOR);
      scene.add(group);
      run.checkpoints = [{ x: home.x, z: home.z, group }];
    }

    active = run;
    jingle();
    showBanner(`${def.title} — ${def.briefing}`);
  }

  // -- objective text --------------------------------------------------------

  function writeObjective() {
    if (index >= MISSION_DEFS.length) {
      state.objective = `All missions complete — Dustline is yours. Relics: ${state.relicsFound || 0}/10`;
      return;
    }
    const def = MISSION_DEFS[index];
    if (active) {
      const d = active.def;
      if (d.kind === 'drive') {
        state.objective = `${d.title}: drop-off ${Math.min(active.step + 1, d.stops)}/${d.stops}`;
      } else if (d.kind === 'timed') {
        state.objective = `${d.title}: gate ${Math.min(active.step + 1, d.stops)}/${d.stops} — ${Math.max(0, Math.ceil(active.timeLeft))}s left`;
      } else if (d.kind === 'escape') {
        state.objective = `${d.title}: lose the heat (wanted: ${state.wanted || 0})`;
      } else if (d.kind === 'collect') {
        const got = active.packages.filter((pkg) => pkg.taken).length;
        state.objective = `${d.title}: packages ${got}/${d.stops}`;
      } else if (d.kind === 'shoot') {
        state.objective = `${d.title}: crates shot ${active.hits}/${d.stops}`;
      } else if (d.kind === 'finale') {
        state.objective = active.phase === 'drive'
          ? `${d.title}: reach the canyon overlook`
          : `${d.title}: hold the overlook — ${Math.max(0, Math.ceil(FINALE_HOLD_TIME - active.survived))}s left`;
      }
      return;
    }
    const where = PLACE_LABELS[def.place] || def.place;
    state.objective = `Next: ${def.title} — see ${def.giver} at ${where}`;
  }

  // -- per-frame update ------------------------------------------------------

  function update(dt) {
    spin += dt;
    if (!built) {
      if (ctx.world && ctx.world.places) {
        buildRelics();
        buildMarkers();
        built = true;
      } else {
        state.objective = 'Explore Dustline.';
        return;
      }
    }

    const world = ctx.world;
    const p = playerPos();
    const allDone = index >= MISSION_DEFS.length;
    const def = allDone ? null : MISSION_DEFS[index];
    const home = def ? world.places[def.place] : null;

    // Relics: hide collected ones, spin the rest, collect on approach.
    let found = 0;
    relics.forEach((r, i) => {
      if (r.collected) {
        found += 1;
        r.group.visible = false;
        return;
      }
      r.gem.rotation.y = spin * 1.5 + i;
      r.gem.position.y = 1.6 + Math.sin(spin * 2 + i * 1.3) * 0.25;
      if (state.mode === 'playing' && dist2(p.x, p.z, r.x, r.z) < RELIC_RADIUS) {
        r.collected = true;
        r.group.visible = false;
        found += 1;
        state.money = (state.money || 0) + RELIC_BONUS;
        chime();
        showToast(`Relic found (+$${RELIC_BONUS})`);
      }
    });
    state.relicsFound = found;
    state.missionIndex = index;

    // Start marker: only the current mission's, only while no mission runs.
    if (startMarker) {
      const show = !active && !allDone && !!home;
      startMarker.visible = show;
      if (show) {
        startMarker.position.set(home.x, 0, home.z);
        startMarkerGem.rotation.y = spin * 1.2;
        startMarkerGem.position.y = 3.2 + Math.sin(spin * 1.8) * 0.3;
      }
    }
    startAvailable = !active && !allDone && !!home && dist2(p.x, p.z, home.x, home.z) < START_RADIUS;

    // Objective marker: a floating diamond over the current goal.
    let target = null;
    if (active) {
      if (active.def.kind === 'drive' || active.def.kind === 'timed') {
        target = active.checkpoints[active.step] || null;
      } else if (active.def.kind === 'collect') {
        let best = null;
        let bestD = Infinity;
        active.packages.forEach((pkg) => {
          if (pkg.taken) return;
          const d = dist2(p.x, p.z, pkg.x, pkg.z);
          if (d < bestD) {
            bestD = d;
            best = pkg;
          }
        });
        target = best;
      } else if (active.def.kind === 'finale' && active.phase === 'drive') {
        target = active.checkpoints[0] || null;
      }
    }
    if (objectiveMarker) {
      objectiveMarker.visible = !!target;
      if (target) {
        objectiveMarker.position.set(target.x, 0, target.z);
        objectiveMarkerGem.rotation.y = spin * 2;
        objectiveMarkerGem.position.y = 4 + Math.sin(spin * 2.4) * 0.35;
      }
    }
    markerPos = target
      ? { x: target.x, z: target.z }
      : (!active && home ? { x: home.x, z: home.z } : null);

    // Gameplay only runs while playing.
    if (state.mode !== 'playing' || !active) {
      writeObjective();
      return;
    }

    const kind = active.def.kind;
    if (kind === 'drive' || kind === 'timed') {
      if (kind === 'timed') {
        active.timeLeft -= dt;
        if (active.timeLeft <= 0) {
          failMission('Out of time — Deke is laughing. Come back and try again.');
          writeObjective();
          return;
        }
      }
      const cp = active.checkpoints[active.step];
      if (cp && dist2(p.x, p.z, cp.x, cp.z) < CHECKPOINT_RADIUS) {
        scene.remove(cp.group);
        active.step += 1;
        chime();
        if (active.step >= active.checkpoints.length) {
          completeMission();
        }
      }
    } else if (kind === 'escape') {
      if (active.grace > 0) {
        active.grace -= dt;
      } else if ((state.wanted || 0) <= 0) {
        completeMission();
      }
    } else if (kind === 'collect') {
      active.packages.forEach((pkg) => {
        if (!pkg.taken && dist2(p.x, p.z, pkg.x, pkg.z) < PACKAGE_RADIUS) {
          pkg.taken = true;
          scene.remove(pkg.group);
          chime();
        }
      });
      if (active.packages.every((pkg) => pkg.taken)) {
        completeMission();
      }
    } else if (kind === 'shoot') {
      if (active.hits >= active.def.stops) {
        completeMission();
      }
    } else if (kind === 'finale') {
      const goal = active.checkpoints[0];
      if (goal) {
        const d = dist2(p.x, p.z, goal.x, goal.z);
        if (active.phase === 'drive' && d < 12) {
          active.phase = 'hold';
          showBanner('Hold the overlook for 30 seconds!');
        } else if (active.phase === 'hold') {
          if (d < FINALE_HOLD_RADIUS) active.survived += dt;
          if (active.survived >= FINALE_HOLD_TIME) {
            completeMission();
          }
        }
      }
    }
    writeObjective();
  }

  return {
    update,
    start,
    get startAvailable() { return startAvailable; },
    get active() { return active; },
    get index() { return index; },
    set index(v) { index = clamp(Math.floor(v) || 0, 0, MISSION_DEFS.length); },
    get completed() { return done; },
    set completed(v) { done = clamp(Math.floor(v) || 0, 0, MISSION_DEFS.length); },
    get relics() { return relics; },
    // Hand collected-relic flags from a save to this module: applied at
    // once when the relics exist, held for buildRelics when they do not yet.
    set pendingRelics(flags) {
      pendingRelics = Array.isArray(flags) ? flags : null;
      relics.forEach((r, i) => {
        if (pendingRelics && pendingRelics[i]) r.collected = true;
      });
    },
    // Current goal position for the minimap: the active checkpoint, or the
    // next mission's start place when no mission is running.
    get marker() { return markerPos; },
  };
}
