// Meshes for the junk in the tunnel: boxes with rounded edges (TV
// cabinets, tapes, the speaker grille), the bulging glass of a picture
// tube, a cylinder (knobs, records, reels, rabbit ears, the dial), a ball,
// a telephone's body narrowing to the top, its handset and its coiled cord.
// The body is lofted through rings; the handset and cord are swept along
// splines through a few control points, each with its own radii. One interleaved buffer of position,
// normal and cavity (how tucked away a point is: 1 open, less in creases),
// unindexed, and where each mesh starts in it.

export const MESH = { BOX: 0, CASE: 1, CRT: 2, CYL: 3, BALL: 4, BODY: 5, HANDSET: 6, CORD: 7 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A mesh is a list of triangles, each three vertices of [position, normal, cavity].
const V = (p, n, c = 1) => [p, n, c];

// A box with rounded edges, so its edges catch the light.
function roundedBox(b) {
  const us = [-1, -0.985, -0.95, -0.9, -0.85, -0.8, -0.4, 0, 0.4, 0.8, 0.85, 0.9, 0.95, 0.985, 1];
  const tris = [];
  const shape = p => {
    const c = p.map(x => Math.max(-(1 - b), Math.min(1 - b, x)));
    const n = norm(sub(p, c));
    return V(c.map((x, i) => x + b * n[i]), n);
  };
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      const at = (i, j) => {
        const p = [0, 0, 0];
        p[axis] = side; p[(axis + 1) % 3] = us[i]; p[(axis + 2) % 3] = us[j];
        return shape(p);
      };
      for (let i = 0; i < us.length - 1; i++) {
        for (let j = 0; j < us.length - 1; j++) {
          const a = at(i, j), bb = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
          tris.push(side > 0 ? [a, bb, c] : [a, c, bb], side > 0 ? [a, c, d] : [a, d, c]);
        }
      }
    }
  }
  return tris;
}

// The glass of a picture tube: a rounded rectangle bulging out towards -z,
// from -1 to 1 across and up, its rim at z = 0 and its middle at -0.25.
function crt() {
  const tris = [];
  const N = 24, B = 0.25;
  const at = (i, j) => {
    const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1;
    // Square to rounded rectangle: push the corners in.
    const m = Math.max(Math.abs(u), Math.abs(v));
    const se = Math.pow(Math.pow(Math.abs(u), 5) + Math.pow(Math.abs(v), 5), 1 / 5);
    const k = m > 0 ? m / se : 1;
    const x = u * k, y = v * k;
    const z = -B * (1 - (x * x + y * y) / 2);
    return V([x, y, z], norm([B * x, B * y, -1]));
  };
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      tris.push([a, c, b], [a, d, c]);
    }
  }
  return tris;
}

// A cylinder along z, radius 1, from -1 to 1, capped.
function cylinder() {
  const tris = [];
  const segs = 32;
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * Math.PI * 2, a1 = ((j + 1) / segs) * Math.PI * 2;
    const p = (a, z) => [Math.cos(a), Math.sin(a), z];
    const n0 = [Math.cos(a0), Math.sin(a0), 0], n1 = [Math.cos(a1), Math.sin(a1), 0];
    tris.push([V(p(a0, -1), n0), V(p(a1, -1), n1), V(p(a1, 1), n1)], [V(p(a0, -1), n0), V(p(a1, 1), n1), V(p(a0, 1), n0)]);
    tris.push([V([0, 0, 1], [0, 0, 1]), V(p(a0, 1), [0, 0, 1]), V(p(a1, 1), [0, 0, 1])]);
    tris.push([V([0, 0, -1], [0, 0, -1]), V(p(a1, -1), [0, 0, -1]), V(p(a0, -1), [0, 0, -1])]);
  }
  return tris;
}

function ball() {
  const tris = [];
  const rows = 10, segs = 16;
  const at = (i, j) => {
    const th = (i / rows) * Math.PI, ph = (j / segs) * Math.PI * 2;
    const p = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    return V(p, p);
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      tris.push([a, b, c], [a, c, d]);
    }
  }
  return tris;
}

// Catmull-Rom through control points of any length.
function spline(pts, per) {
  const out = [];
  const cr = (p0, p1, p2, p3, t) => p1.map((_, i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t
    + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t * t * t));
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) out.push(cr(p0, pts[i], pts[i + 1], p3, k / per));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A tube swept along control points [x, y, z, ra, rb]: an ellipse ra across
// `side` and rb across the other way, smoothly interpolated, with rounded
// caps on both ends.
function sweep(tris, ctrl, { segs = 14, per = 4, side = [0, 1, 0], caps = 4, cav = 1 } = {}) {
  const S = spline(ctrl, per);
  const n = S.length;
  const C = S.map(q => q.slice(0, 3)), R = S.map(q => [Math.max(q[3], 1e-4), Math.max(q[4], 1e-4)]);
  const D = C.map((_, i) => norm(sub(C[Math.min(i + 1, n - 1)], C[Math.max(i - 1, 0)])));
  let u = cross(D[0], side);
  if (Math.hypot(...u) < 1e-3) u = cross(D[0], [1, 0, 0]);
  u = norm(u);
  const rings = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) u = norm(sub(u, scale(D[i], dot(u, D[i]))));
    const v = cross(D[i], u);
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const len = Math.hypot(...sub(C[b], C[a])) || 1;
    const slope = ((R[b][0] + R[b][1]) - (R[a][0] + R[a][1])) / 2 / len;
    rings.push({ c: C[i], u, v, ra: R[i][0], rb: R[i][1], na: R[i][0], nb: R[i][1], d: D[i], tilt: Math.atan(-slope) });
  }
  // Caps: rings shrinking round the ends, or with none, flat ends.
  const capRings = (r, dir, back) => {
    const out = [];
    if (!caps) {
      const tilt = back ? -Math.PI / 2 : Math.PI / 2;
      return [{ ...r, tilt }, { ...r, ra: 1e-4, rb: 1e-4, tilt }];
    }
    for (let k = 1; k <= caps; k++) {
      const phi = (k / caps) * Math.PI / 2;
      const reach = Math.min(r.ra, r.rb);
      out.push({ ...r, c: add(r.c, scale(dir, reach * Math.sin(phi))), ra: r.ra * Math.cos(phi), rb: r.rb * Math.cos(phi), tilt: back ? -phi : phi });
    }
    return out;
  };
  const all = [...capRings(rings[0], scale(rings[0].d, -1), true).reverse(), ...rings, ...capRings(rings[n - 1], rings[n - 1].d, false)];
  const ringPts = all.map(r => Array.from({ length: segs + 1 }, (_, j) => {
    const th = (j / segs) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const p = add(r.c, add(scale(r.u, r.ra * c), scale(r.v, r.rb * s)));
    const radial = norm(add(scale(r.u, c / r.na), scale(r.v, s / r.nb)));
    const nn = norm(add(scale(radial, Math.cos(r.tilt)), scale(r.d, Math.sin(r.tilt))));
    return V(p, nn, cav);
  }));
  for (let i = 0; i < ringPts.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = ringPts[i][j], b = ringPts[i + 1][j], c = ringPts[i + 1][j + 1], d = ringPts[i][j + 1];
      tris.push([a, b, c], [a, c, d]);
    }
  }
}

// A surface through rings of points (each ring closed, all the same
// length), its normals worked out across the grid and turned to face away
// from `inside`; capped flat at the first ring if asked.
function loft(tris, rings, inside, capStart = false) {
  const n = rings.length, m = rings[0].length;
  const P = (i, j) => rings[Math.max(0, Math.min(n - 1, i))][((j % m) + m) % m];
  const N = (i, j) => {
    const du = sub(P(i, j + 1), P(i, j - 1)), dv = sub(P(i + 1, j), P(i - 1, j));
    let nn = norm(cross(du, dv));
    if (dot(nn, sub(P(i, j), inside(i))) < 0) nn = scale(nn, -1);
    return nn;
  };
  const vx = (i, j) => V(P(i, j), N(i, j));
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) tris.push([vx(i, j), vx(i + 1, j), vx(i + 1, j + 1)], [vx(i, j), vx(i + 1, j + 1), vx(i, j + 1)]);
  }
  if (capStart) {
    const c = rings[0].reduce((a, p) => add(a, scale(p, 1 / m)), [0, 0, 0]);
    const cn = norm(sub(c, inside(1)));
    for (let j = 0; j < m; j++) tris.push([V(c, cn), V(P(0, j + 1), cn), V(P(0, j), cn)]);
  }
}

// A rounded rectangle, the corners squarer the higher e is.
function squircle(cx, cz, wx, wz, y, segs, e = 4) {
  return Array.from({ length: segs }, (_, j) => {
    const a = (j / segs) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    return [cx + wx * Math.sign(c) * Math.pow(Math.abs(c), 2 / e), y, cz + wz * Math.sign(s) * Math.pow(Math.abs(s), 2 / e)];
  });
}

// A telephone's body, 1 across either way and 1 up from its middle, the
// way it looked in the fifties: wide at the foot, narrowing as it rises,
// the back standing up and the front sloping back for the dial, with a
// rounded top.
function phoneBody() {
  const rings = [];
  const segs = 48, steps = 22, dome = 8;
  const shape = t => ({ wx: 1 - 0.2 * t * t, wz: 1 - 0.3 * t, cz: 0.3 * t });
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, { wx, wz, cz } = shape(t);
    // The foot flares out a little.
    const flare = 1 + 0.05 * Math.exp(-t * 18);
    rings.push(squircle(0, cz, wx * flare, wz * flare, -1 + 2 * t, segs));
  }
  const top = shape(1);
  for (let k = 1; k <= dome; k++) {
    const ph = (k / dome) * Math.PI / 2, c = Math.cos(ph);
    rings.push(squircle(0, top.cz, top.wx * Math.max(c, 0.02), top.wz * Math.max(c, 0.02), 1 + 0.28 * Math.sin(ph), segs, 2 + 2 * c));
  }
  const tris = [];
  loft(tris, rings, i => [0, Math.max(-1, Math.min(1.2, -1 + (2 * i) / steps)), 0.15], true);
  return tris;
}

// A telephone handset along x, in phone units (the body is 0.32 across):
// one piece, a slim handle that bends down at each end into a round cup,
// the earpiece and the mouthpiece, flat across their faces.
function handset() {
  const half = [
    [0.15, -0.036, 0, 0.044, 0.044], [0.15, -0.024, 0, 0.045, 0.045], [0.149, -0.008, 0, 0.038, 0.038],
    [0.143, 0.008, 0, 0.027, 0.023], [0.128, 0.022, 0, 0.02, 0.015], [0.1, 0.031, 0, 0.017, 0.0125],
    [0.05, 0.036, 0, 0.016, 0.0118],
  ];
  const ctrl = [...half.map(([x, ...r]) => [-x, ...r]), [0, 0.037, 0, 0.016, 0.0115], ...half.slice().reverse()];
  const tris = [];
  sweep(tris, ctrl, { segs: 28, per: 6, side: [1, 0, 0], caps: 0 });
  return tris;
}

// The coiled cord from the back of the body round to the mouthpiece, in
// the same units as the handset, which sits on the body 0.158 up.
function cord() {
  const path = spline([
    [-0.12, -0.05, 0.12], [-0.2, -0.1, 0.11], [-0.27, -0.06, 0.04], [-0.26, 0.05, -0.01], [-0.19, 0.137, 0.0],
  ], 30);
  const R = 0.012, pitch = 0.0085;
  const ctrl = [];
  let along = 0, u = null;
  for (let i = 0; i < path.length - 1; i++) {
    const d = norm(sub(path[i + 1], path[Math.max(i - 1, 0)]));
    if (i > 0) along += Math.hypot(...sub(path[i], path[i - 1]));
    u = u ? norm(sub(u, scale(d, dot(u, d)))) : norm(cross(d, [0, 0, 1]));
    const v = cross(d, u);
    const steps = 5;
    const seg = Math.hypot(...sub(path[i + 1], path[i]));
    for (let k = 0; k < steps; k++) {
      const a = ((along + (seg * k) / steps) / pitch) * Math.PI * 2;
      const c = add(path[i], scale(sub(path[i + 1], path[i]), k / steps));
      ctrl.push([...add(c, add(scale(u, R * Math.cos(a)), scale(v, R * Math.sin(a)))), 0.0034, 0.0034]);
    }
  }
  const tris = [];
  sweep(tris, ctrl, { segs: 8, per: 1, caps: 2, cav: 0.85 });
  return tris;
}

export function buildMeshes() {
  const meshes = [roundedBox(0.2), roundedBox(0.05), crt(), cylinder(), ball(), phoneBody(), handset(), cord()];
  const out = [];
  const ranges = [];
  for (const tris of meshes) {
    ranges.push({ first: out.length / 7, count: tris.length * 3 });
    for (const tri of tris) for (const [p, nn, c] of tri) out.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], c);
  }
  return { data: new Float32Array(out), ranges };
}
