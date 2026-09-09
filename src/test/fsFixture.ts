import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { trackTemporaryPath } from './harness';

export function temporaryDirectory(prefix: string): string {
  return trackTemporaryPath(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function writeFile(dir: string, rel: string, content: string | Buffer): void {
  const target = path.join(dir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

export function readFile(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}
