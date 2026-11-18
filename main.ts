// Dustline entrypoint (Node 22, standard library only): hands the game in by
// copying this directory's game/ and screenshots/ into the output folder and
// writing the dossier the judge reads, using the vendored make.fun helper.
//
// Run it directly:  node main.ts
// Local stand-in for the grader's /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

  mkdirSync(destination, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(destination, 'game'), { recursive: true });

  const shotsOut = join(destination, 'screenshots');
  mkdirSync(shotsOut, { recursive: true });
  const shotsIn = join(repoRoot, 'screenshots');
  if (existsSync(shotsIn)) cpSync(shotsIn, shotsOut, { recursive: true });

  const dossier = buildDossier(destination, DOSSIER_CAPS);
  writeFileSync(join(destination, 'dossier.json'), dossier);
  console.log(`Dustline handed in: ${destination} (dossier ${dossier.length} bytes)`);
}

handIn();
