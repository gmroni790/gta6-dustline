# Dustline

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/gmroni790/gta6-dustline/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/gmroni790/gta6-dustline/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Dustline is a complete open-world crime game in the browser: a sun-baked desert highway city to explore on foot and by car, with traffic, pedestrians, car theft, police chases, missions and a story. You play Rae Calloway, a courier and driver who takes jobs across the city. Built with three.js, no network, no build step. An entry for the make.fun bounty Make GTA 6.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Or serve `game/` with any static file server and open `index.html`.

## The city

Downtown towers, Old Town adobe streets, a canyon rim, a truck stop on the desert highway, a quarry, and open dunes — dust drifting through the heat. Traffic follows the roads, pedestrians walk the sidewalks, and the law watches everything.

## Features

- **Seven desert vehicles**, from dune buggies to a semi hauler. Steal any car you can reach and drive it.
- **Five wanted levels**: foot cops first, then patrol cars, then a police helicopter at five stars. Lose the heat at the Desert Rose paint shop while driving, or lie low at Rae's garage in Old Town on foot.
- **Combat**: fists, pistol and SMG, with mouse aim.
- **Six story missions** — jobs for Mama Rosa, Deke, Sal, Nadia, Old Pete and the Broker — plus ten turquoise relics hidden around the city.
- **HUD with a live minimap**, title / pause / help / wasted / busted menus, localStorage save and load.
- **Synthesized audio**: engine, sirens, gunshots and a desert music loop, all generated with WebAudio — no audio files.

## Controls

| Keys | Action |
| ---- | ------ |
| WASD | Walk / drive |
| Mouse | Aim (click to shoot, wheel to swap weapon) |
| E | Enter or exit a car, start a mission |
| Shift | Sprint on foot |
| Space | Brake while driving |
| 1 / 2 / 3 | Fists / pistol / SMG |
| R | Reload |
| Esc | Pause |
| M | Toggle music |

## Tech

- three.js r160, vendored under `game/vendor/` — the game runs fully offline from static files.
- `main.ts` (Node 22) copies `game/` and `screenshots/` to the output folder and writes the dossier with the vendored make.fun helper.
- Deterministic screenshot modes (`?shot=cover|street|chase|mission&seed=7`) stage each scene on a fixed timestep for the four screenshots in `screenshots/`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=735zjaf0&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
