import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
const editorSmoke = readFileSync(resolve(process.cwd(), 'scripts/smoke-editor.mjs'), 'utf8');

describe('editor smoke harness', () => {
  it('exposes the bounded editor smoke command and documented deadline override', () => {
    expect(packageJson.scripts['smoke:editor']).toBe('node scripts/smoke-editor.mjs');
    expect(editorSmoke).toContain('SCRIPT_VAULT_EDITOR_SMOKE_TIMEOUT_MS');
    expect(editorSmoke).toContain('DEFAULT_SMOKE_TIMEOUT_MS = 90000');
    expect(editorSmoke).toContain('WAIT_TIMEOUT_MS = 15000');
  });

  it('reports the first failing stage and current URL', () => {
    expect(editorSmoke).toContain('async function runStage(name, operation)');
    expect(editorSmoke).toContain('${name} failed at ${currentUrl()}: ${detail}');
    expect(editorSmoke).toContain('at stage "${currentStage}" URL "${currentUrl()}"');
  });

  it('cleans the browser and temporary profile from timeout and process finally paths', () => {
    expect(editorSmoke).toContain('async function cleanupResources()');
    expect(editorSmoke).toContain('await closeBrowserWithFallback(browser, \'Editor smoke\')');
    expect(editorSmoke).toContain('await removeTempProfileDir(userDataDir, \'Editor smoke\')');
    expect(editorSmoke).toContain('await cleanupResources();');
    expect(editorSmoke).toContain('} finally {');
    expect(editorSmoke).toContain('process.exit(1);');
  });

  it('uses the shared wait deadline for every Puppeteer wait', () => {
    expect(editorSmoke).not.toMatch(/timeout:\s*(?:4000|5000|10000|20000|15000)\b/);
    expect(editorSmoke).toContain('timeout: WAIT_TIMEOUT_MS');
  });

  it('waits on semantic diagnostics, paints them, and accepts capability-hidden run actions', () => {
    expect(editorSmoke).toContain("getModelMarkers?.({}).length >= 4");
    expect(editorSmoke).toContain("allow editor diagnostics to paint");
    expect(editorSmoke).toContain("capture editor smoke screenshot");
    expect(editorSmoke).toContain("diagnostics.renderedWarningCount < 3");
    expect(editorSmoke).toContain("run control has zero size without being capability-hidden");
  });
});
