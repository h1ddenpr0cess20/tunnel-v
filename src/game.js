// Game state: flying, steering, the junk, collisions and the set switching
// off when you crash. Positions are in tunnel radii across the tunnel (x,
// y, measured from its middle) and s down it.
import {
  SPAWN_D, M_PER_UNIT, PLAY_R, VMAX, HIT_R, MISS_R, STREAK, pathXY,
} from './constants.js';
import { MESH } from './meshes.js';
import { qAxis, qMul, qNorm, qRot, randomAxis, add, sub, norm, cross, segDist } from './math.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const flySpeed = t => 7 + 9 * (1 - Math.exp(-t / 120));

// How many years back to 1950, when the test card at the end first went
// out: it halves every 250 m you fly.
export const YEARS = 76;
export const yearsLeft = m => YEARS * Math.pow(0.5, m / 250);

// Meshes (see meshes.js) and finishes (see things.wgsl).
const { BOX, CASE, CRT, CYL, BALL, BODY, HANDSET, CORD } = MESH;
export const MAT = { WOOD: 0, PLASTIC: 1, SCREEN: 2, METAL: 3, VINYL: 4, VHS: 5, BAKELITE: 6, FABRIC: 7, DIAL: 8, CASSETTE: 9, LABEL: 10, WINDOW: 11 };
const X_AXIS = [1, 0, 0], Z_AXIS = [0, 0, 1];

// Scale a thing's parts and colliders up or down.
function sized(o, k) {
  return {
    ...o,
    parts: o.parts.map(p => ({ ...p, off: p.off.map(x => x * k), scl: p.scl.map(x => x * k) })),
    cols: o.cols.map(c => ({ a: c.a.map(x => x * k), b: c.b.map(x => x * k), r: c.r * k })),
  };
}

// A wooden TV set, screen towards -z: the picture tube on the left, two
// knobs and the speaker grille on the right, the tube's hood sticking out
// of the back, feet, and rabbit ears on top (unless it's bare: the sets
// stacked in a wall have no feet or ears).
function tvSet(bare) {
  const parts = [
    { mesh: CASE, mat: MAT.WOOD, off: [0, 0, 0], scl: [0.26, 0.2, 0.19] },
    { mesh: BOX, mat: MAT.PLASTIC, off: [0, 0.01, 0.24], scl: [0.17, 0.13, 0.07] },
    { mesh: CASE, mat: MAT.PLASTIC, off: [-0.055, 0.01, -0.186], scl: [0.18, 0.16, 0.01] },
    { mesh: CRT, mat: MAT.SCREEN, off: [-0.055, 0.01, -0.195], scl: [0.16, 0.14, 0.06] },
    { mesh: CYL, mat: MAT.METAL, off: [0.19, 0.1, -0.2], scl: [0.024, 0.024, 0.014] },
    { mesh: CYL, mat: MAT.METAL, off: [0.19, 0.035, -0.2], scl: [0.02, 0.02, 0.014] },
    { mesh: CASE, mat: MAT.FABRIC, off: [0.19, -0.09, -0.191], scl: [0.048, 0.07, 0.004] },
    { mesh: BALL, mat: MAT.METAL, off: [0.04, 0.2, 0.04], scl: [0.035, 0.025, 0.035] },
  ];
  const cols = [{ a: [-0.08, 0, 0], b: [0.08, 0, 0], r: 0.19 }];
  if (bare) return { parts: parts.slice(0, 6), cols };
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.13, 0.13]) parts.push({ mesh: CYL, mat: MAT.PLASTIC, off: [x, -0.212, z], scl: [0.018, 0.018, 0.012], rot: qAxis(X_AXIS, Math.PI / 2) });
  }
  for (const side of [-1, 1]) {
    const a = side * rnd(0.35, 0.7), L = rnd(0.24, 0.34);
    const dir = [-Math.sin(a), Math.cos(a), 0];
    const base = [0.04, 0.21, 0.04];
    const at = k => add(base, dir.map(x => x * L * k));
    parts.push({ mesh: CYL, mat: MAT.METAL, off: at(0.5), scl: [0.005, 0.005, L / 2], rot: qMul(qAxis(Z_AXIS, a), qAxis(X_AXIS, -Math.PI / 2)) });
    parts.push({ mesh: BALL, mat: MAT.METAL, off: at(1), scl: [0.009, 0.009, 0.009] });
    cols.push({ a: base, b: at(1), r: 0.012 });
  }
  return { parts, cols };
}

// A rotary telephone: the body, the dial on its sloping front, the handset
// resting on the cradle's two horns, and the coiled cord. In phone units:
// the body is 0.32 across.
function telephone() {
  return {
    parts: [
      { mesh: BODY, mat: MAT.BAKELITE, off: [0, 0, 0], scl: [0.16, 0.08, 0.13] },
      { mesh: CYL, mat: MAT.DIAL, off: [0, 0.002, -0.0945], scl: [0.058, 0.058, 0.005], rot: qAxis(X_AXIS, 0.454) },
      { mesh: BALL, mat: MAT.BAKELITE, off: [-0.115, 0.098, 0], scl: [0.026, 0.024, 0.034] },
      { mesh: BALL, mat: MAT.BAKELITE, off: [0.115, 0.098, 0], scl: [0.026, 0.024, 0.034] },
      { mesh: HANDSET, mat: MAT.BAKELITE, off: [0, 0.158, 0], scl: [1, 1, 1], jiggle: true },
      { mesh: CORD, mat: MAT.BAKELITE, off: [0, 0, 0], scl: [1, 1, 1] },
    ],
    cols: [
      { a: [-0.06, 0, 0], b: [0.06, 0, 0], r: 0.12 },
      { a: [-0.16, 0.16, 0], b: [0.16, 0.16, 0], r: 0.05 },
    ],
  };
}

// A VHS tape: the black shell, the smoked window over the reels on the
// front, the door along the top edge, a sticker on the back and a label on
// the spine.
function vhsTape() {
  return {
    parts: [
      { mesh: CASE, mat: MAT.VHS, off: [0, 0, 0], scl: [0.2, 0.11, 0.028] },
      { mesh: CASE, mat: MAT.VHS, off: [0, 0.101, 0], scl: [0.199, 0.01, 0.0292] },
      { mesh: CASE, mat: MAT.WINDOW, off: [0, 0.022, -0.0282], scl: [0.105, 0.034, 0.0015], style: 0 },
      { mesh: CASE, mat: MAT.LABEL, off: [0, 0.0, 0.0283], scl: [0.165, 0.072, 0.0008], style: 0 },
      { mesh: CASE, mat: MAT.LABEL, off: [0, -0.1104, 0], scl: [0.17, 0.0008, 0.019], style: 1 },
    ],
    cols: [{ a: [-0.12, 0, 0], b: [0.12, 0, 0], r: 0.08 }],
  };
}

// A compact cassette: the shell, a label on each side with a window
// through it over the two hubs, and the bump along the bottom edge.
function cassetteTape() {
  const parts = [
    { mesh: CASE, mat: MAT.CASSETTE, off: [0, 0, 0], scl: [0.13, 0.085, 0.014] },
    { mesh: CASE, mat: MAT.CASSETTE, off: [0, -0.07, 0], scl: [0.085, 0.016, 0.0165] },
  ];
  for (const side of [-1, 1]) {
    parts.push({ mesh: CASE, mat: MAT.LABEL, off: [0, 0.012, side * 0.0142], scl: [0.118, 0.062, 0.0006], style: 2 });
    parts.push({ mesh: CASE, mat: MAT.WINDOW, off: [0, 0.012, side * 0.0152], scl: [0.095, 0.022, 0.0006], style: 1 });
  }
  return { parts, cols: [{ a: [-0.06, 0, 0], b: [0.06, 0, 0], r: 0.075 }] };
}

export function createGame(events) {
  const S = {
    mode: 'title', paused: false,
    s: 0, speed: 1.6, runT: 0, start: 0, T: 0,
    x: 0, y: 0, vx: 0, vy: 0, steer: [0, 0], nudge: [0, 0],
    right: [1, 0], up: [0, 1], bank: 0,
    deb: [], next: 0, id: 1, spawned: 0,
    deathT: 0, kind: '', bounce: 0, shake: 0, flash: 0, fade: 0, fadeTo: 0,
    glitch: 0, off: 1,
  };
  const seen = {};

  const meters = () => Math.max(0, (S.s - S.start) * M_PER_UNIT);

  // ---- junk -----------------------------------------------------------------
  function junk(kind, x, y, z, o) {
    const d = {
      id: S.id++, kind, x, y, z, vx: 0, vy: 0, orbit: 0,
      q: qAxis(randomAxis(), Math.random() * 6.3), axis: randomAxis(), w: rnd(0.3, 1.2), local: false,
      parts: [], cols: [], minD: 1e9, missed: false, seed: Math.random(), ...o,
    };
    S.deb.push(d);
    return d;
  }

  function tv(x, y, z, k = 1, kind = 'tv') {
    return junk(kind, x, y, z, {
      ...sized(tvSet(kind === 'wall'), k), w: rnd(0.25, 0.7),
      vx: rnd(-0.06, 0.06), vy: rnd(-0.06, 0.06),
    });
  }

  function tape(x, y, z) {
    return junk('tape', x, y, z, {
      ...vhsTape(), w: rnd(1, 2.6),
      vx: rnd(-0.15, 0.15), vy: rnd(-0.15, 0.15), orbit: rnd(-0.25, 0.25),
    });
  }

  // A record skimming across the tunnel, spinning on its own axis, a little tipped.
  function record(x, y, z) {
    const a = Math.random() * 6.3;
    return junk('record', x, y, z, {
      q: qMul(qAxis(randomAxis(), rnd(0.2, 1.2)), qAxis(X_AXIS, Math.PI / 2)),
      axis: Z_AXIS, w: rnd(4, 9) * (Math.random() < 0.5 ? -1 : 1), local: true,
      parts: [{ mesh: CYL, mat: MAT.VINYL, off: [0, 0, 0], scl: [0.18, 0.18, 0.004] }],
      cols: [{ a: [-0.09, 0, 0], b: [0.09, 0, 0], r: 0.09 }, { a: [0, -0.09, 0], b: [0, 0.09, 0], r: 0.09 }],
      vx: 0.45 * Math.cos(a), vy: 0.45 * Math.sin(a), orbit: rnd(-0.4, 0.4),
    });
  }

  function phone(x, y, z) {
    return junk('phone', x, y, z, {
      ...sized(telephone(), 1.3), w: rnd(0.4, 0.9), ring: false,
      vx: rnd(-0.06, 0.06), vy: rnd(-0.06, 0.06),
    });
  }

  function cassette(x, y, z) {
    return junk('cassette', x, y, z, {
      ...sized(cassetteTape(), 1.4),
      w: rnd(0.8, 2), vx: rnd(-0.08, 0.08), vy: rnd(-0.08, 0.08), orbit: rnd(-0.2, 0.2),
    });
  }

  function inDisc(r = PLAY_R) {
    const a = Math.random() * 6.3, rr = Math.sqrt(Math.random()) * r;
    return [rr * Math.cos(a), rr * Math.sin(a)];
  }

  // One pattern at S.next; returns how deep it is.
  function spawn() {
    const diff = Math.min(1, S.runT / 150);
    const v = Math.max(S.speed, 7);
    const z = S.next;
    let type = ['tv', 'tapes', 'phone', 'records', 'wall', 'cassettes'][S.spawned];
    if (!type) {
      const r = Math.random();
      type = r < 0.2 ? 'tv' : r < 0.37 ? 'tapes' : r < 0.52 ? 'phone' : r < 0.69 ? 'records' : r < 0.83 ? 'wall' : 'cassettes';
    }
    let depth = 0.5;
    if (type === 'tv') {
      // Right where you are now, give or take.
      const [ox, oy] = inDisc(0.2);
      tv(clamp(S.x + ox, -PLAY_R, PLAY_R), clamp(S.y + oy, -PLAY_R, PLAY_R), z, rnd(1, 1.25) + 0.15 * diff);
      if (diff > 0.4 && Math.random() < 0.5) { const [x, y] = inDisc(0.7); tv(x, y, z + rnd(3, 5)); depth = 5; }
    } else if (type === 'tapes') {
      const n = 6 + Math.floor(Math.random() * 6 * (0.5 + diff));
      for (let i = 0; i < n; i++) {
        const [x, y] = inDisc(0.9);
        tape(x, y, z + rnd(0, 6));
      }
      depth = 6;
    } else if (type === 'phone') {
      const [ox, oy] = inDisc(0.25);
      phone(clamp(S.x + ox, -PLAY_R, PLAY_R), clamp(S.y + oy, -PLAY_R, PLAY_R), z);
      if (Math.random() < 0.3 + 0.4 * diff) { const [x, y] = inDisc(0.7); phone(x, y, z + rnd(2.5, 4)); depth = 4; }
    } else if (type === 'records') {
      const n = 4 + Math.floor(Math.random() * 4 * (0.5 + diff));
      for (let i = 0; i < n; i++) {
        const [x, y] = inDisc(0.85);
        record(x, y, z + rnd(0, 5));
      }
      depth = 5;
    } else if (type === 'wall') {
      // A wall of TV sets right across the tunnel, all showing snow, with one way through.
      const gr = rnd(0.15, 0.5), ga = Math.random() * 6.3;
      const gx = gr * Math.cos(ga), gy = gr * Math.sin(ga);
      const gap = 0.24 - 0.04 * diff;
      const k = 0.72, sx = 0.41, sy = 0.31;
      for (let i = -3; i <= 3; i++) {
        for (let j = -4; j <= 4; j++) {
          const x = i * sx + (j % 2 ? sx / 2 : 0) + rnd(-0.02, 0.02), y = j * sy + rnd(-0.02, 0.02);
          if (Math.hypot(x, y) > 1.05) continue;
          // Leave out every set that would block the gap.
          if (Math.abs(x - gx) < gap + 0.27 * k && Math.abs(y - gy) < gap + 0.19 * k) continue;
          const d = tv(x, y, z + rnd(-0.15, 0.15), k, 'wall');
          d.q = qMul(qAxis(Z_AXIS, rnd(-0.12, 0.12)), qAxis(X_AXIS, rnd(-0.1, 0.1)));
          d.w = 0; d.vx = d.vy = 0;
        }
      }
      depth = 1;
    } else {
      const n = 4 + Math.floor(Math.random() * (3 + 4 * diff));
      for (let i = 0; i < n; i++) {
        const [x, y] = inDisc(0.85);
        cassette(x, y, z + rnd(0, 3));
      }
      depth = 3;
    }
    S.spawned++;
    S.next = z + depth + Math.max(7, v * (1.0 - 0.35 * diff) + Math.random() * v * (0.9 - 0.4 * diff));
  }

  function colliders(d) {
    return d.cols.map(c => ({
      a: add([d.x, d.y, d.z], qRot(d.q, c.a)),
      b: add([d.x, d.y, d.z], qRot(d.q, c.b)),
      r: c.r,
    }));
  }

  function moveJunk(dt) {
    for (const d of S.deb) {
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (Math.hypot(d.x, d.y) > 1) { d.vx = -d.vx; d.vy = -d.vy; }
      if (d.orbit) {
        const c = Math.cos(d.orbit * dt), s = Math.sin(d.orbit * dt);
        [d.x, d.y] = [d.x * c - d.y * s, d.x * s + d.y * c];
      }
      if (d.w) d.q = qNorm(d.local ? qMul(d.q, qAxis(d.axis, d.w * dt)) : qMul(qAxis(d.axis, d.w * dt), d.q));
      // Telephones ring as you come up on them.
      if (d.kind === 'phone' && !d.ring && S.mode === 'run' && d.z - S.s < Math.max(S.speed, 6) * 1.6) {
        d.ring = true;
        const side = Math.sign((d.x - S.x) * S.right[0] + (d.y - S.y) * S.right[1]);
        events.ring(side * Math.min(1, Math.hypot(d.x - S.x, d.y - S.y) * 1.5));
      }
    }
  }

  // ---- actions --------------------------------------------------------------
  function start() {
    S.mode = 'run'; S.paused = false;
    S.runT = 0; S.start = S.s;
    S.x = 0; S.y = 0; S.vx = 0; S.vy = 0; S.nudge = [0, 0];
    S.deb = []; S.spawned = 0; S.next = S.s + 45;
    S.fadeTo = 0; S.shake = 0; S.flash = 0;
    S.speed = Math.max(S.speed, 3);
    events.start();
  }

  function setPaused(p) {
    if (S.mode !== 'run') return;
    S.paused = p;
    events.pause(p);
  }

  function nudge(dx, dy) {
    if (S.mode !== 'run' || S.paused) return;
    S.nudge[0] += dx; S.nudge[1] += dy;
  }

  function die(kind) {
    S.mode = 'dying'; S.kind = kind; S.deathT = 0;
    S.bounce = Math.min(4, S.speed * 0.35);
    S.speed = 0; S.shake = 1; S.flash = 1; S.glitch = 1;
    events.die(kind);
  }

  // ---- simulation -----------------------------------------------------------
  function step(dt) {
    // Steering is screen-relative, so it still feels right as the view rolls.
    const [sx, sy] = S.steer;
    const tx = (sx * S.right[0] + sy * S.up[0]) * VMAX;
    const ty = (sx * S.right[1] + sy * S.up[1]) * VMAX;
    const k = 1 - Math.exp(-10 * dt);
    S.vx += (tx - S.vx) * k;
    S.vy += (ty - S.vy) * k;
    const x0 = S.x, y0 = S.y, s0 = S.s;
    S.x += S.vx * dt; S.y += S.vy * dt;
    const r = Math.hypot(S.x, S.y);
    if (r > PLAY_R) {
      S.x *= PLAY_R / r; S.y *= PLAY_R / r;
      const nx = S.x / PLAY_R, ny = S.y / PLAY_R, out = S.vx * nx + S.vy * ny;
      if (out > 0) { S.vx -= out * nx; S.vy -= out * ny; }
    }
    S.s += S.speed * dt;
    moveJunk(dt);

    const p0 = [x0, y0, s0], p1 = [S.x, S.y, S.s];
    for (const d of S.deb) {
      if (Math.abs(d.z - S.s) > 2.5) continue;
      for (const c of colliders(d)) {
        const dist = segDist(p0, p1, c.a, c.b) - c.r;
        if (dist < HIT_R) return die(d.kind);
        if (dist < d.minD) { d.minD = dist; d.side = Math.sign((c.a[0] - S.x) * S.right[0] + (c.a[1] - S.y) * S.right[1]); }
      }
      if (!d.missed && d.z < S.s - 0.6 && d.minD < MISS_R) {
        d.missed = true;
        events.nearMiss(d.side || 0, 1 - d.minD / MISS_R, d.kind);
      }
    }
  }

  function update(dt) {
    if (S.paused) return;
    S.T += dt;
    S.flash = Math.max(0, S.flash - dt * 2.5);
    S.shake = Math.max(0, S.shake - dt * 2);
    S.glitch = Math.max(0, S.glitch - dt * 2.2);
    const rate = S.fadeTo > S.fade ? 2.4 : 4;
    S.fade += (S.fadeTo - S.fade) * (1 - Math.exp(-dt * rate));

    // Touch drags move you straight across the screen.
    if (S.nudge[0] || S.nudge[1]) {
      const [nx, ny] = S.nudge;
      S.x += nx * S.right[0] + ny * S.up[0];
      S.y += nx * S.right[1] + ny * S.up[1];
      S.nudge = [0, 0];
    }

    if (S.mode === 'title' || S.mode === 'over') {
      // The set warms up: the picture opens out from a line.
      S.off = Math.max(0, S.off - dt * 1.6);
      const target = S.mode === 'title' ? 1.6 : 0.6;
      S.speed += (target - S.speed) * (1 - Math.exp(-dt * 2));
      S.s += S.speed * dt;
      S.x *= Math.exp(-dt); S.y *= Math.exp(-dt);
      moveJunk(dt);
      return;
    }

    if (S.mode === 'dying') {
      S.deathT += dt;
      S.bounce *= Math.exp(-dt * 5);
      S.s -= S.bounce * dt;
      S.off = clamp((S.deathT - 0.25) / 0.75, 0, 1);
      moveJunk(dt);
      if (S.deathT > 1.25) {
        S.mode = 'over';
        S.off = 0.999; S.fade = 0.5; S.fadeTo = 0.5;
        events.over(S.kind, meters());
      }
      return;
    }

    S.runT += dt;
    S.speed += (flySpeed(S.runT) - S.speed) * (1 - Math.exp(-dt * 1.5));
    let rem = dt;
    while (rem > 1e-6 && S.mode === 'run') {
      const h = Math.min(rem, 1 / 120);
      step(h);
      rem -= h;
    }
    if (S.mode !== 'run') return;
    while (S.next < S.s + SPAWN_D) spawn();
    S.deb = S.deb.filter(d => d.z > S.s - 3);
    for (const d of S.deb) {
      if (!d.seen && d.z - S.s < 40) {
        d.seen = true;
        if (!seen[d.kind]) { seen[d.kind] = true; events.approach(d.kind); }
      }
    }
    events.progress(meters());
  }

  // ---- camera ---------------------------------------------------------------
  // The eye at depth sAbs, relative to `origin` so numbers stay small.
  function eyeAt(sAbs, x, y, roll, origin) {
    const [cx, cy] = pathXY(sAbs);
    const [tx, ty] = pathXY(sAbs + 6);
    const eye = [cx + x, cy + y, sAbs - origin];
    const target = [tx + 0.4 * x, ty + 0.4 * y, sAbs + 6 - origin];
    const fwd = norm(sub(target, eye));
    const up = qRot(qAxis(fwd, roll), [0, 1, 0]);
    return { eye, target, up, fwd };
  }

  function camera(reduceMotion) {
    const drift = reduceMotion ? 0 : 0.35 * Math.sin(S.T * 0.09) + 0.25 * Math.sin(S.T * 0.031 + 1);
    const lateral = S.vx * S.right[0] + S.vy * S.right[1];
    S.bank += (lateral * 0.1 - S.bank) * 0.1;
    const roll = drift + (reduceMotion ? 0 : S.bank);
    const sh = reduceMotion ? 0 : S.shake * S.shake * 0.06;
    const jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh;
    const now = eyeAt(S.s, S.x + jx, S.y + jy, roll, S.s);
    const was = eyeAt(S.s - S.speed * STREAK * 0.6, S.x - S.vx * STREAK, S.y - S.vy * STREAK,
      roll - (reduceMotion ? 0 : 0.35 * 0.09 * Math.cos(S.T * 0.09)) * STREAK, S.s);
    // Screen right and up, across the tunnel, for steering.
    const right = norm(cross(now.up, now.fwd));
    S.right = [right[0], right[1]];
    S.up = [now.up[0], now.up[1]];
    return { now, was };
  }

  // Junk as drawable parts: position relative to the eye's depth, turn, size.
  function parts() {
    const out = [];
    for (const d of S.deb) {
      if (d.z - S.s > SPAWN_D + 2) continue;
      const [cx, cy] = pathXY(d.z);
      const rl = Math.hypot(d.x, d.y) || 1;
      for (const p of d.parts) {
        let off = p.off;
        // A ringing phone's handset rattles in its cradle.
        if (p.jiggle && d.ring) off = add(off, [0, 0.006 * Math.max(0, Math.sin(S.T * 70)) * (Math.sin(S.T * 6) > 0 ? 1 : 0), 0]);
        const o = qRot(d.q, off);
        out.push({
          mesh: p.mesh, mat: p.mat, seed: d.seed,
          pos: [cx + d.x + o[0], cy + d.y + o[1], d.z - S.s + o[2]],
          q: p.rot ? qMul(d.q, p.rot) : d.q, scl: p.scl, radial: [d.x / rl, d.y / rl], style: p.style || 0,
        });
      }
    }
    return out;
  }

  return { S, start, setPaused, nudge, update, camera, parts, meters, spawn, junk: { tv, tape, record, phone, cassette } };
}
