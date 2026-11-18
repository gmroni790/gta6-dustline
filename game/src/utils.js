// Small math helpers shared across the Dustline modules.
// Nothing here touches the DOM or the game state — pure functions only.

/**
 * mulberry32: a tiny seeded PRNG. Given the same seed it always
 * produces the same stream of numbers in [0, 1).
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let mix = Math.imul(state ^ (state >>> 15), 1 | state);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [a, b) from PRNG r. */
export function rrange(r, a, b) {
  return a + r() * (b - a);
}

/** Random integer in [a, b] (inclusive) from PRNG r. */
export function rint(r, a, b) {
  return Math.floor(a + r() * (b - a + 1));
}

/** Random element of arr from PRNG r. */
export function rpick(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}

/** Clamp v into [a, b]. */
export function clamp(v, a, b) {
  if (v < a) return a;
  if (v > b) return b;
  return v;
}

/** Linear interpolation between a and b at t. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Wrap an angle into [-PI, PI]. */
export function wrapAngle(a) {
  const tau = Math.PI * 2;
  while (a > Math.PI) a -= tau;
  while (a < -Math.PI) a += tau;
  return a;
}

/**
 * Move cur toward target by at most maxStep radians, taking the
 * shortest way around the circle. Snaps to target when within reach.
 */
export function turnToward(cur, target, maxStep) {
  const diff = wrapAngle(target - cur);
  if (Math.abs(diff) <= maxStep) return target;
  return cur + Math.sign(diff) * maxStep;
}

/** Squared distance on the ground plane (skips the sqrt). */
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}
