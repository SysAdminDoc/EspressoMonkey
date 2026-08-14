/**
 * Script registration — register/unregister userscripts with the
 * chrome.userScripts API.
 *
 * Extracted from background.core.js (lines 3844-4172, 4545-4560) —
 * logic is kept identical.
 */

import type { Script, ScriptMeta, ScriptSettings } from '../types/script';
import type { WebRequestRule } from './dnr-rules';
import type { Settings } from '../types/settings';
import { ScriptStorage, ScriptValues, SettingsManager, debugLog } from '../modules/storage';
import { ResourceCache } from '../modules/resources';
import { planBackgroundScript } from './background-runner';
import {
  isValidMatchPattern,
  isRegexPattern,
  extractMatchPatternsFromRegex,
  convertIncludeToMatch,
  nativeMatchPatternForRegistration,
  matchPatternToRuntimeRegex,
} from './url-matcher';
import { applyWebRequestRules, removeWebRequestRules } from './dnr-rules';
import { deriveOptionalHostPermissionPlan } from './host-permission-patterns';
import { getScriptAuthToken } from './user-script-message-policy';

// ---------------------------------------------------------------------------
// External functions defined in background.core.js but not yet migrated
// ---------------------------------------------------------------------------

declare function fetchRequireScript(url: string): Promise<string | null>;
declare function buildWrappedScript(
  script: Script,
  requireScripts: Array<{ url: string; code: string }>,
  preloadedStorage: Record<string, unknown>,
  regexIncludes: string[],
  regexExcludes: string[],
  scheduleGuard?: string,
  scriptAuthToken?: string,
): string;

// debugWarn is not exported from storage.ts — declare it locally
declare function debugWarn(...args: unknown[]): void;

// ---------------------------------------------------------------------------
// Phase 39.22 — bound any await chain that could deadlock on a CSP-strict /
// hung remote target (VM #2513). Rejects with a labelled timeout error after
// `ms` milliseconds; the caller is responsible for treating the rejection as
// a soft failure (Promise.allSettled, .catch, etc.). Mirrors the
// `_withTimeout` helper in `background.core.js`.
// ---------------------------------------------------------------------------

function _withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout: Promise<T> = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race<T>([
    Promise.resolve<T>(promise).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    }),
    timeout,
  ]);
}

const SYNC_FIRST_RUN_REGISTRATION_HOLD_MS = 90 * 1000;
const SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY = 'syncFirstRunRegistrationHoldStartedAt';

// Turn one `deniedHosts` entry into candidate exclude match patterns.
// The Settings field documents "optional wildcard hostname", so entries can be
// `example.com`, `*.example.com`, a bare `*`, or carry a port. Only a single
// leading `*.` is legal in a match pattern host, so a `*.`-prefixed entry must
// NOT be wrapped again — `*://*.*.example.com/*` is rejected by Chrome and
// takes the whole register() call down with it.
export function deniedHostExcludePatterns(rawHost: unknown): string[] {
  const host = typeof rawHost === 'string' ? rawHost.trim() : '';
  if (!host) return [];
  if (host === '*' || host === '<all_urls>') return ['*://*/*'];
  if (host.startsWith('*.')) return [`*://${host}/*`];
  return [`*://${host}/*`, `*://*.${host}/*`];
}

function isFirstSyncRegistrationHoldConfigured(settings: Settings): boolean {
  const provider = settings.syncProvider || 'none';
  const lastSync = Number(settings.lastSync || 0);
  return settings.enabled !== false
    && settings.syncHoldExecutionUntilFirstSync === true
    && settings.syncEnabled === true
    && provider !== 'none'
    && !(Number.isFinite(lastSync) && lastSync > 0);
}

async function clearFirstSyncRegistrationHoldMarker(): Promise<void> {
  try {
    await chrome.storage.local.remove(SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY);
  } catch {
    // Non-fatal; the registration gate re-checks current settings on each call.
  }
}

async function getFirstSyncRegistrationGate(settings: Settings): Promise<{ hold: boolean; timedOut: boolean; elapsedMs: number }> {
  if (!isFirstSyncRegistrationHoldConfigured(settings)) {
    await clearFirstSyncRegistrationHoldMarker();
    return { hold: false, timedOut: false, elapsedMs: 0 };
  }

  const now = Date.now();
  let startedAt = 0;
  try {
    const data = await chrome.storage.local.get(SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY);
    startedAt = Number(data?.[SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY] || 0);
  } catch {
    startedAt = 0;
  }
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    startedAt = now;
    try {
      await chrome.storage.local.set({ [SYNC_FIRST_RUN_REGISTRATION_HOLD_STORAGE_KEY]: startedAt });
    } catch {
      // Non-fatal; this wake still holds and a later wake can restart the timer.
    }
  }

  const elapsedMs = Math.max(0, now - startedAt);
  if (elapsedMs >= SYNC_FIRST_RUN_REGISTRATION_HOLD_MS) {
    await clearFirstSyncRegistrationHoldMarker();
    return { hold: false, timedOut: true, elapsedMs };
  }

  return { hold: true, timedOut: false, elapsedMs };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps userscript @run-at values to chrome.userScripts runAt values. */
type ChromeRunAt = 'document_start' | 'document_end' | 'document_idle';

interface UserScriptRegistration {
  id: string;
  matches: string[];
  excludeMatches?: string[];
  js: Array<{ code: string }>;
  runAt: ChromeRunAt;
  allFrames: boolean;
  world: 'USER_SCRIPT';
  worldId?: string;
  messaging?: boolean;
}

function isFirefoxRuntime(): boolean {
  return /Firefox\//.test(globalThis.navigator?.userAgent || '');
}

function supportsUserScriptsWorldId(): boolean {
  // Per-script worlds are no longer Chromium-only. Firefox 153 implements
  // configureWorld({ worldId }) and accepts worldId on register/update; without
  // it every script for a page shares one sandbox and only the first one runs.
  //
  // On Firefox this is only the CHEAP gate: `configureWorld` shipped before
  // per-world `worldId` did, so the symbol proves nothing on 136-152.
  // ensureUserScriptWorldIdSupport() does the real capability probe and its
  // resolved answer wins.
  if (isFirefoxRuntime()) {
    if (typeof chrome?.userScripts?.configureWorld !== 'function') return false;
    return worldIdSupportProbe.resolved ? worldIdSupportProbe.supported : true;
  }
  return typeof chrome?.userScripts?.configureWorld === 'function';
}

const worldIdSupportProbe: {
  resolved: boolean;
  supported: boolean;
  proven: boolean;
  promise: Promise<boolean> | null;
} = { resolved: false, supported: false, proven: false, promise: null };

const WORLD_ID_PROBE_ID = 'sv-worldid-probe';

/**
 * Prove — rather than assume — that this engine honours a per-script `worldId`.
 *
 * Configure a throwaway world, then read the configuration back: only a world
 * that comes back carrying the id we asked for proves the property was honoured.
 * An engine that accepts `configureWorld({worldId})` and silently drops the
 * property would otherwise leave every script sharing one world, which is the
 * bug per-script worlds fixed.
 */
async function ensureUserScriptWorldIdSupport(): Promise<boolean> {
  if (!isFirefoxRuntime()) return supportsUserScriptsWorldId();
  if (worldIdSupportProbe.resolved) return worldIdSupportProbe.supported;
  if (worldIdSupportProbe.promise) return worldIdSupportProbe.promise;

  worldIdSupportProbe.promise = (async () => {
    const api = chrome?.userScripts as unknown as {
      configureWorld?: (config: Record<string, unknown>) => Promise<void>;
      getWorldConfigurations?: () => Promise<Array<{ worldId?: string }>>;
      resetWorldConfiguration?: (worldId: string) => Promise<void>;
    } | undefined;
    if (typeof api?.configureWorld !== 'function') return false;

    try {
      await api.configureWorld({
        worldId: WORLD_ID_PROBE_ID,
        csp: "script-src 'self'",
        messaging: false,
      });
    } catch (_e: unknown) {
      // Rejected the unknown property — the good failure: the engine told us.
      worldIdSupportProbe.proven = true;
      return false;
    }

    if (typeof api.getWorldConfigurations !== 'function') {
      worldIdSupportProbe.proven = false;
      return true;
    }

    try {
      const worlds = await api.getWorldConfigurations();
      const honoured = Array.isArray(worlds)
        && worlds.some((world) => world?.worldId === WORLD_ID_PROBE_ID);
      worldIdSupportProbe.proven = true;
      return honoured;
    } catch (_e: unknown) {
      worldIdSupportProbe.proven = false;
      return true;
    } finally {
      try {
        if (typeof api.resetWorldConfiguration === 'function') {
          await api.resetWorldConfiguration(WORLD_ID_PROBE_ID);
        }
      } catch (_e: unknown) { /* best effort */ }
    }
  })().then((supported) => {
    worldIdSupportProbe.resolved = true;
    worldIdSupportProbe.supported = supported;
    worldIdSupportProbe.promise = null;
    return supported;
  }).catch(() => {
    worldIdSupportProbe.resolved = true;
    worldIdSupportProbe.supported = false;
    worldIdSupportProbe.promise = null;
    return false;
  });

  return worldIdSupportProbe.promise;
}

/**
 * The world id to use for a script.
 *
 * Chrome reserves world ids beginning with `_`, and script ids come from the
 * imported file on a backup restore — so a `_`-prefixed id made configureWorld
 * throw and silently downgraded that script to the SHARED world. Prefix instead
 * of losing isolation; deterministic so the world is stable per script.
 */
function userScriptWorldIdFor(scriptId: string): string {
  const id = typeof scriptId === 'string' ? scriptId : String(scriptId || '');
  if (!id) return '';
  return id.startsWith('_') ? `sv${id}` : id;
}

/**
 * Record that a script fell back to the SHARED user-script world.
 *
 * Previously a bare `catch {}`: the script registered into the default world
 * with no warning, no `_registrationError` and no log entry, which is
 * indistinguishable from working and is the "scripts 2..n silently dead" state
 * per-script worlds exist to prevent.
 */
async function recordWorldIsolationLoss(script: Script, reason: unknown): Promise<void> {
  const detail = reason instanceof Error ? (reason.message || String(reason)) : String(reason || 'unknown');
  const warning = `Per-script world unavailable — this script shares the default sandbox with other scripts on the page (${detail})`;
  try {
    const settings = script.settings as Record<string, unknown> | undefined;
    if (settings) {
      settings._registrationWarning = warning;
      await ScriptStorage.set(script.id, script);
    }
  } catch (_e: unknown) { /* diagnostics must not break registration */ }
  try {
    const errorLog = (globalThis as { ErrorLog?: { log?: (entry: unknown) => Promise<unknown> } }).ErrorLog;
    if (typeof errorLog?.log === 'function') {
      await errorLog.log({
        scriptId: script.id,
        scriptName: script.meta?.name || script.id,
        error: warning,
        source: 'registration',
        context: 'world-isolation',
      });
    }
  } catch (_e: unknown) { /* best effort */ }
}

/** Clear a recorded isolation warning once a world is established. */
async function clearWorldIsolationLoss(script: Script): Promise<void> {
  const settings = script.settings as Record<string, unknown> | undefined;
  if (!settings?._registrationWarning) return;
  try {
    delete settings._registrationWarning;
    await ScriptStorage.set(script.id, script);
  } catch (_e: unknown) { /* best effort */ }
}

function shouldEnforceScopedHostPermissions(settings: Settings): boolean {
  if ((settings as unknown as Record<string, unknown>).scopedHostPermissions === false) return false;
  if (isFirefoxRuntime()) return false;
  return typeof chrome?.permissions?.contains === 'function';
}

async function ensureScopedHostPermissions(script: Script, settings: Settings): Promise<void> {
  if (!shouldEnforceScopedHostPermissions(settings)) return;
  const allowBroad = (script.settings as Record<string, unknown> | undefined)?.allowBroadHostAccess === true;
  const plan = deriveOptionalHostPermissionPlan(script.meta as unknown as Record<string, unknown>, { allowBroad });
  if (plan.requiresBroadHostAccess && !allowBroad) {
    await chrome.userScripts.unregister({ ids: [script.id] }).catch(() => undefined);
    throw new Error('Broad host access requires explicit per-script opt-in before registration');
  }
  if (plan.origins.length === 0) return;
  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins: plan.origins });
  } catch {
    granted = false;
  }
  if (!granted) {
    await chrome.userScripts.unregister({ ids: [script.id] }).catch(() => undefined);
    const sample = plan.origins.slice(0, 3).join(', ');
    const suffix = plan.origins.length > 3 ? `, +${plan.origins.length - 3} more` : '';
    throw new Error(`Browser host access not granted for ${sample}${suffix}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isScriptEligibleForRegistration(script: Script | null | undefined): boolean {
  return !!script && script.enabled !== false && !script.settings?._importQuarantine;
}

export async function registerAllScripts(): Promise<void> {
  try {
    if (!chrome.userScripts) {
      console.warn('[ScriptVault] userScripts API not available');
      return;
    }

    const settings = await SettingsManager.get() as unknown as Settings;
    const firstSyncGate = await getFirstSyncRegistrationGate(settings);
    if (firstSyncGate.hold) {
      await chrome.userScripts.unregister().catch(() => {});
      debugLog(`Holding userscript registration until first sync completes (${Math.ceil((SYNC_FIRST_RUN_REGISTRATION_HOLD_MS - firstSyncGate.elapsedMs) / 1000)}s remaining)`);
      return;
    }
    if (firstSyncGate.timedOut) {
      console.warn('[ScriptVault] First-sync registration hold timed out; registering scripts before first sync.');
    }

    // First, unregister all existing scripts
    await chrome.userScripts.unregister().catch(() => {});

    const scripts: Script[] = await ScriptStorage.getAll();

    if (!settings.enabled) {
      debugLog('Scripts globally disabled');
      return;
    }

    const enabledScripts: Script[] = scripts.filter(isScriptEligibleForRegistration);

    // Sort by @priority (higher = first), then position
    enabledScripts.sort((a: Script, b: Script) => {
      const pa: number = a.meta?.priority || 0;
      const pb: number = b.meta?.priority || 0;
      if (pb !== pa) return pb - pa;
      return (a.position || 0) - (b.position || 0);
    });

    debugLog(`Registering ${enabledScripts.length} scripts`);

    // v2.0: Preload all @require dependencies in parallel before registration
    // This prevents N sequential fetches during registration
    const allRequires = new Set<string>();
    for (const script of enabledScripts) {
      for (const req of (script.meta?.require || [])) {
        allRequires.add(req);
      }
    }
    if (allRequires.size > 0) {
      debugLog(`Preloading ${allRequires.size} @require dependencies`);
      const preloadStart: number = Date.now();
      // Phase 39.22 — bound each fetch so a CSP-strict / slow server
      // can't deadlock the registration sweep (VM #2513). 15s per URL
      // matches the runtime JS at `background.core.js:5598+`.
      await Promise.allSettled(
        [...allRequires].map(url =>
          _withTimeout(fetchRequireScript(url), 15000, `fetchRequire:${url}`),
        ),
      );
      debugLog(`Preloaded in ${Date.now() - preloadStart}ms`);
    }

    // Register all scripts in parallel — significantly faster on large
    // script collections. Phase 39.22 — bound each per-script registration
    // so a single hung script can't deadlock the sweep (VM #2513). 5s per
    // script matches the runtime JS at `background.core.js:5606+`.
    const results: PromiseSettledResult<void>[] = await Promise.allSettled(
      enabledScripts.map(script =>
        _withTimeout(registerScript(script), 5000, `registerScript:${script.id}`),
      ),
    );
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failures.length > 0) {
      console.warn(
        `[ScriptVault] ${failures.length} script(s) failed to register:`,
        failures.map(r => (r.reason as Error)?.message || r.reason),
      );
    }
  } catch (e: unknown) {
    console.error('[ScriptVault] Failed to register scripts:', e);
  }
}

// Register a single script
/**
 * Feature-detect chrome.userScripts.update (Chrome 138+). Mirrors the runtime
 * helper in background.core.js so a future TS-runtime promotion preserves the
 * in-place update path.
 */
export function supportsUserScriptsUpdate(): boolean {
  return typeof (chrome as unknown as { userScripts?: { update?: unknown } })?.userScripts?.update === 'function';
}

/**
 * Replace a script's registration without an unregister/register flicker.
 * Chrome 138+ takes the in-place update path; older Chrome falls back to the
 * existing unregister + register cycle. Mirrors the runtime helper in
 * background.core.js — see that file's reregisterScript for the full
 * behavior contract.
 */
export async function reregisterScript(script: Script): Promise<void> {
  if (!chrome.userScripts || !script) return;
  if (!isScriptEligibleForRegistration(script)) {
    await unregisterScript(script.id);
    return;
  }
  if (supportsUserScriptsUpdate()) {
    try {
      await removeWebRequestRules(script.id).catch(() => undefined);
      await registerScript(script, { useUpdate: true, throwOnError: true });
      return;
    } catch {
      // Fall through to the full unregister + register cycle.
    }
  }
  await unregisterScript(script.id);
  await registerScript(script);
}

export async function registerScript(
  script: Script,
  options: { useUpdate?: boolean; throwOnError?: boolean } = {},
): Promise<void> {
  try {
    if (!chrome.userScripts) return;
    if (!isScriptEligibleForRegistration(script)) {
      await unregisterScript(script?.id);
      return;
    }

    const meta: ScriptMeta = script.meta;
    const settings: ScriptSettings = script.settings || {};

    if (meta.background) {
      const backgroundPlan = planBackgroundScript(script, await SettingsManager.get() as unknown as Settings);
      await chrome.alarms.clear(`crontab_${script.id}`).catch(() => undefined);
      await chrome.userScripts.unregister({ ids: [script.id] }).catch(() => undefined);
      debugLog(`Skipped @background script (${backgroundPlan.status}): ${backgroundPlan.reason}`);
      return;
    }

    // Build match patterns with URL override support
    const matches: string[] = [];
    const excludeMatches: string[] = [];
    // Track whether the script actually ASKED to run somewhere positive. If a
    // user restricts scope to a site whose pattern is malformed (e.g. an IPv6
    // host, an empty file:// host, or a ported host Chrome rejects), all
    // patterns can resolve invalid — and falling back to <all_urls> would run
    // the script on every site, the exact opposite of the user's intent. When
    // positive patterns were requested but none survived, fail closed instead.
    let requestedPositivePatterns = 0;
    let needsPositiveRuntimeMatchGuard = false;
    const positiveRuntimeMatchPatterns: string[] = [];

    // Collect regex @include/@exclude patterns for runtime filtering. Ported
    // @match patterns are widened for Chrome registration and added here as
    // exact runtime guards so localhost:3000 does not run on localhost:8080.
    const regexIncludes: string[] = [];
    const regexExcludes: string[] = [];

    const addPositiveMatchPattern = (pattern: string): boolean => {
      const nativePattern = nativeMatchPatternForRegistration(pattern);
      if (!nativePattern) return false;
      matches.push(nativePattern);
      positiveRuntimeMatchPatterns.push(pattern);
      if (nativePattern !== pattern) needsPositiveRuntimeMatchGuard = true;
      return true;
    };

    const addExcludeMatchPattern = (pattern: string): boolean => {
      const nativePattern = nativeMatchPatternForRegistration(pattern);
      if (!nativePattern) return false;
      if (nativePattern === pattern) {
        excludeMatches.push(nativePattern);
      } else {
        const runtimeRegex = matchPatternToRuntimeRegex(pattern);
        if (runtimeRegex) regexExcludes.push(runtimeRegex);
      }
      return true;
    };

    // Process @match (if enabled in settings)
    if ((settings as Record<string, unknown>).useOriginalMatches !== false && meta.match && Array.isArray(meta.match)) {
      for (const m of meta.match) {
        if (typeof m === 'string' && m.trim()) requestedPositivePatterns++;
        if (isValidMatchPattern(m)) {
          addPositiveMatchPattern(m);
        }
      }
    }

    // Process user @match patterns
    const userMatches = (settings as Record<string, unknown>).userMatches;
    if (userMatches && Array.isArray(userMatches)) {
      for (const m of userMatches as string[]) {
        if (typeof m === 'string' && m.trim()) requestedPositivePatterns++;
        if (isValidMatchPattern(m)) {
          addPositiveMatchPattern(m);
        } else {
          // Try to convert glob-style to match pattern
          const converted: string | null = convertIncludeToMatch(m);
          if (converted && isValidMatchPattern(converted)) {
            addPositiveMatchPattern(converted);
          }
        }
      }
    }

    // Process @include (if enabled in settings)
    if ((settings as Record<string, unknown>).useOriginalIncludes !== false && meta.include && Array.isArray(meta.include)) {
      for (const inc of meta.include) {
        if (isRegexPattern(inc)) {
          // Regex pattern - extract broad match patterns for registration, filter at runtime.
          // Deliberately NOT counted as a requestedPositivePattern: the scope is
          // enforced by the wrapper's runtime __regexIncludes guard, not by a static
          // match pattern. extractMatchPatternsFromRegex returns [] for nearly every
          // real-world regex, so counting it would trip the fail-closed check below
          // and refuse to register a perfectly valid script.
          regexIncludes.push(inc);
          const broad: string[] = extractMatchPatternsFromRegex(inc);
          if (broad.length > 0) {
            matches.push(...broad);
          }
        } else {
          if (typeof inc === 'string' && inc.trim()) requestedPositivePatterns++;
          const converted: string | null = convertIncludeToMatch(inc);
          if (converted && isValidMatchPattern(converted)) {
            addPositiveMatchPattern(converted);
          } else if (inc === '*') {
            addPositiveMatchPattern('<all_urls>');
          }
        }
      }
    }

    // Process user @include patterns
    const userIncludes = (settings as Record<string, unknown>).userIncludes;
    if (userIncludes && Array.isArray(userIncludes)) {
      for (const inc of userIncludes as string[]) {
        if (typeof inc === 'string' && inc.trim()) requestedPositivePatterns++;
        const converted: string | null = convertIncludeToMatch(inc);
        if (converted && isValidMatchPattern(converted)) {
          addPositiveMatchPattern(converted);
        } else if (inc === '*') {
          addPositiveMatchPattern('<all_urls>');
        }
      }
    }

    // Process @exclude-match (stored as excludeMatch by parser)
    if (meta.excludeMatch && Array.isArray(meta.excludeMatch)) {
      for (const m of meta.excludeMatch) {
        if (isValidMatchPattern(m)) {
          addExcludeMatchPattern(m);
        }
      }
    }

    // Process @exclude (if enabled) - convert to exclude matches where possible
    if ((settings as Record<string, unknown>).useOriginalExcludes !== false && meta.exclude && Array.isArray(meta.exclude)) {
      for (const exc of meta.exclude) {
        if (isRegexPattern(exc)) {
          regexExcludes.push(exc);
          continue;
        }
        const converted: string | null = convertIncludeToMatch(exc);
        if (converted && isValidMatchPattern(converted)) {
          addExcludeMatchPattern(converted);
        }
      }
    }

    // Process user @exclude patterns
    const userExcludes = (settings as Record<string, unknown>).userExcludes;
    if (userExcludes && Array.isArray(userExcludes)) {
      for (const exc of userExcludes as string[]) {
        const converted: string | null = convertIncludeToMatch(exc);
        if (converted && isValidMatchPattern(converted)) {
          addExcludeMatchPattern(converted);
        }
      }
    }

    // Add denied hosts as exclude patterns
    const globalSettings = await SettingsManager.get() as unknown as Settings;
    const deniedHosts: string[] | undefined = globalSettings.deniedHosts;
    if (deniedHosts && Array.isArray(deniedHosts)) {
      for (const host of deniedHosts) {
        // Route through addExcludeMatchPattern rather than pushing raw. The
        // Settings validator accepts `*.example.com`, a bare `*`, and
        // `host:8080`, and naive interpolation turned those into
        // `*://*.*.example.com/*`, `*://*.*/*`, and a ported pattern — none of
        // which are legal match patterns. chrome.userScripts.register rejects
        // the whole call, so one bad denied-host entry stopped EVERY script
        // from registering. The helper port-normalizes and drops anything that
        // still isn't native-legal.
        for (const pattern of deniedHostExcludePatterns(host)) {
          addExcludeMatchPattern(pattern);
        }
      }
    }
    // Add blacklisted pages as exclude patterns
    if (globalSettings.pageFilterMode === 'blacklist' && globalSettings.blacklistedPages) {
      const blacklist: string[] = globalSettings.blacklistedPages.split('\n').map(s => s.trim()).filter(Boolean);
      for (const p of blacklist) {
        const converted: string | null = convertIncludeToMatch(p);
        if (converted && isValidMatchPattern(converted)) {
          addExcludeMatchPattern(converted);
        }
      }
    }

    if (needsPositiveRuntimeMatchGuard) {
      for (const pattern of positiveRuntimeMatchPatterns) {
        const runtimeRegex = matchPatternToRuntimeRegex(pattern);
        if (runtimeRegex) regexIncludes.push(runtimeRegex);
      }
    }

    // If no matches survived but positive patterns WERE requested, they were all
    // malformed. Fail closed — do NOT widen to <all_urls>, which would run the
    // script everywhere and defeat an explicit scope restriction. Unregister any
    // prior registration so the script stops running, and surface the error.
    // A regex @include is exempt: the wrapper's runtime __regexIncludes guard
    // returns before any user code when the URL doesn't match, so registering
    // broadly does not actually widen the script's effective scope.
    if (matches.length === 0 && requestedPositivePatterns > 0 && regexIncludes.length === 0) {
      await chrome.userScripts.unregister({ ids: [script.id] }).catch(() => undefined);
      throw new Error('No valid match patterns — script scope could not be applied');
    }

    // If no matches at all (script defined none), use <all_urls> (some scripts use @include *)
    if (matches.length === 0) {
      matches.push('<all_urls>');
    }

    await ensureScopedHostPermissions(script, globalSettings);

    // Map run-at values (with per-script setting override)
    const runAtMap: Record<string, ChromeRunAt> = {
      'document-start': 'document_start',
      'document-end': 'document_end',
      'document-idle': 'document_idle',
      'document-body': 'document_end',
      'context-menu': 'document_idle' // context-menu scripts register idle, triggered via context menu
    };

    // @run-in: filter by tab type (normal-tabs, incognito-tabs)
    const runIn: string = meta['run-in'] || '';
    if (runIn === 'incognito-tabs') {
      // Only run in incognito — skip registration for normal context
      // (chrome.userScripts doesn't support incognito filtering natively,
      // so we inject a runtime guard into the wrapper)
    } else if (runIn === 'normal-tabs') {
      // Only run in normal tabs — runtime guard injected
    }

    // Check for per-script runAt override
    let effectiveRunAt: string = meta['run-at'] || '';
    const settingsRunAt = (settings as Record<string, unknown>).runAt as string | undefined;
    if (settingsRunAt && settingsRunAt !== 'default') {
      effectiveRunAt = settingsRunAt;
    }
    const isContextMenu: boolean = effectiveRunAt === 'context-menu';
    if (isContextMenu) {
      // Context-menu scripts are not auto-registered; they run on-demand via context menu click
      debugLog(`Skipping auto-register for context-menu script: ${meta.name}`);
      return;
    }
    const runAt: ChromeRunAt = runAtMap[effectiveRunAt] || 'document_idle';

    // Determine execution world based on @inject-into and @sandbox
    // chrome.userScripts API only supports 'USER_SCRIPT' world, not 'MAIN'
    // For @inject-into page / @sandbox raw, we still register in USER_SCRIPT world
    // but pass a flag so the wrapper injects the user's code into the page context via <script>
    const world: 'USER_SCRIPT' = 'USER_SCRIPT';
    const injectInto: string = meta['inject-into'] || 'auto';
    const sandbox: string = meta.sandbox || '';
    const injectIntoPage: boolean = (injectInto === 'page' || sandbox === 'raw');

    // Fetch @require dependencies
    const requireScripts: Array<{ url: string; code: string }> = [];
    const requires: string[] = Array.isArray(meta.require) ? meta.require : (meta.require ? [meta.require] : []);

    const failedRequires: string[] = [];
    const failedRequireErrors: Array<{ url: string; message: string }> = [];
    for (const url of requires) {
      try {
        const code: string | null = await fetchRequireScript(url);
        if (code) {
          requireScripts.push({ url, code });
        } else {
          failedRequires.push(url);
          failedRequireErrors.push({ url, message: 'empty response' });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`[ScriptVault] Failed to fetch @require ${url}:`, message);
        failedRequires.push(url);
        failedRequireErrors.push({ url, message });
      }
    }

    // Track failed @require dependencies on the script for UI notification
    if (failedRequires.length > 0) {
      script.settings = script.settings || {};
      script.settings._failedRequires = failedRequires;
      script.settings._failedRequireErrors = failedRequireErrors;
      await ScriptStorage.set(script.id, script);
      debugWarn(`${meta.name}: ${failedRequires.length} @require dependency(s) failed to load`);
    } else if (script.settings?._failedRequires || script.settings?._failedRequireErrors) {
      // Clear previous failures
      delete script.settings._failedRequires;
      delete script.settings._failedRequireErrors;
      await ScriptStorage.set(script.id, script);
    }

    // Pre-fetch @resource dependencies
    await ResourceCache.prefetchResources(meta.resource);

    // Pre-fetch storage values for this script
    const storedValues: Record<string, unknown> = await ScriptValues.getAll(script.id) || {};

    // Build the script code with GM API wrapper, @require scripts, and pre-loaded storage
    if (injectIntoPage) {
      debugLog(`Note: @inject-into page / @sandbox raw not fully supported in MV3, running in USER_SCRIPT world: ${meta.name}`);
    }
    const scriptAuthToken = await getScriptAuthToken(script.id);
    const wrappedCode: string = buildWrappedScript(
      script,
      requireScripts,
      storedValues,
      regexIncludes,
      regexExcludes,
      '',
      scriptAuthToken,
    );

    // Per-script frame-mode override (settings.frameMode): 'top' forces top
    // frame only, 'all' forces all frames, and any other value (including
    // 'default'/undefined) falls back to the `@noframes` metadata.
    const frameMode = (script.settings as Record<string, unknown> | undefined)?.frameMode as
      | 'top'
      | 'all'
      | 'default'
      | undefined;
    let allFrames: boolean;
    if (frameMode === 'top') allFrames = false;
    else if (frameMode === 'all') allFrames = true;
    else allFrames = !meta.noframes;

    // Register the script
    const registration: UserScriptRegistration = {
      id: script.id,
      matches: matches,
      excludeMatches: excludeMatches.length > 0 ? excludeMatches : undefined,
      js: [{ code: wrappedCode }],
      runAt: runAt,
      allFrames: allFrames,
      world: world
    };

    // Chrome 133+ / Firefox 153+: configure and use a per-script worldId so
    // scripts do not collide in one shared sandbox. Engines without support
    // reject the unknown property and fall through to the default world.
    let worldConfigured = false;
    const worldIdSupported = await ensureUserScriptWorldIdSupport();
    const desiredWorldId = userScriptWorldIdFor(script.id);
    if (worldIdSupported && desiredWorldId) {
      try {
        await chrome.userScripts.configureWorld({
          worldId: desiredWorldId,
          csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
          messaging: true
        });
        worldConfigured = true;
      } catch (e: unknown) {
        // The engine claimed support and then refused this world (count limit,
        // reserved id, transient failure). Registering into the shared world
        // beats not registering, but it must not be invisible.
        await recordWorldIsolationLoss(script, e);
      }
    } else if (!worldIdSupported && isFirefoxRuntime()) {
      await recordWorldIsolationLoss(script, 'this browser version has no per-script world support');
    }

    if (worldConfigured) {
      registration.worldId = desiredWorldId;
      await clearWorldIsolationLoss(script);
    }

    try {
      // Chrome 131+ supports messaging in USER_SCRIPT world
      // The `messaging` property is not in all chrome-types versions, so cast to any.
      const payload = [
        { ...registration, messaging: world === 'USER_SCRIPT' } as chrome.userScripts.RegisteredUserScript,
      ];
      if (options.useUpdate && supportsUserScriptsUpdate()) {
        try {
          await (chrome.userScripts as unknown as {
            update(s: chrome.userScripts.RegisteredUserScript[]): Promise<void>;
          }).update(payload);
        } catch {
          // update() throws on "no matching script" — fall back to register
          // so the first save after SW restart still registers cleanly.
          await chrome.userScripts.register(payload);
        }
      } else {
        await chrome.userScripts.register(payload);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg?.includes('messaging')) {
        // Fallback for older Chrome versions that don't support the messaging property
        await chrome.userScripts.register([registration as chrome.userScripts.RegisteredUserScript]);
      } else if (registration.worldId && errMsg?.includes('worldId')) {
        // configureWorld accepted worldId but register/update did not; drop the
        // per-script world rather than leaving the script unregistered — and
        // record it, because the script now shares the default sandbox.
        delete registration.worldId;
        await chrome.userScripts.register([
          { ...registration, messaging: world === 'USER_SCRIPT' } as chrome.userScripts.RegisteredUserScript,
        ]);
        await recordWorldIsolationLoss(script, e);
      } else {
        throw e;
      }
    }

    debugLog(`Registered: ${meta.name} (${requires.length} @require, ${Object.keys(storedValues).length} stored values)`);

    // Apply @webRequest declarativeNetRequest rules if defined
    if (meta.webRequest) {
      // meta.webRequest uses the type from types/script.ts; applyWebRequestRules
      // expects the dnr-rules.ts shape. They originate from the same data so cast is safe.
      const rules: WebRequestRule[] = (
        Array.isArray(meta.webRequest) ? meta.webRequest : [meta.webRequest]
      ) as unknown as WebRequestRule[];
      const globalSettings = await SettingsManager.get() as unknown as Settings;
      const ruleResult = await applyWebRequestRules(script.id, rules, { script, settings: globalSettings });
      if (!ruleResult.success) {
        throw new Error(ruleResult.error || 'GM_webRequest rule rejected');
      }
    }

    if (script.settings?._registrationError) {
      delete script.settings._registrationError;
      await ScriptStorage.set(script.id, script);
    }
  } catch (e: unknown) {
    console.error(`[ScriptVault] Failed to register ${script.meta?.name || script.id}:`, e);
    // Mark script with registration failure for UI display
    try {
      script.settings = script.settings || {};
      script.settings._registrationError = e instanceof Error ? e.message : 'Registration failed';
      await ScriptStorage.set(script.id, script);
    } catch {
      // ignore
    }
    if (options.throwOnError) throw e;
  }
}

export async function unregisterScript(scriptId: string): Promise<void> {
  // Remove any @webRequest declarativeNetRequest rules
  await removeWebRequestRules(scriptId);
  try {
    if (!chrome.userScripts) return;
    await chrome.userScripts.unregister({ ids: [scriptId] });
    // Chrome 133+: reset the per-script world configuration to free resources
    if (supportsUserScriptsWorldId()) {
      try {
        // Chrome 133+ API — shape may differ from chrome-types declarations
        await chrome.userScripts.resetWorldConfiguration(scriptId);
      } catch (_e: unknown) {
        // Chrome <133 / Firefox <153 have no resetWorldConfiguration — ignore
      }
    }
  } catch (_e: unknown) {
    // Script might not be registered
  }
}
