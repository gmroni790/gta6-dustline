// Dustline shared helpers: a seeded random generator plus the small math
// functions every game module uses. Pure code only — no scene, no DOM, no
// network — so any module can import it without side effects.

/** A deterministic random stream from one integer seed. Same seed, same numbers. */
export class Rng {
  constructor(seed) {
    let s = (seed >>> 0) || 1;
    this.next = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** A float in [0, 1). */
  value() {
    return this.next();
  }
  /** A float between a (inclusive) and b (exclusive). */
  range(a, b) {
    return a + this.next() * (b - a);
  }
  /** A whole number between a (inclusive) and b (exclusive). */
  int(a, b) {
    return Math.floor(this.range(a, b));
  }
  /** One element picked from a non-empty array. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  /** True with probability p (0 to 1). */
  chance(p) {
    return this.next() < p;
  }
}

/** Clamp v into [a, b]. */
export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** Linear blend between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent approach: moves a toward b, faster when lambda is larger. */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Shortest-arc blend between two headings. */
export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

/** Distance on the ground plane between two (x, z) points. */
export function dist2(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Square of the ground-plane distance (cheaper when only comparing). */
export function dist2Sq(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}
