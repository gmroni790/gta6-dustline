// Dustline save game: progress lives in localStorage under one key.
// Every storage access is wrapped so a failure (private mode, disabled
// storage, a corrupt save) silently does nothing instead of throwing.
// The game also auto-saves every thirty seconds while playing.

const SAVE_KEY = 'dustline-save-v1';
const AUTOSAVE_SECONDS = 30;

export function createSave(ctx) {
  const state = ctx.state;
  let timer = 0;

  function readRaw() {
    try {
      return window.localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return null;
    }
  }

  function writeRaw(text) {
    try {
      window.localStorage.setItem(SAVE_KEY, text);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Where the player is right now: the car's spot while driving, else the
  // player's own spot.
  function playerSpot() {
    const p = ctx.player;
    if (!p) return null;
    const g = p.car ? p.car.group : p.group;
    if (!g || !g.position) return null;
    return { x: g.position.x, z: g.position.z, heading: p.heading || 0 };
  }

  function save() {
    const data = {
      version: 1,
      money: state.money,
      health: state.health,
      wanted: state.wanted,
      weapon: state.weapon,
      ammoPistol: state.ammoPistol,
      ammoSmg: state.ammoSmg,
      missionsCompleted: ctx.missions ? ctx.missions.completed : 0,
      missionIndex: ctx.missions ? ctx.missions.index : 0,
      relicsFound: state.relicsFound || 0,
      relics: ctx.missions ? ctx.missions.relics.map((r) => !!r.collected) : [],
      position: playerSpot(),
      savedAt: Date.now(),
    };
    try {
      writeRaw(JSON.stringify(data));
    } catch (e) { /* a save that cannot be written is simply skipped */ }
  }

  // Read the save and apply it to the state and the player position.
  // Returns true when a save was applied, false otherwise.
  function load() {
    const raw = readRaw();
    if (!raw) return false;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    if (!data || typeof data !== 'object') return false;

    ['money', 'health', 'wanted', 'ammoPistol', 'ammoSmg', 'relicsFound'].forEach((key) => {
      if (typeof data[key] === 'number') state[key] = data[key];
    });
    if (typeof data.weapon === 'string') state.weapon = data.weapon;

    if (ctx.missions) {
      if (typeof data.missionIndex === 'number') ctx.missions.index = data.missionIndex;
      if (typeof data.missionsCompleted === 'number') ctx.missions.completed = data.missionsCompleted;
      if (Array.isArray(data.relics)) {
        // Hand the flags over rather than setting them directly: the relic
        // meshes are built lazily, so they may not exist yet at load time.
        ctx.missions.pendingRelics = data.relics;
      }
    }

    if (data.position && ctx.player) {
      const spot = data.position;
      if (typeof spot.x === 'number' && typeof spot.z === 'number') {
        if (typeof ctx.player.place === 'function') {
          ctx.player.place(spot.x, spot.z, spot.heading || 0);
        } else if (ctx.player.group && ctx.player.group.position) {
          ctx.player.group.position.set(spot.x, 0, spot.z);
        }
      }
    }
    return true;
  }

  function clear() {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch (e) { /* nothing to clear */ }
  }

  function update(dt) {
    if (state.mode !== 'playing') return;
    timer += dt;
    if (timer >= AUTOSAVE_SECONDS) {
      timer = 0;
      save();
    }
  }

  return {
    get hasSave() {
      return readRaw() !== null;
    },
    save,
    load,
    clear,
    update,
  };
}
