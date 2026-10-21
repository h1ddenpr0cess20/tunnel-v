#version 300 es
// The junk in the tunnel, for WebGL 2 (see things.wgsl).
precision highp float;

struct Inst {
  vec4 pos;     // xyz, finish (see MAT in game.js)
  vec4 q;       // turn
  vec4 scl;     // size xyz, seed
  vec4 rad;     // xy: out from the tunnel's middle; z: which design (labels, windows)
};
layout(std140) uniform U {
  mat4 vp;
  vec4 a;       // time, fade-in start, fade-in end, how bright the static is
  vec4 card;    // direction to the test card, strength
} u;
layout(std140) uniform D { Inst inst[256]; } di;
uniform int base;   // WebGL 2 has no first instance, so each mesh's range starts here

layout(location = 0) in vec3 p;
layout(location = 1) in vec3 n;
layout(location = 2) in float cav;

out vec3 vN;
out vec3 vW;
out vec3 vL;
out vec3 vM;
out float vCav;
flat out int vI;

vec3 qrot(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

void main() {
  int i = base + gl_InstanceID;
  Inst it = di.inst[i];
  vec3 w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  gl_Position = u.vp * vec4(w, 1.0);
  gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;
  vN = qrot(it.q, n / it.scl.xyz);
  vW = w;
  vL = p * it.scl.xyz;
  vM = p;
  vCav = cav;
  vI = i;
}
