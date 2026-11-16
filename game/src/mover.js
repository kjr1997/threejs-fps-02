// Shared movement: a capsule approximated by an axis-aligned box, resolved one axis
// at a time against the world's colliders, so a wall never swallows a body. Player and
// bots both step through here; neither allocates in the hot loop.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createMover(colliders, height) {
  const probe = new THREE.Box3();

  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + h - lift, z + RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // Moves body.position by velocity*dt with gravity; returns whether it stands on ground.
  // height is the body's current height (crouching shrinks it).
  function step(body, dt, height, gravity = 20) {
    body.velocity.y -= gravity * dt;
    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;
    body.position.y += body.velocity.y * dt;
    let onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      onGround = true;
    }
    return onGround;
  }

  return {
    step,
    overlaps,
    clearAt(x, y, z, h) {
      return !overlaps(x, y, z, h, 0.02);
    },
    body(x, y, z) {
      return {
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(),
        yaw: 0,
        pitch: 0,
      };
    },
  };
}
