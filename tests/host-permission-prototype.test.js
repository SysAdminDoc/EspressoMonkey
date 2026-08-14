// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildOptionalHostPrototype,
  buildStrictOptionalHostPrototype,
  renderReport,
} from '../scripts/check-host-permission-prototype.mjs';

const read = path => readFileSync(resolve(path), 'utf8');
const json = path => JSON.parse(read(path));

describe('host-permission prototype policy', () => {
  it('keeps shipping broad while staging retained-bridge and strict optional shapes', () => {
    const shipping = json('manifest.json');
    const retained = buildOptionalHostPrototype(shipping);
    const strict = buildStrictOptionalHostPrototype(shipping);

    expect(shipping.host_permissions).toContain('<all_urls>');
    expect(retained.host_permissions || []).not.toContain('<all_urls>');
    expect(retained.optional_host_permissions).toEqual(expect.arrayContaining(['http://*/*', 'https://*/*']));
    expect(retained.content_scripts[0].matches).toContain('<all_urls>');
    expect(strict.content_scripts).toBeUndefined();
  });

  it('renders the broad compatibility decision without treating the retained bridge as isolated', () => {
    const report = renderReport({
      chromeManifest: json('manifest.json'),
      firefoxManifest: json('manifest-firefox.json'),
      privacy: 'host_permission | `<all_urls>`',
      storeCopy: 'host_permission | `<all_urls>`',
    });

    expect(report.failures).toEqual([]);
    expect(report.text).toContain('Retain required `<all_urls>`');
    expect(report.text).toContain('blocked: broad bridge remains');
    expect(report.text).toContain('npm run host-permissions:matrix');
  });
});

describe('host-permission matrix contract', () => {
  it('keeps raw-runtime DNR helpers in scope and clears recovered registration errors', () => {
    const core = read('src/background/core.ts');
    const registration = read('src/background/registration.ts');

    expect(core).toContain('function _isHighPrivilegeScriptApiOverride(settings: any)');
    expect(core).toContain("delete script.settings._registrationError");
    expect(registration).toContain("delete script.settings._registrationError");
  });
});
