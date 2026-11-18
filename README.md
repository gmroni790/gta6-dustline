# Dustline

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/gmroni790/gta6-dustline/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/gmroni790/gta6-dustline/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Dustline is an original open-world crime game built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC. It plays offline in a desktop browser from static files: no build step, no network, no account. Everything in it — the city, the characters, the vehicles, the story, the art and the sound — is original.

## Run it

Serve the game folder with any static server and open it in desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

Or open `game/index.html` straight from a local server of your choice. The game needs a desktop browser with WebGL; keyboard and mouse required.

## The game

Dustline is a sun-baked desert highway city: downtown towers, adobe streets in Old Town, the canyon rim, a truck stop on the desert highway, the quarry and the dunes. You play Rae Calloway, a courier and driver who takes jobs across the city.

- **Drive and walk** — seven desert vehicle types, from dune buggies to a semi hauler. Steal any car you can reach.
- **A living city** — traffic that follows the roads, pedestrians on the sidewalks, dust drifting through the heat.
- **Five wanted levels** — foot cops, then patrol cars, then the helicopter at five stars. Lose the heat at the Desert Rose paint shop while driving, or lie low at Rae's garage in Old Town on foot.
- **Combat** — fists, pistol and SMG, with mouse aim.
- **Six story missions** — jobs for Mama Rosa, Deke, Sal, Nadia, Old Pete and the Broker — plus ten turquoise relics hidden around the city.
- **HUD with live minimap**, title / pause / help / wasted / busted menus, localStorage save and load, and synthesized WebAudio: engine, sirens, gunshots and a desert music loop. No audio files.

## Controls

| Keys | What they do |
| --- | --- |
| W A S D | Walk / drive |
| Mouse | Aim — click to shoot, wheel to swap weapon |
| E | Enter or exit a car, start a mission |
| Shift | Sprint on foot |
| Space | Brake while driving |
| 1 2 3 | Fists / pistol / SMG |
| R | Reload |
| Esc | Pause |
| M | Music on / off |

## Screenshots

The four screenshots in `screenshots/` are real renders of the game, taken from deterministic shot modes: `?shot=cover&seed=7`, `?shot=street&seed=7`, `?shot=chase&seed=7` and `?shot=mission&seed=7`.

## Tech

Three.js r160 (vendored minified build under `game/vendor/`), vanilla ES modules under `game/src/`, one job per file. `main.ts` (Node 22) copies `game/` and `screenshots/` to the output folder and writes `dossier.json` with the vendored make.fun helper.

---

<sub>Entered on [make.fun](https://make.fun/?ref=735zjaf0&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
