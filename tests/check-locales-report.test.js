// Smoke-tests for scripts/check-locales.mjs. The script is intentionally
// dependency-light so it can run in CI without booting the extension. These
// tests verify it produces a stable JSON report and that --check / --strict
// have the documented severity behavior.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT = resolve(process.cwd(), 'scripts/check-locales.mjs');

function runReport(flags = []) {
  const stdout = execFileSync('node', [SCRIPT, '--json', ...flags], { encoding: 'utf8' });
  return JSON.parse(stdout);
}

describe('scripts/check-locales.mjs', () => {
  it('lists the same 9 locales across sources and generated catalogs', () => {
    const report = runReport();
    expect(report.sources.localeSources).toEqual(['de', 'en', 'es', 'fr', 'he', 'ja', 'pt', 'ru', 'zh']);
    expect(report.sources.localesDir).toEqual(['de', 'en', 'es', 'fr', 'he', 'ja', 'pt', 'ru', 'zh']);
    expect(report.sources.runtimeI18n).toEqual(['de', 'en', 'es', 'fr', 'he', 'ja', 'pt', 'ru', 'zh']);
    expect(report.sources.generatedRuntime).toBe('src/generated/locale-catalogs.ts');
  });

  it('reports zero source, generation, manifest, and coverage drift', () => {
    const report = runReport();
    expect(report.drifts).toEqual([]);
  });

  it('exits 0 in --check mode (no fatal drift)', () => {
    let exitCode = 0;
    try {
      execFileSync('node', [SCRIPT, '--check'], { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      exitCode = err.status || 1;
    }
    expect(exitCode).toBe(0);
  });

  it('exits 0 in --strict mode with generated runtime parity', () => {
    const report = runReport();
    expect(report.drifts).toEqual([]);

    let exitCode = 0;
    try {
      execFileSync('node', [SCRIPT, '--strict'], { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      exitCode = err.status || 1;
    }
    expect(exitCode).toBe(0);
  });

  it('labels every incomplete locale partial and pins explicit baselines', () => {
    const report = runReport();
    expect(report.sources.englishRuntimeKeyCount).toBe(2054);
    expect(report.coverage.find(entry => entry.locale === 'en')).toMatchObject({ status: 'complete', percent: 100 });
    expect(report.coverage.find(entry => entry.locale === 'he')).toMatchObject({
      status: 'partial',
      direction: 'rtl',
      translated: 58,
      englishKeyCount: 2054,
      coveragePercent: 2.8,
      baselinePercent: 2.8,
    });
    expect(report.warnings).toHaveLength(8);
    for (const w of report.warnings) {
      expect(w).toHaveProperty('translated');
      expect(w).toHaveProperty('total');
      expect(w).toHaveProperty('englishKeyCount', 2054);
      expect(w).toHaveProperty('baseline');
      expect(w).toHaveProperty('coveragePercent');
      expect(w).toHaveProperty('baselinePercent');
      expect(w.status).toBe('partial');
      expect(w.translated).toBeGreaterThanOrEqual(w.baseline);
      expect(w.locale).not.toBe('en');
    }
  });
});
