// The junk in the tunnel: wooden TV sets, VHS tapes, records, rotary
// telephones and cassettes.
//
// Lit by a cold key light from behind you, by the flickering static all
// round them (light from outside the tunnel inwards), and from behind by
// the test card at the end, which rims them. Fine detail (wood grain, the
// grille's weave, a record's grooves and label, the reels behind a tape's
// window, the handwriting on its labels, the dial's finger holes) is worked
// out here per pixel in each part's own space, so it stays put as they
// tumble. TV screens show static, or now and then colour bars, and light
// up their own faces. They come out of the dark.

struct U {
  vp: mat4x4f,
  a: vec4f,           // time, fade-in start, fade-in end, how bright the static is
  card: vec4f,        // direction to the test card, strength
};
struct Inst {
  pos: vec4f,         // xyz, finish (see MAT in game.js)
  q: vec4f,           // turn
  scl: vec4f,         // size xyz, seed
  rad: vec4f,         // xy: out from the tunnel's middle; z: which design (labels, windows); w: unused
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<uniform> inst: array<Inst, 256>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) n: vec3f,
  @location(1) w: vec3f,
  @location(2) l: vec3f,
  @location(3) m: vec3f,
  @location(4) cav: f32,
  @location(5) @interpolate(flat) i: u32,
};

const WOOD = 0;
const PLASTIC = 1;
const SCREEN = 2;
const METAL = 3;
const VINYL = 4;
const VHS = 5;
const BAKELITE = 6;
const FABRIC = 7;
const DIAL = 8;
const CASSETTE = 9;
const LABEL = 10;
const WINDOW = 11;

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) cav: f32, @builtin(instance_index) ii: u32) -> VO {
  let it = inst[ii];
  let w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  var o: VO;
  o.pos = u.vp * vec4f(w, 1.0);
  o.n = qrot(it.q, n / it.scl.xyz);
  o.w = w;
  o.l = p * it.scl.xyz;
  o.m = p;
  o.cav = cav;
  o.i = ii;
  return o;
}

fn hash(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn noise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash(i + vec3f(0.0, 1.0, 0.0)), hash(i + vec3f(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(i + vec3f(0.0, 0.0, 1.0)), hash(i + vec3f(1.0, 0.0, 1.0)), w.x),
        mix(hash(i + vec3f(0.0, 1.0, 1.0)), hash(i + vec3f(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}
fn fbm(p: vec3f) -> f32 {
  return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + 3.1) + 0.125 * noise(p * 4.07 + 7.7);
}
// 1 inside a rectangle (centre c, half size h), soft by e.
fn rect(p: vec2f, c: vec2f, h: vec2f, e: f32) -> f32 {
  let d = abs(p - c) - h;
  return 1.0 - smoothstep(-e, e, max(d.x, d.y));
}
fn disc(p: vec2f, c: vec2f, r: f32, e: f32) -> f32 {
  return 1.0 - smoothstep(r - e, r + e, length(p - c));
}

// Colours picked by seed.
fn labelCol(s: f32) -> vec3f {
  let k = i32(fract(s * 7.31) * 6.0);
  var c = array<vec3f, 6>(vec3f(0.75, 0.12, 0.08), vec3f(0.92, 0.85, 0.65), vec3f(0.12, 0.25, 0.6),
                          vec3f(0.95, 0.7, 0.12), vec3f(0.2, 0.5, 0.3), vec3f(0.85, 0.85, 0.82));
  return c[k];
}
fn phoneCol(s: f32) -> vec3f {
  let k = i32(fract(s * 3.77) * 5.0);
  var c = array<vec3f, 5>(vec3f(0.025, 0.025, 0.028), vec3f(0.6, 0.06, 0.05), vec3f(0.85, 0.8, 0.66),
                          vec3f(0.45, 0.68, 0.55), vec3f(0.78, 0.55, 0.12));
  return c[k];
}

// What's on a TV: static, or colour bars. p is across the screen, -1 to 1.
fn picture(p: vec2f, seed: f32, t: f32) -> vec3f {
  if (fract(seed * 7.7) < 0.22) {
    let x = (p.x + 1.0) * 0.5;
    let y = (1.0 - p.y) * 0.5;
    var bars = array<vec3f, 7>(vec3f(0.75), vec3f(0.75, 0.75, 0.0), vec3f(0.0, 0.75, 0.75), vec3f(0.0, 0.75, 0.0),
                               vec3f(0.75, 0.0, 0.75), vec3f(0.75, 0.0, 0.0), vec3f(0.0, 0.0, 0.75));
    var c = bars[clamp(i32(x * 7.0), 0, 6)];
    if (y > 0.67) { c = select(vec3f(0.03), vec3f(0.9), fract(x * 4.0) < 0.25); }
    let roll = fract(y - t * 0.15);
    c *= 0.85 + 0.15 * smoothstep(0.0, 0.05, roll);
    return c + 0.06 * hash(vec3f(floor(p * vec2f(110.0, 80.0)), floor(t * 30.0)));
  }
  let px = floor(vec2f(p.x * 96.0, p.y * 72.0));
  let v = hash(vec3f(px, floor(t * 30.0) + seed * 97.0));
  let lines = 0.8 + 0.2 * sin(p.y * 72.0 * 3.14159);
  let bar = 1.0 + 0.4 * smoothstep(0.85, 1.0, sin(p.y * 2.0 - t * 2.3 + seed * 6.0));
  return vec3f(v * v * 1.1 * lines * bar);
}

// What a glossy finish sees, in direction r: the walls of static all round
// (brighter to the sides, dark ahead and behind, where the tunnel runs
// off), specks of the static itself, sharp in a glossy finish and lost in
// a rough one, and the test card far ahead.
fn env(r: vec3f, rough: f32, t: f32, flick: f32) -> vec3f {
  let side = 1.0 - abs(r.z);
  var e = vec3f(0.025 + 0.3 * side * side * flick);
  let q = r * 60.0;
  let f = fract(q) - 0.5;
  let h = hash(floor(q) + floor(t * 24.0) * 0.173);
  let speck = (1.0 - smoothstep(0.08, 0.22, length(f))) * step(0.8, h) * side;
  e += vec3f(speck * 1.6 * (1.0 - smoothstep(0.03, 0.15, rough)));
  let c = max(dot(r, u.card.xyz), 0.0);
  e += vec3f(0.7, 0.85, 1.0) * pow(c, mix(900.0, 12.0, rough)) * mix(6.0, 0.25, rough) * u.card.w;
  return e;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let it = inst[in.i];
  let mat = i32(it.pos.w + 0.5);
  let style = i32(it.rad.z + 0.5);
  let seed = it.scl.w;
  let t = u.a.x;
  var n = normalize(in.n);
  let v = normalize(-in.w);
  if (dot(n, v) < 0.0 && (mat == SCREEN || mat == FABRIC)) { n = -n; }   // thin things show both faces
  let out = normalize(vec3f(it.rad.xy, 0.0001));
  let l = in.l;
  let m = in.m;

  var albedo = vec3f(0.5);
  var spec = 0.04;          // reflectance straight on
  var shine = 16.0;         // how glossy: the higher the sharper
  var metal = false;
  var emit = vec3f(0.0);
  var cav = in.cav;
  var groove = vec3f(0.0);  // the way a record's grooves run, if it has them

  if (mat == WOOD) {
    // Walnut veneer under lacquer: grain running along the cabinet, wavy,
    // with darker figure.
    let wob = 0.6 * fbm(l * vec3f(3.0, 14.0, 14.0) + seed * 9.0);
    let ring = fract((l.y + l.z * 0.4) * 55.0 + wob * 3.0);
    let grain = smoothstep(0.0, 0.5, ring) * smoothstep(1.0, 0.6, ring);
    albedo = mix(vec3f(0.1, 0.045, 0.02), vec3f(0.34, 0.17, 0.08), 0.3 + 0.55 * grain * (0.6 + 0.4 * noise(l * 30.0)));
    spec = 0.05; shine = 260.0;
  } else if (mat == PLASTIC) {
    albedo = vec3f(0.025);
    spec = 0.05; shine = 120.0;
  } else if (mat == SCREEN) {
    // Glass with the picture behind it, dimmer at the tube's edges.
    let edge = 1.0 - smoothstep(0.75, 1.02, max(abs(m.x), abs(m.y)));
    emit = picture(m.xy, seed, t) * (0.25 + 0.75 * edge) * 1.3;
    albedo = vec3f(0.015);
    spec = 0.045; shine = 900.0;
  } else if (mat == METAL) {
    albedo = vec3f(0.85);
    spec = 0.9; shine = 300.0; metal = true;
  } else if (mat == VINYL) {
    let r = length(m.xy);
    albedo = vec3f(0.015);
    spec = 0.05; shine = 200.0;
    if (abs(m.z) > 0.9) {
      if (r < 0.34) {
        // The label: a colour, a darker ring of print, a bar of print, the spindle hole.
        albedo = labelCol(seed) * (0.9 + 0.1 * noise(vec3f(m.xy * 40.0, seed)));
        let print = (1.0 - smoothstep(0.0, 0.012, abs(r - 0.25))) * step(0.5, fract(atan2(m.y, m.x) * 6.0));
        albedo *= 1.0 - 0.6 * print;
        albedo = mix(albedo, vec3f(0.95, 0.92, 0.85), rect(m.xy, vec2f(0.0, 0.12), vec2f(0.17, 0.018), 0.004) * 0.8);
        spec = 0.03; shine = 20.0;
        if (r < 0.035) { albedo = vec3f(0.0); }
      } else if (r < 0.97) {
        // Grooves, with the gaps between the songs.
        let gap = 1.0 - smoothstep(0.0, 0.008, abs(fract(r * 6.0 + seed) - 0.5) - 0.48);
        albedo = vec3f(0.015 + 0.02 * gap);
        groove = qrot(it.q, normalize(vec3f(-m.y, m.x, 0.0)));
      }
    }
  } else if (mat == VHS) {
    // Black plastic, satin, with the recess for the sticker on the back,
    // the door's seam along the front and grip ribs at the ends.
    albedo = vec3f(0.028) * (0.9 + 0.2 * noise(l * 600.0));
    spec = 0.045; shine = 45.0;
    if (m.z > 0.97) {
      let recess = rect(l.xy, vec2f(0.0), vec2f(0.172, 0.079), 0.0015) - rect(l.xy, vec2f(0.0), vec2f(0.168, 0.075), 0.0015);
      albedo *= 1.0 - 0.6 * recess;
    }
    if (abs(m.z) > 0.97 && abs(l.x) > 0.17) { albedo *= 0.75 + 0.5 * step(0.5, fract(l.y * 120.0)); }
  } else if (mat == BAKELITE) {
    albedo = phoneCol(seed);
    spec = 0.05; shine = 220.0;
  } else if (mat == FABRIC) {
    // A speaker grille: a coarse weave in dark brown and gold.
    let wv = sin(l.x * 900.0) * sin(l.y * 900.0);
    albedo = mix(vec3f(0.06, 0.04, 0.025), vec3f(0.28, 0.2, 0.09), 0.5 + 0.5 * wv);
    spec = 0.02; shine = 6.0;
  } else if (mat == DIAL) {
    // The dial: a clear finger wheel over a white number card, ten holes
    // with the numbers showing through, a white label in the middle, a
    // chrome finger stop, and round it the plate in the phone's colour.
    let r = length(m.xy);
    albedo = phoneCol(seed);
    spec = 0.05; shine = 220.0;
    if (abs(m.z) > 0.9 && r < 0.9) {
      albedo = vec3f(0.86, 0.85, 0.82);
      let a = atan2(m.y, m.x);
      let k = round(fract((a + 1.2) / 6.2831853) * 12.0);
      let ka = k * 0.5236 - 1.2;
      let hd = length(m.xy - 0.62 * vec2f(cos(ka), sin(ka)));
      if (k <= 9.0) {
        albedo *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.035, abs(hd - 0.16)));
        albedo *= 1.0 - 0.8 * (1.0 - smoothstep(0.035, 0.05, hd));
      }
      albedo *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.03, abs(r - 0.86)));
      if (r < 0.3) {
        albedo = vec3f(0.93, 0.92, 0.88) * (1.0 - 0.75 * rect(m.xy, vec2f(0.0, 0.0), vec2f(0.17, 0.025), 0.01));
      }
      let stop = rect(vec2f(dot(m.xy, vec2f(0.64, -0.77)), dot(m.xy, vec2f(0.77, 0.64))), vec2f(0.9, 0.0), vec2f(0.1, 0.035), 0.01);
      albedo = mix(albedo, vec3f(0.8), stop);
      spec = 0.05; shine = 400.0;
    }
  } else if (mat == CASSETTE) {
    // The shell, smoked, black or white, and its five screws.
    let k = i32(fract(seed * 5.1) * 3.0);
    var shells = array<vec3f, 3>(vec3f(0.06, 0.05, 0.045), vec3f(0.02), vec3f(0.82, 0.82, 0.8));
    albedo = shells[k];
    spec = 0.05; shine = 160.0;
    if (abs(m.z) > 0.97) {
      let h = it.scl.xy;
      var sc = 0.0;
      for (var j = 0; j < 5; j++) {
        var c = vec2f(select(-0.9, 0.9, (j & 1) == 1), select(-0.82, 0.86, j >= 2)) * h;
        if (j == 4) { c = vec2f(0.0, -0.55) * h; }
        sc = max(sc, disc(l.xy, c, 0.045 * h.y, 0.004 * h.y));
      }
      albedo = mix(albedo, vec3f(0.5), sc);
    }
  } else if (mat == LABEL) {
    // Printed paper labels: q runs -1 to 1 along and across the label.
    let q = select(m.xy, vec2f(m.x, m.z), it.scl.y < it.scl.z);
    albedo = vec3f(0.92, 0.9, 0.84) * (0.95 + 0.05 * noise(vec3f(q * 90.0, seed)));
    spec = 0.025; shine = 12.0;
    let ink = vec3f(0.55, 0.55, 0.56);
    let band = labelCol(seed);
    if (style == 0) {
      // The sticker on a VHS tape's back: a coloured band along the top,
      // ruled lines to write on, a box in the corner.
      albedo = mix(albedo, band, step(0.62, q.y) * step(q.y, 0.92));
      albedo = mix(albedo, band * 0.6, step(0.55, q.y) * step(q.y, 0.58));
      for (var j = 0; j < 3; j++) {
        let y = 0.28 - f32(j) * 0.34;
        albedo = mix(albedo, ink, rect(q, vec2f(-0.08, y), vec2f(0.82, 0.012), 0.006));
      }
      albedo = mix(albedo, ink, rect(q, vec2f(0.8, -0.72), vec2f(0.1, 0.13), 0.01) - rect(q, vec2f(0.8, -0.72), vec2f(0.085, 0.1), 0.01));
    } else if (style == 1) {
      // The spine: a block of colour at one end, a line to write the title on.
      albedo = mix(albedo, band, step(q.x, -0.78));
      albedo = mix(albedo, ink, rect(q, vec2f(0.1, -0.35), vec2f(0.82, 0.05), 0.02));
    } else {
      // A cassette's label: its ground colour, lines to write on, a band of
      // colour across the bottom and the side's letter in a box.
      let k = i32(fract(seed * 2.9) * 4.0);
      var grounds = array<vec3f, 4>(vec3f(0.92, 0.9, 0.84), vec3f(0.95, 0.85, 0.35), vec3f(0.05), vec3f(0.85, 0.88, 0.92));
      albedo = grounds[k] * (0.95 + 0.05 * noise(vec3f(q * 90.0, seed)));
      let line = select(ink, vec3f(0.6), k == 2);
      albedo = mix(albedo, line, rect(q, vec2f(0.05, 0.78), vec2f(0.8, 0.018), 0.008));
      albedo = mix(albedo, line, rect(q, vec2f(0.05, 0.52), vec2f(0.8, 0.018), 0.008));
      albedo = mix(albedo, band, step(-0.85, q.y) * step(q.y, -0.55));
      albedo = mix(albedo, band * 0.55, step(-0.5, q.y) * step(q.y, -0.44));
      albedo = mix(albedo, line, rect(q, vec2f(-0.9, 0.65), vec2f(0.06, 0.15), 0.01));
    }
  } else if (mat == WINDOW) {
    // Clear plastic over the tape inside. p runs -1 to 1 up the window and
    // as far across as it is long.
    let a = it.scl.x / it.scl.y;
    let p = m.xy * vec2f(a, 1.0);
    var c = vec3f(0.035, 0.033, 0.03);
    let hx = select(0.55, 0.62, style == 1) * a;
    for (var j = -1; j <= 1; j += 2) {
      let q = p - vec2f(f32(j) * hx, 0.0);
      let r = length(q);
      let wound = mix(0.9, 2.2, fract(seed * 4.3 + f32(j) * 0.31)) * select(0.75, 1.0, style == 1);
      // The tape wound on the reel: dark brown, a sheen in rings.
      let tape = 1.0 - smoothstep(wound - 0.03, wound + 0.03, r);
      c = mix(c, vec3f(0.06, 0.04, 0.028) * (0.85 + 0.25 * sin(r * 70.0)), tape);
      // The hub: white, with teeth round its hole.
      let teeth = step(0.5, fract(atan2(q.y, q.x) * 6.0 / 6.2831853 + 0.25));
      let hub = (1.0 - smoothstep(0.42, 0.46, r)) * (1.0 - (1.0 - smoothstep(0.2, 0.23, r)) * teeth);
      c = mix(c, vec3f(0.85, 0.84, 0.8), hub);
    }
    if (style == 1) {
      // On a cassette only the hubs and the middle show through, rimmed
      // dark; the rest is the label round them (its ground, as in LABEL).
      let k = i32(fract(seed * 2.9) * 4.0);
      var grounds = array<vec3f, 4>(vec3f(0.92, 0.9, 0.84), vec3f(0.95, 0.85, 0.35), vec3f(0.05), vec3f(0.85, 0.88, 0.92));
      let hole = max(disc(abs(p), vec2f(hx, 0.0), 0.62, 0.03), rect(p, vec2f(0.0), vec2f(1.25, 0.7), 0.03));
      let rim = max(disc(abs(p), vec2f(hx, 0.0), 0.7, 0.03), rect(p, vec2f(0.0), vec2f(1.33, 0.78), 0.03));
      c = mix(mix(grounds[k], vec3f(0.04), rim), c, hole);
      albedo = c;
    } else {
      // The moulded frame round the edge.
      let fr = rect(p, vec2f(0.0), vec2f(a - 0.12, 0.88), 0.02);
      albedo = mix(vec3f(0.06), c, fr);
    }
    spec = 0.05; shine = 800.0;
  }

  // Light: a key from behind you, the static all round lighting them from
  // the walls (flickering), and what the finish reflects.
  let flick = u.a.w;
  let rough = clamp(sqrt(2.0 / (shine + 2.0)), 0.03, 1.0);
  let key = normalize(vec3f(0.35, 0.6, -0.72));
  let nv = max(dot(n, v), 0.0);
  let F = spec + (1.0 - spec) * pow(1.0 - nv, 5.0) * (1.0 - rough);
  let wall = (0.1 + 0.5 * max(dot(n, out), 0.0) + 0.15 * (1.0 - abs(n.z))) * flick;
  var col = albedo * (max(dot(n, key), 0.0) * 1.05 + wall + 0.03) * select(1.0 - F, 0.15, metal) * cav;

  let h = normalize(key + v);
  let r = reflect(-v, n);
  let tint = select(vec3f(1.0), albedo, metal);
  if (dot(groove, groove) > 0.0) {
    // Grooves shine in a streak across the record, along the way they run.
    let th = dot(groove, h);
    col += vec3f(1.0) * pow(sqrt(max(1.0 - th * th, 0.0)), 90.0) * 0.6;
    col += env(r, 0.4, t, flick) * 0.08;
  } else {
    let sp = (shine + 8.0) / 25.0 * pow(max(dot(n, h), 0.0), shine);
    col += tint * sp * F * max(dot(n, key), 0.0) * cav;
    col += tint * env(r, rough, t, flick) * F * cav;
  }
  col += emit;

  // Edges: a glow from the test card behind.
  let edge = pow(1.0 - nv, 3.0);
  let back = pow(max(dot(n, u.card.xyz), 0.0), 2.0) * edge;
  col += vec3f(0.85, 0.9, 1.0) * back * u.card.w * 0.6;

  let fade = 1.0 - smoothstep(u.a.y, u.a.z, in.w.z);
  return vec4f(col * fade, 1.0);
}
