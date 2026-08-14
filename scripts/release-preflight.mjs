#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

function npmInvocation(args) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    return { command: process.execPath, args: [npmExecPath, ...args] };
  }
  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args };
}

function npmCheck(id, args, description) {
  return { id, ...npmInvocation(args), description };
}

function nodeCheck(id, args, description, extra = {}) {
  return { id, command: process.execPath, args, description, ...extra };
}

export function toBashPath(path) {
  const absolute = resolve(path).replace(/\\/g, '/');
  if (process.platform !== 'win32') return absolute;
  return absolute.replace(/^([A-Za-z]):/, (_match, drive) => `/${drive.toLowerCase()}`);
}

export function parsePreflightArgs(argv = process.argv.slice(2)) {
  const options = { version: '', outputRoot: '', plan: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan') {
      options.plan = true;
      continue;
    }
    if (arg === '--version' || arg === '--output-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      if (arg === '--version') options.version = value;
      if (arg === '--output-root') options.outputRoot = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown release preflight option: ${arg}`);
  }
  return options;
}

export function buildPreflightPlan({ version, artifactRoot, buildRoot }) {
  const packageEnvironment = {
    SCRIPTVAULT_ARTIFACT_ROOT: toBashPath(artifactRoot),
    SCRIPTVAULT_BUILD_ROOT: toBashPath(buildRoot),
  };
  return [
    nodeCheck('typescript-source-drift', ['scripts/check-ts-source-drift.mjs'], 'TypeScript/source authority drift'),
    nodeCheck('runtime-generation-drift', ['scripts/generate-ts-runtime-modules.mjs', '--check'], 'generated runtime byte drift'),
    npmCheck('unit-static-gates', ['run', 'check'], 'typecheck, static gates, and unit tests'),
    npmCheck('service-worker-boot', ['run', 'smoke:service-worker:check'], 'MV3 service-worker cold-start budget'),
    npmCheck('host-permission-matrix', ['run', 'host-permissions:matrix'], 'installed-profile host grants and userscript privileged flows'),
    npmCheck('dependency-audit', ['audit', '--audit-level=critical', '--omit=optional'], 'critical production dependency advisories; documented image-size exception'),
    npmCheck('locale-drift', ['run', 'locale:generate:check'], 'canonical locale and generated catalog drift'),
    npmCheck('privacy-store-copy', ['run', 'store-copy:check'], 'manifest, privacy, and store-copy parity'),
    npmCheck('remote-code-policy', ['run', 'cws:remote-code:check'], 'Chrome Web Store remote-code policy'),
    npmCheck('fail-closed-e2e', ['run', 'test:e2e:release'], 'real extension release E2E with capability skips forbidden'),
    npmCheck('real-page-visual', ['run', 'test:visual'], 'real-page browser visual regression suite'),
    npmCheck('real-page-a11y', ['run', 'test:a11y'], 'WCAG 2.2 AA real-page and state coverage'),
    nodeCheck('chrome-package', ['scripts/run-bash.mjs', 'build.sh'], 'isolated Chrome release package', { env: packageEnvironment }),
    nodeCheck('release-parity', [
      'scripts/check-release-artifacts.mjs',
      '--version', version,
      '--artifact-root', artifactRoot,
      '--require-artifact',
      '--allow-unreleased',
    ], 'version, changelog, tag, and isolated artifact parity'),
  ];
}

export const EXTERNAL_RELEASE_CHECKS = [
  {
    id: 'cws-live-status',
    status: 'not-run',
    command: 'npm run release:store-status -- --require-live',
    requires: ['PUBLISHER_ID', 'EXTENSION_ID', 'CWS_ACCESS_TOKEN'],
    reason: 'requires maintainer-provided Chrome Web Store credentials and live store state',
  },
  {
    id: 'public-release-parity',
    status: 'not-run',
    command: 'npm run release:check:public',
    requires: ['signed release tag', 'published GitHub Release'],
    reason: 'runs after the signed tag and public release assets exist',
  },
  {
    id: 'store-publication-review',
    status: 'not-run',
    command: 'Chrome Web Store, AMO, and Edge Partner Center review',
    requires: ['maintainer store accounts', 'store review completion'],
    reason: 'store submission, approval, rollout, and rollback availability are external live-state checks',
  },
];

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function displayCommand(check) {
  return [check.command, ...check.args].map((part) => String(part).includes(' ') ? JSON.stringify(part) : part).join(' ');
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function collectArtifacts(artifactRoot, version) {
  if (!existsSync(artifactRoot)) return [];
  const expected = `ScriptVault-v${version}.zip`;
  const entries = await readdir(artifactRoot);
  const selected = entries.filter((name) => name === expected);
  const artifacts = [];
  for (const name of selected) {
    const path = join(artifactRoot, name);
    const info = await stat(path);
    artifacts.push({ name, path, bytes: info.size, sha256: await sha256(path) });
  }
  return artifacts;
}

async function runCheck(check, { root, logRoot }) {
  const startedAt = new Date();
  const logPath = join(logRoot, `${check.id}.log`);
  const log = createWriteStream(logPath, { encoding: 'utf8' });
  process.stdout.write(`\n[release-preflight] START ${check.id}: ${check.description}\n`);
  process.stdout.write(`[release-preflight] $ ${displayCommand(check)}\n`);

  const exitCode = await new Promise((resolveExit) => {
    const child = spawn(check.command, check.args, {
      cwd: root,
      env: { ...process.env, ...(check.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      log.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      log.write(chunk);
    });
    child.on('error', (error) => {
      const message = `${error.stack || error.message || error}\n`;
      process.stderr.write(message);
      log.write(message);
      resolveExit(1);
    });
    child.on('close', (code) => resolveExit(code ?? 1));
  });
  await new Promise((resolveClose) => log.end(resolveClose));

  const completedAt = new Date();
  const status = exitCode === 0 ? 'passed' : 'failed';
  process.stdout.write(`[release-preflight] ${status.toUpperCase()} ${check.id} (${completedAt.getTime() - startedAt.getTime()} ms)\n`);
  return {
    id: check.id,
    description: check.description,
    command: displayCommand(check),
    status,
    exitCode,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    logPath,
  };
}

async function writeReport(path, report) {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function runReleasePreflight(options = {}) {
  const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const version = options.version || packageJson.version;
  if (version !== packageJson.version) {
    throw new Error(`requested version ${version} does not match package.json ${packageJson.version}`);
  }

  const generatedAt = new Date();
  const outputRoot = resolve(projectRoot, options.outputRoot || 'release-artifacts');
  const runRoot = join(outputRoot, `preflight-${version}-${safeTimestamp(generatedAt)}`);
  const artifactRoot = join(runRoot, 'artifacts');
  const buildRoot = join(runRoot, 'chrome-build');
  const logRoot = join(runRoot, 'logs');
  const reportPath = join(runRoot, 'preflight-result.json');
  const checks = buildPreflightPlan({ version, artifactRoot, buildRoot });

  if (options.plan) {
    return { version, runRoot, artifactRoot, checks, externalChecks: EXTERNAL_RELEASE_CHECKS };
  }

  await mkdir(artifactRoot, { recursive: true });
  await mkdir(logRoot, { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    completedAt: null,
    status: 'running',
    requestedVersion: version,
    runRoot,
    artifactRoot,
    reportPath,
    checks: [],
    artifacts: [],
    externalChecks: EXTERNAL_RELEASE_CHECKS,
  };
  await writeReport(reportPath, report);

  for (const check of checks) {
    report.checks.push(await runCheck(check, { root: projectRoot, logRoot }));
    await writeReport(reportPath, report);
  }

  report.artifacts = await collectArtifacts(artifactRoot, version);
  report.completedAt = new Date().toISOString();
  report.status = report.checks.every((check) => check.status === 'passed') && report.artifacts.length === 1
    ? 'passed'
    : 'failed';
  await writeReport(reportPath, report);

  process.stdout.write(`\n[release-preflight] ${report.status.toUpperCase()}\n`);
  process.stdout.write(`[release-preflight] machine report: ${relative(projectRoot, reportPath).replace(/\\/g, '/')}\n`);
  process.stdout.write(`[release-preflight] artifact root: ${relative(projectRoot, artifactRoot).replace(/\\/g, '/')}\n`);
  process.stdout.write('[release-preflight] credential/live-store checks remain listed under externalChecks.\n');
  return report;
}

async function main() {
  const options = parsePreflightArgs();
  const result = await runReleasePreflight(options);
  if (options.plan) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (result.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[release-preflight] ${error.stack || error.message || error}`);
    process.exitCode = 2;
  });
}
