const $ = id => document.getElementById(id);

export function createHUD() {
  const el = {
    hud: $('hud'), wanted: $('wanted'), money: $('money'),
    health: $('health-fill'), speed: $('speed'), weapon: $('weapon'),
    ammo: $('ammo'), objective: $('objective'), message: $('message'),
    map: $('minimap'), cross: $('crosshair'), district: $('district'),
    relics: $('relics')
  };
  const menus = {
    title: $('menu-title'), pause: $('menu-pause'), help: $('menu-help'),
    wasted: $('menu-wasted'), busted: $('menu-busted')
  };
  const mctx = el.map ? el.map.getContext('2d') : null;
  let flashUntil = 0, lastDistrict = 0, districtName = '';

  const H = {
    onAction: null,

    showMenu(name) {
      for (const k in menus) if (menus[k]) menus[k].style.display = 'none';
      if (menus[name]) menus[name].style.display = '';
      if (el.hud) el.hud.style.display =
        (name === 'title' || name === 'wasted' || name === 'busted') ? 'none' : '';
    },

    hideAllMenus() {
      for (const k in menus) if (menus[k]) menus[k].style.display = 'none';
      if (el.hud) el.hud.style.display = '';
    },

    flash(msg, ms = 2500) {
      if (!el.message) return;
      el.message.textContent = msg;
      el.message.style.display = '';
      el.message.style.opacity = '1';
      flashUntil = performance.now() + ms;
    },

    update(G) {
      const P = G.player, C = G.combat, M = G.missions, W = G.world, PO = G.police;
      const now = performance.now();
      if (el.message && flashUntil && now > flashUntil) {
        el.message.style.display = 'none';
        flashUntil = 0;
      }
      const wanted = PO ? PO.wanted || 0 : 0;
      if (el.wanted) {
        el.wanted.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
        el.wanted.style.opacity = wanted > 0 ? '1' : '0.45';
      }
      if (el.money) el.money.textContent = '$' + G.money;
      if (el.health) {
        const h = Math.max(0, Math.min(100, P.health));
        el.health.style.width = h + '%';
        el.health.style.background = h > 50 ? '#4caf50' : h > 25 ? '#ffb020' : '#e33';
      }
      const V = P.vehicle || null;
      if (el.speed) el.speed.textContent = V ? Math.round(V.speed * 2.237) + ' mph' : '';
      const w = C ? C.weapon : null;
      const armed = w && w.name && w.name !== 'Fists';
      const wname = armed ? w.name : 'Fists';
      const ammoTxt = armed ? (w.mag ?? 0) + '/' + (w.reserve ?? 0) : '';
      if (el.weapon) el.weapon.textContent = armed ? wname + ' ' + ammoTxt : wname;
      if (el.ammo) el.ammo.textContent = ammoTxt;
      if (el.objective) el.objective.textContent = G.objective || '';
      if (el.district && W && W.districts && now - lastDistrict > 500) {
        lastDistrict = now;
        let best = null, bd = Infinity;
        for (const d of W.districts) {
          const dx = (d.x ?? d.cx ?? 0) - P.x, dz = (d.z ?? d.cz ?? 0) - P.z;
          const q = dx * dx + dz * dz;
          if (q < bd) { bd = q; best = d; }
        }
        districtName = best ? best.name : '';
        el.district.textContent = districtName;
      }
      if (el.relics && M && M.relics) {
        const f = M.relics.found;
        el.relics.textContent = 'Relics ' + (f.size ?? f.length ?? 0) + '/10';
      }
      if (el.cross) {
        const show = !V && G.state === 'playing' &&
          (wname === 'Pistol' || wname === 'SMG' || wname === 'pistol' || wname === 'smg');
        el.cross.style.display = show ? '' : 'none';
      }
      drawMap(G, V);
    }
  };

  function drawMap(G, V) {
    if (!mctx) return;
    const S = 180, C0 = S / 2, m = 6, sc = (S - m * 2) / 460;
    const px = x => C0 + x * sc, py = z => C0 + z * sc;
    const ctx = mctx, P = G.player, W = G.world, M = G.missions, PO = G.police;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(C0, C0, C0 - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#241d12'; ctx.fillRect(0, 0, S, S);
    if (W && W.roads) {
      ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 2;
      for (const r of W.roads) {
        ctx.beginPath();
        if (Array.isArray(r)) {
          r.forEach((pt, i) => i ? ctx.lineTo(px(pt[0]), py(pt[1])) : ctx.moveTo(px(pt[0]), py(pt[1])));
        } else if (r.x1 !== undefined) {
          ctx.moveTo(px(r.x1), py(r.z1)); ctx.lineTo(px(r.x2), py(r.z2));
        } else if (r.a && r.b) {
          ctx.moveTo(px(r.a.x), py(r.a.z)); ctx.lineTo(px(r.b.x), py(r.b.z));
        } else if (r.x !== undefined && r.z !== undefined && r.x2 !== undefined) {
          ctx.moveTo(px(r.x), py(r.z)); ctx.lineTo(px(r.x2), py(r.z2));
        }
        ctx.stroke();
      }
    }
    if (W && W.districts) {
      ctx.fillStyle = '#6b5d43';
      for (const d of W.districts) {
        ctx.beginPath();
        ctx.arc(px(d.x ?? d.cx ?? 0), py(d.z ?? d.cz ?? 0), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const relics = (M && M.relics && (M.relics.list || M.relics.items || M.relics.all)) || (W && W.relics) || [];
    const found = (M && M.relics && M.relics.found) || new Set();
    ctx.fillStyle = '#22d3ee';
    relics.forEach((r, i) => {
      if (found.has ? found.has(i) : found.includes(i)) return;
      ctx.beginPath();
      ctx.arc(px(r.x ?? 0), py(r.z ?? 0), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    const t = M ? M.activeTarget : null;
    if (t && Math.floor(performance.now() / 400) % 2 === 0) {
      const tx = px(t.x ?? 0), ty = py(t.z ?? 0);
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath();
      ctx.moveTo(tx, ty - 5); ctx.lineTo(tx + 4, ty);
      ctx.lineTo(tx, ty + 5); ctx.lineTo(tx - 4, ty);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#3b82f6';
    const dots = [];
    if (PO) {
      if (PO.cars) dots.push(...PO.cars);
      if (PO.cops) dots.push(...PO.cops);
      if (PO.units) dots.push(...PO.units);
    }
    for (const u of dots) {
      ctx.beginPath();
      ctx.arc(px(u.x ?? 0), py(u.z ?? 0), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const a = V ? V.angle : P.angle;
    const hx = px(P.x), hy = py(P.z);
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  const wire = (id, action) => {
    const b = $(id);
    if (b) b.addEventListener('click', () => { if (H.onAction) H.onAction(action); });
  };
  wire('btn-start', 'start');
  wire('btn-load', 'load');
  wire('btn-load-wasted', 'load');
  wire('btn-load-busted', 'load');
  wire('btn-resume', 'resume');
  wire('btn-save', 'save');
  wire('btn-restart', 'restart');
  wire('btn-help', 'help');
  wire('btn-help-title', 'help');
  wire('btn-help-back', 'help-back');
  wire('btn-quit', 'quit');
  wire('btn-retry-wasted', 'retry');
  wire('btn-retry-busted', 'retry');

  return H;
}
