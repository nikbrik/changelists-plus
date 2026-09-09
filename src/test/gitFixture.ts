import { execFileSync } from 'child_process';
import { GitService } from '../gitService';
import { ChangelistStore } from '../changelistStore';
import { temporaryDirectory } from './fsFixture';

export const GIT = 'git';

export function git(dir: string, args: string[], input?: string | Buffer, env?: NodeJS.ProcessEnv): string {
  return execFileSync(GIT, args, {
    cwd: dir,
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : undefined,
  });
}

export function makeRepo(): string {
  const dir = temporaryDirectory('sc-test-');
  git(dir, ['init', '-b', 'main', '-q']);
  // Local settings make the fixture independent from the developer's identity,
  // signing policy and globally configured hooks without changing user config.
  git(dir, ['config', 'user.email', 'test@changelists-plus.invalid']);
  git(dir, ['config', 'user.name', 'Changelists Plus Tests']);
  git(dir, ['config', 'commit.gpgSign', 'false']);
  git(dir, ['config', 'core.hooksPath', '.git/hooks']);
  return dir;
}

export function commitAll(dir: string, message: string): void {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-m', message, '-q']);
}

export function newEngine(dir: string): { gitSvc: GitService; store: ChangelistStore } {
  const gitSvc = new GitService(GIT);
  const store = new ChangelistStore(temporaryDirectory('sc-store-') + '/store.json');
  return { gitSvc, store };
}
