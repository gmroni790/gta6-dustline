import * as THREE from 'three';

const TAU = Math.PI * 2;
const d2 = (ax, az, bx, bz) => { const x = ax - bx, z = az - bz; return x * x + z * z; };

const LIST = [
  { id: 'first-run', title: 'First Run', giver: 'Mama Rosa', spot: 'truckStop', letter: 'R',
    briefing: 'Rosa needs a parcel run downtown. Take it to the city, quick and clean.',
    pay: 150, steps: [
      { kind: 'goto', spot: 'truckStop', text: 'Meet Mama Rosa at the truck stop', radius: 10 },
      { kind: 'goto', spot: 'downtown', text: 'Deliver the package downtown', radius: 10 } ] },
  { id: 'quarry-dust', title: 'Quarry Dust', giver: 'Deke', spot: 'quarry', letter: 'D',
    briefing: 'Deke has a crate waiting at the quarry. Haul it to Old Town.',
    pay: 200, steps: [
      { kind: 'goto', spot: 'quarry', text: 'Reach the quarry', radius: 10 },
      { kind: 'wait', secs: 2, text: 'Loading the crate...' },
      { kind: 'goto', spot: 'oldTown', text: 'Deliver the crate to Old Town', radius: 10 } ] },
  { id: 'canyon-call', title: 'Canyon Call', giver: 'Sal', spot: 'canyon', letter: 'S',
    briefing: 'Sal flagged a pickup at the canyon overlook. The law will be watching — shake them after.',
    pay: 250, steps: [
      { kind: 'goto', spot: 'canyon', text: 'Reach the canyon overlook', radius: 10, heat: 2 },
      { kind: 'escape', text: 'Lose the heat' } ] },
  { id: 'dune-dash', title: 'Dune Dash', giver: 'Nadia', spot: 'dunes', letter: 'N',
    briefing: 'Nadia timed the run: dunes to highway to the truck stop, 100 seconds. Beat the clock.',
    pay: 300, timer: 100, steps: [
      { kind: 'goto', spot: 'dunes', text: 'Checkpoint 1: the dunes', radius: 12 },
      { kind: 'goto', spot: 'highway', text: 'Checkpoint 2: the highway', radius: 12 },
      { kind: 'goto', spot: 'truckStop', text: 'Checkpoint 3: the truck stop', radius: 12 } ] },
  { id: 'long-haul', title: 'The Long Haul', giver: 'Old Pete', spot: 'highway', letter: 'P',
    briefing: 'Pete has a trailer that has to reach downtown. Expect company halfway there.',
    pay: 400, steps: [
      { kind: 'goto', spot: 'highway', text: 'Meet Old Pete on the highway', radius: 10 },
      { kind: 'goto', spot: 'truckStop', text: 'Haul the trailer to the truck stop', radius: 10, heat: 2 },
      { kind: 'goto', spot: 'downtown', text: 'Deliver downtown', radius: 10 } ] },
  { id: 'rim-runner', title: 'Rim Runner', giver: 'The Broker', spot: 'downtown', letter: 'B',
    briefing: "The Broker's final job: canyon pickup, truck stop drop, and a three-star goodbye.",
    pay: 600, steps: [
      { kind: 'goto', spot: 'canyon', text: 'Pick up at the canyon', radius: 10 },
      { kind: 'goto', spot: 'truckStop', text: 'Deliver to the truck stop', radius: 10, heat: 3 },
      { kind: 'escape', text: 'Lose the heat' } ] },
];

function letterTexture(ch) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ffb020';
  cx.font = 'bold 44px sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText(ch, 32, 34);
  return new THREE.CanvasTexture(cv);
}

function makeBeacon(color, h) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, h, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  cyl.position.y = h / 2;
  g.add(cyl);
  return g;
}

export function createMissions(world) {
  const M = { list: LIST, active: null, done: [], start, update, relics: { found: new Set(), total: 10 }, activeTarget: null };
  let built = false, G0 = null;
  let beacons = [], targetBeacon = null, relicMeshes = [];

  function build(G) {
    const scene = G.scene;
    for (const def of LIST) {
      const s = world.spots[def.spot];
      const g = makeBeacon(0xffb020, 12);
      const lm = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 1.6),
        new THREE.MeshBasicMaterial({ map: letterTexture(def.letter), transparent: true, side: THREE.DoubleSide, depthWrite: false })
      );
      lm.position.y = 7;
      g.add(lm);
      g.position.set(s.x, 0, s.z);
      scene.add(g);
      beacons.push({ def, group: g, letter: lm, phase: Math.random() * TAU });
    }
    targetBeacon = makeBeacon(0x33e0ff, 18);
    targetBeacon.visible = false;
    scene.add(targetBeacon);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
    const gemMat = new THREE.MeshLambertMaterial({ color: 0x2fd8c8, emissive: 0x18b8a8, emissiveIntensity: 1.4 });
    world.relicSpots.forEach(s => {
      const g = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55), rockMat);
      rock.position.y = 0.3;
      rock.scale.y = 0.7;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), gemMat);
      gem.position.y = 1.1;
      g.add(rock, gem);
      g.position.set(s.x, 0, s.z);
      scene.add(g);
      relicMeshes.push({ group: g, gem, x: s.x, z: s.z });
    });
  }

  function start(i, G) {
    G = G || G0;
    if (!G || M.active) return false;
    const def = LIST[i];
    if (!def || M.done.includes(def.id)) return false;
    const s = world.spots[def.spot];
    const P = G.player;
    if (Math.hypot(P.x - s.x, P.z - s.z) > 6) return false;
    M.active = { def, step: 0, timer: def.timer || 0, t: 0 };
    G.objective = def.steps[0].text;
    G.hud.flash(def.briefing, 4000);
    G.audio.uiClick();
    return true;
  }

  function complete(G) {
    const def = M.active.def;
    G.money += def.pay;
    M.done.push(def.id);
    M.active = null;
    M.activeTarget = null;
    targetBeacon.visible = false;
    G.audio.missionOk();
    G.audio.cash();
    G.hud.flash('Mission complete! +$' + def.pay, 3000);
    G.objective = 'Free roam — find a mission marker';
    G.justCompletedMission = true;
  }

  function fail(G) {
    M.active = null;
    M.activeTarget = null;
    targetBeacon.visible = false;
    G.audio.missionFail();
    G.hud.flash('Mission failed — try again', 3000);
    G.objective = 'Free roam — find a mission marker';
  }

  function update(dt, G) {
    G0 = G;
    if (!built) { build(G); built = true; }
    if (G.state !== 'playing') return;
    const P = G.player, t = G.time;

    for (const b of beacons) {
      const show = !M.done.includes(b.def.id) && (!M.active || M.active.def !== b.def);
      b.group.visible = show;
      if (show) {
        b.letter.position.y = 7 + Math.sin(t * 2 + b.phase) * 0.4;
        b.letter.lookAt(G.camera.position);
      }
    }

    for (let i = 0; i < relicMeshes.length; i++) {
      const r = relicMeshes[i];
      if (M.relics.found.has(i)) { r.group.visible = false; continue; }
      r.gem.rotation.y += dt * 1.5;
      r.gem.position.y = 1.1 + Math.sin(t * 2 + i) * 0.15;
      if (d2(P.x, P.z, r.x, r.z) < 2.5 * 2.5) {
        M.relics.found.add(i);
        r.group.visible = false;
        G.money += 50;
        G.audio.pickup();
        G.hud.flash('Turquoise Relic found! +$50 (' + M.relics.found.size + '/10)', 2500);
      }
    }

    if (!M.active) {
      M.activeTarget = null;
      targetBeacon.visible = false;
      if (G.input.pressed.has('KeyE')) {
        for (let i = 0; i < LIST.length; i++) {
          const def = LIST[i];
          if (M.done.includes(def.id)) continue;
          const s = world.spots[def.spot];
          if (Math.hypot(P.x - s.x, P.z - s.z) <= 6) { start(i, G); break; }
        }
      }
      return;
    }

    const A = M.active, def = A.def;
    if (def.timer) {
      A.timer -= dt;
      if (A.timer <= 0) { fail(G); return; }
    }
    const step = def.steps[A.step];
    if (step.kind === 'goto') {
      const s = world.spots[step.spot];
      M.activeTarget = { x: s.x, z: s.z };
      targetBeacon.visible = true;
      targetBeacon.position.set(s.x, 0, s.z);
    } else {
      M.activeTarget = null;
      targetBeacon.visible = false;
    }
    G.objective = step.text + (def.timer ? ' — ' + Math.ceil(A.timer) + 's' : '');

    let done = false;
    if (step.kind === 'goto') {
      const s = world.spots[step.spot];
      const r = step.radius || 10;
      if (d2(P.x, P.z, s.x, s.z) < r * r) done = true;
    } else if (step.kind === 'wait') {
      A.t += dt;
      if (A.t >= step.secs) done = true;
    } else if (step.kind === 'escape') {
      if (G.police.wanted === 0) done = true;
    }
    if (!done) return;
    if (step.heat) G.police.addWanted(step.heat);
    A.step++;
    A.t = 0;
    if (A.step >= def.steps.length) complete(G);
    else G.objective = def.steps[A.step].text;
  }

  return M;
}
