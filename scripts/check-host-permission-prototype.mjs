#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const check = args.includes('--check');
const write = args.includes('--write') || !check;
const OUTPUT = 'docs/host-permission-prototype.md';
const OPTIONAL_HOST_PATTERNS = ['http://*/*', 'https://*/*'];

function readText(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildOptionalHostPrototype(manifest) {
  const prototype = structuredClone(manifest);
  const requiredHosts = Array.isArray(prototype.host_permissions) ? prototype.host_permissions : [];
  prototype.host_permissions = requiredHosts.filter(pattern => pattern !== '<all_urls>');
  if (prototype.host_permissions.length === 0) delete prototype.host_permissions;
  prototype.optional_host_permissions = unique([
    ...(Array.isArray(prototype.optional_host_permissions) ? prototype.optional_host_permissions : []),
    ...OPTIONAL_HOST_PATTERNS,
  ]);
  prototype.__scriptvault_prototype = {
    notShipping: true,
    movedFromRequiredHostPermissions: ['<all_urls>'],
    purpose: 'Measure optional HTTP(S) host grants without changing the store manifest.',
  };
  return prototype;
}

export function buildStrictOptionalHostPrototype(manifest) {
  const prototype = buildOptionalHostPrototype(manifest);
  delete prototype.content_scripts;
  prototype.__scriptvault_prototype = {
    ...prototype.__scriptvault_prototype,
    removedForIsolation: ['content_scripts <all_urls>'],
    purpose: 'Measure genuinely withheld host access and the compatibility cost of removing the static bridge.',
  };
  return prototype;
}

function hasContentScriptAllUrls(manifest) {
  return (manifest.content_scripts || []).some(script => (script.matches || []).includes('<all_urls>'));
}

function hasWebAccessibleAllUrls(manifest) {
  return (manifest.web_accessible_resources || []).some(block => (block.matches || []).includes('<all_urls>'));
}

function analyzeTarget(name, manifest) {
  const retainedBridge = buildOptionalHostPrototype(manifest);
  const strictOptional = buildStrictOptionalHostPrototype(manifest);
  const permissions = new Set(manifest.permissions || []);
  const optionalPermissions = new Set(manifest.optional_permissions || []);
  const shippingHostPermissions = new Set(manifest.host_permissions || []);
  const prototypeOptionalHosts = new Set(retainedBridge.optional_host_permissions || []);
  const failures = [];

  if (!shippingHostPermissions.has('<all_urls>')) {
    failures.push(`${name} shipping manifest no longer matches the reviewed required-<all_urls> compatibility policy.`);
  }
  for (const pattern of OPTIONAL_HOST_PATTERNS) {
    if (!prototypeOptionalHosts.has(pattern)) {
      failures.push(`${name} prototype is missing optional_host_permissions ${pattern}.`);
    }
  }
  if ((retainedBridge.host_permissions || []).includes('<all_urls>')
      || (strictOptional.host_permissions || []).includes('<all_urls>')) {
    failures.push(`${name} optional-host prototype still has required <all_urls>.`);
  }
  if (!hasContentScriptAllUrls(manifest) || !hasContentScriptAllUrls(retainedBridge)) {
    failures.push(`${name} shipping/retained-bridge shape lost the static .user.js bridge unexpectedly.`);
  }
  if (hasContentScriptAllUrls(strictOptional)) {
    failures.push(`${name} strict optional prototype still has a broad static content-script match.`);
  }
  if (hasWebAccessibleAllUrls(manifest) || hasWebAccessibleAllUrls(retainedBridge) || hasWebAccessibleAllUrls(strictOptional)) {
    failures.push(`${name} should not expose install.html as a web-accessible <all_urls> resource.`);
  }

  const userScriptsReady = permissions.has('userScripts') || optionalPermissions.has('userScripts');
  const dnrReady = permissions.has('declarativeNetRequest') && permissions.has('declarativeNetRequestWithHostAccess');
  const downloadReady = permissions.has('downloads') || optionalPermissions.has('downloads');
  const cookiesReady = permissions.has('cookies') || optionalPermissions.has('cookies');
  if (!userScriptsReady) failures.push(`${name} prototype cannot register userscripts without userScripts permission coverage.`);
  if (!dnrReady) failures.push(`${name} prototype lacks DNR permissions needed for GM_webRequest rules.`);
  if (!downloadReady) failures.push(`${name} prototype lacks downloads permission needed for GM_download.`);
  if (!cookiesReady) failures.push(`${name} prototype lacks cookie permission coverage.`);

  return {
    name,
    retainedBridge,
    strictOptional,
    checks: {
      shippingRequiredAllUrls: shippingHostPermissions.has('<all_urls>'),
      optionalHttpHosts: OPTIONAL_HOST_PATTERNS.every(pattern => prototypeOptionalHosts.has(pattern)),
      retainedBroadBridge: hasContentScriptAllUrls(retainedBridge),
      strictBridgeRemoved: !hasContentScriptAllUrls(strictOptional),
      installPagePrivate: !hasWebAccessibleAllUrls(strictOptional),
      userScriptsReady,
      dnrReady,
      downloadReady,
      cookiesReady,
    },
    failures,
  };
}

function passLabel(value) {
  return value ? 'pass' : 'fail';
}

export function renderReport({ chromeManifest, firefoxManifest, privacy, storeCopy }) {
  const analyses = [
    analyzeTarget('Chrome', chromeManifest),
    analyzeTarget('Firefox', firefoxManifest),
  ];
  const reviewerCopyReady = privacy.includes('host_permission | `<all_urls>`')
    && storeCopy.includes('host_permission | `<all_urls>`');
  const failures = analyses.flatMap(result => result.failures);
  if (!reviewerCopyReady) {
    failures.push('Reviewer copy no longer covers the shipping <all_urls> host permission.');
  }

  const rows = analyses.map(result => {
    const c = result.checks;
    return `| ${result.name} | ${passLabel(c.shippingRequiredAllUrls)} | ${passLabel(c.optionalHttpHosts)} | ${c.retainedBroadBridge ? 'blocked: broad bridge remains' : 'pass'} | ${passLabel(c.strictBridgeRemoved && c.installPagePrivate)} | ${passLabel(c.userScriptsReady && c.dnrReady && c.downloadReady && c.cookiesReady)} |`;
  }).join('\n');

  const examples = analyses.map(result => {
    const retained = result.retainedBridge;
    const strict = result.strictOptional;
    return [
      `### ${result.name} Prototype Shapes`,
      '',
      '```json',
      JSON.stringify({
        retainedBridge: {
          host_permissions: retained.host_permissions || [],
          optional_host_permissions: retained.optional_host_permissions || [],
          content_scripts: (retained.content_scripts || []).map(script => ({ matches: script.matches || [] })),
        },
        strictOptional: {
          host_permissions: strict.host_permissions || [],
          optional_host_permissions: strict.optional_host_permissions || [],
          content_scripts: strict.content_scripts || [],
        },
      }, null, 2),
      '```',
    ].join('\n');
  }).join('\n\n');

  return {
    failures,
    text: `# Host Permission Recovery Prototype

This report is generated by \`npm run host-permissions:prototype\`. Chrome and Firefox both ship required \`<all_urls>\` for compatibility. The optional-host manifests below are test-only shapes and are not store defaults.

## Shipping Decision

Retain required \`<all_urls>\`. Installed-profile Chromium testing shows that moving only \`host_permissions\` to optional is not genuinely scoped: the static \`content_scripts.matches: ["<all_urls>"]\` bridge remains a broad scriptable host and still enables cross-origin extension fetches even while \`chrome.permissions.contains({ origins })\` reports the explicit host as withheld. Removing that bridge creates a genuinely withheld profile, but also removes the current .user.js/content compatibility bridge.

The strict prototype does pass granted-host userscript registration, update URL, \`@require\`, \`@resource\`, \`@connect\`, DNR, cookie, download, and universal-script approval smoke coverage. It is not ready to ship until those bridge responsibilities are redesigned and the native first-grant prompt is manually validated.

## Prototype Gate

| Target | Shipping required host current | Optional HTTP(S) hosts staged | Retained-bridge isolation | Strict bridge removal / install page private | userScripts + privileged GM coverage |
|---|---|---|---|---|---|
${rows}

Reviewer copy status: ${reviewerCopyReady ? 'pass' : 'fail'}.

## Reproduce

- \`npm run host-permissions:prototype:check\` validates the shipping/prototype contract and reviewer copy.
- \`npm run host-permissions:matrix\` builds the extension and runs the isolated Chromium installed-profile matrix.
- The browser matrix writes \`release-artifacts/host-permission-matrix.json\` with the browser version, lifecycle evidence, product-flow results, and all assertions.
- Chromium's native first-time optional-host permission prompt remains a manual review surface; automation covers a real persisted grant, denial/withheld state, gesture confirmation, and revoke without editing protected profile preferences.

${examples}
`,
  };
}

function main() {
  const chromeManifest = readJson('manifest.json');
  const firefoxManifest = readJson('manifest-firefox.json');
  const report = renderReport({
    chromeManifest,
    firefoxManifest,
    privacy: readText('PRIVACY.md'),
    storeCopy: readText('docs/store-listing-copy.md'),
  });

  if (report.failures.length > 0) {
    console.error('Host permission prototype check failed:');
    for (const failure of report.failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  const outPath = resolve(ROOT, OUTPUT);
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (check) {
    if (current && current !== report.text) {
      console.error(`${OUTPUT} is stale. Run npm run host-permissions:prototype.`);
      process.exit(1);
    }
    console.log(`Host permission prototype contract passed${current ? ' and the local report is current' : ''}.`);
    return;
  }

  if (write) {
    writeFileSync(outPath, report.text, 'utf8');
    console.log(`Updated ${OUTPUT}.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
