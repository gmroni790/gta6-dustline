// Save / load for Dustline. One JSON blob in localStorage; every
// access is wrapped so a blocked or full store can never crash the game.

const SAVE_KEY = 'dustline-save-v1';

/** Persist the current run: money, position, vehicle, progress, clock. */
export function saveGame(G) {
  const player = G.player;
  const missions = G.missions;
  const vehicle = player.vehicle || null;

  const snapshot = {
    money: G.money,
    health: player.health,
    px: player.x,
    pz: player.z,
    angle: player.angle,
    onFoot: vehicle === null,
    vehicleType: vehicle ? vehicle.type : null,
    missionsDone: [...(missions.done || [])],
    relicsFound: [...(missions.relics?.found || [])],
    time: G.time,
  };

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    // Storage unavailable (private mode, quota) — the game carries on.
  }
}

/** Read the saved run back, or null when there is none / it is corrupt. */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.money !== 'number') return null;
    return data;
  } catch (err) {
    return null;
  }
}

/** True when a save blob exists under our key. */
export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch (err) {
    return false;
  }
}

/** Remove the saved run, if any. */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // Nothing to do — there may simply be no save to clear.
  }
}
