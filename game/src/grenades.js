// Grenades: a frag that bursts after its fuse, and a flashbang that blinds anyone
// looking at it. Both are thrown physics objects with a bounce; neither allocates
// while flying (one reused probe box, one reused direction vector).
import * as THREE from 'three';

const GRAVITY = 14;

export function createGrenades(scene, colliders, hooks) {
  const items = [];
  const probe = new THREE.Box3();
  const matFrag = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.4, metalness: 0.6 });
  const matFlash = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.5, metalness: 0.2 });
  const geo = new THREE.SphereGeometry(0.09, 10, 8);

  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (let i = 0; i < colliders.length; i += 1) if (probe.intersectsBox(colliders[i])) return colliders[i];
    return null;
  }

  function throwGrenade(kind, from, dir, team) {
    const mesh = new THREE.Mesh(geo, kind === 'frag' ? matFrag : matFlash);
    mesh.castShadow = true;
    mesh.position.copy(from);
    scene.add(mesh);
    items.push({
      kind, mesh, team,
      position: mesh.position,
      velocity: new THREE.Vector3(dir.x * 15, dir.y * 15 + 3.2, dir.z * 15),
      fuse: kind === 'frag' ? 2.4 : 1.5,
      bounced: false,
    });
  }

  function explode(item) {
    const pos = item.position;
    if (item.kind === 'frag') {
      hooks.explosion(pos);
      hooks.fragDamage(pos, 6.5, 115);
    } else {
      hooks.flashEffect(pos);
    }
    scene.remove(item.mesh);
  }

  function step(dt) {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      item.fuse -= dt;
      item.velocity.y -= GRAVITY * dt;
      const p = item.position;
      const nx = p.x + item.velocity.x * dt;
      if (!overlaps(nx, p.y, p.z)) p.x = nx;
      else { item.velocity.x *= -0.45; item.bounced = true; hooks.bounce(p); }
      const nz = p.z + item.velocity.z * dt;
      if (!overlaps(p.x, p.y, nz)) p.z = nz;
      else { item.velocity.z *= -0.45; item.bounced = true; hooks.bounce(p); }
      p.y += item.velocity.y * dt;
      if (p.y < 0.09) {
        p.y = 0.09;
        item.velocity.y = Math.abs(item.velocity.y) > 1.2 ? -item.velocity.y * 0.45 : 0;
        item.velocity.x *= 0.7;
        item.velocity.z *= 0.7;
        if (!item.bounced) { item.bounced = true; hooks.bounce(p); }
      }
      if (item.fuse <= 0) {
        explode(item);
        items.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const item of items) scene.remove(item.mesh);
    items.length = 0;
  }

  return { throwGrenade, step, clear };
}

export function flashStrength(flashPos, eyePos, viewDir, maxDist = 26) {
  const to = new THREE.Vector3().subVectors(flashPos, eyePos);
  const dist = to.length();
  if (dist > maxDist) return 0;
  to.normalize();
  const facing = Math.max(0, to.dot(viewDir));
  const distFactor = 1 - dist / maxDist;
  return Math.min(1, (0.25 + facing * 0.9) * (0.4 + distFactor * 0.8));
}
