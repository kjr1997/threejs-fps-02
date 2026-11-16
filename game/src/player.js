// The player: WASD with acceleration and friction, crouch, jump, and a body that
// collides one axis at a time. Health and armour live here; money lives in game.js.
import * as THREE from 'three';
import { createMover } from './mover.js';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const ADS_SPEED = 3.1;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders) {
  const mover = createMover(colliders, STAND_HEIGHT);
  const body = mover.body(0, 0, 15.5);
  const state = {
    ...body,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    helmet: false,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys, ads) {
    if (!state.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching && mover.clearAt(state.position.x, state.position.y, state.position.z, STAND_HEIGHT)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = state.crouching ? CROUCH_SPEED : ads ? ADS_SPEED : WALK_SPEED;
    const blend = Math.min(1, (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    state.velocity.x += (wish.x * speed - state.velocity.x) * blend;
    state.velocity.z += (wish.z * speed - state.velocity.z) * blend;
    if (state.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }
    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.onGround = mover.step(state, dt, state.height);
  }

  // Damage after armour: armour absorbs half of what remains, helmet halves headshots.
  function damage(amount, part) {
    if (!state.alive) return 0;
    let dealt = amount;
    if (part === 'head' && state.helmet) dealt *= 0.5;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, dealt * 0.5);
      state.armor -= absorbed;
      dealt -= absorbed;
    }
    state.health -= dealt;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
    }
    return dealt;
  }

  return {
    state,
    step,
    look,
    recoil,
    damage,
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    reset(x, z) {
      state.position.set(x, 0, z);
      state.velocity.set(0, 0, 0);
      state.yaw = 0;
      state.pitch = 0;
      state.eye = STAND_EYE;
      state.health = 100;
      state.armor = 0;
      state.helmet = false;
      state.alive = true;
      state.crouching = false;
      state.height = STAND_HEIGHT;
    },
  };
}
