import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { git } from './gitFixture';

export interface RepositorySnapshot {
  head: string;
  indexEntries: string;
  stagedPatch: string;
  worktree: ReadonlyMap<string, string>;
}

function digest(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function snapshotWorktree(root: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name === '.git') continue;
      const absolute = path.join(dir, item.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (item.isSymbolicLink()) entries.set(relative, `symlink:${fs.readlinkSync(absolute)}`);
      else if (item.isDirectory()) walk(absolute);
      else entries.set(relative, `file:${digest(fs.readFileSync(absolute))}`);
    }
  };
  walk(root);
  return entries;
}

export function snapshotRepository(root: string): RepositorySnapshot {
  return {
    head: git(root, ['rev-parse', '-q', '--verify', 'HEAD']).trim(),
    indexEntries: git(root, ['ls-files', '--stage', '-z']),
    stagedPatch: git(root, ['diff', '--cached', '--binary', '--no-ext-diff']),
    worktree: snapshotWorktree(root),
  };
}
