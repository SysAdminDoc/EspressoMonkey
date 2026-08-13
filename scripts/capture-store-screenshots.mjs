#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import {
  closeBrowserWithFallback,
  removeTempProfileDir,
  settleWhatsNew,
} from './browser-smoke-utils.mjs';

const extensionPath = resolve(process.cwd());
const screenshotDir = join(extensionPath, 'assets', 'screenshots');

function chromeCandidates() {
  const envPaths = [
    process.env.SCRIPT_VAULT_CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
  ].filter(Boolean);

  if (process.platform === 'win32') {
    return [
      ...envPaths,
      join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
  }

  if (process.platform === 'darwin') {
    return [
      ...envPaths,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];
  }

  return [
    ...envPaths,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ];
}

function findChromeExecutable() {
  const executable = chromeCandidates().find(c => c && existsSync(c));
  if (!executable) {
    throw new Error('Chrome executable not found. Set SCRIPT_VAULT_CHROME_PATH.');
  }
  return executable;
}

async function findExtensionId(browser) {
  const isTarget = target => {
    const url = target.url();
    return url.startsWith('chrome-extension://') && url.endsWith('/background.js');
  };
  const existing = browser.targets().find(isTarget);
  const target = existing || await browser.waitForTarget(isTarget, { timeout: 15000 });
  const [, id] = target.url().match(/^chrome-extension:\/\/([^/]+)/) || [];
  if (!id) throw new Error('Could not resolve extension id');
  return id;
}

async function primeCaptureProfile(browser, extensionId) {
  const page = await browser.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.evaluate(async () => {
      await chrome.storage.local.set({
        lastSeenVersion: chrome.runtime.getManifest().version,
      });
    });
  } finally {
    await page.close();
  }
}

async function clickSelector(page, selector) {
  await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector);
    if (!(target instanceof HTMLElement)) {
      throw new Error(`Screenshot target not found: ${targetSelector}`);
    }
    target.click();
  }, selector);
}

const THEMES = ['dark', 'light', 'catppuccin', 'oled'];
const SETTINGS_FILTERS = ['core', 'workspace', 'automation', 'security', 'recovery'];
const SCREENSHOTS = [
  ...THEMES.map(theme => ({ name: `dashboard-${theme}`, page: 'dashboard', variant: 'scripts', theme, width: 1280, height: 800 })),
  ...THEMES.map(theme => ({ name: `dashboard-settings-${theme}`, page: 'dashboard', variant: 'settings', theme, width: 1280, height: 800 })),
  ...SETTINGS_FILTERS.map(settingsFilter => ({
    name: `dashboard-settings-${settingsFilter}-dark`,
    page: 'dashboard',
    variant: 'settings',
    settingsFilter,
    theme: 'dark',
    width: 1280,
    height: 800,
  })),
  ...THEMES.flatMap(theme => ['updates', 'utilities', 'trash', 'help'].map(variant => ({
    name: `dashboard-${variant}-${theme}`,
    page: 'dashboard',
    variant,
    theme,
    width: 1280,
    height: 800,
  }))),
  ...THEMES.map(theme => ({ name: `dashboard-editor-${theme}`, page: 'dashboard', variant: 'editor', theme, width: 1280, height: 800 })),
  { name: 'dashboard-editor-settings-dark', page: 'dashboard', variant: 'editor-settings', theme: 'dark', width: 1280, height: 800 },
  ...THEMES.map(theme => ({ name: `dashboard-confirm-${theme}`, page: 'dashboard', variant: 'confirm', theme, width: 1280, height: 800 })),
  ...THEMES.map(theme => ({ name: `popup-${theme}`, page: 'popup', theme, width: 400, height: 600 })),
  ...THEMES.map(theme => ({ name: `sidepanel-${theme}`, page: 'sidepanel', theme, width: 420, height: 800 })),
  ...THEMES.map(theme => ({ name: `install-${theme}`, page: 'install', theme, width: 1280, height: 800 })),
  ...THEMES.map(theme => ({ name: `devtools-${theme}`, page: 'devtools', theme, width: 1200, height: 720 })),
];

function selectScreenshots(args) {
  const onlyArg = args.find(arg => arg.startsWith('--only='));
  if (!onlyArg) return SCREENSHOTS;

  const requested = new Set(
    onlyArg.slice('--only='.length).split(',').map(name => name.trim().replace(/\.png$/u, '')).filter(Boolean),
  );
  const selected = SCREENSHOTS.filter(shot => requested.has(shot.name));
  const missing = [...requested].filter(name => !SCREENSHOTS.some(shot => shot.name === name));
  if (missing.length > 0) throw new Error(`Unknown screenshot name(s): ${missing.join(', ')}`);
  if (selected.length === 0) throw new Error('The --only filter did not select any screenshots');
  return selected;
}

const selectedScreenshots = selectScreenshots(process.argv.slice(2));

mkdirSync(screenshotDir, { recursive: true });

const executablePath = findChromeExecutable();
const userDataDir = await mkdtemp(join(tmpdir(), 'scriptvault-screenshots-'));
let browser;

try {
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    userDataDir,
    pipe: true,
    enableExtensions: [extensionPath],
    protocolTimeout: 30000,
    args: [
      '--disable-dev-shm-usage',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-sandbox',
    ],
  });

  const extensionId = await findExtensionId(browser);
  await primeCaptureProfile(browser, extensionId);

  for (const shot of selectedScreenshots) {
    console.log(`Capturing: ${shot.name}.png`);
    const page = await browser.newPage();
    const externalRequests = new Set();
    page.on('request', request => {
      if (/^https?:\/\//iu.test(request.url())) {
        externalRequests.add(`${request.resourceType()}: ${request.url()}`);
      }
    });
    console.log('  page created');
    // Chrome Web Store artwork is dimension-validated in physical pixels.
    // A DPR of 2 silently produced 2560x1600 files while logging 1280x800 and
    // can stall Chrome's renderer on the dashboard's largest views.
    await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    console.log('  viewport ready');
    await page.evaluateOnNewDocument((theme) => {
      localStorage.setItem('sv_theme', theme);
    }, shot.theme);
    console.log('  theme preload registered');

    const pageFiles = {
      dashboard: 'pages/dashboard.html',
      popup: 'pages/popup.html',
      sidepanel: 'pages/sidepanel.html',
      install: 'pages/install.html',
      devtools: 'pages/devtools-panel.html',
    };
    const pageFile = pageFiles[shot.page];

    await page.goto(`chrome-extension://${extensionId}/${pageFile}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    console.log('  document loaded');

    await page.evaluate((theme) => {
      localStorage.setItem('sv_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      document.body?.setAttribute('data-theme', theme);
    }, shot.theme);
    console.log('  initial theme pinned');

    if (shot.page === 'dashboard') {
      await page.waitForSelector('.scripts-shell-header', { visible: true, timeout: 15000 });
      console.log('  dashboard shell ready');
      await settleWhatsNew(page);
      console.log("  What's New settled");
      if (shot.variant === 'confirm') {
        await page.evaluate(() => {
          window.ScriptVaultDashboardUI?.confirm(
            'Factory Reset ScriptVault?',
            'Delete every script and restore all settings to their defaults? This cannot be undone.',
            { confirmLabel: 'Factory Reset', tone: 'danger' },
          );
        });
        await page.waitForSelector('#modal.show', { visible: true, timeout: 10000 });
      } else if (shot.variant === 'editor' || shot.variant === 'editor-settings') {
        await clickSelector(page, '#btnNewScript');
        try {
          await page.waitForFunction(() => {
            const overlay = document.querySelector('.editor-overlay.active');
            if (!(overlay instanceof HTMLElement) || overlay.hidden) return false;
            const rect = overlay.getBoundingClientRect();
            return getComputedStyle(overlay).display !== 'none' && rect.width > 0 && rect.height > 0;
          }, { timeout: 15000, polling: 100 });
        } catch (error) {
          const detail = await page.evaluate(() => ({
            activeElement: document.activeElement?.id || document.activeElement?.tagName,
            editor: (() => {
              const overlay = document.getElementById('editorOverlay');
              if (!overlay) return null;
              const rect = overlay.getBoundingClientRect();
              const style = getComputedStyle(overlay);
              return {
                className: overlay.className,
                hidden: overlay.hidden,
                ariaHidden: overlay.getAttribute('aria-hidden'),
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                width: rect.width,
                height: rect.height,
              };
            })(),
            toasts: Array.from(document.querySelectorAll('#toastContainer .toast'))
              .map(toast => toast.textContent?.trim())
              .filter(Boolean),
            newScriptDisabled: document.getElementById('btnNewScript')?.disabled,
          }));
          throw new Error(`Editor did not open after New Script: ${JSON.stringify(detail)}`, { cause: error });
        }
        await page.evaluate(theme => window._monacoEditorAdapter?.setTheme(theme), shot.theme);
        const editorFrame = await (await page.$('#monacoFrame'))?.contentFrame();
        if (!editorFrame) throw new Error('Monaco editor frame did not become available');
        await editorFrame.waitForFunction(
          theme => document.documentElement.dataset.theme === theme,
          { timeout: 10000 },
          shot.theme,
        );
        if (shot.variant === 'editor-settings') {
          await clickSelector(page, '#editorTabScriptSettings');
          await page.waitForSelector('#scriptsettingsPanel:not([hidden])', { visible: true, timeout: 10000 });
        }
      } else if (shot.variant && shot.variant !== 'scripts') {
        await clickSelector(page, `.sv-rail-item[data-workbench-tab="${shot.variant}"]:not(.sv-rail-subitem)`);
        const panelSelector = `#${shot.variant}Panel`;
        await page.waitForSelector(panelSelector, { visible: true, timeout: 10000 });
        if (shot.variant === 'settings' && shot.settingsFilter) {
          await clickSelector(page, `[data-settings-filter="${shot.settingsFilter}"]`);
          await page.waitForFunction(
            filter => {
              const buttons = Array.from(document.querySelectorAll('#settingsCategoryFilters [data-settings-filter]'));
              const selected = buttons.filter(button => button.classList.contains('active'));
              return selected.length === 1
                && selected[0]?.dataset.settingsFilter === filter
                && selected[0]?.getAttribute('aria-pressed') === 'true'
                && buttons.filter(button => button !== selected[0])
                  .every(button => button.getAttribute('aria-pressed') === 'false');
            },
            { timeout: 5000 },
            shot.settingsFilter,
          );
        }
      }
    } else {
      const selectors = {
        popup: '.header',
        sidepanel: '.sp-header',
        install: '.container',
        devtools: '.toolbar',
      };
      await page.waitForSelector(selectors[shot.page], { visible: true, timeout: 15000 });
    }
    console.log('  target surface ready');

    if (shot.page === 'sidepanel') {
      await page.evaluate(() => {
        const hostname = document.getElementById('urlHostname');
        const path = document.getElementById('urlPath');
        if (hostname) hostname.textContent = 'example.com';
        if (path) path.textContent = '/projects';
      });
    }

    // App initialization and view transitions can reapply the saved/default
    // theme after DOMContentLoaded. Pin the requested theme only after the
    // target surface is ready, then wait for the transition snapshot to clear.
    await page.evaluate((theme) => {
      localStorage.setItem('sv_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      document.body?.setAttribute('data-theme', theme);
    }, shot.theme);
    // Wait in the Node process. Page-owned timers can remain suspended while
    // Chrome is painting a large extension view, which previously left the
    // Runtime.callFunctionOn request hanging until Puppeteer's protocol limit.
    await new Promise(resolve => setTimeout(resolve, 350));
    await page.evaluate((theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      document.body?.setAttribute('data-theme', theme);
    }, shot.theme);
    await page.waitForFunction(
      theme => document.documentElement.dataset.theme === theme,
      { timeout: 5000 },
      shot.theme,
    );
    console.log('  final theme verified');

    const outputPath = join(screenshotDir, `${shot.name}.png`);
    await page.screenshot({ path: outputPath, fullPage: false });
    if (externalRequests.size > 0) {
      throw new Error(
        `Extension-owned surface requested external resources:\n${[...externalRequests].join('\n')}`,
      );
    }
    console.log('  external requests: 0');
    console.log(`Captured: ${shot.name}.png (${shot.width}x${shot.height})`);
    await page.close();
  }

  console.log(`\nSaved ${selectedScreenshots.length} screenshot(s) to assets/screenshots/`);
} finally {
  await closeBrowserWithFallback(browser, 'Screenshot capture');
  await removeTempProfileDir(userDataDir, 'Screenshot capture');
}
