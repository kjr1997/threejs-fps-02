// Weapons: the table owns every number; the Weapon class owns one instance's state
// (magazine, cooldown, reload) and its view model. Damage is applied by main.js after
// the ray hits a body part; this module never touches the scene except for the gun.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    name: 'Kestrel P9', kind: 'pistol', price: 0, auto: false,
    damage: 28, headMult: 4, mag: 12, reserve: 36, gap: 0.16, reload: 1.1,
    spreadStill: 0.004, spreadMove: 0.02, spreadAir: 0.03, kick: 0.011, range: 45, falloff: 0.55,
  },
  smg: {
    name: 'Hornet-9', kind: 'smg', price: 1500, auto: true,
    damage: 22, headMult: 4, mag: 28, reserve: 84, gap: 0.085, reload: 1.7,
    spreadStill: 0.006, spreadMove: 0.026, spreadAir: 0.038, kick: 0.008, range: 38, falloff: 0.5,
  },
  rifle: {
    name: 'Longbow AR', kind: 'rifle', price: 2700, auto: true,
    damage: 30, headMult: 4, mag: 30, reserve: 90, gap: 0.098, reload: 1.9,
    spreadStill: 0.0028, spreadMove: 0.024, spreadAir: 0.036, kick: 0.012, range: 60, falloff: 0.65,
  },
  shotgun: {
    name: 'Mule-12', kind: 'shotgun', price: 1700, auto: false,
    damage: 13, headMult: 3, mag: 6, reserve: 24, gap: 0.85, reload: 2.4,
    spreadStill: 0.03, spreadMove: 0.045, spreadAir: 0.06, kick: 0.035, range: 22, falloff: 0.3,
    pellets: 8,
  },
  dmr: {
    name: 'Needle DMR', kind: 'dmr', price: 4750, auto: false,
    damage: 95, headMult: 4, mag: 5, reserve: 15, gap: 1.05, reload: 2.6,
    spreadStill: 0.0009, spreadMove: 0.03, spreadAir: 0.05, kick: 0.03, range: 90, falloff: 0.85,
    scoped: true,
  },
};

export const GRENADE_DEFS = {
  flash: { name: 'Flashbang', price: 200 },
  frag: { name: 'Frag Grenade', price: 300 },
};

const METAL = new THREE.MeshStandardMaterial({ color: 0x40454d, roughness: 0.45, metalness: 0.55 });
const GRIP = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.85, metalness: 0.05 });
const ACCENT = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

export function createWeapon(camera, defKey) {
  const def = WEAPONS[defKey];
  const model = new THREE.Group();
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  const flashLight = new THREE.PointLight(0xffc46a, 0, 6);
  flashLight.position.set(0.24, -0.14, -0.7);
  camera.add(flashLight);

  function part(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || METAL);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  }
  if (def.kind === 'pistol') {
    part(0.05, 0.09, 0.2, 0, 0, -0.1);
    part(0.045, 0.12, 0.05, 0, -0.09, 0.02, GRIP);
    part(0.02, 0.02, 0.06, 0, 0.055, -0.2, ACCENT);
  } else if (def.kind === 'smg') {
    part(0.07, 0.09, 0.34, 0, 0, -0.08);
    part(0.05, 0.05, 0.3, 0, 0.02, -0.36);
    part(0.05, 0.14, 0.06, 0, -0.1, 0.06, GRIP);
    part(0.04, 0.16, 0.04, 0, -0.08, -0.18, GRIP);
  } else if (def.kind === 'shotgun') {
    part(0.09, 0.1, 0.5, 0, 0, -0.12);
    part(0.07, 0.07, 0.34, 0, -0.02, -0.4);
    part(0.07, 0.09, 0.2, 0, -0.02, 0.2, GRIP);
  } else if (def.kind === 'dmr') {
    part(0.07, 0.1, 0.62, 0, 0, -0.16);
    part(0.05, 0.05, 0.05, 0, 0.07, -0.3, ACCENT);
    part(0.06, 0.06, 0.3, 0, 0.075, -0.14);
    part(0.06, 0.1, 0.18, 0, -0.02, 0.22, GRIP);
  } else {
    part(0.08, 0.1, 0.46, 0, 0, -0.1);
    part(0.045, 0.045, 0.42, 0, 0.025, -0.42);
    part(0.07, 0.08, 0.22, 0, -0.02, 0.26, GRIP);
    part(0.03, 0.03, 0.1, 0, 0.06, -0.18, ACCENT);
  }
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);
  flash.position.set(0.24, -0.16, -0.95);
  flash.visible = false;
  camera.add(flash);

  const state = {
    defKey, mag: def.mag, reserve: def.reserve, cooldown: 0,
    reloadLeft: 0, flash: 0, kick: 0, bloom: 0,
  };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    state.kick += (0 - state.kick) * Math.min(1, dt * 13);
    model.position.z = -0.42 + state.kick;
    model.position.y = -0.2 + state.kick * 0.35;
    model.rotation.x = state.kick * 2.4;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 28;
    flashLight.intensity = state.flash > 0 ? 22 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const phase = (def.reload - state.reloadLeft) / def.reload;
      model.rotation.x = -0.5 * Math.sin(Math.min(1, phase * 1.4) * Math.PI);
      if (state.reloadLeft === 0) {
        const take = Math.min(def.mag - state.mag, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    def, state, model,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      state.bloom = Math.min(0.05, state.bloom + (def.kind === 'shotgun' ? 0.03 : 0.012));
      return true;
    },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = 0.06;
      state.kick = def.kind === 'shotgun' ? 0.11 : def.kind === 'dmr' ? 0.09 : 0.055;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed, airborne, crouched, ads) {
      let s = def.spreadStill + state.bloom;
      s += Math.min(1, speed / 5.2) * def.spreadMove;
      if (airborne) s += def.spreadAir;
      if (crouched) s *= 0.7;
      if (ads) s *= def.scoped ? 0.12 : 0.45;
      return s;
    },
    refillAmmo() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    dispose() {
      camera.remove(model);
      camera.remove(flash);
      camera.remove(flashLight);
    },
  };
}
