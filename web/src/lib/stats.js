// Student-t CDF with 4 degrees of freedom (closed form) and the standard normal CDF.
export function tcdf4(t) {
  const q = 1 + (t * t) / 4;
  return 0.5 + 0.375 * (t / Math.sqrt(q)) * (1 - (t * t) / (12 * q));
}
function erf(x) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const ncdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
export const npdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

// Deterministic pseudo-random numbers (thumbnails, layouts): mulberry32
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
