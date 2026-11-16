// The DOM HUD: crosshair, health, ammo, money, timer, score, killfeed, buy menu,
// plant/defuse progress, banners and overlays. It never touches the simulation;
// main.js and game.js push numbers in and read the play callback out.
import { WEAPONS, GRENADE_DEFS } from './weapons.js';

const OVERLAY_COPY = {
  start: {
    title: 'CINDERWORKS',
    copy: 'Yard 7 at dusk. Ember plants the spark-charge at Site A or Site B; Sable stops them. First to 5 rounds takes the yard. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'CINDERWORKS',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Spectating a teammate. You respawn next round.',
    action: 'Keep watching',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const killfeed = $('killfeed');
  const healthNum = $('health-num');
  const healthBar = $('health-bar');
  const armorBar = $('armor-bar');
  const armorRow = $('armor-row');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeLine = $('grenades');
  const moneyEl = $('money');
  const timerEl = $('timer');
  const scoreEmber = $('score-ember');
  const scoreSable = $('score-sable');
  const aliveEmber = $('alive-ember');
  const aliveSable = $('alive-sable');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const progress = $('progress');
  const progressLabel = $('progress-label');
  const progressFill = $('progress-fill');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const vignette = $('vignette');
  const flashOverlay = $('flash-overlay');
  const centerMsg = $('center-msg');
  const scope = $('scope');
  const roundLabel = $('round-label');

  let hitTimer = 0;
  let bannerTimer = 0;
  let centerTimer = 0;
  let last = {};
  let playHandler = null;

  function setText(el, value, key) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }

  return {
    setHealth(hp, armor) {
      setText(healthNum, String(Math.ceil(hp)), 'hp');
      healthBar.style.width = `${Math.max(0, hp)}%`;
      healthBar.classList.toggle('low', hp <= 30);
      armorRow.style.display = armor > 0 ? 'flex' : 'none';
      armorBar.style.width = `${Math.min(100, armor)}%`;
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'res');
      setText(weaponName, name, 'wname');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setGrenades(flash, frag, selected) {
      setText(grenadeLine, `Flash ${flash} · Frag ${frag}  [${selected === 'flash' ? 'FLASH' : 'FRAG'}]`, 'nades');
    },
    setMoney(n) {
      setText(moneyEl, `$${n.toLocaleString('en-US')}`, 'money');
      setText(buyMoney, `$${n.toLocaleString('en-US')}`, 'buymoney');
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      setText(timerEl, `${mm}:${ss}`, 'timer');
      timerEl.classList.toggle('urgent', s <= 10 && phase === 'live');
    },
    setRound(round) {
      setText(roundLabel, `ROUND ${round}`, 'round');
    },
    setScore(e, s) {
      setText(scoreEmber, String(e), 'se');
      setText(scoreSable, String(s), 'ss');
    },
    setAlive(e, s) {
      setText(aliveEmber, '●'.repeat(e) + '○'.repeat(4 - e), 'ae');
      setText(aliveSable, '●'.repeat(s) + '○'.repeat(4 - s), 'as');
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setScope(on) {
      scope.hidden = !on;
      crosshair.style.visibility = on ? 'hidden' : 'visible';
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    killfeed(killer, victim, headshot, killerTeam) {
      const row = document.createElement('div');
      row.className = `feed-row ${killerTeam}`;
      row.textContent = `${killer} ${headshot ? '◎' : '✕'} ${victim}`;
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => row.remove(), 6000);
    },
    damageFlash() {
      vignette.classList.remove('hit');
      void vignette.offsetWidth;
      vignette.classList.add('hit');
    },
    flashBlind(strength) {
      flashOverlay.style.opacity = String(Math.min(1, strength));
      clearTimeout(flashOverlay._t);
      flashOverlay._t = setTimeout(() => { flashOverlay.style.opacity = '0'; }, Math.max(400, strength * 2600));
    },
    centerMessage(text, ms = 2200) {
      centerMsg.textContent = text;
      centerMsg.classList.add('on');
      clearTimeout(centerTimer);
      centerTimer = setTimeout(() => centerMsg.classList.remove('on'), ms);
    },
    clearCenterMessage() {
      centerMsg.textContent = '';
      centerMsg.classList.remove('on');
      clearTimeout(centerTimer);
    },
    banner(titleText, subText, team) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.className = `show ${team || ''}`;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.className = ''; }, 4200);
    },
    showProgress(label, frac) {
      if (frac === null) {
        progress.hidden = true;
        return;
      }
      progress.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(frac * 100)}%`;
    },
    showBuy(open, money, owned) {
      buyMenu.hidden = !open;
      if (!open) return;
      const rows = [
        { key: '1', name: WEAPONS.smg.name, price: WEAPONS.smg.price, owned: owned.weapon === 'smg' },
        { key: '2', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, owned: owned.weapon === 'rifle' },
        { key: '3', name: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price, owned: owned.weapon === 'shotgun' },
        { key: '4', name: WEAPONS.dmr.name, price: WEAPONS.dmr.price, owned: owned.weapon === 'dmr' },
        { key: '5', name: 'Kevlar Vest', price: 650, owned: owned.armor },
        { key: '6', name: 'Helmet', price: 350, owned: owned.helmet },
        { key: '7', name: GRENADE_DEFS.flash.name, price: GRENADE_DEFS.flash.price, owned: false, count: owned.flash },
        { key: '8', name: GRENADE_DEFS.frag.name, price: GRENADE_DEFS.frag.price, owned: false, count: owned.frag },
      ];
      buyList.innerHTML = rows.map((r) => {
        const afford = money >= r.price;
        const state = r.owned ? 'OWNED' : afford ? `$${r.price}` : '—';
        const count = r.count ? ` ×${r.count}` : '';
        return `<div class="buy-row ${r.owned ? 'owned' : ''} ${afford && !r.owned ? '' : 'cant'}"><kbd>${r.key}</kbd><span>${r.name}${count}</span><b>${state}</b></div>`;
      }).join('');
      setText(buyMoney, `$${money.toLocaleString('en-US')}`, 'buymoney');
    },
    showOverlay(mode, data) {
      const text = OVERLAY_COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'match' ? data || '' : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playHandler = handler;
      play.addEventListener('click', () => playHandler && playHandler());
    },
    playAction() {
      if (playHandler) playHandler();
    },
  };
}
