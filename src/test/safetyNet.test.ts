import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { commitChangelist } from '../commitEngine';
import { GitRunOptions, GitService } from '../gitService';
import { parseGitDiff } from '../diffParser';
import { FakeGitGate, FakeGitService } from './fakeGit';
import { commitAll, git, makeRepo, newEngine } from './gitFixture';
import { knownRisk, contractTest, test, unitTest } from './harness';
import { RepositorySnapshot, snapshotRepository } from './repoSnapshot';
import { writeFile } from './fsFixture';

function assertSnapshotEqual(actual: RepositorySnapshot, expected: RepositorySnapshot): void {
  assert.strictEqual(actual.head, expected.head, 'HEAD changed');
  assert.strictEqual(actual.indexEntries, expected.indexEntries, 'index entries changed');
  assert.strictEqual(actual.stagedPatch, expected.stagedPatch, 'staged patch changed');
  assert.deepStrictEqual([...actual.worktree], [...expected.worktree], 'worktree bytes changed');
}

export function registerSafetyNetTests(): void {
  unitTest('safety harness: fake Git supports result, spawn error and deterministic gate', async () => {
    const fake = new FakeGitService();
    const gate = new FakeGitGate();
    fake.enqueue(
      { type: 'result', result: { code: 7, stdout: 'out', stderr: 'err' } },
      { type: 'error', error: new Error('forced termination') },
      { type: 'gate', gate },
    );
    assert.deepStrictEqual(await fake.run(['one']), { code: 7, stdout: 'out', stderr: 'err' });
    await assert.rejects(fake.run(['two']), /forced termination/);
    const waiting = fake.run(['three']);
    await gate.started;
    gate.release({ code: -1, stdout: '', stderr: 'killed' });
    assert.deepStrictEqual(await waiting, { code: -1, stdout: '', stderr: 'killed' });
    fake.assertDrained();
  });

  test('safety fixture: repository identity, signing and hooks are locally isolated', () => {
    const dir = makeRepo();
    assert.strictEqual(git(dir, ['config', '--local', '--get', 'commit.gpgSign']).trim(), 'false');
    assert.strictEqual(git(dir, ['config', '--local', '--get', 'core.hooksPath']).trim(), '.git/hooks');
    assert.match(git(dir, ['config', '--local', '--get', 'user.email']).trim(), /invalid$/);
  });

  test('commit failure: hook preserves HEAD, index patch and worktree byte-for-byte', async () => {
    const dir = makeRepo();
    writeFile(dir, 'f.txt', Buffer.from('base\n'));
    commitAll(dir, 'init');
    writeFile(dir, 'f.txt', Buffer.from('changed\r\n'));
    writeFile(dir, 'staged.bin', Buffer.from([0, 1, 2, 255]));
    git(dir, ['add', 'staged.bin']);
    const { gitSvc, store } = newEngine(dir);
    const cl = store.createChangelist(dir, 'Failure');
    const change = parseGitDiff(await gitSvc.diffWorktree(dir)).find((f) => f.path === 'f.txt')!;
    store.setHunkOwners(dir, 'f.txt', change.hunks.map((h) => ({ id: h.id, oldStart: h.oldStart, oldLines: h.oldLines })), cl.id);
    const hook = path.join(dir, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hook, '#!/bin/sh\nexit 23\n', { mode: 0o755 });
    const before = snapshotRepository(dir);
    const result = await commitChangelist({ git: gitSvc, store, repoRoot: dir, changelistId: cl.id, message: 'fail' });
    assert.deepStrictEqual(result.ok, false);
    assertSnapshotEqual(snapshotRepository(dir), before);
  });

  test('commit fault injection: failure in temporary index leaves repository invariant', async () => {
    const dir = makeRepo();
    writeFile(dir, 'f.txt', 'base\n');
    commitAll(dir, 'init');
    writeFile(dir, 'f.txt', 'change\n');
    const real = new GitService('git');
    class FailingGit extends GitService {
      constructor() { super('git'); }
      override run(args: string[], options: GitRunOptions = {}) {
        if (args[0] === 'apply' && options.env?.GIT_INDEX_FILE) {
          return Promise.resolve({ code: 9, stdout: '', stderr: 'injected apply failure' });
        }
        return real.run(args, options);
      }
    }
    const { store } = newEngine(dir);
    const cl = store.createChangelist(dir, 'Failure');
    const fc = parseGitDiff(await real.diffWorktree(dir))[0];
    store.setHunkOwners(dir, 'f.txt', fc.hunks.map((h) => ({ id: h.id, oldStart: h.oldStart, oldLines: h.oldLines })), cl.id);
    const before = snapshotRepository(dir);
    const result = await commitChangelist({ git: new FailingGit(), store, repoRoot: dir, changelistId: cl.id, message: 'fail' });
    assert.deepStrictEqual(result, { ok: false, error: 'applyFailed', stderr: 'injected apply failure' });
    assertSnapshotEqual(snapshotRepository(dir), before);
  });

  test('repository snapshot: hashes binary bytes and records symlink targets', () => {
    const dir = makeRepo();
    writeFile(dir, 'target.bin', Buffer.from([0, 13, 10, 255]));
    fs.symlinkSync('target.bin', path.join(dir, 'link.bin'));
    commitAll(dir, 'snapshot fixture');
    const snapshot = snapshotRepository(dir);
    assert.match(snapshot.worktree.get('target.bin') ?? '', /^file:[a-f0-9]{64}$/);
    assert.strictEqual(snapshot.worktree.get('link.bin'), 'symlink:target.bin');
  });

  test('guards: rebase state rejects commit without touching repository', async () => {
    const dir = makeRepo();
    writeFile(dir, 'f.txt', 'base\n');
    commitAll(dir, 'init');
    writeFile(dir, 'f.txt', 'change\n');
    fs.mkdirSync(path.join(dir, '.git', 'rebase-merge'));
    const { gitSvc, store } = newEngine(dir);
    const cl = store.createChangelist(dir, 'Guard');
    const before = snapshotRepository(dir);
    const result = await commitChangelist({ git: gitSvc, store, repoRoot: dir, changelistId: cl.id, message: 'blocked' });
    assert.deepStrictEqual(result, { ok: false, error: 'mergeInProgress' });
    assertSnapshotEqual(snapshotRepository(dir), before);
  });

  contractTest('manifest: commands and current security-sensitive configuration are explicit', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      contributes: { commands: Array<{ command: string }>; configuration: { properties: Record<string, unknown> } };
      scripts: Record<string, string>;
    };
    const commands = new Set(manifest.contributes.commands.map((item) => item.command));
    for (const command of ['changelistsPlus.stageChangelist', 'changelistsPlus.commitChangelist', 'changelistsPlus.discardChangelist']) {
      assert.ok(commands.has(command), `missing command ${command}`);
    }
    assert.ok(manifest.contributes.configuration.properties['changelistsPlus.gitPath']);
    assert.ok(manifest.scripts['verify:vsix']);
  });

  knownRisk('Git process has a deadline and bounded stdout/stderr', '02', 'GitService currently has no timeout and stderr limit.');
  knownRisk('untrusted workspace cannot select an executable through gitPath', '03', 'Manifest currently allows workspace override and has no trust restriction.');
  knownRisk('safe minimal mode exposes staging but disables custom commit/discard', '04', 'Destructive commands are still contributed and registered.');
  knownRisk('concurrent HEAD/index mutation aborts before publishing results', '05', 'Operations do not yet coordinate or compare repository generations.');
  knownRisk('interrupted operation is discoverable and recoverable from a journal', '06', 'No backup journal or recovery protocol exists.');
  knownRisk('commit is atomic across HEAD and real-index restoration', '07', 'HEAD can advance before real-index restoration completes.');
  knownRisk('multi-file discard rolls back earlier files after a later failure', '08', 'Discard currently applies and deletes one file at a time.');
}
