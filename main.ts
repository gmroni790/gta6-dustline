// Dustline hands itself in. The grader runs this file on Node 22: it
// gathers the static game and the screenshots into the output folder, then
// asks the vendored make.fun helper to write dossier.json, the summary the
// judge reads. To see the same output locally, point MAKEFUN_OUTPUT_DIR at
// a scratch folder first, e.g. MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync as copyTree, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { fileURLToPath as urlToPath } from 'node:url';
import { buildDossier as makeDossier } from './vendor/makefun-game.ts';

const rootDir = urlToPath(new URL('./', import.meta.url));
const targetDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function mirrorFolder(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  copyTree(source, target, { recursive: true });
}

mirrorFolder(joinPath(rootDir, 'game'), joinPath(targetDir, 'game'));
if (existsSync(joinPath(rootDir, 'screenshots'))) {
  mirrorFolder(joinPath(rootDir, 'screenshots'), joinPath(targetDir, 'screenshots'));
}

// The scorer's caps for this bounty: the dossier text stays under 163840
// bytes, at most 4 screenshots of 256 KiB each, and game/ stays under 993
// files, 48 MiB in all, with no path longer than 1000 bytes.
const limits = { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648, game_path_max_bytes: 1000 };
const dossierText = makeDossier(targetDir, limits);
writeFileSync(joinPath(targetDir, 'dossier.json'), dossierText);
console.log('Dustline dossier written to ' + targetDir);
