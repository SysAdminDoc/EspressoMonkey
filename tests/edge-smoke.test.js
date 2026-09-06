import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
const edgeSmoke = readFileSync(resolve(process.cwd(), 'scripts/smoke-edge-sideload.mjs'), 'utf8');
const edgeBuilder = readFileSync(resolve(process.cwd(), 'scripts/build-edge.mjs'), 'utf8');
const matrixGenerator = readFileSync(resolve(process.cwd(), 'scripts/generate-browser-support-matrix.mjs'), 'utf8');
const edgeSubmission = readFileSync(resolve(process.cwd(), 'docs/edge-submission.md'), 'utf8');
const edgeSmokeEvidence = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/audit/edge-smoke-3.11.0.json'), 'utf8'));

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function supportMatrixFixture({ smokeJson, smokeText } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'scriptvault-support-matrix-'));
  mkdirSync(resolve(dir, 'docs'), { recursive: true });
  mkdirSync(resolve(dir, 'edge-artifacts'), { recursive: true });
  writeFileSync(resolve(dir, 'README.md'), '# Fixture\n\n---\n\n## Permission and Privacy Review\n', 'utf8');
  writeFileSync(resolve(dir, 'docs/cross-browser-pipeline.md'), 'Smoke-test each on every release tag.\n', 'utf8');
  writeJson(resolve(dir, 'manifest.json'), {
    version: '3.18.0',
    minimum_chrome_version: '130',
  });
  writeJson(resolve(dir, 'manifest-firefox.json'), {
    version: '3.18.0',
    browser_specific_settings: {
      gecko: {
        strict_min_version: '140.0',
      },
    },
  });
  writeFileSync(resolve(dir, 'edge-artifacts/scriptvault-edge-v3.18.0.zip'), 'fixture zip', 'utf8');
  writeJson(resolve(dir, 'edge-artifacts/edge-build-3.18.0.json'), {
    version: '3.18.0',
    artifact: 'edge-artifacts/scriptvault-edge-v3.18.0.zip',
    generatedAt: '2026-07-09T12:00:00.000Z',
    packageCommand: 'npm run build:edge:check',
    missingFiles: [],
    edgeReadiness: {
      updateUrlRemoved: true,
      browserSmoke: 'Dedicated local Edge sideload smoke is wired via npm run smoke:edge; release readiness requires a maintainer to run that command on Microsoft Edge.',
      browserSmokeCommand: 'npm run smoke:edge',
      browserSmokeEvidence: 'edge-artifacts/edge-smoke-3.18.0.json',
      initialPublication: 'Manual Partner Center upload remains required until a live Edge Add-ons listing exists.',
      updateAutomation: 'Microsoft Edge Add-ons REST update automation is deferred until listing identifiers and publisher credentials are provisioned.',
    },
  });
  if (smokeJson) {
    writeJson(resolve(dir, 'edge-artifacts/edge-smoke-3.18.0.json'), smokeJson);
  } else if (typeof smokeText === 'string') {
    writeFileSync(resolve(dir, 'edge-artifacts/edge-smoke-3.18.0.json'), smokeText, 'utf8');
  }
  return dir;
}

function generateSupportMatrixFixture(options) {
  const dir = supportMatrixFixture(options);
  try {
    execFileSync(process.execPath, [
      resolve(process.cwd(), 'scripts/generate-browser-support-matrix.mjs'),
      '--date=2026-07-09',
    ], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return readFileSync(resolve(dir, 'README.md'), 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('Microsoft Edge sideload smoke wiring', () => {
  it('exposes a maintainer-runnable Edge smoke command', () => {
    expect(packageJson.scripts['smoke:edge']).toBe('node scripts/smoke-edge-sideload.mjs');
    expect(edgeSmoke).toContain('SCRIPT_VAULT_EDGE_PATH');
    expect(edgeSmoke).toContain('scripts/build-edge.mjs');
    expect(edgeSmoke).toContain('build-edge');
    expect(edgeSmoke).toContain('edge-smoke-${VERSION}.json');
  });

  it('loads the generated Edge package and exercises extension runtime paths', () => {
    expect(edgeSmoke).toContain('chromium.launchPersistentContext(userDataDir');
    expect(edgeSmoke).toContain('`--disable-extensions-except=${BUILD_DIR}`');
    expect(edgeSmoke).toContain('`--load-extension=${BUILD_DIR}`');
    expect(edgeSmoke).toContain('#itemAllowUserScripts');
    expect(edgeSmoke).toContain('#allow-user-scripts');
    expect(edgeSmoke).toContain('fluent-switch');
    expect(edgeSmoke).toContain('pages/dashboard.html');
    expect(edgeSmoke).toContain('pages/popup.html');
    expect(edgeSmoke).toContain('pages/install.html');
    expect(edgeSmoke).toContain("chrome.storage.local.set({ pendingInstall: payload })");
    expect(edgeSmoke).toContain("action: 'getExtensionStatus'");
    expect(edgeSmoke).toContain("action: 'saveScript'");
    expect(edgeSmoke).toContain("action: 'toggleScript'");
    expect(edgeSmoke).toContain('document.documentElement.dataset.scriptvaultBrowserSmoke');
    expect(edgeSmoke).toContain("args.has('--strict-console')");
    expect(edgeSmoke).toContain("error.type !== 'console.error'");
  });

  it('fails boundedly and cleans up the temporary Edge profile on hangs', () => {
    expect(edgeSmoke).toContain('SCRIPT_VAULT_EDGE_SMOKE_TIMEOUT_MS');
    expect(edgeSmoke).toContain('DEFAULT_SMOKE_TIMEOUT_MS');
    expect(edgeSmoke).toContain('abortHungSmoke');
    expect(edgeSmoke).toContain('killEdgeProfileProcesses');
    expect(edgeSmoke).toContain('activeUserDataDir');
    expect(edgeSmoke).toContain('timed out after ${SMOKE_TIMEOUT_MS}ms');
    expect(edgeSmoke).toContain('timeout: Math.min(SMOKE_TIMEOUT_MS, 60000)');
  });

  it('records Edge smoke evidence in the Edge readiness report and support matrix', () => {
    expect(packageJson.scripts['support:matrix']).toContain('npm run build:edge:check');
    expect(packageJson.scripts['support:matrix:check']).toContain('npm run build:edge:check');
    expect(edgeBuilder).toContain("browserSmokeCommand: 'npm run smoke:edge'");
    expect(edgeBuilder).toContain('browserSmokeEvidence: `edge-artifacts/edge-smoke-${version}.json`');
    expect(matrixGenerator).toContain('docs/audit/edge-smoke-${version}.json');
    expect(matrixGenerator).toContain('browserSmokePassed');
    expect(matrixGenerator).toContain('browserSmokeStatus');
    expect(matrixGenerator).toContain('browserSmokeCommand');
    expect(matrixGenerator).toContain('browserSmokeEvidence');
  });

  it('documents the Chromium milestone cadence and explicit support floor', () => {
    expect(matrixGenerator).toContain('14-day stable cadence at M153 (2026-09-08)');
    expect(matrixGenerator).toContain('about 26 milestones per year');
    expect(matrixGenerator).toContain('explicit milestone floor rather than a rolling last-N assumption');
  });

  it('renders distinct support-matrix wording for Edge smoke evidence states', () => {
    const missing = generateSupportMatrixFixture();
    expect(missing).toContain('local Edge smoke command is available but has no current evidence');
    expect(missing).toContain('Dedicated local Edge sideload smoke is wired via npm run smoke:edge');

    const failed = generateSupportMatrixFixture({
      smokeJson: {
        schemaVersion: 1,
        version: '3.18.0',
        generatedAt: '2026-07-08T10:00:00.000Z',
        status: 'failed',
        edgeVersion: 'Edg/130.0.0.0',
        failure: 'local target marker timed out',
      },
    });
    expect(failed).toContain('2026-07-08 Edge sideload smoke failed; package/report generated');
    expect(failed).toContain('Dedicated local Edge sideload smoke failed on 2026-07-08: local target marker timed out; rerun `npm run smoke:edge` before release');

    const unreadable = generateSupportMatrixFixture({ smokeText: '{not-json' });
    expect(unreadable).toContain('Edge sideload smoke evidence is unreadable');
    expect(unreadable).toContain('Dedicated local Edge sideload smoke evidence is unreadable at `edge-artifacts/edge-smoke-3.18.0.json`; rerun `npm run smoke:edge` before release');

    const stale = generateSupportMatrixFixture({
      smokeJson: {
        schemaVersion: 1,
        version: '3.17.0',
        generatedAt: '2026-07-08T10:00:00.000Z',
        status: 'passed',
        edgeVersion: 'Edg/130.0.0.0',
      },
    });
    expect(stale).toContain('Edge sideload smoke evidence is stale');
    expect(stale).toContain('artifact version 3.17.0 does not match manifest 3.18.0');

    const passed = generateSupportMatrixFixture({
      smokeJson: {
        schemaVersion: 1,
        version: '3.18.0',
        generatedAt: '2026-07-08T10:00:00.000Z',
        status: 'passed',
        edgeVersion: 'Edg/130.0.0.0',
      },
    });
    expect(passed).toContain('2026-07-08 Edge sideload smoke passed; package/report generated');
    expect(passed).toContain('Dedicated local Edge sideload smoke passed on Edg/130.0.0.0');
  });

  it('keeps committed Edge smoke evidence tied to a passing live run', () => {
    expect(edgeSmokeEvidence).toMatchObject({
      version: '3.11.0',
      status: 'passed',
      checks: {
        edgeUserScriptsToggle: { present: true, enabledAfter: true },
        dashboard: { title: 'ScriptVault Dashboard', manifestVersion: '3.11.0' },
        popup: { popupWidthOk: true, popupOverflowOk: true },
        scriptRoundTrip: {
          status: { userScriptsAvailable: true, setupState: 'available' },
          target: { ok: true, marker: 'ok' },
        },
      },
    });
    expect(edgeSmokeEvidence.edgeVersion).toMatch(/^Edg\//);
  });

  it('documents the local smoke without overstating Edge publication state', () => {
    expect(edgeSubmission).toContain('npm run smoke:edge');
    expect(edgeSubmission).toContain('edge-artifacts/edge-smoke-<version>.json');
    expect(edgeSubmission).toContain('--strict-console');
    expect(edgeSubmission).toContain('labels this as manual until a live listing exists');
  });
});
