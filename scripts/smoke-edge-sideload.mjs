#!/usr/bin/env node
// scripts/smoke-edge-sideload.mjs
//
// Deterministic Microsoft Edge sideload smoke for the generated Edge package.
// The script builds/stages the Edge artifact, loads build-edge/ into Edge,
// exercises extension pages, saves/toggles a userscript, verifies it runs on a
// local target page, and writes ignored release evidence under edge-artifacts/.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { closeBrowserWithFallback, removeTempProfileDir } from './browser-smoke-utils.mjs';

const ROOT = process.cwd();
const BUILD_DIR = resolve(ROOT, 'build-edge');
const ARTIFACT_DIR = resolve(ROOT, 'edge-artifacts');
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));
const VERSION = MANIFEST.version;
const EDGE_REPORT_PATH = resolve(ARTIFACT_DIR, `edge-build-${VERSION}.json`);
const SMOKE_BROWSER_ID = String(process.env.SCRIPT_VAULT_SMOKE_BROWSER_ID || 'edge').trim().toLowerCase();
const SMOKE_BROWSER_NAME = String(process.env.SCRIPT_VAULT_SMOKE_BROWSER_NAME || 'Microsoft Edge').trim();
const SMOKE_INTERNAL_SCHEME = String(process.env.SCRIPT_VAULT_SMOKE_INTERNAL_SCHEME || 'edge').trim().toLowerCase();
const SMOKE_EVIDENCE_PATH = resolve(
  process.env.SCRIPT_VAULT_SMOKE_EVIDENCE_PATH || resolve(ARTIFACT_DIR, `edge-smoke-${VERSION}.json`),
);
const SMOKE_PROFILE_PREFIX = `scriptvault-${SMOKE_BROWSER_ID.replace(/[^a-z0-9_-]+/g, '-')}-smoke-`;
const args = new Set(process.argv.slice(2));
const DEFAULT_SMOKE_TIMEOUT_MS = 180000;
const configuredSmokeTimeoutMs = Number.parseInt(
  process.env.SCRIPT_VAULT_EDGE_SMOKE_TIMEOUT_MS || String(DEFAULT_SMOKE_TIMEOUT_MS),
  10,
);
const SMOKE_TIMEOUT_MS = Number.isFinite(configuredSmokeTimeoutMs) && configuredSmokeTimeoutMs > 0
  ? configuredSmokeTimeoutMs
  : DEFAULT_SMOKE_TIMEOUT_MS;
let activeBrowser = null;
let activeUserDataDir = '';
let activeExecutableName = SMOKE_BROWSER_ID === 'edge' ? 'msedge.exe' : '';
let hardTimeout = null;

function fail(message) {
  throw new Error(`[${SMOKE_BROWSER_ID}-smoke] ${message}`);
}

function edgeCandidates() {
  const envPaths = [
    process.env.SCRIPT_VAULT_EDGE_PATH,
    process.env.EDGE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ].filter(Boolean);

  if (process.platform === 'win32') {
    return [
      ...envPaths,
      join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }

  if (process.platform === 'darwin') {
    return [
      ...envPaths,
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }

  return [
    ...envPaths,
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/opt/microsoft/msedge/msedge',
  ];
}

function findEdgeExecutable() {
  const executable = edgeCandidates().find(candidate => candidate && existsSync(candidate));
  if (!executable) {
    fail(`${SMOKE_BROWSER_NAME} executable not found. Set SCRIPT_VAULT_EDGE_PATH or EDGE_PATH.`);
  }
  return executable;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function killEdgeProfileProcesses(profileDir) {
  if (!profileDir) return;
  try {
    if (process.platform === 'win32') {
      const escapedProfileDir = profileDir.replace(/'/g, "''");
      execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${activeExecutableName.replace(/'/g, "''")}' -and $_.CommandLine -like '*${escapedProfileDir}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ], { stdio: 'ignore', timeout: 10000 });
      return;
    }
    execFileSync('pkill', ['-f', profileDir], { stdio: 'ignore', timeout: 10000 });
  } catch {
    // Best-effort cleanup only; the normal browser close path already ran or will run.
  }
}

async function abortHungSmoke() {
  console.error(`[${SMOKE_BROWSER_ID}-smoke] timed out after ${SMOKE_TIMEOUT_MS}ms; cleaning up the temporary ${SMOKE_BROWSER_NAME} profile.`);
  await closeBrowserWithFallback(activeBrowser, `${SMOKE_BROWSER_NAME} smoke timeout`);
  killEdgeProfileProcesses(activeUserDataDir);
  await removeTempProfileDir(activeUserDataDir, `${SMOKE_BROWSER_NAME} smoke timeout`);
  process.exit(1);
}

function startHardTimeout() {
  if (Number.isFinite(SMOKE_TIMEOUT_MS) && SMOKE_TIMEOUT_MS > 0) {
    hardTimeout = setTimeout(() => {
      abortHungSmoke().catch(error => {
        console.error(error?.stack || error?.message || error);
        process.exit(1);
      });
    }, SMOKE_TIMEOUT_MS);
  }
}

function clearHardTimeout() {
  if (hardTimeout) clearTimeout(hardTimeout);
}

function assertEdgePackageReady(report) {
  const failures = [];
  if (!existsSync(BUILD_DIR)) failures.push('build-edge/ is missing');
  if (!existsSync(EDGE_REPORT_PATH)) failures.push(`missing ${EDGE_REPORT_PATH}`);
  if (report.version !== VERSION) failures.push(`report version ${report.version || '<missing>'} does not match manifest ${VERSION}`);
  if (Array.isArray(report.missingFiles) && report.missingFiles.length > 0) {
    failures.push(`report has missing files: ${report.missingFiles.join(', ')}`);
  }
  if (!report.artifact || !existsSync(resolve(ROOT, report.artifact))) {
    failures.push(`missing Edge ZIP: ${report.artifact || '<missing>'}`);
  }
  if (report.edgeReadiness?.updateUrlRemoved !== true) {
    failures.push('Edge report did not verify update_url removal');
  }
  if (failures.length > 0) fail(failures.join('; '));
}

function buildEdgePackageIfNeeded() {
  if (args.has('--skip-build')) return;
  execFileSync(process.execPath, ['scripts/build-edge.mjs', '--check'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

async function smokePageServer() {
  const server = createServer((req, res) => {
    if (req.url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(`<!doctype html>
      <html>
        <head><title>ScriptVault browser smoke target</title></head>
        <body><main id="target">Browser smoke target</main></body>
      </html>`);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}/smoke-target`,
    close: () => new Promise(resolveClose => {
      server.close(resolveClose);
      server.closeAllConnections?.();
    }),
  };
}

async function findExtensionId(context) {
  const isScriptVaultWorker = worker => (
    worker.url().startsWith('chrome-extension://')
    && worker.url().endsWith('/background.js')
  );
  const existing = context.serviceWorkers().find(isScriptVaultWorker);
  const worker = existing || await context.waitForEvent('serviceworker', {
    predicate: isScriptVaultWorker,
    timeout: 20000,
  });
  const [, extensionId] = worker.url().match(/^chrome-extension:\/\/([^/]+)/) || [];
  if (!extensionId) fail(`Could not resolve extension id from service worker URL: ${worker.url()}`);
  return extensionId;
}

function attachWorkerLogging(worker, errors, seenWorkers) {
  if (seenWorkers.has(worker)) return;
  seenWorkers.add(worker);
  const url = worker.url();
  if (!url.startsWith('chrome-extension://')) return;
  worker.on('console', message => {
    if (message.type() !== 'error') return;
    errors.push({
      scope: `service_worker:${url}`,
      type: 'console.error',
      text: message.text(),
      location: message.location(),
    });
  });
}

function attachPageLogging(page, errors, scope) {
  page.on('pageerror', error => {
    errors.push({ scope, type: 'pageerror', text: error?.message || String(error) });
  });
  page.on('console', message => {
    if (message.type() !== 'error') return;
    errors.push({
      scope,
      type: 'console.error',
      text: message.text(),
      location: message.location(),
    });
  });
}

async function runtimeMessage(page, message, timeout = 60000) {
  page.setDefaultTimeout(timeout);
  return await page.evaluate(msg => chrome.runtime.sendMessage(msg).catch(error => ({ error: String(error) })), message);
}

async function openDashboard(browser, extensionId, errors) {
  const page = await browser.newPage();
  attachPageLogging(page, errors, 'dashboard');
  await page.goto(`chrome-extension://${extensionId}/pages/dashboard.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 25000,
  });
  await page.waitForSelector('#scriptsPanel.tm-panel.active', { timeout: 20000 });
  await page.waitForSelector('.tm-tab[data-tab="scripts"]', { state: 'attached', timeout: 20000 });

  return {
    page,
    snapshot: await page.evaluate(() => ({
      title: document.title,
      manifestVersion: chrome.runtime.getManifest().version,
      activeTab: document.querySelector('.tm-tab[data-tab="scripts"]')?.textContent?.trim() || '',
      selectedTab: document.querySelector('.tm-tab[data-tab="scripts"]')?.getAttribute('aria-selected') || '',
      hasNewScriptButton: !!document.querySelector('#btnNewScript'),
      hasSearch: !!document.querySelector('#scriptSearch'),
      setupBannerState: document.querySelector('[data-setup-state]')?.getAttribute('data-setup-state') || '',
    })),
  };
}

async function enableUserScriptsToggle(browser, extensionId) {
  const page = await browser.newPage();
  try {
    await page.goto(`${SMOKE_INTERNAL_SCHEME}://extensions/?id=${extensionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    const readToggle = () => page.evaluate(() => {
      const findControl = root => {
        const direct = root.querySelector?.('#itemAllowUserScripts');
        if (direct) return direct;
        const row = root.querySelector?.('#allow-user-scripts');
        if (row) {
          return row.shadowRoot?.querySelector('#crToggle')
            || row.querySelector?.('#crToggle')
            || row;
        }
        const edgeRow = [...(root.querySelectorAll?.('standard-row') || [])]
          .find(element => /Allow User Scripts/i.test(element.textContent || ''));
        if (edgeRow) {
          const findSwitch = switchRoot => {
            const directSwitch = switchRoot.querySelector?.('fluent-switch');
            if (directSwitch) return directSwitch;
            for (const element of switchRoot.querySelectorAll?.('*') || []) {
              if (!element.shadowRoot) continue;
              const nestedSwitch = findSwitch(element.shadowRoot);
              if (nestedSwitch) return nestedSwitch;
            }
            return null;
          };
          const edgeSwitch = findSwitch(edgeRow) || (edgeRow.shadowRoot ? findSwitch(edgeRow.shadowRoot) : null);
          if (edgeSwitch) return edgeSwitch;
        }
        for (const element of root.querySelectorAll?.('*') || []) {
          if (!element.shadowRoot) continue;
          const nested = findControl(element.shadowRoot);
          if (nested) return nested;
        }
        return null;
      };
      const control = findControl(document);
      return control ? { present: true, checked: control.checked === true } : { present: false, checked: false };
    });
    const clickToggle = async () => {
      const handle = await page.evaluateHandle(() => {
        const findControl = root => {
          const direct = root.querySelector?.('#itemAllowUserScripts');
          if (direct) return direct;
          const row = root.querySelector?.('#allow-user-scripts');
          if (row) {
            return row.shadowRoot?.querySelector('#crToggle')
              || row.querySelector?.('#crToggle')
              || row;
          }
          const edgeRow = [...(root.querySelectorAll?.('standard-row') || [])]
            .find(element => /Allow User Scripts/i.test(element.textContent || ''));
          if (edgeRow) {
            const findSwitch = switchRoot => {
              const directSwitch = switchRoot.querySelector?.('fluent-switch');
              if (directSwitch) return directSwitch;
              for (const element of switchRoot.querySelectorAll?.('*') || []) {
                if (!element.shadowRoot) continue;
                const nestedSwitch = findSwitch(element.shadowRoot);
                if (nestedSwitch) return nestedSwitch;
              }
              return null;
            };
            const edgeSwitch = findSwitch(edgeRow) || (edgeRow.shadowRoot ? findSwitch(edgeRow.shadowRoot) : null);
            if (edgeSwitch) return edgeSwitch;
          }
          for (const element of root.querySelectorAll?.('*') || []) {
            if (!element.shadowRoot) continue;
            const nested = findControl(element.shadowRoot);
            if (nested) return nested;
          }
          return null;
        };
        return findControl(document);
      });
      const element = handle.asElement();
      if (!element) {
        await handle.dispose();
        return false;
      }
      try {
        await element.click();
        return true;
      } finally {
        await handle.dispose();
      }
    };

    let toggle = { present: false, checked: false };
    const deadline = Date.now() + 10000;
    while (!toggle.present && Date.now() < deadline) {
      toggle = await readToggle();
      if (!toggle.present) await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
    }
    if (!toggle.present) {
      return {
        present: false,
        enabledBefore: null,
        enabledAfter: null,
        note: `${SMOKE_BROWSER_NAME} did not expose an Allow User Scripts toggle on the extension details page.`,
      };
    }

    const enabledBefore = toggle.checked;
    if (!enabledBefore) {
      await clickToggle();
      const enabledDeadline = Date.now() + 10000;
      do {
        toggle = await readToggle();
        if (!toggle.checked) await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
      } while (!toggle.checked && Date.now() < enabledDeadline);
    }
    const enabledAfter = toggle.checked;
    if (!enabledAfter) {
      fail(`Allow User Scripts toggle did not stay enabled in ${SMOKE_BROWSER_NAME}`);
    }
    return {
      present: true,
      enabledBefore,
      enabledAfter,
      note: enabledBefore
        ? `Allow User Scripts was already enabled in the temporary ${SMOKE_BROWSER_NAME} profile.`
        : `Allow User Scripts was enabled through ${SMOKE_INTERNAL_SCHEME}://extensions in the temporary ${SMOKE_BROWSER_NAME} profile.`,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function openPopup(browser, extensionId, errors) {
  const page = await browser.newPage();
  attachPageLogging(page, errors, 'popup');
  await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForSelector('body', { timeout: 10000 });
  return await page.evaluate(() => {
    const rect = document.body.getBoundingClientRect();
    return {
      title: document.title,
      bodyText: document.body.innerText.slice(0, 300),
      hasActionButton: !!document.querySelector('button, [role="button"]'),
      popupWidthOk: Math.round(rect.width) === 360,
      popupOverflowOk: document.body.scrollWidth <= Math.ceil(rect.width),
      bodyWidth: rect.width,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
}

function smokeScriptCode() {
  return `// ==UserScript==\n// @name ScriptVault ${SMOKE_BROWSER_NAME} Smoke\n// @namespace scriptvault/smoke\n// @version 1.0.0\n// @match http://127.0.0.1/*\n// @grant none\n// ==/UserScript==\n\ndocument.documentElement.dataset.scriptvaultBrowserSmoke = 'ok';\n`;
}

async function openInstallReview(browser, extensionId, dashboardPage, errors) {
  const code = smokeScriptCode();
  await dashboardPage.evaluate(async payload => {
    await chrome.storage.local.set({ pendingInstall: payload });
  }, {
    code,
    url: `https://example.com/${SMOKE_BROWSER_ID}-smoke.user.js`,
    timestamp: Date.now(),
  });

  const page = await browser.newPage();
  attachPageLogging(page, errors, 'install-review');
  try {
    await page.goto(`chrome-extension://${extensionId}/pages/install.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.waitForSelector('#btn-install', { timeout: 20000 });
    await page.waitForSelector('#reviewSummary', { timeout: 20000 });
    await page.waitForFunction(browserName => (
      document.body.innerText.includes(`ScriptVault ${browserName} Smoke`)
      || !!document.querySelector('.install-terminal.error')
    ), SMOKE_BROWSER_NAME, { timeout: 10000 });
    const snapshot = await page.evaluate(browserName => ({
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim() || '',
      installAction: document.querySelector('#btn-install')?.textContent?.trim() || '',
      hasReviewSummary: !!document.querySelector('#reviewSummary'),
      hasCodeReview: !!document.querySelector('#reviewCode'),
      hasExpectedScript: document.body.innerText.includes(`ScriptVault ${browserName} Smoke`),
      hasTerminalError: !!document.querySelector('.install-terminal.error'),
    }), SMOKE_BROWSER_NAME);
    if (snapshot.title !== 'Install Userscript - ScriptVault') fail(`unexpected install review title: ${snapshot.title}`);
    if (!snapshot.hasReviewSummary || !snapshot.hasCodeReview || !snapshot.hasExpectedScript) {
      fail('install review did not render the expected script details and code review');
    }
    if (snapshot.hasTerminalError) fail('install review rendered a terminal error for the smoke script');
    return snapshot;
  } finally {
    await dashboardPage.evaluate(() => chrome.storage.local.remove('pendingInstall')).catch(() => {});
    await page.close().catch(() => {});
  }
}

async function scriptRoundTrip(browser, dashboardPage) {
  const status = await runtimeMessage(dashboardPage, { action: 'getExtensionStatus' });
  if (status?.error) fail(`getExtensionStatus failed: ${status.error}`);
  if (!status?.userScriptsAvailable) {
    fail(`userScripts unavailable: ${status?.setupState || status?.setupMessage || JSON.stringify(status)}`);
  }

  const scriptId = `scriptvault_${SMOKE_BROWSER_ID}_smoke`;
  const code = smokeScriptCode();

  const save = await runtimeMessage(dashboardPage, {
    action: 'saveScript',
    id: scriptId,
    code,
    enabled: true,
  });
  if (save?.error || !save?.success) fail(`saveScript failed: ${save?.error || JSON.stringify(save)}`);

  const list = await runtimeMessage(dashboardPage, { action: 'getScripts' });
  if (list?.error) fail(`getScripts failed: ${list.error}`);
  const saved = (list?.scripts || []).find(script => script.id === scriptId);
  if (!saved) fail(`Saved ${SMOKE_BROWSER_NAME} smoke script was not returned by getScripts`);

  const disabled = await runtimeMessage(dashboardPage, {
    action: 'toggleScript',
    scriptId,
    enabled: false,
  });
  if (disabled?.error || !disabled?.success) fail(`toggle off failed: ${disabled?.error || JSON.stringify(disabled)}`);

  const enabled = await runtimeMessage(dashboardPage, {
    action: 'toggleScript',
    scriptId,
    enabled: true,
  });
  if (enabled?.error || !enabled?.success) fail(`toggle on failed: ${enabled?.error || JSON.stringify(enabled)}`);

  const target = await smokePageServer();
  const targetPage = await browser.newPage();
  try {
    await targetPage.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await targetPage.waitForFunction(
      () => document.documentElement.dataset.scriptvaultBrowserSmoke === 'ok',
      undefined,
      { timeout: 15000 },
    );
    const runResult = await targetPage.evaluate(() => ({
      ok: document.documentElement.dataset.scriptvaultBrowserSmoke === 'ok',
      marker: document.documentElement.dataset.scriptvaultBrowserSmoke || '',
      title: document.title,
      url: location.href,
    }));

    return {
      status,
      savedScript: {
        id: saved.id,
        name: saved.meta?.name || '',
        enabledAfterSave: saved.enabled !== false,
      },
      toggle: {
        disabled: disabled.script?.enabled === false,
        enabled: enabled.script?.enabled === true,
      },
      target: runResult,
    };
  } finally {
    await targetPage.close().catch(() => {});
    await target.close();
  }
}

async function writeEvidence(evidence) {
  await mkdir(dirname(SMOKE_EVIDENCE_PATH), { recursive: true });
  await writeFile(SMOKE_EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function main() {
  const startedAt = Date.now();
  const logPhase = phase => console.log(
    `[${SMOKE_BROWSER_ID}-smoke] ${phase} (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`,
  );
  buildEdgePackageIfNeeded();
  logPhase('package ready');
  const edgeReport = readJson(EDGE_REPORT_PATH);
  assertEdgePackageReady(edgeReport);

  const executablePath = findEdgeExecutable();
  activeExecutableName = basename(executablePath);
  const userDataDir = await mkdtemp(join(tmpdir(), SMOKE_PROFILE_PREFIX));
  activeUserDataDir = userDataDir;
  const extensionErrors = [];
  const seenWorkers = new WeakSet();
  let browser;
  let evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    version: VERSION,
    status: 'failed',
    browserId: SMOKE_BROWSER_ID,
    browserName: SMOKE_BROWSER_NAME,
    browserExecutable: executablePath,
    edgeExecutable: executablePath,
    buildReport: {
      path: `edge-artifacts/edge-build-${VERSION}.json`,
      generatedAt: edgeReport.generatedAt,
      artifact: edgeReport.artifact,
      manifestTransformed: edgeReport.manifestTransformed,
    },
    checks: {},
    extensionErrors,
  };

  try {
    browser = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: args.has('--headed') ? false : true,
      timeout: Math.min(SMOKE_TIMEOUT_MS, 60000),
      args: [
        `--disable-extensions-except=${BUILD_DIR}`,
        `--load-extension=${BUILD_DIR}`,
        '--disable-dev-shm-usage',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-sandbox',
      ],
    });
    activeBrowser = browser;
    logPhase('browser launched');

    browser.on('page', page => {
      attachPageLogging(page, extensionErrors, `page:${page.url() || '<pending>'}`);
    });
    browser.on('serviceworker', worker => attachWorkerLogging(worker, extensionErrors, seenWorkers));
    browser.on('weberror', webError => {
      const page = webError.page();
      const url = page?.url() || '';
      if (!url.startsWith('chrome-extension://')) return;
      extensionErrors.push({
        scope: `page:${url}`,
        type: 'pageerror',
        text: webError.error()?.message || String(webError.error()),
      });
    });
    browser.pages().forEach(page => attachPageLogging(page, extensionErrors, `page:${page.url() || '<pending>'}`));
    browser.serviceWorkers().forEach(worker => attachWorkerLogging(worker, extensionErrors, seenWorkers));

    evidence.browserVersion = browser.browser()?.version() || 'unknown';
    evidence.edgeVersion = evidence.browserVersion;
    const extensionId = await findExtensionId(browser);
    evidence.extensionId = extensionId;
    logPhase('extension target ready');
    evidence.checks.edgeUserScriptsToggle = await enableUserScriptsToggle(browser, extensionId);
    logPhase('user scripts gate ready');

    const dashboard = await openDashboard(browser, extensionId, extensionErrors);
    evidence.checks.dashboard = dashboard.snapshot;
    if (dashboard.snapshot.title !== 'ScriptVault Dashboard') fail(`unexpected dashboard title: ${dashboard.snapshot.title}`);
    if (dashboard.snapshot.manifestVersion !== VERSION) fail(`dashboard manifest version ${dashboard.snapshot.manifestVersion} does not match ${VERSION}`);
    if (!/^(scripts|installed userscripts)$/i.test(dashboard.snapshot.activeTab)) fail(`unexpected dashboard active tab: ${dashboard.snapshot.activeTab}`);
    if (dashboard.snapshot.selectedTab !== 'true') fail('dashboard installed scripts tab is not selected');
    if (!dashboard.snapshot.hasNewScriptButton || !dashboard.snapshot.hasSearch) fail('dashboard missing script controls');
    logPhase('dashboard verified');

    const popup = await openPopup(browser, extensionId, extensionErrors);
    evidence.checks.popup = popup;
    if (!popup.hasActionButton) fail('popup did not render any action buttons');
    if (!popup.popupWidthOk || !popup.popupOverflowOk) {
      fail(`popup layout overflow: width=${popup.bodyWidth}, scrollWidth=${popup.bodyScrollWidth}`);
    }
    logPhase('popup verified');

    evidence.checks.installReview = await openInstallReview(browser, extensionId, dashboard.page, extensionErrors);
    logPhase('install review verified');
    evidence.checks.scriptRoundTrip = await scriptRoundTrip(browser, dashboard.page);
    if (!evidence.checks.scriptRoundTrip.target?.ok) fail(`${SMOKE_BROWSER_NAME} smoke userscript did not run on the local target page`);
    logPhase('userscript round trip verified');

    const fatalErrors = extensionErrors.filter(error => error.type !== 'console.error');
    if (fatalErrors.length > 0) {
      fail(`captured ${fatalErrors.length} extension runtime exception(s)`);
    }
    if (args.has('--strict-console') && extensionErrors.length > 0) {
      fail(`captured ${extensionErrors.length} extension console/runtime error(s)`);
    }

    evidence.status = 'passed';
    await writeEvidence(evidence);
    logPhase('evidence written');
    console.log(`${SMOKE_BROWSER_NAME} sideload smoke passed for ScriptVault ${VERSION} (${extensionId}).`);
    console.log(`Evidence: ${SMOKE_EVIDENCE_PATH}`);
  } catch (error) {
    evidence.failure = error?.message || String(error);
    await writeEvidence(evidence);
    throw error;
  } finally {
    await closeBrowserWithFallback(browser, `${SMOKE_BROWSER_NAME} smoke`);
    activeBrowser = null;
    logPhase('browser closed');
    await removeTempProfileDir(userDataDir, `${SMOKE_BROWSER_NAME} smoke`);
    activeUserDataDir = '';
    logPhase('temporary profile removed');
  }
}

startHardTimeout();
main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}).finally(() => {
  clearHardTimeout();
});
