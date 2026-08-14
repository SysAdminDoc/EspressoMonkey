#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

const manifestFiles = ['manifest.json', 'manifest-firefox.json'];
const storeCopyPath = 'docs/store-listing-copy.md';
const privacyPath = 'PRIVACY.md';
const readmePath = 'README.md';
const amoSourceReadmePath = 'AMO-SOURCE-README.md';

function readText(path) {
  return readFileSync(join(projectRoot, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

const copyCatalog = [
  ['permission', 'storage', ['installed scripts', 'settings'], ['installed scripts', 'settings']],
  ['permission', 'tabs', ['GM_openInTab', 'active tab'], ['GM_openInTab', 'active tab']],
  ['permission', 'notifications', ['update status', 'script notifications'], ['update status', 'script notifications']],
  ['permission', 'contextMenus', ['context-menu', 'run scripts'], ['context-menu', 'run scripts']],
  ['permission', 'menus', ['context-menu', 'run scripts'], ['context-menu', 'run scripts']],
  ['permission', 'scripting', ['content bridge', 'script injection'], ['content bridge', 'script injection']],
  ['permission', 'userScripts', ['USER_SCRIPT world', 'userscripts'], ['USER_SCRIPT world', 'userscripts']],
  ['permission', 'webNavigation', ['document lifecycle', 'frame navigation'], ['document lifecycle', 'frame navigation']],
  ['permission', 'unlimitedStorage', ['cached dependencies', 'backups'], ['cached dependencies', 'backups']],
  ['permission', 'alarms', ['update checks', 'scheduled sync'], ['update checks', 'scheduled sync']],
  ['optional_permission', 'downloads', ['GM_download', 'export'], ['GM_download', 'export']],
  ['permission', 'declarativeNetRequest', ['per-script network rules', 'webRequest metadata'], ['per-script network rules', 'webRequest metadata']],
  ['permission', 'declarativeNetRequestWithHostAccess', ['host-backed DNR', 'matching sites'], ['host-backed DNR', 'matching sites']],
  ['permission', 'publicSuffix', ['public suffix', 'domain badge'], ['public suffix', 'domain badge']],
  ['permission', 'sidePanel', ['side panel', 'browser side panel'], ['side panel', 'browser side panel']],
  ['permission', 'offscreen', ['offscreen document', 'background export'], ['offscreen document', 'background export']],
  ['optional_permission', 'clipboardWrite', ['optional clipboard write', 'user-triggered copy'], ['optional clipboard write', 'user-triggered copy']],
  ['optional_permission', 'clipboardRead', ['optional clipboard read', 'user-triggered paste'], ['optional clipboard read', 'user-triggered paste']],
  ['optional_permission', 'identity', ['Chrome OAuth', 'cloud sync'], ['Chrome OAuth', 'cloud sync']],
  ['optional_permission', 'cookies', ['optional cookie access', 'user-requested scripts'], ['optional cookie access', 'user-requested scripts']],
  ['optional_permission', 'userScripts', ['Firefox optional grant', 'USER_SCRIPT world'], ['Firefox optional grant', 'USER_SCRIPT world']],
  ['host_permission', '<all_urls>', ['Host permission', 'user-chosen sites'], ['Host permission', 'user-chosen sites']],
  ['content_script_match', '<all_urls>', ['Content script match', '.user.js install'], ['Content script match', '.user.js install']],
  ['sandbox_page', 'pages/editor-sandbox.html', ['sandboxed editor', 'Monaco'], ['sandboxed editor', 'Monaco']],
  ['data_collection_required', 'none', ['Required data collection', 'none'], ['Required data collection', 'none']],
  ['data_collection_optional', 'authenticationInfo', ['authenticationInfo', 'OAuth tokens'], ['authenticationInfo', 'OAuth tokens']],
  ['data_collection_optional', 'technicalAndInteraction', ['technicalAndInteraction', 'error diagnostics'], ['technicalAndInteraction', 'error diagnostics']],
  ['data_collection_optional', 'websiteActivity', ['websiteActivity', 'installed scripts'], ['websiteActivity', 'installed scripts']],
  ['data_collection_optional', 'websiteContent', ['websiteContent', 'GM_xmlhttpRequest'], ['websiteContent', 'GM_xmlhttpRequest']],
].map(([surface, token, privacyNeedles, storeNeedles]) => ({
  surface,
  token,
  key: `${surface}:${token}`,
  privacyNeedles: ['Permissions inventory', surface, `\`${token}\``, ...privacyNeedles],
  storeNeedles: ['Store listing permission justifications', surface, `\`${token}\``, ...storeNeedles],
}));

const catalogByKey = new Map(copyCatalog.map((entry) => [entry.key, entry]));
const manifestEntries = new Map();

function addEntry(surface, token, manifestPath) {
  if (!token) return;
  const key = `${surface}:${token}`;
  const existing = manifestEntries.get(key) || { key, surface, token, manifests: new Set() };
  existing.manifests.add(manifestPath);
  manifestEntries.set(key, existing);
}

for (const manifestPath of manifestFiles) {
  const manifest = readJson(manifestPath);
  for (const token of manifest.permissions || []) addEntry('permission', token, manifestPath);
  for (const token of manifest.optional_permissions || []) addEntry('optional_permission', token, manifestPath);
  for (const token of manifest.host_permissions || []) addEntry('host_permission', token, manifestPath);

  for (const contentScript of manifest.content_scripts || []) {
    for (const match of contentScript.matches || []) addEntry('content_script_match', match, manifestPath);
  }

  for (const resourceBlock of manifest.web_accessible_resources || []) {
    for (const match of resourceBlock.matches || []) addEntry('web_accessible_match', match, manifestPath);
    for (const resource of resourceBlock.resources || []) addEntry('web_accessible_resource', resource, manifestPath);
  }

  for (const page of manifest.sandbox?.pages || []) addEntry('sandbox_page', page, manifestPath);

  const dataPermissions = manifest.browser_specific_settings?.gecko?.data_collection_permissions;
  for (const token of dataPermissions?.required || []) addEntry('data_collection_required', token, manifestPath);
  for (const token of dataPermissions?.optional || []) addEntry('data_collection_optional', token, manifestPath);
}

const privacy = readText(privacyPath);
const storeCopy = readText(storeCopyPath);
const readme = readText(readmePath);
const amoSourceReadme = readText(amoSourceReadmePath);
const failures = [];

function inventoryEntries(text) {
  const entries = new Set();
  const rowPattern = /^\|\s*(permission|optional_permission|host_permission|content_script_match|web_accessible_match|web_accessible_resource|sandbox_page|data_collection_required|data_collection_optional)\s*\|\s*`([^`]+)`\s*\|/gm;
  for (const match of text.matchAll(rowPattern)) entries.add(`${match[1]}:${match[2]}`);
  return entries;
}

for (const entry of manifestEntries.values()) {
  const catalogEntry = catalogByKey.get(entry.key);
  if (!catalogEntry) {
    failures.push(
      `No permission-copy catalog entry for ${entry.key} from ${[...entry.manifests].join(', ')}`
    );
    continue;
  }

  for (const needle of catalogEntry.privacyNeedles) {
    if (!privacy.includes(needle)) {
      failures.push(`${privacyPath} is missing "${needle}" for ${entry.key}`);
    }
  }
  for (const needle of catalogEntry.storeNeedles) {
    if (!storeCopy.includes(needle)) {
      failures.push(`${storeCopyPath} is missing "${needle}" for ${entry.key}`);
    }
  }
}

for (const [path, text] of [[privacyPath, privacy], [storeCopyPath, storeCopy]]) {
  for (const key of inventoryEntries(text)) {
    if (!manifestEntries.has(key)) {
      failures.push(`${path} documents stale manifest surface ${key}`);
    }
  }
}

const readmeNeedles = [
  'Permission and Privacy Review',
  'docs/store-listing-copy.md',
  'docs/cws-remote-code-compliance.md',
  'npm run store-copy:check',
  'npm run cws:remote-code:check',
];
for (const needle of readmeNeedles) {
  if (!readme.includes(needle)) {
    failures.push(`${readmePath} is missing "${needle}"`);
  }
}

const amoSourceReadmeNeedles = [
  'Reviewer Build Instructions',
  'npm run build-for-amo',
  'scriptvault-firefox-v<version>.zip',
  'scriptvault-firefox-source-v<version>.zip',
  'AMO Data Collection Copy',
  'Required data collection: `none`',
  '`authenticationInfo`',
  '`technicalAndInteraction`',
  '`websiteActivity`',
  '`websiteContent`',
  'Permission Rationale',
  'Manual Submission Steps',
  'AMO developer account',
  'unlisted',
  'maintainer credentials',
];
for (const needle of amoSourceReadmeNeedles) {
  if (!amoSourceReadme.includes(needle)) {
    failures.push(`${amoSourceReadmePath} is missing "${needle}"`);
  }
}

const releaseRunbook = readText('docs/release-runbook.md');
if (!releaseRunbook.includes('npm run store-copy:check')) {
  failures.push('docs/release-runbook.md does not include npm run store-copy:check in the release gate');
}
if (!releaseRunbook.includes('npm run cws:remote-code:check')) {
  failures.push('docs/release-runbook.md does not include npm run cws:remote-code:check in the release gate');
}
if (!releaseRunbook.includes('docs/cws-remote-code-compliance.md')) {
  failures.push('docs/release-runbook.md does not reference docs/cws-remote-code-compliance.md');
}
if (!releaseRunbook.includes(amoSourceReadmePath)) {
  failures.push(`docs/release-runbook.md does not reference ${amoSourceReadmePath}`);
}

const packageJson = readJson('package.json');
if (packageJson.scripts?.['store-copy:check'] !== 'node scripts/check-permission-copy.mjs') {
  failures.push('package.json is missing script "store-copy:check": "node scripts/check-permission-copy.mjs"');
}

if (failures.length > 0) {
  console.error('Permission/store copy check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Permission/store copy check passed for ${manifestEntries.size} manifest surfaces across ${manifestFiles.join(', ')}.`
);
