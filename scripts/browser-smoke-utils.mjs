import { rm } from 'node:fs/promises';

const WHATS_NEW_OVERLAY = '.sv-wn-overlay';

/**
 * Dismiss the What's New modal and prove it stays gone. Its visibility is
 * decided after an async storage read, so a single selector check can race a
 * late modal. Click through the page DOM instead of an ElementHandle: the
 * latter can wait indefinitely when the overlay is mid-transition.
 */
export async function settleWhatsNew(page, { quietMs = 400, timeoutMs = 8000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dismissed = await page.evaluate(() => {
      const dismissButton = document.querySelector('#svWnDismiss');
      if (!dismissButton) return false;
      dismissButton.click();
      return true;
    });
    if (dismissed) {
      await page.waitForFunction(
        selector => !document.querySelector(selector),
        { timeout: 5000 },
        WHATS_NEW_OVERLAY,
      );
      continue;
    }

    const stillAbsent = await page
      .waitForFunction(
        selector => !!document.querySelector(selector),
        { timeout: quietMs },
        WHATS_NEW_OVERLAY,
      )
      .then(() => false)
      .catch(() => true);
    if (stillAbsent) return;
  }
  throw new Error("What's New modal never settled: it kept reappearing");
}

export async function closeBrowserWithFallback(browser, label = 'Browser smoke') {
  if (!browser) return;
  const browserProcess = browser.process?.();
  let timer;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('browser.close timed out after 15s')), 15000);
      }),
    ]);
  } catch (error) {
    console.warn(`${label} browser close fallback: ${error?.message || error}`);
    if (browserProcess && !browserProcess.killed) browserProcess.kill('SIGKILL');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function removeTempProfileDir(profileDir, label = 'Browser smoke') {
  try {
    await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch (error) {
    console.warn(`${label} temp profile cleanup skipped: ${error?.message || error}`);
  }
}
