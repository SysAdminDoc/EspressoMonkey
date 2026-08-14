// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPreflightPlan,
  EXTERNAL_RELEASE_CHECKS,
  parsePreflightArgs,
} from '../scripts/release-preflight.mjs';
import { runReleaseArtifactCheck } from '../scripts/check-release-artifacts.mjs';

const temporaryRoots = [];
const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version;

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'scriptvault-preflight-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('credential-free release preflight', () => {
  it('builds one ordered plan covering every release gate class', () => {
    const root = temporaryRoot();
    const artifactRoot = join(root, 'artifacts');
    const checks = buildPreflightPlan({ version, artifactRoot, buildRoot: join(root, 'build') });
    expect(checks.map((check) => check.id)).toEqual([
      'typescript-source-drift',
      'runtime-generation-drift',
      'unit-static-gates',
      'service-worker-boot',
      'host-permission-matrix',
      'dependency-audit',
      'locale-drift',
      'privacy-store-copy',
      'remote-code-policy',
      'fail-closed-e2e',
      'real-page-visual',
      'real-page-a11y',
      'chrome-package',
      'release-parity',
    ]);
    expect(checks.find((check) => check.id === 'chrome-package').env).toMatchObject({
      SCRIPTVAULT_ARTIFACT_ROOT: expect.any(String),
      SCRIPTVAULT_BUILD_ROOT: expect.any(String),
    });
    expect(checks.find((check) => check.id === 'dependency-audit').args.slice(-3)).toEqual([
      'audit', '--audit-level=critical', '--omit=optional',
    ]);
    expect(checks.find((check) => check.id === 'release-parity').args).toEqual(expect.arrayContaining([
      '--version', version, '--artifact-root', artifactRoot, '--require-artifact', '--allow-unreleased',
    ]));
  });

  it('keeps credential and live-store checks explicit but outside the local gate', () => {
    expect(EXTERNAL_RELEASE_CHECKS.map((check) => check.id)).toEqual([
      'cws-live-status',
      'public-release-parity',
      'store-publication-review',
    ]);
    expect(EXTERNAL_RELEASE_CHECKS.every((check) => check.status === 'not-run')).toBe(true);
    expect(EXTERNAL_RELEASE_CHECKS.find((check) => check.id === 'cws-live-status').requires).toContain('CWS_ACCESS_TOKEN');
  });

  it('parses explicit versions and report roots without accepting unknown flags', () => {
    expect(parsePreflightArgs(['--version', version, '--output-root', 'out', '--plan'])).toEqual({
      version,
      outputRoot: 'out',
      plan: true,
    });
    expect(() => parsePreflightArgs(['--skip-tests'])).toThrow('unknown release preflight option');
    expect(() => parsePreflightArgs(['--version'])).toThrow('--version requires a value');
  });

  it('selects exactly the requested package from an isolated artifact root', async () => {
    const artifactRoot = temporaryRoot();
    writeFileSync(join(artifactRoot, `ScriptVault-v${version}.zip`), 'current');
    const clean = await runReleaseArtifactCheck(
      ['node', 'check-release-artifacts', '--allow-unreleased', '--require-artifact'],
      { artifactRoot, version },
    );
    expect(clean.ok).toBe(true);
    expect(clean.artifact).toBe(join(artifactRoot, `ScriptVault-v${version}.zip`));

    writeFileSync(join(artifactRoot, 'ScriptVault-v0.0.0.zip'), 'stale');
    const stale = await runReleaseArtifactCheck(
      ['node', 'check-release-artifacts', '--allow-unreleased', '--require-artifact'],
      { artifactRoot, version },
    );
    expect(stale.ok).toBe(false);
    expect(stale.failures.join('\n')).toContain('isolated selection accepts only');
  });

  it('lets the Chrome packager redirect both staging and artifact output', () => {
    const buildScript = readFileSync(resolve('build.sh'), 'utf8');
    expect(buildScript).toContain('SCRIPTVAULT_BUILD_ROOT');
    expect(buildScript).toContain('SCRIPTVAULT_ARTIFACT_ROOT');
    expect(buildScript).toContain('ZIP_PATH="$ARTIFACT_ROOT/$ZIP_NAME"');
  });
});
