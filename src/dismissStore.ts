/**
 * Persistence layer for the dismissed-PR list.
 *
 * Uses VSCode's `Memento` for storage (passed in as `MementoLike` so
 * unit tests can supply a Map-backed fake). All functions are
 * synchronous reads / fire-and-forget writes - `update()` returns a
 * Thenable that we don't await because callers refresh from a freshly
 * loaded list anyway.
 */

import { GLOBAL_STATE_KEY } from './constants.js';
import { DismissRecord, MementoLike, RawPullRequest } from './types.js';

/**
 * Read the dismissed records from storage, prune any that should be
 * auto-undismissed, and return the set of currently active dismissals.
 *
 * Auto-undismiss rule: if the PR's current `lastMergeSourceCommit.commitId`
 * differs from the value captured at dismiss time, the dismissal is
 * dropped. PRs no longer in the active list (merged / abandoned) are
 * also pruned so storage doesn't grow without bound.
 *
 * @param memento     storage backend (real `ctx.globalState` or a fake)
 * @param currentPrs  the freshly-fetched list of active PRs
 * @returns the set of PR ids that remain dismissed
 */
export function loadActive(
  memento: MementoLike,
  currentPrs: RawPullRequest[],
): Set<number> {
  const stored = memento.get<DismissRecord[]>(GLOBAL_STATE_KEY) ?? [];
  const prById = new Map<number, RawPullRequest>(
    currentPrs.map(p => [p.pullRequestId, p]),
  );

  const active = new Set<number>();
  const remaining: DismissRecord[] = [];

  for (const rec of stored) {
    const pr = prById.get(rec.prId);
    // PR is no longer in the active list - drop the record entirely.
    if (!pr) continue;

    const currentCommitId = pr.lastMergeSourceCommit?.commitId ?? null;
    // Activity since dismiss - auto-undismiss.
    if (currentCommitId !== rec.lastActivityCommitIdAtDismiss) continue;

    active.add(rec.prId);
    remaining.push(rec);
  }

  // Persist pruned set only if it actually changed, to avoid spurious writes.
  if (remaining.length !== stored.length) {
    void memento.update(GLOBAL_STATE_KEY, remaining);
  }

  return active;
}

/**
 * Persist a new dismissal. Captures the current activity commit id so
 * future refreshes can detect new commits.
 *
 * @param memento  storage backend
 * @param pr       the PR being dismissed (provides current commit id)
 * @param nowIso   timestamp; injected so tests can pin it deterministically
 */
export async function dismiss(
  memento: MementoLike,
  pr: RawPullRequest,
  nowIso: string,
): Promise<void> {
  const stored = memento.get<DismissRecord[]>(GLOBAL_STATE_KEY) ?? [];
  // Replace any existing record for the same PR id so the activity baseline
  // reflects "now", not the moment of an earlier dismissal.
  const withoutThisPr = stored.filter(r => r.prId !== pr.pullRequestId);
  const next: DismissRecord = {
    prId: pr.pullRequestId,
    dismissedAtIso: nowIso,
    lastActivityCommitIdAtDismiss: pr.lastMergeSourceCommit?.commitId ?? null,
  };
  await memento.update(GLOBAL_STATE_KEY, [...withoutThisPr, next]);
}

/**
 * Clear the dismissal for a single PR, restoring it to the list.
 *
 * @param memento storage backend
 * @param prId    the PR to undismiss
 */
export async function undismissOne(
  memento: MementoLike,
  prId: number,
): Promise<void> {
  const stored = memento.get<DismissRecord[]>(GLOBAL_STATE_KEY) ?? [];
  const remaining = stored.filter(r => r.prId !== prId);
  if (remaining.length !== stored.length) {
    await memento.update(GLOBAL_STATE_KEY, remaining);
  }
}

/**
 * Clear every dismissal. Used by the `prStatus.undismissAll` command
 * as an escape hatch when the auto-undismiss rule misses a case
 * (e.g. PR has new comments but no new commits).
 */
export async function undismissAll(memento: MementoLike): Promise<void> {
  await memento.update(GLOBAL_STATE_KEY, []);
}

/**
 * Inspect the raw stored records (used for the tooltip "N hidden" hint
 * and as a debugging helper).
 */
export function allRecords(memento: MementoLike): DismissRecord[] {
  return memento.get<DismissRecord[]>(GLOBAL_STATE_KEY) ?? [];
}
