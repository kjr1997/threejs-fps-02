// Bots: three Ember teammates and four Sable opponents. Each bot is a body with a
// weapon, a health pool and a small state machine: follow a route through the nav graph,
// hold an angle, push when the way is clear, retreat when hurt, plant the charge or
// defuse it, and shoot back when it sees an enemy. It hears gunshots nearby and reacts
// to what it sees; it never knows where an enemy is without line of sight or sound.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover } from './mover.js';
import { WEAPONS } from './weapons.js';
import { findPath, nearestNode } from './world.js';

const NAMES = {
  ember: ['Ash', 'Cinder', 'Flint'],
  sable: ['Slate', 'Onyx', 'Basalt', 'Quartz'],
};
const BOT_SPEED = 3.7;
const EYE = 1.55;
const REACT_MIN = 0.35;
const REACT_MAX = 0.85;

function buildMesh(scene, team) {
  const color = team === 'ember' ? PALETTE.ember : PALETTE.sable;
  const dark = team === 'ember' ? PALETTE.emberDeep : PALETTE.sableDeep;
  const group = new THREE.Group();
  const matBody = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
  const matDark = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.7, metalness: 0.1 });
  const matSkin = new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.8 });
  const matVisor = new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.25, metalness: 0.6 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), matBody);
  torso.position.y = 1.08;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), matSkin);
  head.position.y = 1.62;
  head.userData.part = 'head';
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), matVisor);
  visor.position.set(0, 1.64, -0.13);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.2), matDark);
  legL.position.set(-0.14, 0.36, 0);
  legL.userData.part = 'legs';
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), matDark);
  gun.position.set(0.28, 1.15, -0.25);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.12), matDark);
  pack.position.set(0, 1.1, 0.2);
  group.add(torso, head, visor, legL, legR, gun, pack);
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head, legL, legR };
}

export function createBots(scene, world, hooks, random) {
  const mover = createMover(world.colliders, 1.72);
  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpEnd = new THREE.Vector3();
  // Raycast targets for bot shots: bot bodies, the world, and the player's hitboxes.
  // Rebuilt once when main.js hands over the player hitboxes; never per shot.
  let shotTargets = hitMeshes.concat(world.shootables);

  function makeBot(team, index, spawn) {
    const mesh = buildMesh(scene, team);
    const bot = {
      team,
      name: NAMES[team][index],
      mesh,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      velocity: new THREE.Vector3(),
      yaw: team === 'ember' ? Math.PI : 0,
      health: 100,
      alive: true,
      weaponKey: index === 0 ? 'rifle' : index === 1 ? 'smg' : 'rifle',
      ammo: 30,
      cooldown: 0,
      burstLeft: 0,
      burstPause: 0,
      reactAt: 0,
      target: null, // current enemy entity
      path: [],
      pathIndex: 0,
      holdNode: null,
      holdUntil: 0,
      state: 'route',
      plantProgress: 0,
      defuseProgress: 0,
      strafeDir: 1,
      strafeAt: 0,
      investigate: null,
      blindUntil: 0,
      skill: 0.35 + random() * 0.3,
      fall: 0,
      stepPhase: random() * 10,
    };
    mesh.group.position.copy(bot.position);
    for (const part of [mesh.torso, mesh.head, mesh.legL, mesh.legR]) {
      part.userData.bot = bot;
      hitMeshes.push(part);
    }
    bots.push(bot);
    return bot;
  }

  world.spawns.ember.forEach((s, i) => {
    if (i < 3) makeBot('ember', i, s);
  });
  world.spawns.sable.forEach((s, i) => makeBot('sable', i, s));

  function reset(round) {
    for (const bot of bots) {
      const spawn = world.spawns[bot.team][bot.team === 'ember' ? NAMES.ember.indexOf(bot.name) : NAMES.sable.indexOf(bot.name)];
      bot.position.set(spawn.x, 0, spawn.z);
      bot.velocity.set(0, 0, 0);
      bot.yaw = bot.team === 'ember' ? Math.PI : 0;
      bot.health = 100;
      bot.alive = true;
      bot.weaponKey = round >= 2 && bot.team === 'sable' && bot.name === 'Slate' ? 'dmr' : bot.weaponKey;
      bot.ammo = WEAPONS[bot.weaponKey].mag;
      bot.cooldown = 0;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.target = null;
      bot.path = [];
      bot.pathIndex = 0;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.blindUntil = 0;
      bot.fall = 0;
      bot.mesh.group.rotation.set(0, 0, 0);
      bot.mesh.group.position.copy(bot.position);
      bot.mesh.group.visible = true;
      bot.state = 'route';
      bot.investigate = null;
    }
  }

  function los(from, to) {
    tmpDir.copy(to).sub(from);
    const dist = tmpDir.length();
    if (dist < 0.01) return true;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit;
  }

  function canSee(bot, entity) {
    if (!entity.alive) return false;
    tmpEye.set(bot.position.x, bot.position.y + EYE, bot.position.z);
    tmpTo.set(entity.position.x, entity.position.y + 1.35, entity.position.z);
    const dist = tmpEye.distanceTo(tmpTo);
    if (dist > 32) return false;
    // Bots only acquire what is in front of them: without this they opened
    // fire across the whole yard in the first second of every round, because
    // the lanes give 30 m sightlines from spawn to spawn.
    const dx = tmpTo.x - tmpEye.x;
    const dz = tmpTo.z - tmpEye.z;
    const len = Math.hypot(dx, dz) || 1;
    const facing = -Math.sin(bot.yaw) * (dx / len) + -Math.cos(bot.yaw) * (dz / len);
    if (facing < 0.2) return false;
    return los(tmpEye, tmpTo);
  }

  function nearestVisibleEnemy(bot, foes) {
    let best = null;
    let bestD = Infinity;
    for (const foe of foes) {
      if (!foe.alive) continue;
      const d = bot.position.distanceTo(foe.position);
      if (d < bestD && canSee(bot, foe)) {
        bestD = d;
        best = foe;
      }
    }
    return best;
  }

  function setPath(bot, goalNode) {
    const from = nearestNode(world.nav, bot.position.x, bot.position.z);
    bot.path = findPath(world.nav, from, goalNode);
    bot.pathIndex = 0;
  }

  function followPath(bot, dt, now) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = world.nav[bot.path[bot.pathIndex]];
    const dx = node.x - bot.position.x;
    const dz = node.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const dirX = dx / dist;
    const dirZ = dz / dist;
    bot.velocity.x = dirX * BOT_SPEED;
    bot.velocity.z = dirZ * BOT_SPEED;
    bot.yaw = Math.atan2(-dirX, -dirZ);
    const body = { position: bot.position, velocity: bot.velocity };
    mover.step(body, dt, 1.72);
    return false;
  }

  function aimAt(bot, targetPos, dt) {
    const dx = targetPos.x - bot.position.x;
    const dz = targetPos.z - bot.position.z;
    const wanted = Math.atan2(-dx, -dz);
    let diff = wanted - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += diff * Math.min(1, dt * 8);
  }

  function botShoot(bot, target, now) {
    const def = WEAPONS[bot.weaponKey];
    if (bot.cooldown > 0 || bot.ammo <= 0) return;
    if (bot.burstPause > 0) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.burstPause = 0.45 + random() * 0.6;
    }
    bot.burstLeft -= 1;
    bot.cooldown = def.gap;
    bot.ammo -= 1;
    if (bot.ammo === 0) {
      bot.ammo = def.mag;
      bot.cooldown = def.reload;
    }
    // Aim with error: worse with distance, target speed, and bot movement.
    // Tuned so a moving target at 20 m is hard to hit (bots still punish
    // close-range peeks and stationary targets); previously a walking player
    // in the open died within ~4 s of the round starting.
    const dist = bot.position.distanceTo(target.position);
    const targetSpeed = target.velocity ? Math.hypot(target.velocity.x, target.velocity.z) : 0;
    const err = (0.022 + dist * 0.0022 + targetSpeed * 0.007) * (1.15 - bot.skill);
    tmpDir.set(
      target.position.x - bot.position.x + (random() * 2 - 1) * err * dist,
      target.position.y + 1.2 - (bot.position.y + EYE) + (random() * 2 - 1) * err * dist * 0.7,
      target.position.z - bot.position.z + (random() * 2 - 1) * err * dist,
    ).normalize();
    tmpEye.set(bot.position.x, bot.position.y + EYE, bot.position.z);
    raycaster.set(tmpEye, tmpDir);
    raycaster.far = 90;
    const hits = raycaster.intersectObjects(shotTargets, false);
    const hit = hits[0];
    tmpEnd.copy(tmpDir).multiplyScalar(hit ? hit.distance : 40).add(tmpEye);
    hooks.tracer(tmpEye, hit ? hit.point : tmpEnd, bot.team);
    if (hit && hit.object.userData.bot && hit.object.userData.bot.team !== bot.team) {
      const victim = hit.object.userData.bot;
      const part = hit.object.userData.part || 'torso';
      const falloff = Math.max(def.falloff, 1 - (dist / def.range) * (1 - def.falloff));
      let dmg = def.damage * falloff * (part === 'head' ? def.headMult : part === 'legs' ? 0.8 : 1);
      hooks.damageBot(victim, bot, part, dmg, hit.point);
    } else if (hit && hit.object.userData.isPlayer) {
      const part = hit.object.userData.part || 'torso';
      const falloff = Math.max(def.falloff, 1 - (dist / def.range) * (1 - def.falloff));
      // Bots do not one-tap the player: a bot headshot counts double, not 4x,
      // so the player dies to sustained fire, not one lucky long-range headshot.
      // Bot shots also deal 55% damage to the player (they stay full strength
      // against other bots): three bots focus-firing an exposed player still
      // killed them in ~2 s, which left no room to cross open ground at all.
      const mult = part === 'head' ? Math.min(def.headMult, 2) : part === 'legs' ? 0.8 : 1;
      const dmg = def.damage * falloff * mult * 0.55;
      hooks.damagePlayer(bot, part, dmg, hit.point);
    }
    hooks.shotSound(bot.position, def.kind);
    hooks.hearShot(bot.position, bot.team);
  }

  function step(bot, dt, now, ctx) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.mesh.group.rotation.x = -bot.fall * 1.45;
      }
      return;
    }
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);
    if (bot.burstLeft > 0 && bot.burstPause <= 0 && bot.cooldown <= 0) bot.burstPause = 0;

    const foes = ctx.targetsFor[bot.team];
    const seen = nearestVisibleEnemy(bot, foes);
    if (now < (bot.blindUntil || 0)) bot.target = null;
    else if (seen && bot.target !== seen) {
      bot.target = seen;
      bot.reactAt = now + REACT_MIN + random() * (REACT_MAX - REACT_MIN);
    } else if (!seen) {
      bot.target = null;
    }

    // Combat: strafe and shoot once reacted.
    if (bot.target) {
      const target = bot.target;
      aimAt(bot, target.position, dt);
      if (now > bot.strafeAt) {
        bot.strafeAt = now + 0.7 + random() * 0.7;
        bot.strafeDir = random() < 0.5 ? -1 : 1;
      }
      const side = Math.cos(bot.yaw) * bot.strafeDir;
      const fwd = -Math.sin(bot.yaw) * bot.strafeDir;
      bot.velocity.x = side * 1.4;
      bot.velocity.z = fwd * 1.4;
      const body = { position: bot.position, velocity: bot.velocity };
      mover.step(body, dt, 1.72);
      if (now >= bot.reactAt) botShoot(bot, target, now);
      bot.state = 'combat';
      return;
    }

    // Objective work.
    if (ctx.phase === 'live' || ctx.phase === 'planted') {
      if (bot.team === 'ember' && ctx.phase === 'live' && !ctx.planted) {
        const site = world.sites[ctx.teamSite];
        const dSite = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
        if (dSite < site.r && ctx.siteClear) {
          bot.state = 'plant';
          bot.plantProgress += dt / 5;
          aimAt(bot, { x: site.x, z: site.z }, dt);
          if (bot.plantProgress >= 1) {
            bot.plantProgress = 0;
            hooks.plantDone(bot, ctx.teamSite);
          }
          return;
        }
      }
      if (bot.team === 'sable' && ctx.planted) {
        const charge = ctx.chargePos;
        const d = Math.hypot(charge.x - bot.position.x, charge.z - bot.position.z);
        if (d < 2.2 && ctx.defuseClear) {
          bot.state = 'defuse';
          bot.defuseProgress += dt / 5;
          if (bot.defuseProgress >= 1) {
            bot.defuseProgress = 0;
            hooks.defuseDone(bot);
          }
          return;
        }
      }
    }
    bot.plantProgress = 0;
    bot.defuseProgress = 0;

    // Route: hold, investigate, or walk the assigned route.
    if (bot.holdNode && bot.state === 'hold') {
      if (now < bot.holdUntil) {
        bot.velocity.set(0, 0, 0);
        return;
      }
      bot.holdNode = null;
      bot.state = 'route';
    }
    if (bot.investigate) {
      const arrived = followPath(bot, dt, now);
      if (arrived) bot.investigate = null;
      return;
    }
    if (bot.path.length === 0) {
      // Pick a destination for this bot's job.
      if (bot.team === 'ember') {
        setPath(bot, ctx.teamSite === 'A' ? 'aSite' : 'bSite');
      } else if (bot.name === 'Slate' || bot.name === 'Onyx') {
        setPath(bot, ctx.planted ? (ctx.plantSite === 'A' ? 'aSite' : 'bSite') : bot.name === 'Slate' ? 'aCorner' : 'bCorner');
      } else if (bot.name === 'Basalt') {
        setPath(bot, 'midDoors');
      } else {
        setPath(bot, ctx.planted ? (ctx.plantSite === 'A' ? 'aSite' : 'bSite') : 'midNorth');
      }
    }
    const arrived = followPath(bot, dt, now);
    if (arrived) {
      bot.path = [];
      if (bot.team === 'sable' && !ctx.planted) {
        bot.holdNode = nearestNode(world.nav, bot.position.x, bot.position.z);
        bot.holdUntil = now + 6 + random() * 6;
        bot.state = 'hold';
        // Face the lane the enemy comes from: a holder in the north half
        // faces south (yaw PI), one in the south half faces north (yaw 0).
        bot.yaw = bot.position.z < -8 ? Math.PI : 0;
      }
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.velocity.set(0, 0, 0);
      return true;
    }
    // Hurt bots fall back a little: investigate the shooter's direction.
    if (bot.health < 40 && bot.state !== 'combat') {
      const from = nearestNode(world.nav, bot.position.x, bot.position.z);
      bot.investigate = from;
    }
    return false;
  }

  function hearShot(pos, team) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team || bot.target) continue;
      if (bot.position.distanceTo(pos) < 32) {
        bot.investigate = nearestNode(world.nav, pos.x, pos.z);
        setPath(bot, bot.investigate);
      }
    }
  }

  function aliveCount(team) {
    return bots.filter((b) => b.team === team && b.alive).length;
  }

  function syncMeshes() {
    for (const bot of bots) {
      bot.mesh.group.position.copy(bot.position);
      bot.mesh.group.rotation.y = bot.yaw;
      // Walk cycle: legs swing while moving.
      const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
      bot.stepPhase += speed * 0.09;
      const swing = Math.sin(bot.stepPhase * 6) * Math.min(0.5, speed / 4);
      bot.mesh.legL.rotation.x = swing;
      bot.mesh.legR.rotation.x = -swing;
    }
  }

  return {
    bots,
    hitMeshes,
    reset,
    step,
    damage,
    hearShot,
    aliveCount,
    syncMeshes,
    setPath,
    setPlayerHitMeshes(meshes) {
      shotTargets = hitMeshes.concat(world.shootables, meshes);
    },
    byTeam(team) {
      return bots.filter((b) => b.team === team);
    },
  };
}
