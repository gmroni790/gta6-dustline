// HUD, menus and minimap for Dustline.
//
// The HUD reads the game object every frame and mirrors it into the DOM:
// wanted stars, money, health, speed, weapon, objective, district and
// relic count, plus a circular minimap drawn on a 180x180 canvas. Menus
// are plain DOM overlays; button clicks are forwarded to H.onAction so
// main.js decides what each action does.

const $ = (id) => document.getElementById(id);

export function createHUD() {
  const el = {
    hud: $('hud'),
    wanted: $('wanted'),
    money: $('money'),
    healthFill: $('health-fill'),
    speed: $('speed'),
    weapon: $('weapon'),
    ammo: $('ammo'),
    objective: $('objective'),
    message: $('message'),
    map: $('minimap'),
    crosshair: $('crosshair'),
    district: $('district'),
    relics: $('relics'),
  };

  const menus = {
    title: $('menu-title'),
    pause: $('menu-pause'),
    help: $('menu-help'),
    wasted: $('menu-wasted'),
    busted: $('menu-busted'),
  };

  const mapCtx = el.map ? el.map.getContext('2d') : null;

  let flashUntil = 0;      // performance.now() deadline for the message
  let districtAt = 0;      // last time the district name was recomputed
  let districtName = '';   // cached nearest district

  const H = {
    // Set by main.js: called with 'start', 'load', 'resume', ... on click.
    onAction: null,

    // Show one menu and hide the rest. Title/wasted/busted hide the HUD.
    showMenu(name) {
      for (const key in menus) {
        if (menus[key]) menus[key].classList.add('hidden');
      }
      if (menus[name]) menus[name].classList.remove('hidden');
      if (el.hud) {
        el.hud.classList.toggle('hidden',
          name === 'title' || name === 'wasted' || name === 'busted');
      }
    },

    // Hide every menu and bring the HUD back.
    hideAllMenus() {
      for (const key in menus) {
        if (menus[key]) menus[key].classList.add('hidden');
      }
      if (el.hud) el.hud.classList.remove('hidden');
    },

    // Flash a message in the centre of the screen for `ms` milliseconds.
    flash(msg, ms = 2500) {
      if (!el.message) return;
      el.message.textContent = msg;
      el.message.style.display = '';
      el.message.style.opacity = '1';
      flashUntil = performance.now() + ms;
    },

    update(G) {
      const player = G.player;
      const combat = G.combat;
      const missions = G.missions;
      const world = G.world;
      const police = G.police;
      const now = performance.now();

      // Hide the flash message once its time is up.
      if (el.message && flashUntil && now > flashUntil) {
        el.message.style.display = 'none';
        flashUntil = 0;
      }

      // Wanted stars: filled for the current level, dim when clean.
      const wanted = police ? police.wanted || 0 : 0;
      if (el.wanted) {
        el.wanted.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
        el.wanted.style.opacity = wanted > 0 ? '1' : '0.45';
      }

      if (el.money) el.money.textContent = '$' + G.money;

      // Health bar: width follows health, colour green > amber > red.
      if (el.healthFill) {
        const hp = Math.max(0, Math.min(100, player.health));
        el.healthFill.style.width = hp + '%';
        el.healthFill.style.background = hp > 50 ? '#4caf50' : hp > 25 ? '#ffb020' : '#e33';
      }

      const vehicle = player.vehicle || null;

      // Speed, only while driving (world units/s -> mph).
      if (el.speed) {
        el.speed.textContent = vehicle ? Math.round(vehicle.speed * 2.237) + ' mph' : '';
      }

      // Weapon line: name plus mag/reserve for guns, 'Fists' otherwise.
      const weapon = combat ? combat.weapon : 'fists';
      const armed = weapon === 'pistol' || weapon === 'smg';
      const weaponName = armed ? (weapon === 'pistol' ? 'Pistol' : 'SMG') : 'Fists';
      const ammoText = armed ? (combat.mag[weapon] ?? 0) + '/' + (combat.ammo[weapon] ?? 0) : '';
      if (el.weapon) el.weapon.textContent = armed ? weaponName + ' ' + ammoText : weaponName;
      if (el.ammo) el.ammo.textContent = ammoText;

      if (el.objective) el.objective.textContent = G.objective || '';

      // District: nearest named district, recomputed at most twice a second.
      if (el.district && world && world.districts && now - districtAt > 500) {
        districtAt = now;
        let best = null;
        let bestDist = Infinity;
        for (const d of world.districts) {
          const dx = (d.x ?? d.cx ?? 0) - player.x;
          const dz = (d.z ?? d.cz ?? 0) - player.z;
          const q = dx * dx + dz * dz;
          if (q < bestDist) {
            bestDist = q;
            best = d;
          }
        }
        districtName = best ? best.name : '';
        el.district.textContent = districtName;
      }

      if (el.relics && missions && missions.relics) {
        const found = missions.relics.found;
        el.relics.textContent = 'Relics ' + (found.size ?? found.length ?? 0) + '/10';
      }

      // Crosshair: only on foot, playing, holding a gun.
      if (el.crosshair) {
        const show = !vehicle && G.state === 'playing' && armed;
        el.crosshair.style.display = show ? '' : 'none';
      }

      drawMinimap(G, vehicle);
    },
  };

  // Circular minimap: roads, districts, unfound relics, active target,
  // police units and the player arrow. The map covers ±230 world units
  // across the 180px canvas with a 6px margin.
  function drawMinimap(G, vehicle) {
    if (!mapCtx) return;
    const SIZE = 180;
    const HALF = SIZE / 2;
    const MARGIN = 6;
    const scale = (SIZE - MARGIN * 2) / 460;
    const toX = (x) => HALF + x * scale;
    const toY = (z) => HALF + z * scale;

    const ctx = mapCtx;
    const player = G.player;
    const world = G.world;
    const missions = G.missions;
    const police = G.police;

    ctx.save();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.beginPath();
    ctx.arc(HALF, HALF, HALF - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#241d12';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Roads: support the {x1,z1,x2,z2} form plus a few alternates.
    if (world && world.roads) {
      ctx.strokeStyle = '#8a7a5a';
      ctx.lineWidth = 2;
      for (const road of world.roads) {
        ctx.beginPath();
        if (Array.isArray(road)) {
          road.forEach((pt, i) => {
            if (i) ctx.lineTo(toX(pt[0]), toY(pt[1]));
            else ctx.moveTo(toX(pt[0]), toY(pt[1]));
          });
        } else if (road.x1 !== undefined) {
          ctx.moveTo(toX(road.x1), toY(road.z1));
          ctx.lineTo(toX(road.x2), toY(road.z2));
        } else if (road.a && road.b) {
          ctx.moveTo(toX(road.a.x), toY(road.a.z));
          ctx.lineTo(toX(road.b.x), toY(road.b.z));
        } else if (road.x !== undefined && road.z !== undefined && road.x2 !== undefined) {
          ctx.moveTo(toX(road.x), toY(road.z));
          ctx.lineTo(toX(road.x2), toY(road.z2));
        }
        ctx.stroke();
      }
    }

    // District dots.
    if (world && world.districts) {
      ctx.fillStyle = '#6b5d43';
      for (const d of world.districts) {
        ctx.beginPath();
        ctx.arc(toX(d.x ?? d.cx ?? 0), toY(d.z ?? d.cz ?? 0), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Unfound relics as cyan dots.
    const relicSpots = (missions && missions.relics && (missions.relics.list || missions.relics.items || missions.relics.all))
      || (world && (world.relics || world.relicSpots))
      || [];
    const found = (missions && missions.relics && missions.relics.found) || new Set();
    ctx.fillStyle = '#22d3ee';
    relicSpots.forEach((spot, i) => {
      if (found.has ? found.has(i) : found.includes(i)) return;
      ctx.beginPath();
      ctx.arc(toX(spot.x ?? 0), toY(spot.z ?? 0), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Active mission target: a blinking yellow diamond.
    const target = missions ? missions.activeTarget : null;
    if (target && Math.floor(performance.now() / 400) % 2 === 0) {
      const tx = toX(target.x ?? 0);
      const ty = toY(target.z ?? 0);
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath();
      ctx.moveTo(tx, ty - 5);
      ctx.lineTo(tx + 4, ty);
      ctx.lineTo(tx, ty + 5);
      ctx.lineTo(tx - 4, ty);
      ctx.closePath();
      ctx.fill();
    }

    // Police units as blue dots.
    ctx.fillStyle = '#3b82f6';
    const units = [];
    if (police) {
      if (police.cars) units.push(...police.cars);
      if (police.cops) units.push(...police.cops);
      if (police.units) units.push(...police.units);
    }
    for (const unit of units) {
      ctx.beginPath();
      ctx.arc(toX(unit.x ?? 0), toY(unit.z ?? 0), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player arrow, rotated by heading.
    const heading = vehicle ? vehicle.angle : player.angle;
    ctx.save();
    ctx.translate(toX(player.x), toY(player.z));
    ctx.rotate(heading + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // Wire every menu button to the onAction callback with its action name.
  function wireButton(id, action) {
    const button = $(id);
    if (button) {
      button.addEventListener('click', () => {
        if (H.onAction) H.onAction(action);
      });
    }
  }
  wireButton('btn-start', 'start');
  wireButton('btn-load', 'load');
  wireButton('btn-load-wasted', 'load');
  wireButton('btn-load-busted', 'load');
  wireButton('btn-resume', 'resume');
  wireButton('btn-save', 'save');
  wireButton('btn-restart', 'restart');
  wireButton('btn-help', 'help');
  wireButton('btn-help-title', 'help');
  wireButton('btn-help-back', 'help-back');
  wireButton('btn-quit', 'quit');
  wireButton('btn-retry-wasted', 'retry');
  wireButton('btn-retry-busted', 'retry');

  return H;
}
