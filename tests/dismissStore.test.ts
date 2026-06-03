import { beforeEach, describe, expect, it } from 'vitest';
import {
  allRecords,
  dismiss,
  loadActive,
  undismissAll,
  undismissOne,
} from '../src/dismissStore.js';
import { GLOBAL_STATE_KEY } from '../src/constants.js';
import { DismissRecord, MementoLike } from '../src/types.js';
import { pr } from './fixtures.js';

/**
 * Minimal Map-backed `Memento` so we can exercise dismissStore.ts
 * without importing `vscode` (which would fail outside the extension host).
 */
function makeMemento(): MementoLike {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      if (store.has(key)) return store.get(key) as T;
      return defaultValue;
    },
    async update(key: string, value: unknown) {
      store.set(key, value);
    },
  };
}

describe('dismissStore', () => {
  let memento: MementoLike;
  const NOW = '2026-06-02T10:00:00Z';

  beforeEach(() => {
    memento = makeMemento();
  });

  it('round-trips a single dismissal', async () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    await dismiss(memento, p, NOW);
    const active = loadActive(memento, [p]);
    expect(active.has(p.pullRequestId)).toBe(true);
  });

  it('auto-undismisses when the source commit changes', async () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    await dismiss(memento, p, NOW);
    const updated = { ...p, lastMergeSourceCommit: { commitId: 'bbb' } };
    const active = loadActive(memento, [updated]);
    expect(active.has(p.pullRequestId)).toBe(false);
  });

  it('auto-undismisses when commit goes from null to a value', async () => {
    const p = pr({ lastMergeSourceCommit: null });
    await dismiss(memento, p, NOW);
    const updated = { ...p, lastMergeSourceCommit: { commitId: 'first-push' } };
    const active = loadActive(memento, [updated]);
    expect(active.has(p.pullRequestId)).toBe(false);
  });

  it('stays dismissed across multiple refreshes with the same commit', async () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    await dismiss(memento, p, NOW);
    loadActive(memento, [p]);
    loadActive(memento, [p]);
    const active = loadActive(memento, [p]);
    expect(active.has(p.pullRequestId)).toBe(true);
  });

  it('prunes records for PRs no longer in the active list', async () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    await dismiss(memento, p, NOW);
    const active = loadActive(memento, []);
    expect(active.size).toBe(0);
    expect(allRecords(memento)).toHaveLength(0);
  });

  it('persists the pruned set after auto-undismissing', async () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    await dismiss(memento, p, NOW);
    const updated = { ...p, lastMergeSourceCommit: { commitId: 'bbb' } };
    loadActive(memento, [updated]);
    expect(allRecords(memento)).toHaveLength(0);
  });

  it('dismiss replaces an existing record rather than duplicating it', async () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    await dismiss(memento, p, NOW);
    await dismiss(memento, p, '2026-06-02T11:00:00Z');
    const records = allRecords(memento);
    expect(records).toHaveLength(1);
    expect(records[0].dismissedAtIso).toBe('2026-06-02T11:00:00Z');
  });

  it('undismissOne clears only the targeted PR', async () => {
    const p1 = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    const p2 = pr({ lastMergeSourceCommit: { commitId: 'bbb' } });
    await dismiss(memento, p1, NOW);
    await dismiss(memento, p2, NOW);
    await undismissOne(memento, p1.pullRequestId);
    const active = loadActive(memento, [p1, p2]);
    expect(active.has(p1.pullRequestId)).toBe(false);
    expect(active.has(p2.pullRequestId)).toBe(true);
  });

  it('undismissOne is a no-op for a PR that was not dismissed', async () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    await dismiss(memento, p, NOW);
    await undismissOne(memento, 999999);
    expect(allRecords(memento)).toHaveLength(1);
  });

  it('undismissAll clears every record', async () => {
    const p1 = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    const p2 = pr({ lastMergeSourceCommit: { commitId: 'bbb' } });
    await dismiss(memento, p1, NOW);
    await dismiss(memento, p2, NOW);
    expect(allRecords(memento)).toHaveLength(2);
    await undismissAll(memento);
    expect(allRecords(memento)).toHaveLength(0);
  });

  it('returns an empty set when storage is fresh', () => {
    const active = loadActive(memento, [pr()]);
    expect(active.size).toBe(0);
  });

  it('handles null commit at both dismiss time and load time as still-dismissed', async () => {
    const p = pr({ lastMergeSourceCommit: null });
    await dismiss(memento, p, NOW);
    const active = loadActive(memento, [p]);
    expect(active.has(p.pullRequestId)).toBe(true);
  });

  it('multiple PRs dismissed: only the one with new activity gets undismissed', async () => {
    const a = pr({ lastMergeSourceCommit: { commitId: 'a1' } });
    const b = pr({ lastMergeSourceCommit: { commitId: 'b1' } });
    await dismiss(memento, a, NOW);
    await dismiss(memento, b, NOW);
    const aRefreshed = { ...a, lastMergeSourceCommit: { commitId: 'a2' } };
    const active = loadActive(memento, [aRefreshed, b]);
    expect(active.has(a.pullRequestId)).toBe(false);
    expect(active.has(b.pullRequestId)).toBe(true);
  });

  it('stores under the versioned key', async () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'aaa' } });
    await dismiss(memento, p, NOW);
    const direct = memento.get<DismissRecord[]>(GLOBAL_STATE_KEY);
    expect(direct).toBeDefined();
    expect(direct).toHaveLength(1);
  });
});
