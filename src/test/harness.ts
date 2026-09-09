import * as fs from 'fs';

export type SuiteKind = 'unit' | 'integration' | 'contract';

interface TestCase {
  name: string;
  kind: SuiteKind;
  fn?: () => Promise<void> | void;
  reason?: string;
}

const tests: TestCase[] = [];
const temporaryPaths = new Set<string>();

export function test(name: string, fn: () => Promise<void> | void, kind: SuiteKind = 'integration'): void {
  tests.push({ name, kind, fn });
}

export function unitTest(name: string, fn: () => Promise<void> | void): void {
  test(name, fn, 'unit');
}

export function contractTest(name: string, fn: () => Promise<void> | void): void {
  test(name, fn, 'contract');
}

/** A known unsafe behavior. Pending cases are executable specifications for the target epic. */
export function knownRisk(name: string, targetEpic: string, reason: string): void {
  tests.push({ name: `KNOWN RISK [${targetEpic}] ${name}`, kind: 'contract', reason });
}

export function trackTemporaryPath(path: string): string {
  temporaryPaths.add(path);
  return path;
}

async function cleanupTemporaryPaths(): Promise<void> {
  for (const path of temporaryPaths) {
    try {
      fs.rmSync(path, { recursive: true, force: true });
    } finally {
      temporaryPaths.delete(path);
    }
  }
}

export async function runRegisteredTests(): Promise<void> {
  const suiteIndex = process.argv.indexOf('--suite');
  const requested = (suiteIndex >= 0 ? process.argv[suiteIndex + 1] : undefined) as SuiteKind | undefined;
  if (requested && !['unit', 'integration', 'contract'].includes(requested)) {
    throw new Error(`Unknown TEST_SUITE: ${requested}`);
  }
  const selected = tests.filter((t) => !requested || t.kind === requested);
  let passed = 0;
  let pending = 0;
  const failures: string[] = [];
  const started = Date.now();

  for (const t of selected) {
    if (!t.fn) {
      pending++;
      process.stdout.write(`PENDING ${t.name}: ${t.reason}\n`);
      continue;
    }
    try {
      await t.fn();
      passed++;
      process.stdout.write(`PASS [${t.kind}] ${t.name}\n`);
    } catch (e) {
      failures.push(t.name + ': ' + (e instanceof Error ? (e.stack ?? e.message) : String(e)));
      process.stdout.write(`FAIL [${t.kind}] ${t.name}\n`);
    } finally {
      await cleanupTemporaryPaths();
    }
  }

  process.stdout.write(
    `\n${passed} passed, ${failures.length} failed, ${pending} pending (${Date.now() - started}ms)\n`,
  );
  if (failures.length > 0) {
    process.stdout.write('\n--- Failures ---\n');
    for (const failure of failures) {
      process.stdout.write(failure + '\n\n');
    }
    process.exitCode = 1;
  }
}
