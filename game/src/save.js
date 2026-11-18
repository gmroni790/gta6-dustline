const KEY = 'dustline-save-v1';

export function saveGame(G) {
  const P = G.player, M = G.missions;
  const V = P.vehicle || null;
  const data = {
    money: G.money,
    health: P.health,
    px: P.x, pz: P.z, angle: P.angle,
    onFoot: !V,
    vehicleType: V ? V.type : null,
    missionsDone: [...(M.done || [])],
    relicsFound: [...(M.relics?.found || [])],
    time: G.time
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { /* storage unavailable */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.money !== 'number') return null;
    return d;
  } catch (e) { return null; }
}

export function hasSave() {
  try { return localStorage.getItem(KEY) !== null; }
  catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); }
  catch (e) { /* ignore */ }
}
