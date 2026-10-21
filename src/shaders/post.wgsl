// The picture, as if on an old set: tone mapping, a little colour fringing
// towards the edges, scanlines, grain, a vignette, tracking trouble when
// something goes by close, a burst of snow when you crash, and the set
// switching off: the picture squashed into a bright line, then a dot, then
// gone. And a touch of dither so the dark doesn't band.

struct U {
  a: vec4f,   // exposure, vignette, flash, fade
  b: vec4f,   // resolution.xy, time, switched off (0 on, 1 off)
  c: vec4f,   // tracking trouble, device pixel ratio, unused, unused
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var hdr: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn rnd(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}
fn tap(px: vec2f) -> vec3f {
  let res = vec2i(u.b.xy) - 1;
  return textureLoad(hdr, clamp(vec2i(px), vec2i(0), res), 0).rgb;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let res = u.b.xy;
  let t = u.b.z;
  var uv = fc.xy / res;

  // Switching off: squash to a line, then to a dot.
  let off = u.b.w;
  let sy = mix(1.0, 0.003, smoothstep(0.0, 0.55, off));
  let sx = mix(1.0, 0.004, smoothstep(0.55, 0.95, off));
  uv = 0.5 + (uv - 0.5) / vec2f(sx, sy);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec4f(0.0, 0.0, 0.0, 1.0); }

  // Tracking trouble: bands of the picture slip sideways.
  let band = floor(uv.y * 34.0);
  let slip = rnd(vec2f(band, floor(t * 18.0)));
  var shift = u.c.x * select(0.0, (slip - 0.5) * 0.08, slip > 0.62);
  shift += u.c.x * 0.006 * sin(uv.y * 300.0 + t * 40.0);
  let px = (uv + vec2f(shift, 0.0)) * res;

  // Fringes: red and blue pulled apart, more towards the edges.
  let fr = (uv - 0.5) * 0.0025 * res.x * (0.4 + u.c.x * 4.0);
  let c = vec3f(tap(px + fr).r, tap(px).g, tap(px - fr).b);
  var col = vec3f(1.0) - exp(-c * u.a.x);

  // Scanlines, a vignette, grain.
  let line = fc.y / max(u.c.y, 1.0);
  col *= 0.95 + 0.05 * sin(line * 2.094);
  let q = uv - 0.5;
  col *= 1.0 - u.a.y * pow(length(q * vec2f(res.x / res.y, 1.0)) * 1.1, 2.4);
  let g = rnd(fc.xy * 0.731 + fract(t * 7.13) * 91.0);
  col += (g - 0.5) * 0.018;

  // The crash: a burst of snow, then the picture going.
  let snow = rnd(floor(fc.xy / max(u.c.y * 2.0, 1.0)) + fract(t * 3.7) * 57.0);
  col = mix(col, vec3f(snow), u.a.z * 0.8);
  col = mix(col, vec3f(0.0), u.a.w);
  // The bright line and dot as it switches off.
  col *= 1.0 + 3.0 * smoothstep(0.3, 0.9, off);
  col *= 1.0 - smoothstep(0.92, 1.0, off);

  let n = rnd(fc.xy + t);
  col += (n - 0.5) / 255.0;
  return vec4f(max(col, vec3f(0.0)), 1.0);
}
