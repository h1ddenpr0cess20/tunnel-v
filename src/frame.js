// One frame's worth of uniforms, packed once for either renderer. The
// layouts match the uniform structs in src/shaders (WGSL and std140 GLSL alike).
import { FAR, NEAR, WINDOW, SPAWN_D, CARD_D, STREAK, K, pathXY, phases } from './constants.js';
import { perspective, lookAt, mul, project, norm, sub } from './math.js';

export const MAX_INST = 256;   // 16 KB of instances: the most a WebGL 2 uniform block is sure to hold
export const BATCHES = 3;      // so they're drawn in up to three batches of that many
export const SIZES = { particles: 76, things: 24, inst: MAX_INST * 16, card: 8, post: 12 };

const SHEETS = 3;     // sheets of static, one inside another
const SNOW = 0.06;    // share of particles that are snow in the middle
const TAU = Math.PI * 2;

export function createFrame() {
  return {
    particles: new Float32Array(SIZES.particles),
    things: new Float32Array(SIZES.things),
    inst: new Float32Array(SIZES.inst * BATCHES),
    card: new Float32Array(SIZES.card),
    post: new Float32Array(SIZES.post),
    groups: [], batches: 0, count: 0, spin: 0,
    proj: new Float32Array(16), view: new Float32Array(16), pview: new Float32Array(16),
    vp: new Float32Array(16), pvp: new Float32Array(16), ph: new Float64Array(12),
  };
}

// How big the test card looks: a little bigger the further you get, never close.
export const cardSize = m => 0.02 + 0.04 * (1 - Math.exp(-m / 3000));

export function packFrame(f, { game, view, t, dt, count, reduceMotion, gain, meters, tune }) {
  const S = game.S;
  const { now, was } = game.camera(reduceMotion);
  const aspect = view.w / view.h;
  const tanY = Math.min(1.25, Math.max(0.62, 0.55 / aspect));
  perspective(f.proj, tanY, aspect, 0.05, 1000);
  // Mirror x, so +x in the world is right on the screen and the junk isn't back to front.
  f.proj[0] = -f.proj[0];
  mul(f.vp, f.proj, lookAt(f.view, now.eye, now.target, now.up));
  mul(f.pvp, f.proj, lookAt(f.pview, was.eye, was.target, was.up));

  // The sheets turn a little faster the faster you go.
  const rate = reduceMotion ? 0.04 : 0.1 + 0.012 * S.speed;
  f.spin = (f.spin + rate * dt) % TAU;
  const wt = S.T % 3600;

  // Sheets: rows round the tunnel and along it, the dots about as far apart
  // both ways on the second sheet.
  const per = Math.floor((count * (1 - SNOW)) / SHEETS);
  const rows = Math.max(8, Math.round(Math.sqrt(per * WINDOW / (TAU * 1.45))));
  const cols = Math.max(8, Math.floor(per / rows));
  f.count = SHEETS * cols * rows + Math.floor(count * SNOW);

  const P = f.particles;
  P.set(f.vp, 0);
  P.set(f.pvp, 16);
  const off = S.s - NEAR;
  P.set([view.w, view.h, wt, view.dpr], 32);
  P.set([((off % WINDOW) + WINDOW) % WINDOW, 0, f.spin, f.spin - rate * STREAK], 36);
  P.set([WINDOW, NEAR, FAR, gain], 40);
  P.set([count, SHEETS, cols, rows], 44);
  P.set([view.h / 2 / tanY, view.h * 0.03, SNOW, S.speed * STREAK * 0.6], 48);
  P.set(phases(S.s, f.ph), 52);
  P.set(K, 64);

  // The test card, far down the tunnel, right behind the middle of the
  // dark (where the tunnel leans to: see place() in particles.wgsl).
  const [hx, hy] = pathXY(S.s + FAR);
  const hole = [hx + Math.sin(wt * 0.071 + 1.0) * 0.08 * FAR, hy + Math.sin(wt * 0.053 + 2.0) * 0.08 * FAR, FAR];
  const k = CARD_D / FAR;
  const cPos = [now.eye[0] + (hole[0] - now.eye[0]) * k, now.eye[1] + (hole[1] - now.eye[1]) * k, now.eye[2] + (hole[2] - now.eye[2]) * k];
  const cc = project(f.vp, cPos);
  const R = cardSize(meters) * CARD_D;
  const rNdc = cc[2] > 0 ? R / tanY / cc[2] : 0;
  f.card.set([cc[0], cc[1], rNdc, aspect, wt, gain, rNdc * view.h / 2, tune]);

  // The static flickers, and so does the light it throws on the junk.
  const flick = 0.85 + 0.15 * Math.sin(wt * 37) * Math.sin(wt * 23.3);

  // Junk, nearest first, then grouped by mesh within each batch.
  const D = f.things;
  D.set(f.vp, 0);
  D.set([wt, SPAWN_D * 0.55, SPAWN_D * 0.98, flick], 16);
  D.set([...norm(sub(cPos, now.eye)), 0.7], 20);
  const all = game.parts().sort((a, b) => a.pos[2] - b.pos[2]).slice(0, MAX_INST * BATCHES);
  f.groups.length = 0;
  f.batches = Math.ceil(all.length / MAX_INST);
  for (let b = 0; b < f.batches; b++) {
    const parts = all.slice(b * MAX_INST, (b + 1) * MAX_INST).sort((x, y) => x.mesh - y.mesh);
    parts.forEach((p, k) => {
      const i = b * MAX_INST + k;
      f.inst.set([p.pos[0], p.pos[1], p.pos[2], p.mat, ...p.q, ...p.scl, p.seed, p.radial[0], p.radial[1], p.style, 0], i * 16);
      const g = f.groups[f.groups.length - 1];
      if (g && g.mesh === p.mesh && g.batch === b) g.count++;
      else f.groups.push({ mesh: p.mesh, batch: b, first: k, count: 1 });
    });
  }

  const glitch = reduceMotion ? 0 : Math.min(1, S.glitch);
  f.post.set([1.8, 0.4, S.flash, S.fade, view.w, view.h, t % 100, S.off, glitch, view.dpr, 0, 0]);
  return f;
}
