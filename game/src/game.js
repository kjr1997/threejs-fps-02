// The match: rounds, phases, money, the charge, and the win conditions. It owns no
// rendering and no input; main.js and the bots call into it, and it calls back out
// through hooks (banner, sound, charge mesh) so the rules stay in one place.
import { WEAPONS, GRENADE_DEFS } from './weapons.js';

const BUY_SECONDS = 15;
const ROUND_SECONDS = 100;
const FUSE_SECONDS = 35;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const PLANT_REWARD = 300;
const KILL_REWARD = 300;
const WIN_BONUS = 3250;
const LOSS_BONUS = 1900;

export function createGame(hooks) {
  const state = {
    phase: 'buy',
    round: 1,
    scoreEmber: 0,
    scoreSable: 0,
    money: 800,
    teamSite: 'A',
    timer: BUY_SECONDS,
    fuse: 0,
    plantSite: null,
    chargePos: null,
    lossStreak: 0,
    matchOver: false,
    weaponKey: 'rifle',
    sidearm: 'pistol',
    armor: false,
    helmet: false,
    flash: 0,
    frag: 0,
    selectedGrenade: 'flash',
  };

  function startRound(round) {
    state.round = round;
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.fuse = 0;
    state.plantSite = null;
    state.chargePos = null;
    state.teamSite = hooks.random() < 0.5 ? 'A' : 'B';
    hooks.onRoundStart(round, state.teamSite);
  }

  function startMatch() {
    state.scoreEmber = 0;
    state.scoreSable = 0;
    state.money = 800;
    state.lossStreak = 0;
    state.matchOver = false;
    state.weaponKey = 'rifle';
    state.armor = false;
    state.helmet = false;
    state.flash = 0;
    state.frag = 0;
    startRound(1);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.timer = 5;
    if (winner === 'ember') {
      state.scoreEmber += 1;
      state.money += WIN_BONUS;
      state.lossStreak = 0;
    } else {
      state.scoreSable += 1;
      state.money += LOSS_BONUS + Math.min(2, state.lossStreak) * 500;
      state.lossStreak += 1;
    }
    hooks.onRoundEnd(winner, reason, state.scoreEmber, state.scoreSable);
    if (state.scoreEmber >= WIN_ROUNDS || state.scoreSable >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchOver = true;
    }
  }

  function nextRound() {
    if (state.matchOver) {
      state.phase = 'matchEnd';
      hooks.onMatchEnd(state.scoreEmber > state.scoreSable ? 'ember' : 'sable', state.scoreEmber, state.scoreSable);
      return;
    }
    startRound(state.round + 1);
  }

  function plantCharge(site, byBot) {
    state.plantSite = site;
    const s = hooks.world.sites[site];
    state.chargePos = { x: s.x, z: s.z };
    state.phase = 'planted';
    state.fuse = FUSE_SECONDS;
    state.money += PLANT_REWARD;
    hooks.onPlant(site, byBot);
  }

  function defuseCharge() {
    const site = state.plantSite;
    state.plantSite = null;
    state.chargePos = null;
    hooks.onDefuse(site);
    endRound('sable', 'Charge defused');
  }

  function explodeCharge() {
    const site = state.plantSite;
    state.plantSite = null;
    state.chargePos = null;
    hooks.onExplode(site);
    endRound('ember', 'Charge detonated');
  }

  function onKill(killerIsPlayer) {
    if (killerIsPlayer) state.money += KILL_REWARD;
  }

  function buy(key) {
    if (state.phase !== 'buy') return false;
    const table = {
      1: { kind: 'weapon', key: 'smg', price: WEAPONS.smg.price },
      2: { kind: 'weapon', key: 'rifle', price: WEAPONS.rifle.price },
      3: { kind: 'weapon', key: 'shotgun', price: WEAPONS.shotgun.price },
      4: { kind: 'weapon', key: 'dmr', price: WEAPONS.dmr.price },
      5: { kind: 'armor', price: 650 },
      6: { kind: 'helmet', price: 350 },
      7: { kind: 'grenade', key: 'flash', price: GRENADE_DEFS.flash.price },
      8: { kind: 'grenade', key: 'frag', price: GRENADE_DEFS.frag.price },
    };
    const item = table[key];
    if (!item || state.money < item.price) return false;
    if (item.kind === 'weapon' && state.weaponKey === item.key) return false;
    if (item.kind === 'armor' && state.armor) return false;
    if (item.kind === 'helmet' && state.helmet) return false;
    if (item.kind === 'grenade' && state[item.key] >= 2) return false;
    state.money -= item.price;
    if (item.kind === 'weapon') {
      state.weaponKey = item.key;
      hooks.onWeaponBought(item.key);
    } else if (item.kind === 'armor') {
      state.armor = true;
      hooks.onArmorBought();
    } else if (item.kind === 'helmet') {
      state.helmet = true;
      hooks.onArmorBought();
    } else {
      state[item.key] += 1;
    }
    return true;
  }

  function step(dt) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        hooks.onLive();
      }
    } else if (state.phase === 'live') {
      state.timer -= dt;
      if (state.timer <= 0) endRound('sable', 'Time expired — Sable holds the yard');
    } else if (state.phase === 'planted') {
      state.fuse -= dt;
      state.timer = state.fuse;
      if (state.fuse <= 0) explodeCharge();
    } else if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) nextRound();
    }
  }

  return {
    state,
    startMatch,
    startRound,
    endRound,
    plantCharge,
    defuseCharge,
    explodeCharge,
    onKill,
    buy,
    step,
  };
}
