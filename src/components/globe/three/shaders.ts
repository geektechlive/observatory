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
