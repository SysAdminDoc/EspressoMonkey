import { expect, test } from '@playwright/test';

import {
  launchScriptVault,
  openExtensionPage,
} from './helpers/extension-fixture.js';

test('Find Scripts separates a challenged catalog from an unreachable one', async () => {
  test.setTimeout(90_000);
  const app = await launchScriptVault();
  try {
    const page = await openExtensionPage(app);
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (url.startsWith('https://api.greasyfork.org/')) {
          return new Response(
            '<!doctype html><title>Just a moment...</title><p>Checking your browser before accessing</p>',
            { status: 403, headers: { 'Content-Type': 'text/html' } },
          );
        }
        if (url.startsWith('https://openuserjs.org/')) {
          throw new TypeError('Failed to fetch');
        }
        return nativeFetch(input, init);
      };
    });
    await page.evaluate(() => chrome.storage.local.set({
      lastSeenVersion: chrome.runtime.getManifest().version,
    }));
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.locator('#btnFindScripts').click();
    await expect(page.locator('#findScriptsOverlay:not([hidden])')).toBeVisible();
    await page.locator('#findScriptsInput').fill('youtube.com');
    await page.locator('#btnFindScriptsSearch').click();

    const greasyForkHealth = page.locator('[data-source-health="greasyfork"]');
    await expect(greasyForkHealth).toHaveAttribute('data-health-state', 'challenged');
    await expect(greasyForkHealth).toHaveAttribute('title', /browser-check page/i);
    await expect(page.locator('#findScriptsResults')).toContainText('browser-check page');

    await page.locator('#findScriptsSource').selectOption('openuserjs');
    await page.locator('#findScriptsInput').fill('youtube.com');
    await page.locator('#btnFindScriptsSearch').click();

    const openUserJsHealth = page.locator('[data-source-health="openuserjs"]');
    await expect(openUserJsHealth).toHaveAttribute('data-health-state', 'unreachable');
    await expect(openUserJsHealth).toHaveAttribute('title', /not with the script|could not reach/i);
    await expect(page.locator('#findScriptsResults')).toContainText('could not reach');
  } finally {
    await app.close();
  }
});
