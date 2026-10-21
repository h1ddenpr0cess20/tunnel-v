#version 300 es
// The tunnel, for WebGL 2: the same sheets of static and snow as
// particles.wgsl, made up from their index alone and drawn as streaks.
precision highp float;
precision highp int;

layout(std140) uniform U {
  mat4 vp;      // view-projection now
  mat4 pvp;     // and STREAK seconds ago
  vec4 a;       // resolution.xy, time, device pixel ratio
  vec4 b;       // window offset, unused, spin now, spin then
  vec4 c;       // window, near, far, gain
  vec4 d;       // particle count, sheets, dots round each sheet, rows along it
  vec4 e;       // focal length px, longest streak px, share of snow, depth moved in STREAK
  vec4 p[3];    // phases (s * K + K0) mod 2π
  vec4 k[3];    // wave numbers K
} u;

out vec2 vQ;
flat out vec4 vF;

const float TAU = 6.2831853;
const float TWIST = 0.035;
const float OPEN = 0.03;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd(uint v) { return float(pcg(v)) / 4294967296.0; }

float P(uint i) { return u.p[i / 4u][i % 4u]; }
float K(uint i) { return u.k[i / 4u][i % 4u]; }
float ph(uint i, float z) { return P(i) + z * K(i); }

vec2 centre(float z) {
  return vec2(1.8 * sin(ph(0u, z)) + 0.7 * sin(ph(1u, z)) + 0.6 * sin(ph(9u, z)),
              1.2 * sin(ph(2u, z)) + 0.5 * sin(ph(3u, z)) + 0.5 * sin(ph(10u, z)));
}

// How a sheet is folded: see particles.wgsl.
vec3 fold(float th, float z, float t, float s) {
  float f1 = sin(3.0 * th + ph(4u, z) + t * 0.31 + s * 1.7);
  float f2 = sin(5.0 * th - ph(5u, z) - t * 0.23 + s * 2.9);
  float f3 = sin(8.0 * th + ph(6u, z) + t * 0.47 + s * 0.8);
  float g = 0.55 * f1 + 0.3 * f2 + 0.15 * f3;
  float round_ = 0.16 * sin(4.0 * th + ph(7u, z) + t * 0.2 + s * 2.2) + 0.06 * f2;
  float along = 0.5 * sin(3.0 * th - ph(5u, z) * 0.7 + t * 0.17 + s) + 0.2 * f3;
  return vec3(g, round_, along);
}

vec3 place(float th, float z, float r, float s, float spin, float t, bool sheet) {
  float ang = th + spin + TWIST * z;
  float rr = r;
  float zz = z;
  if (sheet) {
    vec3 f = fold(th, z, t, s);
    ang += f.y;
    zz += f.z;
    rr = r * (1.0 + 0.3 * f.x) * (1.0 + OPEN * max(z, 0.0));
  }
  vec2 lean = vec2(sin(t * 0.071 + 1.0), sin(t * 0.053 + 2.0)) * 0.08 * z;
  return vec3(centre(zz) + lean + rr * vec2(cos(ang), sin(ang)), zz);
}

void none() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vQ = vec2(0.0);
  vF = vec4(0.0);
}

void main() {
  uint ii = uint(gl_InstanceID);
  vec2 res = u.a.xy;
  float W = u.c.x;
  float t = u.a.z;
  uint nSheet = uint(u.d.y) * uint(u.d.z) * uint(u.d.w);
  uint frame = uint(t * 24.0);

  float zoff, r, th, size, bright;
  float s = 0.0;
  float spinMul = 1.0;
  bool sheet = true;

  if (ii < nSheet) {
    uint cols = uint(u.d.z);
    uint rows = uint(u.d.w);
    uint per = cols * rows;
    uint sid = ii / per;
    uint k = ii % per;
    uint col = k % cols;
    uint row = k / cols;
    uint hs = sid * 16u + 5000011u;
    uint hp = ii * 4u + 3000017u;
    s = float(sid);
    r = 1.0 + 0.42 * s + 0.08 * s * s;
    float stagger = (row & 1u) == 1u ? 0.5 : 0.0;
    th = (float(col) + stagger + 0.1 * (rnd(hp) - 0.5)) / float(cols) * TAU + rnd(hs) * TAU;
    zoff = (float(row) + 0.1 * (rnd(hp + 1u) - 0.5)) / float(rows) * W + rnd(hs + 1u) * W;
    zoff -= W * floor(zoff / W);
    spinMul = (sid & 1u) == 0u ? 1.0 : -0.7;
    size = (0.0028 + 0.0018 * rnd(hp + 2u)) * (1.0 + 0.25 * s);
    float flick = rnd(hp * 31u + frame * 2654435761u);
    bright = (0.45 + 0.9 * flick * flick) / (1.0 + 0.45 * s);
  } else {
    uint h = ii * 4u + 17u;
    float rate = 3.0 + 4.0 * rnd(h);
    float cyc = t * rate + rnd(h + 1u);
    float life = fract(cyc);
    uint hh = pcg(h + uint(cyc) * 7919u);
    zoff = rnd(hh) * W;
    r = 0.08 + 1.0 * sqrt(rnd(hh + 1u));
    th = rnd(hh + 2u) * TAU;
    size = 0.002 + 0.0025 * rnd(hh + 3u);
    bright = (0.25 + 0.9 * pow(rnd(hh + 4u), 3.0)) * sin(3.14159 * life);
    spinMul = 0.3;
    sheet = false;
  }

  float aa = zoff - u.b.x;
  if (aa < 0.0) aa += W;
  float z = aa - u.c.y;

  vec3 pNow = place(th, z, r, s, u.b.z * spinMul, t, sheet);
  vec3 pThen = place(th, z + u.e.w, r, s, u.b.w * spinMul, t, sheet);
  pThen.z -= u.e.w;

  if (sheet) {
    vec3 f = fold(th, z, t, s);
    bright *= 0.12 + 1.9 * pow(0.5 + 0.5 * f.x, 3.0);
  }
  float bar = sin(ph(11u, pNow.z) + t * 1.4);
  bright *= 1.0 + 1.4 * pow(max(bar, 0.0), 40.0);

  vec4 ca = u.vp * vec4(pNow, 1.0);
  if (ca.w < 0.06) { none(); return; }
  vec4 cb = u.pvp * vec4(pThen, 1.0);
  if (cb.w < 0.06) cb = ca;
  vec2 A = (ca.xy / ca.w * 0.5 + 0.5) * res;
  vec2 B = (cb.xy / cb.w * 0.5 + 0.5) * res;

  float fade = smoothstep(0.2, 2.0, z) * pow(1.0 - smoothstep(u.c.z * 0.3, u.c.z, z), 1.3);
  float rTrue = size * u.e.x / ca.w;
  float minR = 0.75 * u.a.w;
  float rad = clamp(rTrue, minR, 7.0 * u.a.w);
  float I = bright * 1.5 * fade * u.c.w * min(1.0, (rTrue * rTrue) / (rad * rad));
  if (I < 0.003) { none(); return; }

  vec2 d = A - B;
  float len = length(d);
  if (len > u.e.y) { d *= u.e.y / len; len = u.e.y; }
  vec2 dir = len > 0.01 ? d / max(len, 1e-4) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  I *= mix(1.0, (2.0 * rad) / (2.0 * rad + len), 0.8);

  int vi = gl_VertexID;
  vec2 cn = vec2(vi == 1 || vi == 2 || vi == 4 ? 1.0 : -1.0, vi == 2 || vi == 4 || vi == 5 ? 1.0 : -1.0);
  float ext = 3.0 * rad + 1.0;
  float hl = len * 0.5;
  float along = cn.x * (hl + ext);
  float across = cn.y * ext;
  vec2 mid = A - d * 0.5;
  vec2 px = mid + dir * along + perp * across;

  gl_Position = vec4(px / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  vQ = vec2(along, across);
  vF = vec4(hl, rad, I, 0.0);
}
