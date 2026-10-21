// The tunnel: sheets of TV static, folded like cloth, and snow in the air.
//
// Every particle is made up here from its index alone. The walls are a few
// sheets one inside another, each a grid of dots in rows round the tunnel
// and along it. Each sheet is draped into folds that drift and roll as
// time goes by: the dots are pushed in and out, round and along, and where
// they bunch up into a crease the sheet shows a bright line, the way a
// curtain does. Each dot flickers like a pixel of static. The sheets turn
// slowly, the inner ones one way and the outer ones the other, and a bright
// bar rolls down the tunnel now and then, like a set losing its vertical
// hold. In the open middle, snow: dots that blink on somewhere, hang a
// moment and blink off. The tunnel's shape is held to your view and the
// dots stream past as you fly. Each is drawn as a short streak from where
// it is now to where it was STREAK seconds ago. Far away they fade to
// nothing: the dark at the centre.
//
// Space: x right, y up, z forward, relative to the eye's depth.

struct U {
  vp: mat4x4f,        // view-projection now
  pvp: mat4x4f,       // and STREAK seconds ago
  a: vec4f,           // resolution.xy, time, device pixel ratio
  b: vec4f,           // window offset (s - near mod window), unused, spin now, spin then
  c: vec4f,           // window, near, far, gain
  d: vec4f,           // particle count, sheets, dots round each sheet, rows along it
  e: vec4f,           // focal length px, longest streak px, share of snow, depth moved in STREAK
  p: array<vec4f, 3>, // phases (s * K + K0) mod 2π
  k: array<vec4f, 3>, // wave numbers K
};
@group(0) @binding(0) var<uniform> u: U;

const TAU = 6.2831853;
const TWIST = 0.035;   // how far round the sheets twist per unit of depth
const OPEN = 0.03;     // how much wider the tunnel gets with depth

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,                         // pixels along and across the streak
  @location(1) @interpolate(flat) f: vec4f,      // half length, radius, intensity
};

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v)) / 4294967296.0; }

fn P(i: u32) -> f32 { return u.p[i / 4u][i % 4u]; }
fn K(i: u32) -> f32 { return u.k[i / 4u][i % 4u]; }
fn ph(i: u32, z: f32) -> f32 { return P(i) + z * K(i); }

fn centre(z: f32) -> vec2f {
  return vec2f(1.8 * sin(ph(0u, z)) + 0.7 * sin(ph(1u, z)) + 0.6 * sin(ph(9u, z)),
               1.2 * sin(ph(2u, z)) + 0.5 * sin(ph(3u, z)) + 0.5 * sin(ph(10u, z)));
}

// How a sheet is folded at angle th and depth z: x is how far out (-1 to
// 1), y how far round and z how far along it is pushed.
fn fold(th: f32, z: f32, t: f32, s: f32) -> vec3f {
  let f1 = sin(3.0 * th + ph(4u, z) + t * 0.31 + s * 1.7);
  let f2 = sin(5.0 * th - ph(5u, z) - t * 0.23 + s * 2.9);
  let f3 = sin(8.0 * th + ph(6u, z) + t * 0.47 + s * 0.8);
  let g = 0.55 * f1 + 0.3 * f2 + 0.15 * f3;
  let round = 0.16 * sin(4.0 * th + ph(7u, z) + t * 0.2 + s * 2.2) + 0.06 * f2;
  let along = 0.5 * sin(3.0 * th - ph(5u, z) * 0.7 + t * 0.17 + s) + 0.2 * f3;
  return vec3f(g, round, along);
}

fn place(th: f32, z: f32, r: f32, s: f32, spin: f32, t: f32, sheet: bool) -> vec3f {
  var ang = th + spin + TWIST * z;
  var rr = r;
  var zz = z;
  if (sheet) {
    let f = fold(th, z, t, s);
    ang += f.y;
    zz += f.z;
    rr = r * (1.0 + 0.3 * f.x) * (1.0 + OPEN * max(z, 0.0));
  }
  let lean = vec2f(sin(t * 0.071 + 1.0), sin(t * 0.053 + 2.0)) * 0.08 * z;
  return vec3f(centre(zz) + lean + rr * vec2f(cos(ang), sin(ang)), zz);
}

fn none() -> VO {
  var o: VO;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  o.q = vec2f(0.0);
  o.f = vec4f(0.0);
  return o;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let res = u.a.xy;
  let W = u.c.x;
  let t = u.a.z;
  let nSheet = u32(u.d.y) * u32(u.d.z) * u32(u.d.w);
  let frame = u32(t * 24.0);

  var zoff: f32;
  var r: f32;
  var th: f32;
  var size: f32;
  var bright: f32;
  var s = 0.0;
  var spinMul = 1.0;
  var sheet = true;

  if (ii < nSheet) {
    let cols = u32(u.d.z);
    let rows = u32(u.d.w);
    let per = cols * rows;
    let sid = ii / per;
    let k = ii % per;
    let col = k % cols;
    let row = k / cols;
    let hs = sid * 16u + 5000011u;
    let hp = ii * 4u + 3000017u;
    s = f32(sid);
    r = 1.0 + 0.42 * s + 0.08 * s * s;
    // Rows round the tunnel, every other one staggered half a dot.
    let stagger = select(0.0, 0.5, (row & 1u) == 1u);
    th = (f32(col) + stagger + 0.1 * (rnd(hp) - 0.5)) / f32(cols) * TAU + rnd(hs) * TAU;
    zoff = (f32(row) + 0.1 * (rnd(hp + 1u) - 0.5)) / f32(rows) * W + rnd(hs + 1u) * W;
    zoff = zoff - W * floor(zoff / W);
    spinMul = select(-0.7, 1.0, (sid & 1u) == 0u);
    size = (0.0028 + 0.0018 * rnd(hp + 2u)) * (1.0 + 0.25 * s);
    // Static: every dot flickers, frame by frame.
    let flick = rnd(hp * 31u + frame * 2654435761u);
    bright = (0.45 + 0.9 * flick * flick) / (1.0 + 0.45 * s);
  } else {
    // Snow: blinks on somewhere in the middle, hangs a moment, blinks off.
    let h = ii * 4u + 17u;
    let rate = 3.0 + 4.0 * rnd(h);
    let cyc = t * rate + rnd(h + 1u);
    let life = fract(cyc);
    let hh = pcg(h + u32(cyc) * 7919u);
    zoff = rnd(hh) * W;
    r = 0.08 + 1.0 * sqrt(rnd(hh + 1u));
    th = rnd(hh + 2u) * TAU;
    size = 0.002 + 0.0025 * rnd(hh + 3u);
    bright = (0.25 + 0.9 * pow(rnd(hh + 4u), 3.0)) * sin(3.14159 * life);
    spinMul = 0.3;
    sheet = false;
  }

  // Depth: each particle repeats every W along the tunnel; take the copy in the window.
  var a = zoff - u.b.x;
  if (a < 0.0) { a = a + W; }
  let z = a - u.c.y;

  let pNow = place(th, z, r, s, u.b.z * spinMul, t, sheet);
  var pThen = place(th, z + u.e.w, r, s, u.b.w * spinMul, t, sheet);
  pThen.z = pThen.z - u.e.w;

  // Where the sheet folds outwards it catches the light; the bar rolls down
  // the tunnel towards you.
  if (sheet) {
    let f = fold(th, z, t, s);
    bright *= 0.12 + 1.9 * pow(0.5 + 0.5 * f.x, 3.0);
  }
  let bar = sin(ph(11u, pNow.z) + t * 1.4);
  bright *= 1.0 + 1.4 * pow(max(bar, 0.0), 40.0);

  let ca = u.vp * vec4f(pNow, 1.0);
  if (ca.w < 0.06) { return none(); }
  var cb = u.pvp * vec4f(pThen, 1.0);
  if (cb.w < 0.06) { cb = ca; }
  let A = (ca.xy / ca.w * 0.5 + 0.5) * res;
  var B = (cb.xy / cb.w * 0.5 + 0.5) * res;

  // Fade in near the eye and out towards the dark at the centre.
  let fade = smoothstep(0.2, 2.0, z) * pow(1.0 - smoothstep(u.c.z * 0.3, u.c.z, z), 1.3);
  let rTrue = size * u.e.x / ca.w;
  let minR = 0.75 * u.a.w;
  let rad = clamp(rTrue, minR, 7.0 * u.a.w);
  var I = bright * 1.5 * fade * u.c.w * min(1.0, (rTrue * rTrue) / (rad * rad));
  if (I < 0.003) { return none(); }

  var d = A - B;
  var len = length(d);
  if (len > u.e.y) { d = d * (u.e.y / len); len = u.e.y; }
  let dir = select(vec2f(1.0, 0.0), d / max(len, 1e-4), len > 0.01);
  let perp = vec2f(-dir.y, dir.x);
  I = I * mix(1.0, (2.0 * rad) / (2.0 * rad + len), 0.8);

  var corner = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let cn = corner[vi];
  let ext = 3.0 * rad + 1.0;
  let hl = len * 0.5;
  let along = cn.x * (hl + ext);
  let across = cn.y * ext;
  let mid = A - d * 0.5;
  let px = mid + dir * along + perp * across;

  var o: VO;
  o.pos = vec4f(px / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0), 1.0);
  o.q = vec2f(along, across);
  o.f = vec4f(hl, rad, I, 0.0);
  return o;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let hl = in.f.x;
  let rad = in.f.y;
  let d = length(vec2f(max(abs(in.q.x) - hl, 0.0), in.q.y));
  let core = exp(-(d * d) / (0.72 * rad * rad));
  let halo = 0.08 * exp(-d / (rad * 1.3));
  let v = in.f.z * (core + halo);
  return vec4f(v, v, v, 1.0);
}
