import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { StyleParams } from '../worlds/types';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const compositeFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float time;
uniform vec3 outlineColor;
uniform float outlineWidth;
uniform float outlineStrength;
uniform float outlineSens;
uniform float neonEdges;
uniform float saturation;
uniform float contrast;
uniform float brightness;
uniform vec3 tint;
uniform float halftone;
uniform float halftoneScale;
uniform float paper;
uniform float grain;
uniform float vignette;
uniform float posterize;
uniform float exposure;
uniform float pixelScale;
uniform vec3 flash;       // damage / effect flash colour (additive, premultiplied by amount)
uniform float flashAmt;
uniform float desat;      // extra desaturation (death cam)

float viewZ(float d) {
  // perspective depth -> positive view distance
  return (cameraNear * cameraFar) / ((cameraFar - cameraNear) * d - cameraFar) * -1.0;
}
float invZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return 1.0 / viewZ(d);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

float edgeAt(vec2 uv, vec2 px) {
  float c = invZ(uv);
  float l = invZ(uv - vec2(px.x, 0.0));
  float r = invZ(uv + vec2(px.x, 0.0));
  float u = invZ(uv + vec2(0.0, px.y));
  float d = invZ(uv - vec2(0.0, px.y));
  // Laplacian of 1/z is ~0 on planes; creases and silhouettes light up.
  float lap = abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c);
  float rel = lap / max(c, 1e-6);
  // silhouette: large relative jump in depth
  float jump = max(max(abs(l - c), abs(r - c)), max(abs(u - c), abs(d - c))) / max(c, 1e-6);
  float e = max(smoothstep(0.05 / outlineSens, 0.12 / outlineSens, rel), smoothstep(0.18, 0.32, jump));
  return e;
}

void main() {
  vec2 uv = vUv;
  vec4 src = texture2D(tColor, uv);
  vec3 col = src.rgb * exposure;

  // --- outlines
  float edge = 0.0;
  if (outlineWidth > 0.0) {
    vec2 px = outlineWidth * pixelScale / resolution;
    edge = edgeAt(uv, px);
    // soften far away lines a bit
    float dist = viewZ(texture2D(tDepth, uv).x);
    edge *= mix(1.0, 0.45, smoothstep(40.0, 140.0, dist));
    edge *= outlineStrength;
  }

  // grade in sRGB-ish space
  vec3 s = toSRGB(col);
  float lum = dot(s, vec3(0.299, 0.587, 0.114));
  s = mix(vec3(lum), s, saturation);
  s = (s - 0.5) * contrast + 0.5 + brightness;
  s *= tint;
  if (posterize > 0.0) s = floor(s * posterize + 0.5) / posterize;

  // --- halftone (dots in darker areas)
  if (halftone > 0.0) {
    float sc = halftoneScale * pixelScale;
    vec2 p = gl_FragCoord.xy / sc;
    float ang = 0.785;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 q = rot * p;
    vec2 cell = fract(q) - 0.5;
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    float dark = clamp((0.72 - l) * 1.6, 0.0, 1.0);
    float r = sqrt(dark) * 0.62;
    float dotm = 1.0 - smoothstep(r - 0.08, r + 0.08, length(cell));
    s = mix(s, s * 0.35, dotm * halftone);
    // light areas get a subtle paper tone
    s = mix(s, s * vec3(1.0, 0.98, 0.92), halftone * 0.3);
  }

  // --- paper fibres
  if (paper > 0.0) {
    vec2 p = gl_FragCoord.xy / pixelScale;
    float n = noise(p * 0.9) * 0.5 + noise(p * 0.23) * 0.35 + noise(p * 0.05) * 0.15;
    float fib = noise(vec2(p.x * 0.08, p.y * 1.4)) * noise(vec2(p.x * 1.3, p.y * 0.07));
    s *= mix(1.0, 0.9 + 0.14 * n - 0.08 * fib, paper);
  }

  // --- outline compositing
  vec3 lineCol = outlineColor;
  if (neonEdges > 0.0) {
    vec3 sc = s / max(max(s.r, max(s.g, s.b)), 0.05);
    lineCol = mix(outlineColor, sc * 1.25, neonEdges);
  }
  if (neonEdges > 0.0) s = mix(s, max(s, lineCol), edge);
  else s = mix(s, lineCol, edge);

  // --- grain & vignette
  if (grain > 0.0) {
    float g = hash(gl_FragCoord.xy + fract(time * 13.0) * 100.0) - 0.5;
    s += g * grain * 0.12;
  }
  if (vignette > 0.0) {
    vec2 d = uv - 0.5;
    s *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.1, 1.0)));
  }

  if (desat > 0.0) {
    float l2 = dot(s, vec3(0.299, 0.587, 0.114));
    s = mix(s, vec3(l2) * vec3(1.0, 0.95, 0.9), desat);
  }
  s += flash * flashAmt;

  #ifdef LINEAR_OUT
    // keep HDR headroom for bloom on bright neon lines
    vec3 outc = toLinear(clamp(s, 0.0, 1.0));
    if (neonEdges > 0.0) outc += toLinear(lineCol) * edge * 0.9 * neonEdges;
    gl_FragColor = vec4(outc, 1.0);
  #else
    gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
  #endif
}
`;

const outputFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  // soft shoulder so bloom doesn't clip harshly
  c = c / (1.0 + max(c - 1.0, 0.0) * 0.5);
  gl_FragColor = vec4(toSRGB(c), 1.0);
}
`;

export class Pipeline {
  rtScene: THREE.WebGLRenderTarget;
  rtComp: THREE.WebGLRenderTarget | null = null;
  composite: THREE.ShaderMaterial;
  output: THREE.ShaderMaterial;
  quad: FullScreenQuad;
  bloom: UnrealBloomPass | null = null;
  style!: StyleParams;
  scale = 1;
  width = 1;
  height = 1;
  flashColor = new THREE.Color(0, 0, 0);
  flashAmt = 0;
  desat = 0;
  msaa: number;

  constructor(public renderer: THREE.WebGLRenderer, msaa: number) {
    this.msaa = msaa;
    this.rtScene = this.makeSceneRT(1, 1);
    this.composite = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: compositeFrag,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 0.05 },
        cameraFar: { value: 500 },
        time: { value: 0 },
        outlineColor: { value: new THREE.Color(0) },
        outlineWidth: { value: 1.5 },
        outlineStrength: { value: 1 },
        outlineSens: { value: 1 },
        neonEdges: { value: 0 },
        saturation: { value: 1 },
        contrast: { value: 1 },
        brightness: { value: 0 },
        tint: { value: new THREE.Color(1, 1, 1) },
        halftone: { value: 0 },
        halftoneScale: { value: 5 },
        paper: { value: 0 },
        grain: { value: 0 },
        vignette: { value: 0 },
        posterize: { value: 0 },
        exposure: { value: 1 },
        pixelScale: { value: 1 },
        flash: { value: new THREE.Color(0, 0, 0) },
        flashAmt: { value: 0 },
        desat: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.output = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: outputFrag,
      uniforms: { tColor: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.composite);
  }

  private hdrType(): THREE.TextureDataType {
    const gl = this.renderer.getContext();
    const ok = this.renderer.capabilities.isWebGL2 && (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    return ok ? THREE.HalfFloatType : THREE.UnsignedByteType;
  }

  private makeSceneRT(w: number, h: number) {
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: this.hdrType(),
      depthTexture: depth,
      samples: this.msaa,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    return rt;
  }

  setStyle(style: StyleParams) {
    this.style = style;
    const u = this.composite.uniforms;
    u.outlineColor.value.setHex(style.outlineColor);
    u.outlineWidth.value = style.outlineWidth;
    u.outlineStrength.value = style.outlineStrength;
    u.outlineSens.value = style.outlineSensitivity;
    u.neonEdges.value = style.neonEdges;
    u.saturation.value = style.saturation;
    u.contrast.value = style.contrast;
    u.brightness.value = style.brightness;
    u.tint.value.setHex(style.tint);
    u.halftone.value = style.halftone;
    u.halftoneScale.value = style.halftoneScale;
    u.paper.value = style.paper;
    u.grain.value = style.grain;
    u.vignette.value = style.vignette;
    u.posterize.value = style.posterize;
    u.exposure.value = style.exposure;
    this.configureBloom();
  }

  bloomEnabled = true;
  private configureBloom() {
    const want = !!this.style?.bloom && this.bloomEnabled;
    const defLinear = 'LINEAR_OUT' in (this.composite.defines ?? {});
    if (want) {
      if (!this.bloom) this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 1, 0.4, 0.8);
      const b = this.style.bloom!;
      this.bloom.strength = b.strength;
      this.bloom.radius = b.radius;
      this.bloom.threshold = b.threshold;
      if (!this.rtComp) this.rtComp = new THREE.WebGLRenderTarget(this.width, this.height, { type: this.hdrType() });
      if (!defLinear) {
        this.composite.defines = { LINEAR_OUT: 1 };
        this.composite.needsUpdate = true;
      }
    } else if (defLinear) {
      this.composite.defines = {};
      this.composite.needsUpdate = true;
    }
  }

  setSize(w: number, h: number, pixelRatio: number, scale: number) {
    this.scale = scale;
    const rw = Math.max(1, Math.floor(w * pixelRatio * scale));
    const rh = Math.max(1, Math.floor(h * pixelRatio * scale));
    this.width = rw;
    this.height = rh;
    this.rtScene.setSize(rw, rh);
    this.rtComp?.setSize(rw, rh);
    this.bloom?.setSize(rw, rh);
    this.composite.uniforms.resolution.value.set(rw, rh);
    // Line thickness should scale with physical resolution (roughly 1 at 1080p)
    this.composite.uniforms.pixelScale.value = Math.max(0.6, rh / 1080);
  }

  setMSAA(samples: number) {
    if (samples === this.msaa) return;
    this.msaa = samples;
    this.rtScene.dispose();
    this.rtScene = this.makeSceneRT(this.width, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    const u = this.composite.uniforms;
    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    u.time.value = time;
    u.flash.value.copy(this.flashColor);
    u.flashAmt.value = this.flashAmt;
    u.desat.value = this.desat;

    const useBloom = !!(this.style?.bloom && this.bloomEnabled && this.bloom && this.rtComp);
    this.quad.material = this.composite;
    if (useBloom) {
      r.setRenderTarget(this.rtComp);
      this.quad.render(r);
      this.bloom!.render(r, null as unknown as THREE.WebGLRenderTarget, this.rtComp!, 0, false);
      this.output.uniforms.tColor.value = this.rtComp!.texture;
      this.quad.material = this.output;
      r.setRenderTarget(null);
      this.quad.render(r);
    } else {
      r.setRenderTarget(null);
      this.quad.render(r);
    }
  }
}
