// The test card, at the end of the tunnel: the signal you're flying
// towards. A little screen of colour bars glowing in the dark, with a
// circle and a cross over them, rolling and snowing now and then like a
// station not quite tuned in, with a cold glow round it.

struct U {
  a: vec4f,   // centre (NDC xy), half its height (NDC y units), aspect w/h
  b: vec4f,   // time, glow, pixels per half height, how well tuned in (0 to 1)
};
@group(0) @binding(0) var<uniform> u: U;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VO;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.ndc = p[i];
  return o;
}

fn hash(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}

fn bars(p: vec2f) -> vec3f {
  // p: -1.333 to 1.333 across, -1 to 1 up.
  let x = (p.x / 1.3333 + 1.0) * 0.5;
  let y = (1.0 - p.y) * 0.5;
  var top = array<vec3f, 7>(vec3f(0.75), vec3f(0.75, 0.75, 0.0), vec3f(0.0, 0.75, 0.75), vec3f(0.0, 0.75, 0.0),
                            vec3f(0.75, 0.0, 0.75), vec3f(0.75, 0.0, 0.0), vec3f(0.0, 0.0, 0.75));
  var mid = array<vec3f, 7>(vec3f(0.0, 0.0, 0.75), vec3f(0.04), vec3f(0.75, 0.0, 0.75), vec3f(0.04),
                            vec3f(0.0, 0.75, 0.75), vec3f(0.04), vec3f(0.75));
  let k = clamp(i32(x * 7.0), 0, 6);
  var c = top[k];
  if (y > 0.67) { c = mid[k]; }
  if (y > 0.75) {
    let j = i32(x * 6.0);
    c = vec3f(0.03);
    if (j == 0) { c = vec3f(0.0, 0.13, 0.3); }
    if (j == 1) { c = vec3f(1.0); }
    if (j == 2) { c = vec3f(0.2, 0.0, 0.42); }
    if (j == 5) { c = vec3f(0.08); }
  }
  // A circle and a cross over the middle.
  let r = length(p);
  let ring = 1.0 - smoothstep(0.012, 0.03, abs(r - 0.62));
  let crosshair = (1.0 - smoothstep(0.008, 0.02, min(abs(p.x), abs(p.y)))) * step(r, 0.62);
  return mix(c, vec3f(0.95), max(ring, crosshair) * 0.85);
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let t = u.b.x;
  let d = (in.ndc - u.a.xy) * vec2f(u.a.w, 1.0) / max(u.a.z, 1e-5);
  var col = vec3f(0.0);
  let aa = 1.5 / max(u.b.z, 1.0);
  // The screen: 4:3, its corners rounded like a tube's.
  let q = abs(d) - vec2f(1.3333, 1.0) + 0.18;
  let box = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - 0.18;
  let inside = 1.0 - smoothstep(-aa, aa, box);
  if (inside > 0.0) {
    // It rolls now and then, and snows, less the better tuned in.
    let tune = u.b.w;
    let roll = select(0.0, fract(t * 0.6) * 2.0, fract(t * 0.07) > 0.93);
    var p = d;
    p.y = (fract((p.y + 1.0) * 0.5 + roll * 0.5) * 2.0) - 1.0;
    p.x += 0.02 * sin(p.y * 40.0 + t * 7.0) * (1.0 - tune);
    let snow = hash(vec3f(floor(d * vec2f(60.0, 45.0)), floor(t * 30.0)));
    var c = bars(p);
    c = mix(c, vec3f(snow), 0.25 + 0.4 * (1.0 - tune));
    c *= 0.88 + 0.12 * sin(d.y * 140.0);
    col = c * 2.2 * inside;
  }
  // The glow round it.
  let g = max(box, 0.0);
  col += vec3f(0.75, 0.85, 1.0) * u.b.y * (0.35 * exp(-g * 5.0) + 0.06 * exp(-g * 0.7)) * (1.0 - inside * 0.5);
  return vec4f(col, 1.0);
}
