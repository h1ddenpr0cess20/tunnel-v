#version 300 es
// The junk in the tunnel, for WebGL 2 (see things.wgsl).
precision highp float;

struct Inst {
  vec4 pos;
  vec4 q;
  vec4 scl;
  vec4 rad;
};
layout(std140) uniform U {
  mat4 vp;
  vec4 a;
  vec4 card;
} u;
layout(std140) uniform D { Inst inst[256]; } di;

in vec3 vN;
in vec3 vW;
in vec3 vL;
in vec3 vM;
in float vCav;
flat in int vI;
out vec4 outColor;

const int WOOD = 0;
const int PLASTIC = 1;
const int SCREEN = 2;
const int METAL = 3;
const int VINYL = 4;
const int VHS = 5;
const int BAKELITE = 6;
const int FABRIC = 7;
const int DIAL = 8;
const int CASSETTE = 9;
const int LABEL = 10;
const int WINDOW = 11;

vec3 qrot(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
float hash(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), w.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}
float fbm(vec3 p) {
  return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + 3.1) + 0.125 * noise(p * 4.07 + 7.7);
}
float rect(vec2 p, vec2 c, vec2 h, float e) {
  vec2 d = abs(p - c) - h;
  return 1.0 - smoothstep(-e, e, max(d.x, d.y));
}
float disc(vec2 p, vec2 c, float r, float e) {
  return 1.0 - smoothstep(r - e, r + e, length(p - c));
}

vec3 labelCol(float s) {
  int k = int(fract(s * 7.31) * 6.0);
  vec3 c[6] = vec3[6](vec3(0.75, 0.12, 0.08), vec3(0.92, 0.85, 0.65), vec3(0.12, 0.25, 0.6),
                      vec3(0.95, 0.7, 0.12), vec3(0.2, 0.5, 0.3), vec3(0.85, 0.85, 0.82));
  return c[k];
}
vec3 phoneCol(float s) {
  int k = int(fract(s * 3.77) * 5.0);
  vec3 c[5] = vec3[5](vec3(0.025, 0.025, 0.028), vec3(0.6, 0.06, 0.05), vec3(0.85, 0.8, 0.66),
                      vec3(0.45, 0.68, 0.55), vec3(0.78, 0.55, 0.12));
  return c[k];
}

vec3 picture(vec2 p, float seed, float t) {
  if (fract(seed * 7.7) < 0.22) {
    float x = (p.x + 1.0) * 0.5;
    float y = (1.0 - p.y) * 0.5;
    vec3 bars[7] = vec3[7](vec3(0.75), vec3(0.75, 0.75, 0.0), vec3(0.0, 0.75, 0.75), vec3(0.0, 0.75, 0.0),
                           vec3(0.75, 0.0, 0.75), vec3(0.75, 0.0, 0.0), vec3(0.0, 0.0, 0.75));
    vec3 c = bars[clamp(int(x * 7.0), 0, 6)];
    if (y > 0.67) c = fract(x * 4.0) < 0.25 ? vec3(0.9) : vec3(0.03);
    float roll = fract(y - t * 0.15);
    c *= 0.85 + 0.15 * smoothstep(0.0, 0.05, roll);
    return c + 0.06 * hash(vec3(floor(p * vec2(110.0, 80.0)), floor(t * 30.0)));
  }
  vec2 px = floor(vec2(p.x * 96.0, p.y * 72.0));
  float v = hash(vec3(px, floor(t * 30.0) + seed * 97.0));
  float lines = 0.8 + 0.2 * sin(p.y * 72.0 * 3.14159);
  float bar = 1.0 + 0.4 * smoothstep(0.85, 1.0, sin(p.y * 2.0 - t * 2.3 + seed * 6.0));
  return vec3(v * v * 1.1 * lines * bar);
}

vec3 env(vec3 r, float rough, float t, float flick) {
  float side = 1.0 - abs(r.z);
  vec3 e = vec3(0.025 + 0.3 * side * side * flick);
  vec3 q = r * 60.0;
  vec3 f = fract(q) - 0.5;
  float h = hash(floor(q) + floor(t * 24.0) * 0.173);
  float speck = (1.0 - smoothstep(0.08, 0.22, length(f))) * step(0.8, h) * side;
  e += vec3(speck * 1.6 * (1.0 - smoothstep(0.03, 0.15, rough)));
  float c = max(dot(r, u.card.xyz), 0.0);
  e += vec3(0.7, 0.85, 1.0) * pow(c, mix(900.0, 12.0, rough)) * mix(6.0, 0.25, rough) * u.card.w;
  return e;
}

void main() {
  Inst it = di.inst[vI];
  int mat = int(it.pos.w + 0.5);
  int style = int(it.rad.z + 0.5);
  float seed = it.scl.w;
  float t = u.a.x;
  vec3 n = normalize(vN);
  vec3 v = normalize(-vW);
  if (dot(n, v) < 0.0 && (mat == SCREEN || mat == FABRIC)) n = -n;
  vec3 out_ = normalize(vec3(it.rad.xy, 0.0001));
  vec3 l = vL;
  vec3 m = vM;

  vec3 albedo = vec3(0.5);
  float spec = 0.04;
  float shine = 16.0;
  bool metal = false;
  vec3 emit = vec3(0.0);
  float cav = vCav;
  vec3 groove = vec3(0.0);

  if (mat == WOOD) {
    float wob = 0.6 * fbm(l * vec3(3.0, 14.0, 14.0) + seed * 9.0);
    float ring = fract((l.y + l.z * 0.4) * 55.0 + wob * 3.0);
    float grain = smoothstep(0.0, 0.5, ring) * smoothstep(1.0, 0.6, ring);
    albedo = mix(vec3(0.1, 0.045, 0.02), vec3(0.34, 0.17, 0.08), 0.3 + 0.55 * grain * (0.6 + 0.4 * noise(l * 30.0)));
    spec = 0.05; shine = 260.0;
  } else if (mat == PLASTIC) {
    albedo = vec3(0.025);
    spec = 0.05; shine = 120.0;
  } else if (mat == SCREEN) {
    float edge = 1.0 - smoothstep(0.75, 1.02, max(abs(m.x), abs(m.y)));
    emit = picture(m.xy, seed, t) * (0.25 + 0.75 * edge) * 1.3;
    albedo = vec3(0.015);
    spec = 0.045; shine = 900.0;
  } else if (mat == METAL) {
    albedo = vec3(0.85);
    spec = 0.9; shine = 300.0; metal = true;
  } else if (mat == VINYL) {
    float r = length(m.xy);
    albedo = vec3(0.015);
    spec = 0.05; shine = 200.0;
    if (abs(m.z) > 0.9) {
      if (r < 0.34) {
        albedo = labelCol(seed) * (0.9 + 0.1 * noise(vec3(m.xy * 40.0, seed)));
        float print = (1.0 - smoothstep(0.0, 0.012, abs(r - 0.25))) * step(0.5, fract(atan(m.y, m.x) * 6.0));
        albedo *= 1.0 - 0.6 * print;
        albedo = mix(albedo, vec3(0.95, 0.92, 0.85), rect(m.xy, vec2(0.0, 0.12), vec2(0.17, 0.018), 0.004) * 0.8);
        spec = 0.03; shine = 20.0;
        if (r < 0.035) albedo = vec3(0.0);
      } else if (r < 0.97) {
        float gap = 1.0 - smoothstep(0.0, 0.008, abs(fract(r * 6.0 + seed) - 0.5) - 0.48);
        albedo = vec3(0.015 + 0.02 * gap);
        groove = qrot(it.q, normalize(vec3(-m.y, m.x, 0.0)));
      }
    }
  } else if (mat == VHS) {
    albedo = vec3(0.028) * (0.9 + 0.2 * noise(l * 600.0));
    spec = 0.045; shine = 45.0;
    if (m.z > 0.97) {
      float recess = rect(l.xy, vec2(0.0), vec2(0.172, 0.079), 0.0015) - rect(l.xy, vec2(0.0), vec2(0.168, 0.075), 0.0015);
      albedo *= 1.0 - 0.6 * recess;
    }
    if (abs(m.z) > 0.97 && abs(l.x) > 0.17) albedo *= 0.75 + 0.5 * step(0.5, fract(l.y * 120.0));
  } else if (mat == BAKELITE) {
    albedo = phoneCol(seed);
    spec = 0.05; shine = 220.0;
  } else if (mat == FABRIC) {
    float wv = sin(l.x * 900.0) * sin(l.y * 900.0);
    albedo = mix(vec3(0.06, 0.04, 0.025), vec3(0.28, 0.2, 0.09), 0.5 + 0.5 * wv);
    spec = 0.02; shine = 6.0;
  } else if (mat == DIAL) {
    float r = length(m.xy);
    albedo = phoneCol(seed);
    spec = 0.05; shine = 220.0;
    if (abs(m.z) > 0.9 && r < 0.9) {
      albedo = vec3(0.86, 0.85, 0.82);
      float a = atan(m.y, m.x);
      float k = floor(fract((a + 1.2) / 6.2831853) * 12.0 + 0.5);
      float ka = k * 0.5236 - 1.2;
      float hd = length(m.xy - 0.62 * vec2(cos(ka), sin(ka)));
      if (k <= 9.0) {
        albedo *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.035, abs(hd - 0.16)));
        albedo *= 1.0 - 0.8 * (1.0 - smoothstep(0.035, 0.05, hd));
      }
      albedo *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.03, abs(r - 0.86)));
      if (r < 0.3) {
        albedo = vec3(0.93, 0.92, 0.88) * (1.0 - 0.75 * rect(m.xy, vec2(0.0), vec2(0.17, 0.025), 0.01));
      }
      float stop = rect(vec2(dot(m.xy, vec2(0.64, -0.77)), dot(m.xy, vec2(0.77, 0.64))), vec2(0.9, 0.0), vec2(0.1, 0.035), 0.01);
      albedo = mix(albedo, vec3(0.8), stop);
      spec = 0.05; shine = 400.0;
    }
  } else if (mat == CASSETTE) {
    int k = int(fract(seed * 5.1) * 3.0);
    vec3 shells[3] = vec3[3](vec3(0.06, 0.05, 0.045), vec3(0.02), vec3(0.82, 0.82, 0.8));
    albedo = shells[k];
    spec = 0.05; shine = 160.0;
    if (abs(m.z) > 0.97) {
      vec2 h = it.scl.xy;
      float sc = 0.0;
      for (int j = 0; j < 5; j++) {
        vec2 c = vec2((j & 1) == 1 ? 0.9 : -0.9, j >= 2 ? 0.86 : -0.82) * h;
        if (j == 4) c = vec2(0.0, -0.55) * h;
        sc = max(sc, disc(l.xy, c, 0.045 * h.y, 0.004 * h.y));
      }
      albedo = mix(albedo, vec3(0.5), sc);
    }
  } else if (mat == LABEL) {
    vec2 q = it.scl.y < it.scl.z ? vec2(m.x, m.z) : m.xy;
    albedo = vec3(0.92, 0.9, 0.84) * (0.95 + 0.05 * noise(vec3(q * 90.0, seed)));
    spec = 0.025; shine = 12.0;
    vec3 ink = vec3(0.55, 0.55, 0.56);
    vec3 band = labelCol(seed);
    if (style == 0) {
      albedo = mix(albedo, band, step(0.62, q.y) * step(q.y, 0.92));
      albedo = mix(albedo, band * 0.6, step(0.55, q.y) * step(q.y, 0.58));
      for (int j = 0; j < 3; j++) {
        float y = 0.28 - float(j) * 0.34;
        albedo = mix(albedo, ink, rect(q, vec2(-0.08, y), vec2(0.82, 0.012), 0.006));
      }
      albedo = mix(albedo, ink, rect(q, vec2(0.8, -0.72), vec2(0.1, 0.13), 0.01) - rect(q, vec2(0.8, -0.72), vec2(0.085, 0.1), 0.01));
    } else if (style == 1) {
      albedo = mix(albedo, band, step(q.x, -0.78));
      albedo = mix(albedo, ink, rect(q, vec2(0.1, -0.35), vec2(0.82, 0.05), 0.02));
    } else {
      int k = int(fract(seed * 2.9) * 4.0);
      vec3 grounds[4] = vec3[4](vec3(0.92, 0.9, 0.84), vec3(0.95, 0.85, 0.35), vec3(0.05), vec3(0.85, 0.88, 0.92));
      albedo = grounds[k] * (0.95 + 0.05 * noise(vec3(q * 90.0, seed)));
      vec3 line = k == 2 ? vec3(0.6) : ink;
      albedo = mix(albedo, line, rect(q, vec2(0.05, 0.78), vec2(0.8, 0.018), 0.008));
      albedo = mix(albedo, line, rect(q, vec2(0.05, 0.52), vec2(0.8, 0.018), 0.008));
      albedo = mix(albedo, band, step(-0.85, q.y) * step(q.y, -0.55));
      albedo = mix(albedo, band * 0.55, step(-0.5, q.y) * step(q.y, -0.44));
      albedo = mix(albedo, line, rect(q, vec2(-0.9, 0.65), vec2(0.06, 0.15), 0.01));
    }
  } else if (mat == WINDOW) {
    float a = it.scl.x / it.scl.y;
    vec2 p = m.xy * vec2(a, 1.0);
    vec3 c = vec3(0.035, 0.033, 0.03);
    float hx = (style == 1 ? 0.62 : 0.55) * a;
    for (int j = -1; j <= 1; j += 2) {
      vec2 q = p - vec2(float(j) * hx, 0.0);
      float r = length(q);
      float wound = mix(0.9, 2.2, fract(seed * 4.3 + float(j) * 0.31)) * (style == 1 ? 1.0 : 0.75);
      float tape = 1.0 - smoothstep(wound - 0.03, wound + 0.03, r);
      c = mix(c, vec3(0.06, 0.04, 0.028) * (0.85 + 0.25 * sin(r * 70.0)), tape);
      float teeth = step(0.5, fract(atan(q.y, q.x) * 6.0 / 6.2831853 + 0.25));
      float hub = (1.0 - smoothstep(0.42, 0.46, r)) * (1.0 - (1.0 - smoothstep(0.2, 0.23, r)) * teeth);
      c = mix(c, vec3(0.85, 0.84, 0.8), hub);
    }
    if (style == 1) {
      int k = int(fract(seed * 2.9) * 4.0);
      vec3 grounds[4] = vec3[4](vec3(0.92, 0.9, 0.84), vec3(0.95, 0.85, 0.35), vec3(0.05), vec3(0.85, 0.88, 0.92));
      float hole = max(disc(abs(p), vec2(hx, 0.0), 0.62, 0.03), rect(p, vec2(0.0), vec2(1.25, 0.7), 0.03));
      float rim = max(disc(abs(p), vec2(hx, 0.0), 0.7, 0.03), rect(p, vec2(0.0), vec2(1.33, 0.78), 0.03));
      c = mix(mix(grounds[k], vec3(0.04), rim), c, hole);
      albedo = c;
    } else {
      float fr = rect(p, vec2(0.0), vec2(a - 0.12, 0.88), 0.02);
      albedo = mix(vec3(0.06), c, fr);
    }
    spec = 0.05; shine = 800.0;
  }

  float flick = u.a.w;
  float rough = clamp(sqrt(2.0 / (shine + 2.0)), 0.03, 1.0);
  vec3 key = normalize(vec3(0.35, 0.6, -0.72));
  float nv = max(dot(n, v), 0.0);
  float F = spec + (1.0 - spec) * pow(1.0 - nv, 5.0) * (1.0 - rough);
  float wall = (0.1 + 0.5 * max(dot(n, out_), 0.0) + 0.15 * (1.0 - abs(n.z))) * flick;
  vec3 col = albedo * (max(dot(n, key), 0.0) * 1.05 + wall + 0.03) * (metal ? 0.15 : 1.0 - F) * cav;

  vec3 h = normalize(key + v);
  vec3 r = reflect(-v, n);
  vec3 tint = metal ? albedo : vec3(1.0);
  if (dot(groove, groove) > 0.0) {
    float th = dot(groove, h);
    col += vec3(1.0) * pow(sqrt(max(1.0 - th * th, 0.0)), 90.0) * 0.6;
    col += env(r, 0.4, t, flick) * 0.08;
  } else {
    float sp = (shine + 8.0) / 25.0 * pow(max(dot(n, h), 0.0), shine);
    col += tint * sp * F * max(dot(n, key), 0.0) * cav;
    col += tint * env(r, rough, t, flick) * F * cav;
  }
  col += emit;

  float edge = pow(1.0 - nv, 3.0);
  float back = pow(max(dot(n, u.card.xyz), 0.0), 2.0) * edge;
  col += vec3(0.85, 0.9, 1.0) * back * u.card.w * 0.6;

  float fade = 1.0 - smoothstep(u.a.y, u.a.z, vW.z);
  outColor = vec4(col * fade, 1.0);
}
