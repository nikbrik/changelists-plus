import { GitResult, GitRunOptions, GitService } from '../gitService';

export type FakeGitOutcome =
  | { type: 'result'; result: GitResult }
  | { type: 'error'; error: Error }
  | { type: 'gate'; gate: FakeGitGate };

export interface FakeGitCall {
  args: string[];
  options: GitRunOptions;
}

export class FakeGitGate {
  private settle?: (result: GitResult) => void;
  readonly started = new Promise<void>((resolve) => { this.markStarted = resolve; });
  private markStarted!: () => void;

  wait(): Promise<GitResult> {
    this.markStarted();
    return new Promise((resolve) => { this.settle = resolve; });
  }

  release(result: GitResult = { code: 0, stdout: '', stderr: '' }): void {
    if (!this.settle) throw new Error('Fake Git gate has not started');
    this.settle(result);
  }
}

/** Deterministic Git test double: results, spawn errors and hangs are explicitly released by tests. */
export class FakeGitService extends GitService {
  readonly calls: FakeGitCall[] = [];
  private readonly outcomes: FakeGitOutcome[] = [];

  constructor() { super('test-only-fake-git'); }

  enqueue(...outcomes: FakeGitOutcome[]): void { this.outcomes.push(...outcomes); }

  override async run(args: string[], options: GitRunOptions = {}): Promise<GitResult> {
    this.calls.push({ args: [...args], options });
    const outcome = this.outcomes.shift();
    if (!outcome) throw new Error(`Unexpected Git call: git ${args.join(' ')}`);
    if (outcome.type === 'error') throw outcome.error;
    if (outcome.type === 'gate') return outcome.gate.wait();
    return outcome.result;
  }

  assertDrained(): void {
    if (this.outcomes.length !== 0) throw new Error(`${this.outcomes.length} fake Git outcomes unused`);
  }
}
