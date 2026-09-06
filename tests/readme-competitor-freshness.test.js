import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPETITOR_DATA_MAX_AGE_DAYS,
  checkCompetitorDataFreshness,
} from '../scripts/check-readme-claims.mjs';

const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');

const withMarker = (date) => `## Comparison\n\n<!-- competitor-data-verified: ${date} -->\n\n| a | b |\n`;

// The shipped README asserted "ViolentMonkey | Manifest V3 | Beta/test builds"
// for three weeks after Violentmonkey shipped MV3 stable in v2.43.0. Nothing
// could catch it: readme:check validates ScriptVault's own claims against
// ScriptVault's own source, and there is no source of truth in this repo for
// what another project does. Dating the claims is the only thing that can be
// gated, so the date is what gets gated.
describe('README competitor-claim freshness', () => {
  it('passes on a freshly verified table', () => {
    const now = new Date('2026-08-06T00:00:00Z');
    expect(checkCompetitorDataFreshness(withMarker('2026-08-06'), now)).toEqual([]);
  });

  it('fails once the claims age past the limit', () => {
    const now = new Date('2026-08-06T00:00:00Z');
    const stale = withMarker('2025-01-01');
    const failures = checkCompetitorDataFreshness(stale, now);
    expect(failures).toHaveLength(1);
    expect(failures[0].check).toBe('stale-competitor-data');
    expect(failures[0].why).toContain('Re-check the upstream releases');
  });

  it('fails a Comparison section with no verification marker at all', () => {
    const failures = checkCompetitorDataFreshness('## Comparison\n\n| a | b |\n');
    expect(failures).toHaveLength(1);
    expect(failures[0].check).toBe('competitor-data-undated');
  });

  it('rejects a malformed or future-dated marker', () => {
    const now = new Date('2026-08-06T00:00:00Z');
    expect(checkCompetitorDataFreshness(withMarker('not-a-date'), now)[0].check).toBe('competitor-data-undated');
    expect(checkCompetitorDataFreshness(withMarker('2027-01-01'), now)[0].why).toContain('in the future');
  });

  it('stays silent when there is no Comparison section to age out', () => {
    expect(checkCompetitorDataFreshness('# ScriptVault\n\nNo comparison here.\n')).toEqual([]);
  });

  it('the shipped README carries a marker that is currently within the limit', () => {
    expect(checkCompetitorDataFreshness(readme)).toEqual([]);
  });

  it('no longer claims Violentmonkey lacks Manifest V3', () => {
    // The specific regression: false since violentmonkey v2.43.0 (2026-07-14).
    expect(readme).not.toContain('Beta/test builds');
    if (readme.includes('## Comparison')) {
      const comparison = readme.slice(readme.indexOf('## Comparison'));
      expect(comparison).toContain('violentmonkey/violentmonkey/releases');
    }
  });

  it('keeps the age limit tight enough to matter', () => {
    expect(COMPETITOR_DATA_MAX_AGE_DAYS).toBeLessThanOrEqual(365);
  });
});
