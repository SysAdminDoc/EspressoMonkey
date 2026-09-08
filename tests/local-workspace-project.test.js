import { describe, expect, it } from 'vitest';
import {
  createLocalWorkspaceProjectScriptId,
  normalizeLocalWorkspaceProjectPath,
  normalizeLocalWorkspaceProjectManifest,
  reconcileLocalWorkspaceProject,
  resolveLocalWorkspaceProjectAction,
  toPortableLocalWorkspaceProjectManifest,
} from '../src/modules/local-workspace-project.ts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const PROJECT_ID = 'local-project-test-project';

function file(relativePath, sha256, version = '1.0.0', matchedEntryScriptId = '') {
  return { relativePath, sha256, version, matchedEntryScriptId };
}

describe('local workspace project manifest', () => {
  it('normalizes relative userscript paths and rejects traversal or absolute paths', () => {
    expect(normalizeLocalWorkspaceProjectPath('src\\one.user.js')).toBe('src/one.user.js');
    expect(normalizeLocalWorkspaceProjectPath('../one.user.js')).toBeNull();
    expect(normalizeLocalWorkspaceProjectPath('/tmp/one.user.js')).toBeNull();
    expect(normalizeLocalWorkspaceProjectPath('C:/tmp/one.user.js')).toBeNull();
    expect(normalizeLocalWorkspaceProjectPath('notes/readme.md')).toBe('notes/readme.md');
    expect(createLocalWorkspaceProjectScriptId(PROJECT_ID, 'src/one.user.js'))
      .toBe(createLocalWorkspaceProjectScriptId(PROJECT_ID, 'src\\one.user.js'));
  });

  it('does not replace malformed manifest paths with a valid fallback entry', () => {
    const manifest = normalizeLocalWorkspaceProjectManifest({
      projectId: PROJECT_ID,
      entries: [
        { relativePath: '../escape.user.js' },
        { relativePath: 'notes/readme.md' },
        { scriptId: 'sv-project-valid', lastAppliedSha256: HASH_A },
      ],
    });

    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].relativePath).toBe('script.user.js');
  });

  it('assigns stable IDs to a bounded initial folder and queues every file for review', () => {
    const result = reconcileLocalWorkspaceProject({
      projectId: PROJECT_ID,
      displayName: 'Example project',
      entries: [],
      queue: [],
    }, [
      file('a.user.js', HASH_A),
      file('styles/main.user.css', HASH_B, '2.0.0'),
      file('nested/third.user.js', HASH_C),
    ], [], 100);

    expect(result.issues).toEqual([]);
    expect(result.actions).toHaveLength(3);
    expect(result.actions.map(action => action.kind)).toEqual(['added', 'added', 'added']);
    expect(new Set(result.manifest.entries.map(entry => entry.scriptId)).size).toBe(3);
    expect(result.manifest.entries.map(entry => entry.relativePath)).toEqual([
      'a.user.js',
      'nested/third.user.js',
      'styles/main.user.css',
    ]);
  });

  it('preserves the script ID across a handle-matched rename', () => {
    const scriptId = createLocalWorkspaceProjectScriptId(PROJECT_ID, 'old.user.js');
    const baseline = {
      projectId: PROJECT_ID,
      displayName: 'Example project',
      entries: [{
        relativePath: 'old.user.js',
        scriptId,
        status: 'synced',
        lastAppliedSha256: HASH_A,
        lastAppliedVersion: '1.0.0',
        lastObservedSha256: HASH_A,
        lastObservedVersion: '1.0.0',
        lastObservedAt: 1,
      }],
      queue: [],
    };
    const result = reconcileLocalWorkspaceProject(baseline, [
      file('renamed.user.js', HASH_A, '1.0.0', scriptId),
    ], [{ id: scriptId, sha256: HASH_A, version: '1.0.0' }], 200);

    expect(result.actions).toMatchObject([{
      kind: 'renamed',
      scriptId,
      previousPath: 'old.user.js',
      relativePath: 'renamed.user.js',
    }]);
    expect(result.manifest.entries[0].scriptId).toBe(scriptId);
  });

  it('queues a conflict with both folder and ScriptVault hashes without choosing a winner', () => {
    const scriptId = createLocalWorkspaceProjectScriptId(PROJECT_ID, 'conflict.user.js');
    const baseline = {
      projectId: PROJECT_ID,
      displayName: 'Example project',
      entries: [{
        relativePath: 'conflict.user.js',
        scriptId,
        status: 'synced',
        lastAppliedSha256: HASH_A,
        lastAppliedVersion: '1.0.0',
        lastObservedSha256: HASH_A,
        lastObservedVersion: '1.0.0',
        lastObservedAt: 1,
      }],
      queue: [],
    };
    const result = reconcileLocalWorkspaceProject(baseline, [file('conflict.user.js', HASH_B, '2.0.0')], [
      { id: scriptId, sha256: HASH_C, version: '3.0.0' },
    ], 300);

    expect(result.actions).toMatchObject([{
      kind: 'conflict',
      sha256: HASH_B,
      scriptSha256: HASH_C,
      version: '2.0.0',
      scriptVersion: '3.0.0',
    }]);
    expect(result.manifest.entries[0].status).toBe('conflict');
    expect(result.manifest.entries[0].lastAppliedSha256).toBe(HASH_A);
  });

  it('redacts handles, absolute paths, and code from the portable manifest', () => {
    const result = reconcileLocalWorkspaceProject({
      projectId: PROJECT_ID,
      displayName: 'Example project',
      entries: [],
      queue: [],
    }, [file('one.user.js', HASH_A)], [], 400);
    const portable = toPortableLocalWorkspaceProjectManifest({
      ...result.manifest,
      handle: { name: 'secret' },
      absolutePath: 'C:/Users/dev/secret/one.user.js',
      code: 'window.secret = true;',
    });
    const serialized = JSON.stringify(portable);

    expect(serialized).not.toContain('secret/one.user.js');
    expect(serialized).not.toContain('window.secret');
    expect(serialized).not.toContain('handle');
    expect(portable.privacy).toEqual({
      includesHandles: false,
      includesAbsolutePaths: false,
      includesFileContents: false,
    });
  });

  it('resolves an explicit folder decision and removes only that queue item', () => {
    const result = reconcileLocalWorkspaceProject({
      projectId: PROJECT_ID,
      displayName: 'Example project',
      entries: [],
      queue: [],
    }, [file('one.user.js', HASH_A)], [], 500);
    const action = result.actions[0];
    const resolved = resolveLocalWorkspaceProjectAction(result.manifest, action.actionId, 'apply');

    expect(resolved.queue).toHaveLength(0);
    expect(resolved.entries[0]).toMatchObject({
      scriptId: action.scriptId,
      lastAppliedSha256: HASH_A,
      status: 'synced',
    });
  });

  it('keeps deleted review actions pointed at the removed folder path', () => {
    const scriptId = createLocalWorkspaceProjectScriptId(PROJECT_ID, 'removed.user.js');
    const result = reconcileLocalWorkspaceProject({
      projectId: PROJECT_ID,
      displayName: 'Example project',
      entries: [{
        relativePath: 'removed.user.js',
        scriptId,
        status: 'synced',
        lastAppliedSha256: HASH_A,
        lastAppliedVersion: '1.0.0',
        lastObservedSha256: HASH_A,
        lastObservedVersion: '1.0.0',
        lastObservedAt: 1,
      }],
      queue: [],
    }, [], [{ id: scriptId, sha256: HASH_A, version: '1.0.0' }], 600);

    expect(result.actions).toMatchObject([{
      kind: 'deleted',
      relativePath: 'removed.user.js',
      previousPath: '',
    }]);
  });
});
