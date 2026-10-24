/**
 * Earth and atmosphere shaders (ROCI v2 spec section 5, #47), ported from the approved
 * prototype (docs/design-history/mockups-v2.html). Three lessons from that prototype:
 *   1. Grade in perceptual space: the sampler returns linear light, so without
 *      pow(rgb, 1/2.2) land falls under the sea thresholds and the Earth goes black.
 *   2. Water gets its own ramp (blue-dominant pixels): dark bronze sea, copper land.
 *   3. No additive twilight band: against the dark sea it reads as an object.
 * The grade applies to the Earth texture only; data markers are never graded.
 * Lighting is in object space, so the sun direction needs no per-frame rotation.
 */

export const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalObj;
  void main() {
    vUv = uv;
    vNormalObj = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const earthFragment = /* glsl */ `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDir;
  uniform vec3 gShadow;
  uniform vec3 gDeep;
  uniform vec3 gMid;
  uniform vec3 gHigh;
  uniform vec3 gNight;
  uniform float gMix;
  uniform float showTerminator;
  varying vec2 vUv;
  varying vec3 vNormalObj;

  void main() {
    vec3 day = texture2D(dayTex, vUv).rgb;
    vec3 dayP = pow(day, vec3(1.0 / 2.2));
    float lum = dot(dayP, vec3(0.2126, 0.7152, 0.0722));
    float water = smoothstep(0.04, 0.16, dayP.b - dayP.r);
    vec3 sea = mix(gShadow, gDeep, smoothstep(0.1, 0.45, lum));
    vec3 land = lum < 0.45
      ? mix(gDeep, gMid, smoothstep(0.15, 0.45, lum))
      : mix(gMid, gHigh, (lum - 0.45) / 0.55);
    vec3 graded = mix(day, mix(land, sea, water), gMix);

    float ndl = dot(normalize(vNormalObj), sunDir);
    float dayAmt = mix(1.0, smoothstep(-0.08, 0.12, ndl), showTerminator);
    float light = mix(1.0, 0.32 + 0.95 * max(ndl, 0.0), showTerminator);
    vec3 lit = graded * light;

    float city = texture2D(nightTex, vUv).r;
    vec3 night = gNight * pow(city, 1.6) * 1.8 + gShadow * 0.6;
    vec3 col = mix(night, lit, dayAmt);

    // HUD graticule every 30 degrees, brighter on the day side
    vec2 g = vec2(vUv.x * 12.0, vUv.y * 6.0);
    vec2 gw = fwidth(g);
    vec2 gl = smoothstep(gw * 1.2, vec2(0.0), abs(fract(g - 0.5) - 0.5));
    col = mix(col, vec3(0.86, 0.84, 0.8), max(gl.x, gl.y) * mix(0.025, 0.05, dayAmt));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * The Earth in the bloom pass (#50): only the night side's city lights, black
 * everywhere else, so copper never glows. It still writes depth, so nothing on the
 * far side of the planet glows through it. Shares the Earth's uniforms.
 */
export const earthBloomFragment = /* glsl */ `
  uniform sampler2D nightTex;
  uniform vec3 sunDir;
  uniform vec3 gNight;
  uniform float showTerminator;
  varying vec2 vUv;
  varying vec3 vNormalObj;

  void main() {
    float ndl = dot(normalize(vNormalObj), sunDir);
    float dayAmt = mix(1.0, smoothstep(-0.08, 0.12, ndl), showTerminator);
    float city = texture2D(nightTex, vUv).r;
    gl_FragColor = vec4(gNight * pow(city, 1.6) * 1.8 * (1.0 - dayAmt), 1.0);
    #include <colorspace_fragment>
  }
`

export const auroraVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * The aurora field (#50). The texel lookup is fieldUv() in src/lib/auroraField.ts,
 * which the unit tests pin; keep the two in step. The shimmer drifts slow bands along
 * the oval; time stands still under reduced motion and while rotation is paused.
 */
export const auroraFragment = /* glsl */ `
  #define PI 3.141592653589793
  uniform sampler2D field;
  uniform vec3 color;
  uniform float time;
  varying vec3 vPos;
  void main() {
    vec3 n = normalize(vPos);
    float lat = degrees(asin(clamp(n.y, -1.0, 1.0)));
    float lon = degrees(atan(-n.z, n.x));
    vec2 uv = vec2((lon + 180.5) / 360.0, (lat + 90.5) / 181.0);
    float a = texture2D(field, uv).r;
    if (a <= 0.0) discard;
    float lonR = radians(lon);
    float shimmer = 0.78 + 0.22 * sin(lonR * 26.0 + time * 0.5 + 2.0 * sin(lonR * 7.0 - time * 0.21));
    gl_FragColor = vec4(color, a * shimmer);
    #include <colorspace_fragment>
  }
`

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vNormalObj;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    vNormalObj = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** Fresnel rim: copper on the day side, a faint telemetry scatter on the night limb. */
export const atmosphereFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 dayCol;
  uniform vec3 nightCol;
  varying vec3 vNormalView;
  varying vec3 vNormalObj;
  void main() {
    float rim = pow(max(0.0, 0.74 - dot(vNormalView, vec3(0.0, 0.0, 1.0))), 4.0);
    float d = smoothstep(-0.25, 0.35, dot(vNormalObj, sunDir));
    vec3 c = mix(nightCol * 0.18, dayCol, d);
    gl_FragColor = vec4(c * rim * 0.9, 1.0);
  }
`
