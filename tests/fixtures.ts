/**
 * Shared fixture builders for tests. Keep them tiny - each builder
 * produces the minimum object the function under test needs, with
 * sensible defaults that can be overridden by spreading.
 */

import {
  PolicyStatus,
  PrViewModel,
  RawPolicyEvaluation,
  RawPullRequest,
  ReviewerVote,
} from '../src/types.js';

let prIdCounter = 1;

/**
 * Build a `RawPullRequest` with all the fields the code reads. Pass an
 * override object to set specific fields - e.g. `pr({ mergeStatus: 'conflicts' })`.
 */
export function pr(overrides: Partial<RawPullRequest> = {}): RawPullRequest {
  const id = prIdCounter++;
  return {
    pullRequestId: id,
    title: `PR ${id}`,
    isDraft: false,
    status: 'active',
    mergeStatus: 'succeeded',
    creationDate: '2026-01-01T00:00:00Z',
    sourceRefName: 'refs/heads/feature',
    targetRefName: 'refs/heads/main',
    url: `https://example/api/pr/${id}`,
    repository: {
      id: 'repo-id',
      name: 'my-repo',
      project: { id: 'proj-id', name: 'My Project' },
    },
    reviewers: [],
    lastMergeSourceCommit: { commitId: 'commit-aaa' },
    ...overrides,
  };
}

/**
 * Build a reviewer entry inline. The cast to `ReviewerVote` is safe
 * because we only call this with literal vote values.
 */
export function reviewer(
  name: string,
  vote: ReviewerVote,
  isRequired = false,
) {
  return { id: `id-${name}`, displayName: name, vote, isRequired };
}

/** Build a blocking policy evaluation with the given status. */
export function policy(
  status: PolicyStatus,
  displayName = 'Some Policy',
): RawPolicyEvaluation {
  return {
    status,
    configuration: { isBlocking: true, type: { displayName } },
  };
}

/**
 * Build a `PrViewModel` with sensible defaults for presentation / grouping
 * tests. Override any field by spreading - e.g. `vm({ category: 'pending' })`.
 */
export function vm(overrides: Partial<PrViewModel> = {}): PrViewModel {
  const id = overrides.prId ?? 42;
  return {
    prId: id,
    title: 'Add the thing',
    repo: 'my-repo',
    project: 'My Project',
    webUrl: `https://dev.azure.com/org/proj/_git/my-repo/pullrequest/${id}`,
    createdAt: '2026-01-01T00:00:00Z',
    isDraft: false,
    myRole: 'creator',
    myVote: null,
    lastActivityCommitId: 'commit-aaa',
    color: 'green',
    category: 'approved',
    statusSummary: 'Ready to merge',
    policies: [],
    reviewers: [],
    ...overrides,
  };
}
