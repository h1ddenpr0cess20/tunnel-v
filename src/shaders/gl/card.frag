#version 300 es
// The test card, for WebGL 2 (see card.wgsl).
precision highp float;

layout(std140) uniform U {
  vec4 a;   // centre (NDC xy), half its height (NDC y units), aspect w/h
  vec4 b;   // time, glow, pixels per half height, how well tuned in
} u;
in vec2 vNdc;
out vec4 outColor;

float hash(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}

vec3 bars(vec2 p) {
  float x = (p.x / 1.3333 + 1.0) * 0.5;
  float y = (1.0 - p.y) * 0.5;
  vec3 top[7] = vec3[7](vec3(0.75), vec3(0.75, 0.75, 0.0), vec3(0.0, 0.75, 0.75), vec3(0.0, 0.75, 0.0),
                        vec3(0.75, 0.0, 0.75), vec3(0.75, 0.0, 0.0), vec3(0.0, 0.0, 0.75));
  vec3 mid[7] = vec3[7](vec3(0.0, 0.0, 0.75), vec3(0.04), vec3(0.75, 0.0, 0.75), vec3(0.04),
                        vec3(0.0, 0.75, 0.75), vec3(0.04), vec3(0.75));
  int k = clamp(int(x * 7.0), 0, 6);
  vec3 c = top[k];
  if (y > 0.67) c = mid[k];
  if (y > 0.75) {
    int j = int(x * 6.0);
    c = vec3(0.03);
    if (j == 0) c = vec3(0.0, 0.13, 0.3);
    if (j == 1) c = vec3(1.0);
    if (j == 2) c = vec3(0.2, 0.0, 0.42);
    if (j == 5) c = vec3(0.08);
  }
  float r = length(p);
  float ring = 1.0 - smoothstep(0.012, 0.03, abs(r - 0.62));
  float cr = (1.0 - smoothstep(0.008, 0.02, min(abs(p.x), abs(p.y)))) * step(r, 0.62);
  return mix(c, vec3(0.95), max(ring, cr) * 0.85);
}

void main() {
  float t = u.b.x;
  vec2 d = (vNdc - u.a.xy) * vec2(u.a.w, 1.0) / max(u.a.z, 1e-5);
  vec3 col = vec3(0.0);
  float aa = 1.5 / max(u.b.z, 1.0);
  vec2 q = abs(d) - vec2(1.3333, 1.0) + 0.18;
  float box = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 0.18;
  float inside = 1.0 - smoothstep(-aa, aa, box);
  if (inside > 0.0) {
    float tune = u.b.w;
    float roll = fract(t * 0.07) > 0.93 ? fract(t * 0.6) * 2.0 : 0.0;
    vec2 p = d;
    p.y = (fract((p.y + 1.0) * 0.5 + roll * 0.5) * 2.0) - 1.0;
    p.x += 0.02 * sin(p.y * 40.0 + t * 7.0) * (1.0 - tune);
    float snow = hash(vec3(floor(d * vec2(60.0, 45.0)), floor(t * 30.0)));
    vec3 c = bars(p);
    c = mix(c, vec3(snow), 0.25 + 0.4 * (1.0 - tune));
    c *= 0.88 + 0.12 * sin(d.y * 140.0);
    col = c * 2.2 * inside;
  }
  float g = max(box, 0.0);
  col += vec3(0.75, 0.85, 1.0) * u.b.y * (0.35 * exp(-g * 5.0) + 0.06 * exp(-g * 0.7)) * (1.0 - inside * 0.5);
  outColor = vec4(col, 1.0);
}
