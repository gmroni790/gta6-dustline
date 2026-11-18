// Dustline HUD: every DOM element, the minimap canvas, menus and buttons.
// The only module allowed to touch the DOM. Every element lookup is guarded,
// so a missing id is skipped silently instead of throwing.

import { clamp } from './utils.js';

const ELEMENT_IDS = [
  'hud', 'healthFill', 'healthText', 'stars', 'moneyText', 'speedText',
  'weaponText', 'ammoText', 'relicText', 'objectiveText', 'banner', 'toast',
  'minimap', 'crosshair', 'damageFlash',
  'menuTitle', 'menuPause', 'menuHelp', 'menuWasted', 'menuBusted',
  'btnStart', 'btnContinue', 'btnResume', 'btnRestart', 'btnHelp', 'btnHelpBack',
  'muteBtn',
];

const WEAPON_NAMES = { fists: 'Fists', pistol: 'Pistol', smg: 'SMG' };
const BANNER_SECONDS = 4;
const TOAST_SECONDS = 2.5;

export function createHUD(ctx) {
  const state = ctx.state;

  function $(id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  const el = {};
  ELEMENT_IDS.forEach((id) => {
    el[id] = $(id);
  });

  let mapCtx = null;
  if (el.minimap) {
    try {
      mapCtx = el.minimap.getContext('2d');
    } catch (e) {
      mapCtx = null;
    }
  }

  let bannerTimer = 0;
  let toastTimer = 0;
  let lastHealth = typeof state.health === 'number' ? state.health : 100;
  let flash = 0;
  let lastFlash = '';
  let helpFrom = 'title';

  function show(node, on, display) {
    if (!node) return;
    node.style.display = on ? (display || 'flex') : 'none';
  }

  function showBanner(text) {
    if (!el.banner) return;
    el.banner.textContent = text;
    el.banner.style.display = 'block';
    bannerTimer = BANNER_SECONDS;
  }

  function showToast(text) {
    if (!el.toast) return;
    el.toast.textContent = text;
    el.toast.style.display = 'block';
    toastTimer = TOAST_SECONDS;
  }

  function updateMuteLabel() {
    if (el.muteBtn) el.muteBtn.textContent = state.muted ? 'Sound: Off' : 'Sound: On';
  }
  updateMuteLabel();

  function onClick(node, fn) {
    if (!node) return;
    node.addEventListener('click', () => {
      try {
        fn();
      } catch (e) { /* a button must never break the game */ }
    });
  }

  onClick(el.btnStart, () => {
    if (ctx.audio && ctx.audio.resume) ctx.audio.resume();
    state.mode = 'playing';
  });
  onClick(el.btnContinue, () => {
    try {
      if (ctx.save && ctx.save.load) ctx.save.load();
    } catch (e) { /* a bad save still starts the game */ }
    if (ctx.audio && ctx.audio.resume) ctx.audio.resume();
    state.mode = 'playing';
  });
  onClick(el.btnResume, () => {
    state.mode = 'playing';
  });
  onClick(el.btnRestart, () => {
    try {
      window.location.reload();
    } catch (e) { /* ignore */ }
  });
  onClick(el.btnHelp, () => {
    helpFrom = state.mode === 'paused' ? 'paused' : 'title';
    state.mode = 'help';
  });
  onClick(el.btnHelpBack, () => {
    state.mode = helpFrom;
  });
  onClick(el.muteBtn, () => {
    state.muted = !state.muted;
    try {
      if (ctx.audio && ctx.audio.setMuted) ctx.audio.setMuted(state.muted);
    } catch (e) { /* audio is optional */ }
    updateMuteLabel();
  });

  // -- minimap ---------------------------------------------------------------

  function playerSpot() {
    const p = ctx.player;
    if (!p) return null;
    const g = p.car ? p.car.group : p.group;
    if (!g || !g.position) return null;
    return { x: g.position.x, z: g.position.z, heading: p.heading || 0 };
  }

  function drawMinimap() {
    if (!mapCtx || !el.minimap) return;
    const world = ctx.world;
    if (!world || !world.bounds) return;
    const w = el.minimap.width;
    const h = el.minimap.height;
    if (!w || !h) return;
    const b = world.bounds;
    const spanX = b.maxX - b.minX || 1;
    const spanZ = b.maxZ - b.minZ || 1;
    // North up: the smallest z (north edge) maps to the top of the canvas.
    const toX = (x) => ((x - b.minX) / spanX) * w;
    const toY = (z) => ((z - b.minZ) / spanZ) * h;

    mapCtx.clearRect(0, 0, w, h);
    mapCtx.fillStyle = 'rgba(8, 12, 16, 0.82)';
    mapCtx.fillRect(0, 0, w, h);

    // Roads, drawn as one path.
    if (Array.isArray(world.roads)) {
      mapCtx.strokeStyle = 'rgba(210, 210, 210, 0.55)';
      mapCtx.lineWidth = 1;
      mapCtx.beginPath();
      world.roads.forEach((r) => {
        mapCtx.moveTo(toX(r.ax), toY(r.az));
        mapCtx.lineTo(toX(r.bx), toY(r.bz));
      });
      mapCtx.stroke();
    }

    // Uncollected relics as turquoise dots.
    if (ctx.missions && Array.isArray(ctx.missions.relics)) {
      mapCtx.fillStyle = '#2de2c5';
      ctx.missions.relics.forEach((r) => {
        if (r.collected) return;
        mapCtx.beginPath();
        mapCtx.arc(toX(r.x), toY(r.z), 2, 0, Math.PI * 2);
        mapCtx.fill();
      });
    }

    // Current mission marker as an amber diamond.
    const marker = ctx.missions ? ctx.missions.marker : null;
    if (marker) {
      const mx = toX(marker.x);
      const my = toY(marker.z);
      mapCtx.fillStyle = '#ffb020';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, my - 5);
      mapCtx.lineTo(mx + 4, my);
      mapCtx.lineTo(mx, my + 5);
      mapCtx.lineTo(mx - 4, my);
      mapCtx.closePath();
      mapCtx.fill();
    }

    // Police: officers blue, cars and helicopter red.
    const police = ctx.police;
    if (police) {
      if (Array.isArray(police.cops)) {
        mapCtx.fillStyle = '#3f8cff';
        police.cops.forEach((c) => {
          const g = c && c.group;
          if (!g || !g.position) return;
          mapCtx.beginPath();
          mapCtx.arc(toX(g.position.x), toY(g.position.z), 2.5, 0, Math.PI * 2);
          mapCtx.fill();
        });
      }
      mapCtx.fillStyle = '#ff3b30';
      if (Array.isArray(police.cars)) {
        police.cars.forEach((c) => {
          // A patrol entry wraps its vehicle: the mesh lives under .vehicle.
          const g = c && (c.group || (c.vehicle && c.vehicle.group));
          if (!g || !g.position) return;
          mapCtx.beginPath();
          mapCtx.arc(toX(g.position.x), toY(g.position.z), 3, 0, Math.PI * 2);
          mapCtx.fill();
        });
      }
      if (police.heli && police.heli.group && police.heli.group.position) {
        const hp = police.heli.group.position;
        mapCtx.beginPath();
        mapCtx.arc(toX(hp.x), toY(hp.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
    }

    // Player triangle, pointing along the heading.
    const spot = playerSpot();
    if (spot) {
      const px = toX(spot.x);
      const py = toY(spot.z);
      // Forward on the map is (sin h, cos h); rotate the nose there.
      const angle = Math.atan2(Math.cos(spot.heading), Math.sin(spot.heading));
      mapCtx.save();
      mapCtx.translate(px, py);
      mapCtx.rotate(angle);
      mapCtx.fillStyle = '#ffffff';
      mapCtx.strokeStyle = '#111111';
      mapCtx.lineWidth = 1;
      mapCtx.beginPath();
      mapCtx.moveTo(7, 0);
      mapCtx.lineTo(-5, 4.5);
      mapCtx.lineTo(-5, -4.5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.stroke();
      mapCtx.restore();
    }
  }

  // -- per-frame update ------------------------------------------------------

  function update(dt) {
    const mode = state.mode || 'title';

    // Banner and toast timers.
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0 && el.banner) el.banner.style.display = 'none';
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0 && el.toast) el.toast.style.display = 'none';
    }

    // Damage flash: light up when health drops, then fade away.
    const health = typeof state.health === 'number' ? state.health : 100;
    if (health < lastHealth) flash = 0.55;
    lastHealth = health;
    if (flash > 0) flash = Math.max(0, flash - dt * 1.4);
    if (el.damageFlash && flash.toFixed(2) !== lastFlash) {
      lastFlash = flash.toFixed(2);
      el.damageFlash.style.opacity = lastFlash;
    }

    // Menus follow the mode word; while playing, all menus hide.
    show(el.menuTitle, mode === 'title');
    show(el.menuPause, mode === 'paused');
    show(el.menuHelp, mode === 'help');
    show(el.menuWasted, mode === 'wasted');
    show(el.menuBusted, mode === 'busted');
    show(el.hud, mode === 'playing' || mode === 'paused', 'block');
    if (el.btnContinue) {
      const showContinue = mode === 'title' && !!(ctx.save && ctx.save.hasSave);
      el.btnContinue.style.display = showContinue ? 'inline-block' : 'none';
    }

    // Stat readouts.
    if (el.healthFill) el.healthFill.style.width = `${clamp(health, 0, 100)}%`;
    if (el.healthText) el.healthText.textContent = `${Math.round(health)} HP`;
    if (el.stars) {
      const wanted = clamp(state.wanted || 0, 0, 5);
      el.stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    }
    if (el.moneyText) el.moneyText.textContent = `$${Math.floor(state.money || 0)}`;
    if (el.speedText) {
      const p = ctx.player;
      const speed = p ? (p.car ? p.car.speed || 0 : p.speed || 0) : 0;
      el.speedText.textContent = `${Math.round(Math.abs(speed) * 2.237)} mph`;
    }
    if (el.weaponText) el.weaponText.textContent = WEAPON_NAMES[state.weapon] || 'Fists';
    if (el.ammoText) {
      if (state.weapon === 'pistol') el.ammoText.textContent = `${state.ammoPistol || 0}`;
      else if (state.weapon === 'smg') el.ammoText.textContent = `${state.ammoSmg || 0}`;
      else el.ammoText.textContent = '∞';
    }
    if (el.relicText) el.relicText.textContent = `${state.relicsFound || 0} / 10`;
    if (el.objectiveText) el.objectiveText.textContent = state.objective || '';

    // Crosshair: armed and playing, never in shot mode.
    const armed = state.weapon === 'pistol' || state.weapon === 'smg';
    show(el.crosshair, mode === 'playing' && armed && !state.shotMode, 'block');

    // The minimap lives inside the hud container, so it only needs drawing
    // while the hud is visible.
    if (mode === 'playing' || mode === 'paused') drawMinimap();
  }

  return { update, showBanner, showToast };
}
