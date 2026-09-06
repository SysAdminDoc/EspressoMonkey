#!/usr/bin/env node
// scripts/build-edge.mjs
//
// Microsoft Edge Add-ons package builder. Edge uses the same Chromium
// codebase as Chrome and accepts an unmodified Chrome MV3 manifest in the
// vast majority of cases, so this script:
//   1. Runs the standard esbuild pipeline (background.js + Monaco).
//   2. Stages the Chrome build into `build-edge/`.
//   3. Generates the Edge manifest from the shared declarative transform
//      profile in `manifest-firefox.transformations.json`.
//   4. Verifies every declared file is present.
//   5. Produces `edge-artifacts/scriptvault-edge-vX.Y.Z.zip` plus a parity
//      summary JSON.
//
// Edge submission checklist lives in docs/edge-submission.md. This script
// is the "build" half; the store-upload half stays manual until Microsoft
// Partner Center ships a stable CI API.
//
// Usage:
//   node scripts/build-edge.mjs             # full build + zip
//   node scripts/build-edge.mjs --no-zip    # stage only
//   node scripts/build-edge.mjs --check     # build, then assert parity report

import { execSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { existsSync, createWriteStream } from 'node:fs';
import { generateManifestForProfile } from './generate-manifest-firefox.mjs';

const ROOT = process.cwd();
const BUILD_DIR = join(ROOT, 'build-edge');
const ARTIFACT_DIR = join(ROOT, 'edge-artifacts');

const args = new Set(process.argv.slice(2));
const wantZip = !args.has('--no-zip');
const wantCheck = args.has('--check');
const EDGE_DOCS = {
  porting: 'https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension',
  publish: 'https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension',
  apiSupport: 'https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support',
  updateApi: 'https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api'
};

// Files + directories to package. Mirrors build.sh INCLUDE[] for Chrome —
// keep the two lists in sync (tests/package-page-assets.test.js gates both).
const INCLUDE = [
  'background.js',
  'content.js',
  'offscreen.html',
  'offscreen.js',
  'shared',
  'modules/find-script-sources.js',
  'modules/i18n.js',
  'modules/local-libraries.js',
  'modules/local-workspace-project.js',
  'modules/script-config.js',
  'modules/user-scripts-setup.js',
  'modules/userstyles.js',
  'pages',
  'images/icon16.png',
  'images/icon32.png',
  'images/icon48.png',
  'images/icon128.png',
  'lib/codemirror',
  'lib/monaco-esm',
  'lib/acorn.min.js',
  'lib/diff.min.js',
  'lib/fflate.js',
  'lib/scriptvault.d.ts',
  'managed-storage-schema.json',
  '_locales'
];

function log(msg) {
  process.stdout.write(`[build-edge] ${msg}\n`);
}

function toRepoPath(path) {
  return relative(ROOT, path).replace(/\\/g, '/');
}

async function copyRecursive(src, dest) {
  const info = await stat(src);
  if (info.isDirectory()) {
    await mkdir(dest, { recursive: true });
    for (const entry of await readdir(src)) {
      await copyRecursive(join(src, entry), join(dest, entry));
    }
  } else {
    await mkdir(dirname(dest), { recursive: true });
    const data = await readFile(src);
    await writeFile(dest, data);
  }
}

async function applyManifestTransforms() {
  const chromeManifestPath = join(ROOT, 'manifest.json');
  const chromeManifest = JSON.parse(await readFile(chromeManifestPath, 'utf8'));
  const before = `${JSON.stringify(chromeManifest, null, 2)}\n`;
  const result = await generateManifestForProfile({ profile: 'edge', rootDir: ROOT });
  const outPath = join(BUILD_DIR, 'manifest.json');
  await writeFile(outPath, result.text);
  return {
    changed: before !== result.text,
    manifest: result.manifest,
    transformsApplied: result.transformations
  };
}

async function verifyTree(declaredFiles) {
  const missing = [];
  for (const item of declaredFiles) {
    const path = join(BUILD_DIR, item);
    if (!existsSync(path)) missing.push(item);
  }
  return missing;
}

async function zipDir(srcDir, outPath) {
  // Prefer Windows bsdtar (tar.exe) which produces POSIX-slash entries
  // Chrome/Edge accept. Falls back to `zip` on POSIX systems.
  await rm(outPath, { force: true });
  if (process.platform === 'win32') {
    const tar = 'C:/Windows/System32/tar.exe';
    if (existsSync(tar)) {
      execSync(`"${tar}" -a -c -f "${outPath}" *`, { cwd: srcDir, stdio: 'inherit' });
      return;
    }
  }
  try {
    execSync(`zip -r "${outPath}" . -x "*.DS_Store" "*Thumbs.db"`, { cwd: srcDir, stdio: 'inherit' });
  } catch (err) {
    throw new Error('No zip tool available (need tar.exe on Windows or zip on POSIX).');
  }
}

async function main() {
  log('Building background.js + Monaco via esbuild…');
  execSync('node esbuild.config.mjs', { cwd: ROOT, stdio: 'inherit' });

  log('Staging Edge build directory…');
  await rm(BUILD_DIR, { recursive: true, force: true });
  await mkdir(BUILD_DIR, { recursive: true });
  for (const item of INCLUDE) {
    const src = join(ROOT, item);
    if (!existsSync(src)) {
      log(`  ! missing source: ${item}`);
      continue;
    }
    await copyRecursive(src, join(BUILD_DIR, item));
  }

  const transformResult = await applyManifestTransforms();
  log(`Manifest staged (transformed: ${transformResult.changed}).`);

  const declaredFiles = ['manifest.json', ...INCLUDE];
  const missing = await verifyTree(declaredFiles);
  if (missing.length > 0) {
    log(`Edge build is missing ${missing.length} declared file(s): ${missing.join(', ')}`);
    if (wantCheck) process.exit(1);
  }

  const version = transformResult.manifest.version;
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const zipName = `scriptvault-edge-v${version}.zip`;
  const zipPath = join(ARTIFACT_DIR, zipName);

  if (wantZip) {
    log(`Packaging ${zipName}…`);
    await zipDir(BUILD_DIR, zipPath);
    const size = (await stat(zipPath)).size;
    log(`Wrote ${zipName} (${(size / 1024).toFixed(1)} KB)`);
  } else {
    log('Skipping ZIP step (--no-zip).');
  }

  const summaryPath = join(ARTIFACT_DIR, `edge-build-${version}.json`);
  const summary = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    version,
    buildDir: toRepoPath(BUILD_DIR),
    artifact: wantZip ? toRepoPath(zipPath) : null,
    packageCommand: wantZip ? 'npm run build:edge:check' : 'npm run build:edge:stage',
    transformsApplied: transformResult.transformsApplied,
    manifestTransformed: transformResult.changed,
    missingFiles: missing,
    edgeReadiness: {
      chromeCompatibilityReviewed: true,
      updateUrlRemoved: !Object.prototype.hasOwnProperty.call(transformResult.manifest, 'update_url'),
      unsupportedApiReview: 'No Edge-specific unsupported APIs identified by the current manifest/package transform; API support remains reviewed through docs/edge-submission.md.',
      packageAutomation: 'Local package generation is automated by npm run build:edge:check.',
      initialPublication: 'Manual Partner Center upload remains required until a live Edge Add-ons listing exists.',
      updateAutomation: 'Microsoft Edge Add-ons REST update automation is deferred until listing identifiers and publisher credentials are provisioned.',
      browserSmoke: 'Dedicated local Edge sideload smoke is wired via npm run smoke:edge; release readiness requires a maintainer to run that command on Microsoft Edge.',
      browserSmokeCommand: 'npm run smoke:edge',
      browserSmokeEvidence: `edge-artifacts/edge-smoke-${version}.json`
    },
    reviewDeclarations: {
      privacyPolicy: 'PRIVACY.md',
      permissionsAndDataUse: 'docs/store-listing-copy.md',
      remoteCode: 'docs/cws-remote-code-compliance.md',
      edgeSubmission: 'docs/edge-submission.md',
      microsoftDocs: EDGE_DOCS
    }
  };
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));
  log('Edge build summary:');
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');

  if (wantCheck) {
    const failures = [];
    if (missing.length > 0) failures.push(`missing files: ${missing.join(', ')}`);
    if (wantZip && (!summary.artifact || !existsSync(zipPath))) failures.push(`missing Edge ZIP: ${toRepoPath(zipPath)}`);
    if (!existsSync(summaryPath)) failures.push(`missing Edge summary: ${toRepoPath(summaryPath)}`);
    if (!summary.edgeReadiness.updateUrlRemoved) failures.push('Edge manifest still contains update_url');
    if (failures.length > 0) {
      for (const failure of failures) log(`  ! ${failure}`);
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('[build-edge] Failed:', err?.stack || err?.message || err);
  process.exit(1);
});
