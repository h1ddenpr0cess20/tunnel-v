#version 300 es
// The picture, for WebGL 2 (see post.wgsl).
precision highp float;

layout(std140) uniform U {
  vec4 a;   // exposure, vignette, flash, fade
  vec4 b;   // resolution.xy, time, switched off
  vec4 c;   // tracking trouble, device pixel ratio
} u;
uniform sampler2D hdr;
out vec4 outColor;

float rnd(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
vec3 tap(vec2 px) {
  ivec2 res = ivec2(u.b.xy) - 1;
  return texelFetch(hdr, clamp(ivec2(px), ivec2(0), res), 0).rgb;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 res = u.b.xy;
  float t = u.b.z;
  vec2 uv = fc / res;

  float off = u.b.w;
  float sy = mix(1.0, 0.003, smoothstep(0.0, 0.55, off));
  float sx = mix(1.0, 0.004, smoothstep(0.55, 0.95, off));
  uv = 0.5 + (uv - 0.5) / vec2(sx, sy);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // WebGL's y runs up the screen; bands are counted from the top as in WebGPU.
  float band = floor((1.0 - uv.y) * 34.0);
  float slip = rnd(vec2(band, floor(t * 18.0)));
  float shift = u.c.x * (slip > 0.62 ? (slip - 0.5) * 0.08 : 0.0);
  shift += u.c.x * 0.006 * sin((1.0 - uv.y) * 300.0 + t * 40.0);
  vec2 px = (uv + vec2(shift, 0.0)) * res;

  vec2 fr = (uv - 0.5) * 0.0025 * res.x * (0.4 + u.c.x * 4.0);
  vec3 c = vec3(tap(px + fr).r, tap(px).g, tap(px - fr).b);
  vec3 col = vec3(1.0) - exp(-c * u.a.x);

  float line = fc.y / max(u.c.y, 1.0);
  col *= 0.95 + 0.05 * sin(line * 2.094);
  vec2 q = uv - 0.5;
  col *= 1.0 - u.a.y * pow(length(q * vec2(res.x / res.y, 1.0)) * 1.1, 2.4);
  float g = rnd(fc * 0.731 + fract(t * 7.13) * 91.0);
  col += (g - 0.5) * 0.018;

  float snow = rnd(floor(fc / max(u.c.y * 2.0, 1.0)) + fract(t * 3.7) * 57.0);
  col = mix(col, vec3(snow), u.a.z * 0.8);
  col = mix(col, vec3(0.0), u.a.w);
  col *= 1.0 + 3.0 * smoothstep(0.3, 0.9, off);
  col *= 1.0 - smoothstep(0.92, 1.0, off);

  float n = rnd(fc + t);
  col += (n - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
