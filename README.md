# CINDERWORKS — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/kjr1997/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/kjr1997/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical shooter in the style Counter-Strike made famous, built on
three.js 0.187.0 (vendored under `game/vendor/three/`). Two teams fight over Yard 7,
a dusk-lit foundry yard: **Ember** attacks, **Sable** defends. First to 5 rounds
takes the yard.

## How a round plays

- **Objective:** Ember plants the spark-charge at Site A (the furnace hall) or
  Site B (the container yard) by holding **E** inside the site. Once planted, a
  35-second fuse runs — Sable must defuse it, or the charge detonates and Ember
  takes the round. Eliminating the other team also wins the round; if the timer
  runs out with no plant, Sable holds the yard.
- **Money:** kills pay $300, round wins $3,250, losses $1,900+ (loss streak bonus).
  Spend it in the buy phase (**B**, then number keys): SMG, rifle, shotgun, DMR,
  Kevlar, helmet, flashbangs and frag grenades.
- **Gunplay:** hitscan with headshots (4×), damage falloff, recoil and bloom that
  punish firing on the move, crouching and aiming down sights that reward stopping
  to aim. The DMR gets a real scope.
- **Bots:** three Ember teammates and four Sable opponents follow routes through
  the nav graph, hold angles at the sites and mid, push when the way is clear,
  retreat when hurt, plant/defuse the charge, and react to what they see and hear
  — gunshots draw them to investigate.
- **Feel:** synthesized WebAudio gunshots, reloads, beeps, explosions and round
  stings (no audio files), tracers, impact sparks, a blinking planted charge,
  furnace flicker, and a full HUD (health/armour, ammo, money, timer, score,
  alive counts, killfeed, buy menu, plant progress).

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look, RMB aim down sights |
| Click | Fire, R reload |
| B then 1–8 | Buy menu |
| E (hold) | Plant the charge |
| G / Q | Throw grenade / switch grenade type |
| Wheel | Switch primary / sidearm |
| Ctrl / Space | Crouch / jump |

## Run it

```sh
node serve.ts        # serves game/ at http://localhost:8080
```

No build step, no network requests: static files and ES modules only. Screenshots
in `screenshots/` are real renders of this game's own code, taken with
`?shot=start|play|plant|end&seed=1`.

## Entry

`main.ts` copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the kit's `vendor/makefun-threejs.ts`.

MIT licensed — see LICENSE.
