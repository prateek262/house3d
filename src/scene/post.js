import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Post-processing chain. tier: { post, msaa, ao, bloom }. When post is off, renders directly (fastest path). */
export class Post {
  constructor(renderer, scene) { this.renderer = renderer; this.scene = scene; this.composer = null; this.camera = null; this.tier = null; }

  setTier(tier, camera) {
    this.dispose(); this.tier = tier; this.camera = camera;
    if (!tier.post) return;
    const r = this.renderer; const size = r.getSize(new THREE.Vector2());
    const c = new EffectComposer(r); c.renderTarget1.samples = tier.msaa; c.renderTarget2.samples = tier.msaa;
    c.setPixelRatio(r.getPixelRatio()); c.setSize(size.x, size.y);
    this.renderPass = new RenderPass(this.scene, camera); c.addPass(this.renderPass);
    if (tier.ao) {
      const ao = new GTAOPass(this.scene, camera, size.x, size.y);
      const scene = this.scene;
      // exclude glass / transparent surfaces and the sky from the AO normal+depth pre-pass
      ao.overrideVisibility = function () {
        const cache = this._visibilityCache;
        scene.traverse((o) => { cache.set(o, o.visible); if (o.isPoints || o.isLine || o.userData.noAO || (o.material && o.material.transparent)) o.visible = false; });
      };
      ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      ao.blendIntensity = 0.9; this.ao = ao; c.addPass(ao);
    }
    if (tier.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.18, 0.5, 0.95); c.addPass(this.bloom); }
    c.addPass(new OutputPass());
    this.composer = c;
  }

  setCamera(camera) {
    this.camera = camera;
    if (!this.composer) return;
    this.renderPass.camera = camera;
    if (this.ao) { this.ao.camera = camera; this.ao.enabled = camera.isPerspectiveCamera; }
  }

  setSize(w, h) { if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); } }

  render(dt) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (!this.composer) return;
    for (const p of this.composer.passes) if (p.dispose) p.dispose();
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    this.composer = null; this.ao = null; this.bloom = null;
  }
}
