// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. Player shots are raycasts against bot bodies and the world; bot shots are
// resolved inside bots.js. ?shot=start|play|plant|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades, flashStrength } from './grenades.js';
import { createEffects } from './tracers.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createGame } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

window.addEventListener('error', (event) => {
  window.__shotError = String(event.message || event.error || 'error');
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 24, 68);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const hud = createHud();
const audio = createAudio();
const effects = createEffects(scene);
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 100;

// The player's hitboxes: invisible meshes the bots' raycasts hit. They follow the
// player every frame and never render.
const playerHitMeshes = [];
{
  const mk = (geo, part, y) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.visible = false;
    mesh.userData.isPlayer = true;
    mesh.userData.part = part;
    mesh.position.y = y;
    scene.add(mesh);
    playerHitMeshes.push(mesh);
    return mesh;
  };
  mk(new THREE.SphereGeometry(0.16, 10, 8), 'head', 1.62);
  mk(new THREE.BoxGeometry(0.52, 0.72, 0.3), 'torso', 1.08);
  mk(new THREE.BoxGeometry(0.42, 0.72, 0.26), 'legs', 0.36);
}
function syncPlayerHitboxes() {
  const p = player.state.position;
  for (const mesh of playerHitMeshes) {
    mesh.position.x = p.x;
    mesh.position.z = p.z;
    mesh.position.y = p.y + (mesh.userData.part === 'head' ? 1.62 : mesh.userData.part === 'torso' ? 1.08 : 0.36);
  }
}

const grenades = createGrenades(scene, world.colliders, {
  explosion(pos) {
    effects.explosion(pos);
    audio.explosion();
  },
  fragDamage(pos, radius, maxDmg) {
    damageInRadius(pos, radius, maxDmg, 'frag');
  },
  flashEffect(pos) {
    applyFlash(pos);
  },
  bounce(pos) {
    if (pos.distanceTo(player.state.position) < 30) audio.bounce();
  },
});

// The charge: a blinking box that appears where the spark-charge is planted.
const chargeGroup = new THREE.Group();
{
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.28, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.4, metalness: 0.6 }),
  );
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.06),
    new THREE.MeshBasicMaterial({ color: PALETTE.danger }),
  );
  lamp.position.set(0, 0.17, 0);
  chargeGroup.add(body, lamp);
  chargeGroup.visible = false;
  scene.add(chargeGroup);
}
const chargeLight = new THREE.PointLight(PALETTE.danger, 0, 8, 1.8);
scene.add(chargeLight);

let weaponPrimary = null;
let weaponSidearm = null;
let weapon = null; // active weapon
let spectating = null;
let plantChannel = { active: false, progress: 0, site: null };
let buyOpen = false;
let beepAt = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let stepCount = 0;

const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const camDir = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

const bots = createBots(scene, world, {
  tracer(from, to) {
    effects.tracer(from, to);
  },
  damageBot(victim, attacker, part, dmg, point) {
    effects.spark(point);
    const killed = bots.damage(victim, dmg);
    if (killed) {
      hud.killfeed(attacker.name, victim.name, part === 'head', attacker.team);
      checkElimination();
    }
  },
  damagePlayer(attacker, part, dmg, point) {
    effects.spark(point);
    const dealt = player.damage(dmg, part);
    hud.damageFlash();
    audio.hurt();
    hud.setHealth(player.state.health, player.state.armor);
    if (!player.state.alive) onPlayerDeath(attacker);
    checkElimination();
  },
  shotSound(pos, kind) {
    if (pos.distanceTo(player.state.position) < 45) audio.shot(kind);
  },
  hearShot(pos, team) {
    bots.hearShot(pos, team);
  },
  plantDone(bot, site) {
    game.plantCharge(site, bot);
  },
  defuseDone() {
    game.defuseCharge();
  },
}, random);
bots.setPlayerHitMeshes(playerHitMeshes);

const game = createGame({
  random,
  world,
  onRoundStart(round, site) {
    // Reset everyone to their spawn, refill ammo, open the buy menu.
    const spawn = world.spawns.ember[0];
    player.reset(spawn.x, spawn.z);
    player.state.armor = game.state.armor ? 100 : 0;
    player.state.helmet = game.state.helmet;
    equipPrimary(game.state.weaponKey);
    if (weaponPrimary) weaponPrimary.refillAmmo();
    if (weaponSidearm) weaponSidearm.refillAmmo();
    weapon = weaponPrimary;
    setWeaponVisible();
    bots.reset(round);
    grenades.clear();
    chargeGroup.visible = false;
    chargeLight.intensity = 0;
    plantChannel = { active: false, progress: 0, site: null };
    spectating = null;
    hud.setRound(round);
    hud.setScore(game.state.scoreEmber, game.state.scoreSable);
    hud.setMoney(game.state.money);
    hud.setHealth(player.state.health, player.state.armor);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
    hud.setGrenades(game.state.flash, game.state.frag, game.state.selectedGrenade);
    hud.centerMessage(`ROUND ${round} — PLANT THE CHARGE AT SITE ${site}`);
    // Hide the overlay on later rounds (respawn after death) — but only while
    // pointer lock is held. If the player died last round and never clicked the
    // death overlay, the round turns with them alive but unlocked: hiding the
    // overlay then would leave the sim frozen in buy phase with no way back.
    // Show the pause overlay instead so there is always a button to resume.
    if (started) {
      if (document.pointerLockElement) hud.hideOverlay();
      else hud.showOverlay('paused');
    }
    buyOpen = true;
    hud.showBuy(true, game.state.money, ownedSnapshot());
  },
  onLive() {
    buyOpen = false;
    hud.showBuy(false);
    hud.centerMessage('GO — PLANT THE CHARGE');
  },
  onRoundEnd(winner, reason, se, ss) {
    hud.setScore(se, ss);
    hud.setMoney(game.state.money);
    hud.showProgress(null, null);
    chargeGroup.visible = false;
    chargeLight.intensity = 0;
    if (winner === 'ember') {
      hud.banner('EMBER TAKES THE ROUND', reason, 'ember');
      audio.roundWin();
    } else {
      hud.banner('SABLE HOLDS THE YARD', reason, 'sable');
      audio.roundLose();
    }
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner, se, ss) {
    hud.showOverlay('match', winner === 'ember'
      ? `Ember takes the yard ${se}–${ss}. The foundry is yours.`
      : `Sable holds the yard ${se}–${ss}. Ember falls back to regroup.`);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPlant(site, byBot) {
    const s = world.sites[site];
    chargeGroup.position.set(s.x, 0.16, s.z);
    chargeGroup.visible = true;
    hud.centerMessage(`CHARGE PLANTED AT SITE ${site}`);
    audio.beep(true);
    beepAt = elapsed + 0.6;
  },
  onDefuse(site) {
    chargeGroup.visible = false;
    chargeLight.intensity = 0;
    hud.centerMessage('CHARGE DEFUSED');
  },
  onExplode(site) {
    const s = world.sites[site];
    tmpVec.set(s.x, 0.8, s.z);
    effects.explosion(tmpVec);
    audio.explosion();
    damageInRadius(tmpVec, 14, 200, 'blast');
    chargeGroup.visible = false;
    chargeLight.intensity = 0;
  },
  onWeaponBought(key) {
    equipPrimary(key);
    weapon = weaponPrimary;
    setWeaponVisible();
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
    audio.buy();
  },
  onArmorBought() {
    player.state.armor = 100;
    player.state.helmet = game.state.helmet;
    hud.setHealth(player.state.health, player.state.armor);
    audio.buy();
  },
});

function ownedSnapshot() {
  return {
    weapon: game.state.weaponKey,
    armor: game.state.armor,
    helmet: game.state.helmet,
    flash: game.state.flash,
    frag: game.state.frag,
  };
}

function equipPrimary(key) {
  if (weaponPrimary) weaponPrimary.dispose();
  weaponPrimary = createWeapon(camera, key);
  if (!weaponSidearm) weaponSidearm = createWeapon(camera, 'pistol');
  weapon = weaponPrimary;
}

function setWeaponVisible() {
  if (weaponPrimary) weaponPrimary.model.visible = weapon === weaponPrimary;
  if (weaponSidearm) weaponSidearm.model.visible = weapon === weaponSidearm;
}

function switchWeapon() {
  if (!player.state.alive || !weaponPrimary || !weaponSidearm) return;
  weapon = weapon === weaponPrimary ? weaponSidearm : weaponPrimary;
  setWeaponVisible();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
}

function damageInRadius(pos, radius, maxDmg, kind) {
  const victims = [];
  if (player.state.alive) victims.push({ entity: 'player', pos: player.state.position });
  for (const bot of bots.bots) if (bot.alive) victims.push({ entity: bot, pos: bot.position });
  for (const v of victims) {
    const d = v.pos.distanceTo(pos);
    if (d > radius) continue;
    // Line of sight from the blast: walls shield.
    tmpVec.copy(v.pos);
    tmpVec.y += 1.1;
    raycaster.set(pos, tmpVec.clone().sub(pos).normalize());
    raycaster.far = d;
    if (raycaster.intersectObjects(world.shootables, false)[0]) continue;
    const dmg = maxDmg * (1 - d / radius * 0.8);
    if (v.entity === 'player') {
      player.damage(dmg, 'torso');
      hud.damageFlash();
      hud.setHealth(player.state.health, player.state.armor);
      if (!player.state.alive) onPlayerDeath(null);
    } else {
      const killed = bots.damage(v.entity, dmg);
      if (killed) {
        hud.killfeed(kind === 'blast' ? 'Charge' : 'Frag', v.entity.name, false, 'ember');
      }
    }
  }
  checkElimination();
}

function applyFlash(pos) {
  audio.flash();
  camera.getWorldDirection(camDir);
  tmpVec.copy(player.state.position);
  tmpVec.y += player.state.eye;
  const strength = flashStrength(pos, tmpVec, camDir);
  if (strength > 0.05) hud.flashBlind(strength);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.position.distanceTo(pos);
    if (d > 26) continue;
    tmpVec.copy(bot.position);
    tmpVec.y += 1.5;
    raycaster.set(pos, tmpVec.clone().sub(pos).normalize());
    raycaster.far = d;
    if (raycaster.intersectObjects(world.shootables, false)[0]) continue;
    bot.blindUntil = elapsed + 2.2;
  }
}

function onPlayerDeath(killer) {
  spectating = bots.byTeam('ember').find((b) => b.alive) || null;
  hud.showOverlay('dead');
  if (document.pointerLockElement) document.exitPointerLock();
}

function checkElimination() {
  const phase = game.state.phase;
  if (phase !== 'live') return;
  const emberAlive = bots.aliveCount('ember') + (player.state.alive ? 1 : 0);
  const sableAlive = bots.aliveCount('sable');
  if (emberAlive === 0) game.endRound('sable', 'Ember team eliminated');
  else if (sableAlive === 0) game.endRound('ember', 'Sable team eliminated');
}

function siteClearFor(team, site) {
  const s = world.sites[site];
  const foes = team === 'ember' ? bots.byTeam('sable') : bots.byTeam('ember');
  for (const foe of foes) {
    if (!foe.alive) continue;
    if (Math.hypot(foe.position.x - s.x, foe.position.z - s.z) < 13) return false;
  }
  if (team === 'sable' && player.state.alive) {
    const c = game.state.chargePos;
    if (c && Math.hypot(player.state.position.x - c.x, player.state.position.z - c.z) < 13) return false;
  }
  return true;
}

function botContext() {
  const planted = game.state.phase === 'planted';
  // Foe lists are built once per frame here, never per bot. targetsFor.X lists
  // what team X's bots may shoot at: Sable bots for Ember, Ember bots + the player
  // for Sable.
  const emberFoes = bots.byTeam('ember');
  const sableFoes = bots.byTeam('sable');
  const targetsFor = {
    ember: sableFoes,
    sable: player.state.alive ? emberFoes.concat([player.state]) : emberFoes,
  };
  return {
    phase: game.state.phase,
    teamSite: game.state.teamSite,
    planted,
    plantSite: game.state.plantSite,
    chargePos: game.state.chargePos,
    siteClear: siteClearFor('ember', game.state.teamSite),
    defuseClear: planted ? siteClearFor('sable', game.state.plantSite) : false,
    targetsFor,
    sableBots: sableFoes,
    emberBots: emberFoes,
    playerAsFoe: player.state,
    player: player.state,
  };
}

hud.onPlay(() => {
  if (shot) return;
  if (game.state.phase === 'matchEnd') {
    game.startMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  audio.unlock();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (game.state.phase !== 'matchEnd' && player.state.alive) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  if (spectating && !player.state.alive) {
    camera.position.set(spectating.position.x, spectating.position.y + 1.55, spectating.position.z);
    camera.rotation.set(0, spectating.yaw, 0, 'YXZ');
    return;
  }
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  // ADS: narrow the field of view; the DMR gets a real scope picture.
  const targetFov = input.state.ads && weapon && weapon.def.scoped ? 30 : input.state.ads ? 66 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
  if (weapon && weapon.def.scoped) hud.setScope(input.state.ads);
}

function shoot(spread) {
  if (!weapon || !weapon.takeRound()) return false;
  const def = weapon.def;
  camera.getWorldDirection(direction);
  const pellets = def.pellets || 1;
  let anyHit = false;
  for (let p = 0; p < pellets; p += 1) {
    tmpVec.copy(direction);
    tmpVec.x += (random() * 2 - 1) * spread;
    tmpVec.y += (random() * 2 - 1) * spread;
    tmpVec.z += (random() * 2 - 1) * spread;
    tmpVec.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, tmpVec);
    const targets = world.shootables.concat(bots.hitMeshes);
    const hit = raycaster.intersectObjects(targets, false)[0];
    muzzle.copy(camera.position).addScaledVector(direction, 0.6);
    muzzle.y -= 0.12;
    muzzle.x += Math.cos(player.state.yaw) * 0.2;
    if (hit) {
      effects.tracer(muzzle, hit.point);
      if (hit.object.userData.bot) {
        const bot = hit.object.userData.bot;
        const part = hit.object.userData.part || 'torso';
        const dist = hit.distance;
        const falloff = Math.max(def.falloff, 1 - (dist / def.range) * (1 - def.falloff));
        const dmg = def.damage * falloff * (part === 'head' ? def.headMult : part === 'legs' ? 0.8 : 1);
        const killed = bots.damage(bot, dmg);
        audio.hit();
        hud.hitMarker(killed, killed ? 300 : 90);
        hud.killfeed('You', bot.name, part === 'head', 'ember');
        if (killed) {
          game.onKill(true);
          audio.kill();
          hud.setMoney(game.state.money);
        }
        anyHit = true;
        checkElimination();
      } else {
        effects.spark(hit.point);
      }
    } else {
      tmpVec.copy(camera.position).addScaledVector(direction, 70);
      effects.tracer(muzzle, tmpVec);
    }
  }
  weapon.pullTrigger();
  player.recoil(def.kick * (0.8 + random() * 0.4), (random() * 2 - 1) * def.kick * 0.4);
  audio.shot(def.kind);
  bots.hearShot(player.state.position, 'ember');
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name);
  return anyHit;
}

function throwGrenade() {
  const kind = game.state.selectedGrenade;
  if (game.state[kind] <= 0) {
    audio.denied();
    return;
  }
  game.state[kind] -= 1;
  camera.getWorldDirection(direction);
  tmpVec.copy(camera.position).addScaledVector(direction, 0.5);
  grenades.throwGrenade(kind, tmpVec, direction, 'ember');
  hud.setGrenades(game.state.flash, game.state.frag, game.state.selectedGrenade);
}

function step(dt) {
  elapsed += dt;
  stepCount += 1;
  const phase = game.state.phase;
  game.step(dt);

  // Beeping charge, accelerating as the fuse runs down.
  if (game.state.phase === 'planted' && elapsed >= beepAt) {
    audio.beep(false);
    chargeLight.intensity = chargeLight.intensity > 0 ? 0 : 14;
    beepAt = elapsed + 0.3 + (game.state.fuse / 35) * 0.7;
  }

  const look = input.takeLook();
  player.look(look.x, look.y);
  if (player.state.alive) {
    player.step(dt, input.state.keys, input.state.ads);
    if (weapon) weapon.step(dt);
    // Footsteps.
    const speed = player.groundSpeed();
    if (speed > 1 && player.state.onGround && stepCount % Math.max(12, Math.floor(34 - speed * 3)) === 0) audio.step();
    // Firing.
    if (input.state.firing && weapon) {
      if (weapon.ready()) {
        shoot(shot ? 0 : weapon.spread(speed, !player.state.onGround, player.state.crouching, input.state.ads));
      } else if (weapon.state.mag === 0 && weapon.state.reloadLeft === 0) {
        if (weapon.reload()) audio.reload();
        else audio.dryFire();
      }
    }
    if (input.wasPressed('KeyR') && weapon && weapon.reload()) audio.reload();
    if (input.wasPressed('KeyQ')) {
      game.state.selectedGrenade = game.state.selectedGrenade === 'flash' ? 'frag' : 'flash';
      hud.setGrenades(game.state.flash, game.state.frag, game.state.selectedGrenade);
    }
    if (input.wasPressed('KeyG')) throwGrenade();
    // Plant channel: hold E inside the target site while the round is live.
    if (phase === 'live' && input.state.keys.has('KeyE')) {
      const site = world.sites[game.state.teamSite];
      const d = Math.hypot(player.state.position.x - site.x, player.state.position.z - site.z);
      if (d < site.r) {
        if (!plantChannel.active) plantChannel = { active: true, progress: 0, site: game.state.teamSite };
        plantChannel.progress += dt / 5;
        hud.showProgress('PLANTING THE CHARGE', plantChannel.progress);
        if (stepCount % 30 === 0) audio.plantTick();
        if (plantChannel.progress >= 1) {
          hud.showProgress(null, null);
          plantChannel.active = false;
          game.plantCharge(plantChannel.site, null);
        }
      } else {
        plantChannel.active = false;
        hud.showProgress(null, null);
      }
    } else if (plantChannel.active) {
      plantChannel.active = false;
      hud.showProgress(null, null);
    }
    // Buy menu.
    if (input.wasPressed('KeyB') && game.state.phase === 'buy') {
      buyOpen = !buyOpen;
      hud.showBuy(buyOpen, game.state.money, ownedSnapshot());
    }
    if (buyOpen && game.state.phase === 'buy') {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8']) {
        if (input.wasPressed(code)) {
          const ok = game.buy(code.slice(-1));
          if (ok) {
            hud.setMoney(game.state.money);
            hud.showBuy(true, game.state.money, ownedSnapshot());
            hud.setGrenades(game.state.flash, game.state.frag, game.state.selectedGrenade);
          } else {
            audio.denied();
          }
        }
      }
    }
    // Crosshair spread follows movement and bloom.
    if (weapon) {
      const spreadPx = 5 + weapon.spread(player.groundSpeed(), !player.state.onGround, player.state.crouching, input.state.ads) * 900;
      hud.setCrosshairGap(spreadPx);
    }
  }

  // Bots move and fight whenever the round is live (frozen during the buy phase).
  if (phase === 'live' || phase === 'planted' || phase === 'roundEnd') {
    const ctx = botContext();
    for (const bot of bots.bots) bots.step(bot, dt, elapsed, ctx);
    bots.syncMeshes();
  }
  grenades.step(dt);
  effects.step(dt);
  syncPlayerHitboxes();
  // HUD numbers that change every frame.
  hud.setHealth(player.state.health, player.state.armor);
  hud.setTimer(game.state.phase === 'planted' ? game.state.fuse : game.state.timer, game.state.phase);
  hud.setAlive(bots.aliveCount('ember') + (player.state.alive ? 1 : 0), bots.aliveCount('sable'));
  if (weapon) hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  // Furnace light flicker.
  world.furnaceLight.intensity = 24 + Math.sin(elapsed * 7.3) * 3 + Math.sin(elapsed * 13.1) * 2;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  // The simulation runs while the player holds pointer lock, while spectating after
  // death, and through round/match end. Before the first lock (the start overlay)
  // the buy clock waits for the player.
  const simRunning = shot || input.state.locked || !player.state.alive
    || game.state.phase === 'roundEnd' || game.state.phase === 'matchEnd';
  if (!frozen && simRunning) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  const body = player.state;
  if (name === 'start') {
    game.startMatch();
    body.position.set(0, 0, 15.5);
    body.yaw = 0.12;
    body.pitch = 0.01;
    settle(10);
    hud.showBuy(true, game.state.money, ownedSnapshot());
    hud.setMoney(game.state.money);
  } else if (name === 'play') {
    game.startMatch();
    game.state.phase = 'live';
    game.state.timer = 62;
    buyOpen = false;
    hud.showBuy(false);
    body.position.set(-6, 0, 12);
    body.yaw = 0.3;
    body.pitch = 0.02;
    // Stage a fight: one Sable bot holding mid-doors, one Ember teammate pushing.
    const foe = bots.byTeam('sable')[0];
    foe.position.set(0.5, 0, -1.5);
    foe.yaw = Math.PI;
    foe.mesh.group.position.copy(foe.position);
    const mate = bots.byTeam('ember')[0];
    mate.position.set(-3.5, 0, 6);
    mate.yaw = Math.PI;
    mate.mesh.group.position.copy(mate.position);
    settle(30);
    // Fire twice at the foe; the second shot lands for a hitmarker.
    camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
    camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
    for (let i = 0; i < 2; i += 1) {
      tmpVec.set(foe.position.x, foe.position.y + 1.2, foe.position.z);
      const dx = tmpVec.x - body.position.x;
      const dy = tmpVec.y - (body.position.y + body.eye);
      const dz = tmpVec.z - body.position.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      body.yaw = Math.atan2(-dx, -dz);
      body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
      syncCamera();
      shoot(0);
      settle(6);
    }
  } else if (name === 'plant') {
    game.startMatch();
    game.state.phase = 'live';
    game.state.timer = 41;
    buyOpen = false;
    hud.showBuy(false);
    body.position.set(-11, 0, -8.5);
    body.yaw = 1.26;
    body.pitch = -0.03;
    const foe = bots.byTeam('sable')[1];
    foe.position.set(-12, 0, -12.5);
    foe.alive = false;
    foe.fall = 1;
    foe.mesh.group.rotation.x = -1.45;
    foe.mesh.group.position.copy(foe.position);
    settle(20);
    plantChannel = { active: true, progress: 0.62, site: 'A' };
    hud.showProgress('PLANTING THE CHARGE', 0.62);
  } else if (name === 'end') {
    game.startMatch();
    game.state.scoreEmber = 1;
    game.state.scoreSable = 0;
    game.state.phase = 'roundEnd';
    game.state.timer = 4.2;
    buyOpen = false;
    hud.showBuy(false);
    body.position.set(-2, 0, 6);
    body.yaw = 0.12;
    body.pitch = 0.02;
    const foe = bots.byTeam('sable')[0];
    foe.position.set(-1, 0, 0);
    foe.alive = false;
    foe.fall = 1;
    foe.mesh.group.rotation.x = -1.45;
    foe.mesh.group.position.copy(foe.position);
    const foe2 = bots.byTeam('sable')[2];
    foe2.position.set(3, 0, -2);
    foe2.alive = false;
    foe2.fall = 1;
    foe2.mesh.group.rotation.x = -1.45;
    foe2.mesh.group.position.copy(foe2.position);
    settle(20);
    hud.setScore(1, 0);
    hud.banner('EMBER TAKES THE ROUND', 'Sable team eliminated', 'ember');
  }
  hud.clearCenterMessage();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def.name);
  hud.setHealth(player.state.health, player.state.armor);
  hud.setMoney(game.state.money);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('wheel', () => {
  if (shot) return;
  switchWeapon();
}, { passive: true });

// Debug hook for automated play-testing: a small read-only summary of the match.
window.__cinder = {
  state() {
    return {
      phase: game.state.phase,
      round: game.state.round,
      score: [game.state.scoreEmber, game.state.scoreSable],
      money: game.state.money,
      timer: game.state.phase === 'planted' ? game.state.fuse : game.state.timer,
      teamSite: game.state.teamSite,
      player: {
        alive: player.state.alive,
        hp: Math.round(player.state.health),
        pos: [player.state.position.x.toFixed(1), player.state.position.y.toFixed(1), player.state.position.z.toFixed(1)],
        yaw: +player.state.yaw.toFixed(3),
        weapon: weapon ? weapon.def.name : null,
        mag: weapon ? weapon.state.mag : 0,
      },
      alive: {
        ember: bots.aliveCount('ember') + (player.state.alive ? 1 : 0),
        sable: bots.aliveCount('sable'),
      },
      bots: bots.bots.map((b) => ({ name: b.name, team: b.team, hp: Math.round(b.health), alive: b.alive, state: b.state })),
    };
  },
};

syncCamera();
if (shot) {
  game.startMatch();
  runShot(shot);
} else {
  game.startMatch();
  requestAnimationFrame(frame);
}
