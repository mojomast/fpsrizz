// GLSL ES 3.00 sources. Feature #defines (LIT, MAP, VCOL, FOG, ALPHATEST) are prepended per program variant.
export const MAX_LIGHTS = 16;

export const VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec3 aColor;
uniform mat4 uModel, uV, uP;
uniform vec4 uUvT;
out vec3 vW; out vec3 vN; out vec3 vC; out vec2 vUv; out float vDepth;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vec4 v = uV * w;
  vW = w.xyz;
#ifdef LIT
  vN = transpose(inverse(mat3(uModel))) * aNormal;
#else
  vN = aNormal;
#endif
  vC = aColor;
  vUv = aUv * uUvT.xy + uUvT.zw;
  vDepth = -v.z;
  gl_Position = uP * v;
}`;

export const FRAG = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec3 vC; in vec2 vUv; in float vDepth;
uniform vec3 uColor, uEmissive, uAmbient, uFogColor;
uniform vec2 uFog;
uniform float uOpacity, uAlphaTest;
uniform sampler2D uMap;
uniform int uNL;
uniform vec3 uLP[${MAX_LIGHTS}];
uniform vec3 uLC[${MAX_LIGHTS}];
uniform float uLD[${MAX_LIGHTS}];
out vec4 outColor;
void main() {
  vec4 c = vec4(uColor, uOpacity);
#ifdef MAP
  c *= texture(uMap, vUv);
#endif
#ifdef VCOL
  c.rgb *= vC;
#endif
#ifdef ALPHATEST
  if (c.a < uAlphaTest) discard;
#endif
#ifdef LIT
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 light = uAmbient;
  for (int i = 0; i < uNL; i++) {
    vec3 d = uLP[i] - vW;
    float dist = length(d);
    if (uLD[i] > 0.0 && dist >= uLD[i]) continue; // out of range: skip the rest of the work for this light
    float att = uLD[i] > 0.0 ? clamp(1.0 - dist / uLD[i], 0.0, 1.0) : 1.0;
    att *= att;
    light += uLC[i] * max(dot(n, d / max(dist, 1e-4)), 0.0) * att;
  }
  c.rgb = c.rgb * light + uEmissive;
#endif
#ifdef FOG
  c.rgb = mix(uFogColor, c.rgb, clamp((uFog.y - vDepth) / max(uFog.y - uFog.x, 1e-4), 0.0, 1.0));
#endif
  outColor = c;
}`;

export const UNIFORMS = ['uModel', 'uV', 'uP', 'uUvT', 'uColor', 'uEmissive', 'uAmbient', 'uFogColor', 'uFog',
  'uOpacity', 'uAlphaTest', 'uMap', 'uNL', 'uLP', 'uLC', 'uLD'];
