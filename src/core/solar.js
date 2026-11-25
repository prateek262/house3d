// Rooftop solar PV: sun position, panel geometry, shading and yield estimates. Pure JS (shared by app + validator).
// Scene units (feet) in, metric/kWh out. Sun model: standard declination / hour-angle (solar time), adequate for
// layout and shading checks; yields are indicative (see assumption A36).
import { M_PER_FT } from './units.js';

const D2R = Math.PI / 180;
export const SITE = { name: 'Bilaspur, Chhattisgarh', lat: 22.08, lon: 82.15 };
/** Indicative specific yield for Bilaspur at near-optimal tilt, unshaded, PR ~0.78 (kWh per kWp per year). */
export const SPECIFIC_YIELD = 1500;
export const DAYS = { 'Dec 21': 355, 'Mar 21': 80, 'Jun 21': 172, 'Sep 21': 264 };

/** Unit vector toward the sun in scene axes (+x east, +y up, -z north) for a day-of-year and solar hour. */
export function sunDir(doy, hour, lat = SITE.lat) {
  const decl = 23.45 * Math.sin(D2R * (360 / 365) * (284 + doy)) * D2R; const H = (hour - 12) * 15 * D2R; const phi = lat * D2R;
  const sinA = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H); const alt = Math.asin(sinA);
  let cosAz = (Math.sin(decl) - sinA * Math.sin(phi)) / (Math.cos(alt) * Math.cos(phi)); cosAz = Math.max(-1, Math.min(1, cosAz));
  let az = Math.acos(cosAz); if (H > 0) az = 2 * Math.PI - az; // azimuth from north, clockwise
  return { x: Math.sin(az) * Math.cos(alt), y: sinA, z: -Math.cos(az) * Math.cos(alt), elev: alt / D2R, az: az / D2R };
}

/** Panel geometry (scene units). Panels face south (+z): low edge on the +z side. */
export function panelGeom(p, mod, tilt, lowEdge, roofY) {
  const t = tilt * D2R; const dz = mod.l * Math.cos(t); const rise = mod.l * Math.sin(t);
  const low = { y: roofY + lowEdge, z: p.z + dz / 2 }; const high = { y: low.y + rise, z: p.z - dz / 2 };
  return { x: p.x, w: mod.w, l: mod.l, low, high, dz, rise, n: { x: 0, y: Math.cos(t), z: Math.sin(t) }, s: { x: 0, y: Math.sin(t), z: -Math.cos(t) } };
}

function rayCylinder(P, d, c) {
  const ox = P.x - c.x, oz = P.z - c.z; const a = d.x * d.x + d.z * d.z; if (a < 1e-9) return false;
  const b = 2 * (ox * d.x + oz * d.z); const cc = ox * ox + oz * oz - c.r * c.r; const disc = b * b - 4 * a * cc; if (disc < 0) return false;
  const sq = Math.sqrt(disc); let t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a); if (t2 <= 1e-4) return false; t1 = Math.max(t1, 1e-4);
  const y1 = P.y + d.y * t1, y2 = P.y + d.y * t2; return Math.min(y1, y2) <= c.y1 && Math.max(y1, y2) >= c.y0;
}
function rayPanel(P, d, g) {
  const den = d.x * g.n.x + d.y * g.n.y + d.z * g.n.z; if (Math.abs(den) < 1e-6) return false;
  const t = ((g.x - P.x) * g.n.x + (g.low.y - P.y) * g.n.y + (g.low.z - P.z) * g.n.z) / den; if (t <= 1e-3) return false;
  const H = { x: P.x + d.x * t, y: P.y + d.y * t, z: P.z + d.z * t };
  if (Math.abs(H.x - g.x) > g.w / 2) return false;
  const v = ((H.x - g.x) * g.s.x + (H.y - g.low.y) * g.s.y + (H.z - g.low.z) * g.s.z) / g.l; return v >= 0 && v <= 1;
}

/** Obstacles that can shade the array: roof tanks as vertical cylinders (scene units). */
export function tankObstacles(house) {
  const W = house.water; if (!W) return [];
  return W.tanks.map((t) => ({ x: t.x, z: t.z, r: t.diameter / 2, y0: house.roof.y, y1: house.roof.y + t.pedestal + 0.12 + t.height + t.diameter * 0.18 }));
}

/**
 * Shading analysis for a panel set: fraction of panel area shaded, per panel, over a set of days and hours.
 * Weighted by sun elevation (proxy for irradiance). Returns { perPanel[], loss, worst: {label, frac} }.
 */
export function shadingAnalysis(panels, mod, tilt, lowEdge, roofY, obstacles, { hours = [8, 9, 10, 11, 12, 13, 14, 15, 16], days = DAYS } = {}) {
  const geoms = panels.map((p) => panelGeom(p, mod, tilt, lowEdge, roofY));
  const per = panels.map(() => ({ w: 0, s: 0 })); let worst = { label: '', frac: 0 }; let W = 0, S = 0;
  const samples = []; for (const u of [1 / 6, 1 / 2, 5 / 6]) for (const v of [1 / 6, 1 / 2, 5 / 6]) samples.push([u, v]);
  for (const [label, doy] of Object.entries(days)) for (const h of hours) {
    const d = sunDir(doy, h); if (d.elev < 8) continue;
    const inc = Math.max(0, d.x * geoms[0].n.x + d.y * geoms[0].n.y + d.z * geoms[0].n.z); const wgt = inc * Math.sin(d.elev * D2R);
    let shadedHere = 0;
    geoms.forEach((g, i) => {
      let sh = 0;
      for (const [u, v] of samples) {
        const P = { x: g.x + (u - 0.5) * g.w, y: g.low.y + g.s.y * v * g.l + 0.02, z: g.low.z + g.s.z * v * g.l };
        if (obstacles.some((c) => rayCylinder(P, d, c)) || geoms.some((o, j) => j !== i && rayPanel(P, d, o))) sh++;
      }
      const f = sh / samples.length; per[i].w += wgt; per[i].s += wgt * f; shadedHere += f;
    });
    W += wgt * geoms.length; S += wgt * shadedHere;
    const frac = shadedHere / geoms.length; if (h >= 9 && h <= 15 && frac > worst.frac) worst = { label: `${label} ${String(h).padStart(2, '0')}:00`, frac };
  }
  return { perPanel: per.map((p) => (p.w ? p.s / p.w : 0)), loss: W ? S / W : 0, worst };
}

/** Annual yield estimate (kWh) for kWp at a tilt, with a shading loss fraction. */
export function annualYield(kwp, tilt, shadeLoss) {
  const tiltFactor = 1 - 0.00012 * (tilt - SITE.lat) ** 2;
  return kwp * SPECIFIC_YIELD * tiltFactor * (1 - shadeLoss);
}

/** Summary of house.solar (scene units). */
export function solarSummary(house) {
  const S = house.solar; if (!S) return null;
  const roofY = house.roof.y; const obs = tankObstacles(house);
  const sh = shadingAnalysis(S.panels, S.module, S.tilt, S.lowEdge, roofY, obs);
  const kwp = (S.panels.length * S.module.wp) / 1000;
  const areaM2 = S.panels.length * S.module.w * S.module.l * M_PER_FT * M_PER_FT;
  const kg = S.panels.length * S.module.kg + areaM2 * (S.structureKgM2 || 9);
  return { kwp, count: S.panels.length, areaM2, kg, shading: sh, annualKWh: annualYield(kwp, S.tilt, sh.loss) };
}
