// Tracers, impacts and explosions: pooled lines and sprites, so firing never
// allocates. A tracer is a short bright line from muzzle to hit point; an impact is
// a small spark sprite that fades; an explosion is a growing fireball with a light.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 16;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparkMat = new THREE.SpriteMaterial({ color: 0xffc46a, transparent: true, opacity: 0.9, depthWrite: false });
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const sprite = new THREE.Sprite(sparkMat.clone());
    sprite.scale.set(0.22, 0.22, 1);
    sprite.visible = false;
    scene.add(sprite);
    sparks.push({ sprite, life: 0 });
  }
  let sparkIndex = 0;

  const boomMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9 });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff7a1a, 0, 22, 1.5);
  scene.add(boomLight);
  let boomLife = 0;

  function tracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.07;
    t.line.material.opacity = 0.9;
  }

  function spark(point) {
    const s = sparks[sparkIndex];
    sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
    s.sprite.position.copy(point);
    s.sprite.visible = true;
    s.life = 0.18;
    s.sprite.material.opacity = 0.95;
    s.sprite.scale.set(0.22, 0.22, 1);
  }

  function explosion(point) {
    boom.position.copy(point);
    boom.scale.setScalar(0.4);
    boom.visible = true;
    boomLife = 0.7;
    boomLight.position.copy(point);
    boomLight.position.y += 1;
    boomLight.intensity = 120;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.sprite.material.opacity = Math.max(0, s.life / 0.18) * 0.95;
        const sc = 0.22 + (0.18 - Math.max(0, s.life)) * 1.4;
        s.sprite.scale.set(sc, sc, 1);
        if (s.life <= 0) s.sprite.visible = false;
      }
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - Math.max(0, boomLife) / 0.7;
      boom.scale.setScalar(0.4 + k * 5.2);
      boom.material.opacity = Math.max(0, 0.9 * (1 - k));
      boomLight.intensity = Math.max(0, 120 * (1 - k));
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
  }

  return { tracer, spark, explosion, step };
}
