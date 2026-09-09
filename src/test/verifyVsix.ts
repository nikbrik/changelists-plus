import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const vsix = process.argv[2];
if (!vsix) throw new Error('Usage: npm run verify:vsix -- path/to/extension.vsix');

const root = path.resolve(__dirname, '..', '..');
const archiveEntries = execFileSync('unzip', ['-Z1', vsix], { encoding: 'utf8' }).trim().split('\n');
assert.ok(
  !archiveEntries.some((entry) => entry.startsWith('extension/dist/test/')),
  'test-only JavaScript must not be shipped in VSIX',
);
const packagedJavaScript = archiveEntries
  .filter((entry) => entry.startsWith('extension/dist/') && entry.endsWith('.js'))
  .map((entry) => entry.slice('extension/'.length));
assert.ok(packagedJavaScript.includes('dist/extension.js'), 'extension/dist/extension.js missing from VSIX');
assert.ok(!packagedJavaScript.some((entry) => entry.startsWith('dist/test/')), 'test code must not ship in VSIX');
const localFiles = ['package.json', ...packagedJavaScript];

for (const relative of localFiles) {
  const archivePath = `extension/${relative}`;
  assert.ok(archiveEntries.includes(archivePath), `${archivePath} missing from VSIX`);
  const archived = execFileSync('unzip', ['-p', vsix, archivePath]);
  const local = fs.readFileSync(path.join(root, relative));
  assert.ok(archived.equals(local), `${archivePath} differs from the checked-out build`);
}

process.stdout.write(`Verified ${localFiles.length} source/build files against ${vsix}\n`);
