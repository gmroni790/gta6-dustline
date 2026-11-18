// Dustline entrypoint (Node 22, standard library only): hands the game in by
// copying this directory's game/ and screenshots/ into the output folder and
// writing the dossier the judge reads, using the vendored make.fun helper.
//
// Run it directly:  node main.ts
// Local stand-in for the grader's /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps for this bounty: the text budget shapes the dossier,
// the rest refuse an entry the scorer would refuse (too many or too large
// screenshots, a game folder past the file or byte caps, an over-long path).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn() {
  const repoRoot = dirname(fileURLToPath(import.meta.url));
  const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

  // Fail loudly before copying anything, rather than handing in an entry
  // the scorer would refuse: the game folder must exist, and the shots
  // must be within the count and per-file byte caps.
  const gameDir = join(repoRoot, 'game');
  if (!existsSync(gameDir)) throw new Error(`no game/ folder in ${repoRoot}`);
  const shotsIn = join(repoRoot, 'screenshots');
  if (existsSync(shotsIn)) {
    const shots = readdirSync(shotsIn).filter((name) => name.endsWith('.jpg'));
    if (shots.length > DOSSIER_CAPS.screenshots.max) {
      throw new Error(`${shots.length} screenshots, cap is ${DOSSIER_CAPS.screenshots.max}`);
    }
    for (const name of shots) {
      const bytes = statSync(join(shotsIn, name)).size;
      if (bytes > DOSSIER_CAPS.screenshots.max_bytes) {
        throw new Error(`${name} is ${bytes} bytes, cap is ${DOSSIER_CAPS.screenshots.max_bytes}`);
      }
    }
  }

  mkdirSync(destination, { recursive: true });
  cpSync(gameDir, join(destination, 'game'), { recursive: true });

  const shotsOut = join(destination, 'screenshots');
  mkdirSync(shotsOut, { recursive: true });
  if (existsSync(shotsIn)) cpSync(shotsIn, shotsOut, { recursive: true });

  const dossier = buildDossier(destination, DOSSIER_CAPS);
  writeFileSync(join(destination, 'dossier.json'), dossier);
  // buildDossier hands back raw bytes, so decode before inspecting them.
  const textBytes = JSON.parse(Buffer.from(dossier).toString('utf8')).text.length;
  const textNote =
    textBytes >= DOSSIER_CAPS.text_max_bytes
      ? ` — WARNING: dossier text hit the ${DOSSIER_CAPS.text_max_bytes}-byte cap`
      : ` (text ${textBytes}/${DOSSIER_CAPS.text_max_bytes} bytes)`;
  console.log(`Dustline handed in: ${destination} (dossier ${dossier.length} bytes)${textNote}`);
}

handIn();
