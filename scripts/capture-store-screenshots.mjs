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

async function primeCaptureProfile(browser, extensionId, fixture = 'empty') {
  const page = await browser.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/pages/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await page.evaluate(async (captureFixture) => {
      await chrome.storage.local.set({
        lastSeenVersion: chrome.runtime.getManifest().version,
      });
      if (captureFixture !== 'populated') return;

      const fixtureNames = [
        'Codex Resets — Auto Beg every 3 Seconds',
        'GodLikeProductions Enhanced Suite',
        'Reddit Hide All',
        '4chanZ',
        'Old Reddit Redirect',
        'Segue — Spotify → YouTube Music exporter',
        'A deliberately long userscript title that verifies table truncation without covering the inspector @namespace visual-qa @description metadata-like text must stay inside the name column @match https://example.test/*',
        'Research Workspace Assistant',
        'pfSense Auto Login',
        'IMDb Enhanced',
        'Local Layout Tuner',
      ];
      for (const [index, name] of fixtureNames.entries()) {
        const version = `${1 + Math.floor(index / 4)}.${index % 5}.${index % 3}`;
        const code = `// ==UserScript==\n// @name ${name}\n// @namespace https://scriptvault.local/visual-qa\n// @version ${version}\n// @description Deterministic populated-library fixture for dashboard visual QA.\n// @match https://example${index + 1}.com/*\n// @grant none\n// ==/UserScript==\n\ndocument.documentElement.dataset.scriptVaultFixture = '${index + 1}';\n`;
        const result = await chrome.runtime.sendMessage({
          action: 'saveScript',
          data: {
            id: `visual_qa_script_${index + 1}`,
            code,
            enabled: index % 3 === 0,
          },
        });
        if (result?.error) throw new Error(result.error);
      }
    }, fixture);
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
const SUPPORTED_CAPTURE_LOCALES = new Set(['de', 'en', 'es', 'fr', 'he', 'ja', 'pt', 'ru', 'zh']);
const SCREENSHOTS = [
  ...THEMES.map(theme => ({ name: `dashboard-${theme}`, page: 'dashboard', variant: 'scripts', theme, width: 1280, height: 800 })),
  ...THEMES.map(theme => ({ name: `dashboard-settings-${theme}`, page: 'dashboard', variant: 'settings', theme, width: 1280, height: 800 })),
  ...THEMES.flatMap(theme => SETTINGS_FILTERS.map(settingsFilter => ({
    name: `dashboard-settings-${settingsFilter}-${theme}`,
    page: 'dashboard',
    variant: 'settings',
    settingsFilter,
    theme,
    width: 1280,
    height: 800,
  }))),
  ...THEMES.map(theme => ({
    name: `dashboard-settings-search-${theme}`,
    page: 'dashboard',
    variant: 'settings',
    settingsQuery: 'CSP',
    theme,
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
  ...THEMES.flatMap(theme => ['saved', 'dirty', 'error'].map(scriptSettingsState => ({
    name: scriptSettingsState === 'saved'
      ? `dashboard-editor-settings-${theme}`
      : `dashboard-editor-settings-${scriptSettingsState}-${theme}`,
    page: 'dashboard',
    variant: 'editor-settings',
    scriptSettingsState,
    theme,
    width: 1280,
    height: 800,
  }))),
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

function selectCaptureLocale(args) {
  const localeArg = args.find(arg => arg.startsWith('--locale='));
  if (!localeArg) return '';

  const locale = localeArg.slice('--locale='.length).trim().toLowerCase();
  if (!SUPPORTED_CAPTURE_LOCALES.has(locale)) {
    throw new Error(`Unsupported capture locale: ${locale || '<empty>'}`);
  }
  return locale;
}

function selectViewportOverride(args) {
  const viewportArg = args.find(arg => arg.startsWith('--viewport='));
  if (!viewportArg) return null;

  const match = viewportArg.slice('--viewport='.length).trim().match(/^(\d{3,4})x(\d{3,4})$/u);
  if (!match) throw new Error('The --viewport value must use WIDTHxHEIGHT, for example 1920x1080');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 320 || width > 3840 || height < 480 || height > 2160) {
    throw new Error(`Unsupported screenshot viewport: ${width}x${height}`);
  }
  return { width, height };
}

function selectOutputSuffix(args) {
  const suffixArg = args.find(arg => arg.startsWith('--suffix='));
  if (!suffixArg) return '';
  const suffix = suffixArg.slice('--suffix='.length).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(suffix)) {
    throw new Error('The --suffix value must contain only lowercase letters, numbers, and hyphens');
  }
  return suffix;
}

function selectPopupTextScale(args) {
  const scaleArg = args.find(arg => arg.startsWith('--popup-text-scale='));
  if (!scaleArg) return 100;
  const scale = Number(scaleArg.slice('--popup-text-scale='.length).trim());
  if (!Number.isInteger(scale) || scale < 100 || scale > 200) {
    throw new Error('The --popup-text-scale value must be an integer from 100 through 200');
  }
  return scale;
}

function selectCaptureFixture(args) {
  const fixtureArg = args.find(arg => arg.startsWith('--fixture='));
  if (!fixtureArg) return 'empty';
  const fixture = fixtureArg.slice('--fixture='.length).trim().toLowerCase();
  if (!new Set(['empty', 'populated']).has(fixture)) {
    throw new Error(`Unsupported capture fixture: ${fixture || '<empty>'}`);
  }
  return fixture;
}

function selectOpenControl(args) {
  const openArg = args.find(arg => arg.startsWith('--open='));
  if (!openArg) return '';
  const control = openArg.slice('--open='.length).trim().toLowerCase();
  if (control !== 'saved-views') {
    throw new Error(`Unsupported open control: ${control || '<empty>'}`);
  }
  return control;
}

const screenshotArgs = process.argv.slice(2);
const viewportOverride = selectViewportOverride(screenshotArgs);
const selectedScreenshots = selectScreenshots(screenshotArgs).map(shot => (
  viewportOverride ? { ...shot, ...viewportOverride } : shot
));
const captureLocale = selectCaptureLocale(screenshotArgs);
const outputSuffix = selectOutputSuffix(screenshotArgs);
const captureFixture = selectCaptureFixture(screenshotArgs);
const openControl = selectOpenControl(screenshotArgs);
const dismissSetupWarning = screenshotArgs.includes('--dismiss-setup-warning');
const popupTextScale = selectPopupTextScale(screenshotArgs);

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
  await primeCaptureProfile(browser, extensionId, captureFixture);

  for (const shot of selectedScreenshots) {
    const outputName = [shot.name, captureLocale, outputSuffix].filter(Boolean).join('-');
    console.log(`Capturing: ${outputName}.png`);
    const page = await browser.newPage();
    const externalRequests = new Set();
    const runtimeErrors = [];
    page.on('request', request => {
      if (/^https?:\/\//iu.test(request.url())) {
        externalRequests.add(`${request.resourceType()}: ${request.url()}`);
      }
    });
    page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
    });
    console.log('  page created');
    // Chrome Web Store artwork is dimension-validated in physical pixels.
    // A DPR of 2 silently produced 2560x1600 files while logging 1280x800 and
    // can stall Chrome's renderer on the dashboard's largest views.
    await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (captureLocale) {
      const localeSession = await page.createCDPSession();
      await localeSession.send('Emulation.setLocaleOverride', { locale: captureLocale });
    }
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
      await page.waitForFunction(() => {
        const emptyState = document.getElementById('emptyState');
        const hasVisibleEmptyState = emptyState instanceof HTMLElement
          && getComputedStyle(emptyState).display !== 'none'
          && emptyState.getBoundingClientRect().height > 0;
        const hasRenderedRows = (document.getElementById('scriptTableBody')?.children.length || 0) > 0;
        return hasVisibleEmptyState || hasRenderedRows;
      }, { timeout: 15000, polling: 100 });
      console.log('  script library settled');
      if (dismissSetupWarning) {
        const dismissed = await page.evaluate(() => {
          const button = document.getElementById('btnDismissWarning');
          const banner = document.getElementById('setupWarningBanner');
          if (!(button instanceof HTMLElement) || !(banner instanceof HTMLElement)) return false;
          if (getComputedStyle(banner).display === 'none') return true;
          button.click();
          return true;
        });
        if (!dismissed) throw new Error('Setup warning dismissal control was unavailable');
        await page.waitForFunction(
          () => getComputedStyle(document.getElementById('setupWarningBanner')).display === 'none',
          { timeout: 5000 },
        );
      }
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
          if (shot.scriptSettingsState === 'dirty') {
            await page.evaluate(() => {
              const input = document.querySelector('#scriptsettingsPanel .script-settings-panel input:not([disabled])');
              if (!(input instanceof HTMLInputElement)) {
                throw new Error('No editable per-script setting was available for dirty-state capture');
              }
              input.checked = !input.checked;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            });
          } else if (shot.scriptSettingsState === 'error') {
            await page.evaluate(() => {
              const status = document.getElementById('scriptSettingsSaveStatus');
              if (!(status instanceof HTMLElement)) {
                throw new Error('Per-script save status was unavailable for error-state capture');
              }
              status.dataset.state = 'error';
              status.textContent = I18n.getMessage('scriptSettingsSaveFailed') || 'Save failed';
            });
          }
          await page.waitForFunction(
            state => document.getElementById('scriptSettingsSaveStatus')?.dataset.state === state,
            { timeout: 5000 },
            shot.scriptSettingsState || 'saved',
          );
        }
      } else if (shot.variant && shot.variant !== 'scripts') {
        await clickSelector(page, `.sv-rail-item[data-workbench-tab="${shot.variant}"]:not(.sv-rail-subitem)`);
        const panelSelector = `#${shot.variant}Panel`;
        await page.waitForSelector(panelSelector, { visible: true, timeout: 10000 });
        if (shot.variant === 'settings') {
          if (shot.settingsFilter) {
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
          if (shot.settingsQuery) {
            await page.evaluate(query => {
              const input = document.getElementById('settingsQuickFilter');
              if (!(input instanceof HTMLInputElement)) {
                throw new Error('Settings search input was unavailable for query capture');
              }
              input.value = query;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }, shot.settingsQuery);
            await page.waitForFunction(
              query => document.getElementById('settingsQuickFilter')?.value === query
                && [...document.querySelectorAll('#settingsSections > .settings-section')]
                  .some(section => !section.hidden),
              { timeout: 5000 },
              shot.settingsQuery,
            );
          }
        }
      } else if (openControl === 'saved-views') {
        await clickSelector(page, '#savedViewSelectTrigger');
        await page.waitForSelector('#savedViewSelectMenu:not([hidden])', { visible: true, timeout: 5000 });
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

    if (shot.page === 'popup') {
      await page.evaluate(({ hideSetupWarning, textScale }) => {
        if (hideSetupWarning) {
          const warning = document.getElementById('setupWarning');
          warning?.classList.remove('visible');
          warning?.setAttribute('hidden', '');
          warning?.style.setProperty('display', 'none', 'important');
        }
        document.documentElement.style.fontSize = `${textScale}%`;
      }, { hideSetupWarning: dismissSetupWarning, textScale: popupTextScale });
    }

    if (captureLocale) {
      const expectedDirection = captureLocale === 'he' ? 'rtl' : 'ltr';
      await page.waitForFunction(
        (locale, direction) => document.documentElement.lang === locale
          && document.documentElement.dir === direction,
        { timeout: 5000 },
        captureLocale,
        expectedDirection,
      );
      console.log(`  locale ready: ${captureLocale} (${expectedDirection})`);
    }

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
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    console.log('  final theme verified');

    // Taking the screenshot forces a paint in headless/backgrounded Chrome.
    // Read geometry afterward so text-scaling checks observe the same frame
    // that is written to disk rather than a stale pre-paint layout snapshot.
    const outputPath = join(screenshotDir, `${outputName}.png`);
    await page.screenshot({ path: outputPath, fullPage: false });

    if (shot.page === 'popup') {
      const popupGeometry = await page.evaluate(({ hideSetupWarning, textScale }) => {
        if (hideSetupWarning) {
          const warning = document.getElementById('setupWarning');
          warning?.classList.remove('visible');
          warning?.setAttribute('hidden', '');
          warning?.style.setProperty('display', 'none', 'important');
        }
        document.documentElement.style.fontSize = `${textScale}%`;

        const button = document.getElementById('btnDashboard');
        const label = button?.querySelector('.footer-text');
        const footer = document.querySelector('.footer-actions');
        if (!(button instanceof HTMLElement) || !(label instanceof HTMLElement) || !(footer instanceof HTMLElement)) {
          throw new Error('Popup footer controls were unavailable');
        }
        const range = document.createRange();
        range.selectNodeContents(label);
        const lineRects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
        const buttonRect = button.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        return {
          textScale,
          lineCount: lineRects.length,
          labelInsideButton: labelRect.left >= buttonRect.left - 0.5
            && labelRect.right <= buttonRect.right + 0.5
            && labelRect.top >= buttonRect.top - 0.5
            && labelRect.bottom <= buttonRect.bottom + 0.5,
          footerInsideViewport: footerRect.left >= -0.5
            && footerRect.right <= innerWidth + 0.5
            && footerRect.top >= -0.5
            && footerRect.bottom <= innerHeight + 0.5,
          documentFitsHorizontally: document.documentElement.scrollWidth <= innerWidth + 1,
          button: { width: buttonRect.width, height: buttonRect.height, bottom: buttonRect.bottom },
          footer: { width: footerRect.width, height: footerRect.height, bottom: footerRect.bottom },
        };
      }, { hideSetupWarning: dismissSetupWarning, textScale: popupTextScale });
      if (
        popupGeometry.lineCount !== 1
        || !popupGeometry.labelInsideButton
        || !popupGeometry.footerInsideViewport
        || !popupGeometry.documentFitsHorizontally
      ) {
        throw new Error(`Popup footer geometry failed: ${JSON.stringify(popupGeometry)}`);
      }
      console.log(`  popup footer geometry verified: ${JSON.stringify(popupGeometry)}`);
    }

    if (externalRequests.size > 0) {
      throw new Error(
        `Extension-owned surface requested external resources:\n${[...externalRequests].join('\n')}`,
      );
    }
    if (shot.page === 'popup' && runtimeErrors.length > 0) {
      throw new Error(`Extension-owned surface reported runtime errors:\n${runtimeErrors.join('\n')}`);
    }
    console.log('  external requests: 0');
    if (shot.page === 'popup') console.log('  runtime errors: 0');
    console.log(`Captured: ${outputName}.png (${shot.width}x${shot.height})`);
    await page.close();
  }

  const captureLabel = [captureLocale, outputSuffix, viewportOverride && `${viewportOverride.width}x${viewportOverride.height}`]
    .filter(Boolean)
    .join(', ');
  console.log(`\nSaved ${selectedScreenshots.length} screenshot(s) to assets/screenshots/${captureLabel ? ` (${captureLabel})` : ''}`);
} finally {
  await closeBrowserWithFallback(browser, 'Screenshot capture');
  await removeTempProfileDir(userDataDir, 'Screenshot capture');
}
