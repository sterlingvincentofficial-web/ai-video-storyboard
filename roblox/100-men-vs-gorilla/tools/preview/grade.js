// The preview's colour grade, approximating the game's Lighting (default.project.json):
// Bloom -> BloomEffect, the grade pass -> ColorCorrectionEffect (saturation, contrast, a slight
// cool tint), matched against frames of the reference game. Shared by index.html and studio.html.
import * as THREE from 'three';
import { EffectComposer } from './node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from './node_modules/three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './node_modules/three/examples/jsm/postprocessing/OutputPass.js';

export const GRADE = { saturation: 0.86, contrast: 1.06, brightness: 0.02, tint: [1.02, 1.0, 0.97], bloom: [0.3, 0.45, 0.9] };

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1 }, contrast: { value: 1 }, brightness: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform float brightness; uniform vec3 tint; varying vec2 vUv;
    void main() { vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(vec3(l), col, saturation);
      col = (col - 0.18) * contrast + 0.18 + brightness; col *= tint; gl_FragColor = vec4(max(col, 0.0), c.a); }`,
};

export function makeComposer(renderer, scene, camera, W, H) {
  const composer = new EffectComposer(renderer);
  composer.setSize(W, H);
  const rp = new RenderPass(scene, camera); composer.addPass(rp);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), ...GRADE.bloom));
  const g = new ShaderPass(GradeShader);
  g.uniforms.saturation.value = GRADE.saturation; g.uniforms.contrast.value = GRADE.contrast;
  g.uniforms.brightness.value = GRADE.brightness; g.uniforms.tint.value.set(...GRADE.tint);
  composer.addPass(g);
  composer.addPass(new OutputPass());
  return { render: () => composer.render(), setScene: s => { rp.scene = s; } };
}
