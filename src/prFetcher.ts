/**
 * Orchestrates the ADO REST calls needed to render the status bar:
 *
 *   1. `_apis/connectionData` to discover the authenticated user id
 *   2. two parallel `_apis/git/pullrequests` queries
 *      (one for creator, one for reviewer) - results deduped
 *   3. per-PR `_apis/policy/evaluations` to get blocking policies,
 *      all run in parallel
 *
 * Returns raw ADO shapes; the projection into `PrViewModel` happens
 * in `viewModel.ts` so this module stays at the IO boundary.
 */

import { adoGet } from './adoClient.js';
import {
  PolicyEvaluations,
  PrRole,
  RawPolicyEvaluation,
  RawPullRequest,
} from './types.js';

interface ConnectionData {
  authenticatedUser: { id: string };
}

interface PrListResponse {
  value: RawPullRequest[];
}

interface PolicyListResponse {
  value: RawPolicyEvaluation[];
}

export interface PrFetchResult {
  userId: string;
  prs: RawPullRequest[];
  /** Per-PR blocking policies, or `null` for a PR whose policy fetch failed. */
  policies: Map<number, PolicyEvaluations>;
  roleByPr: Map<number, PrRole>;
}

/**
 * Fetch every active PR the user is involved in - either as creator or
 * as an assigned reviewer - and the blocking policy state for each.
 *
 * @param token bearer access token
 */
export async function fetchMyPrs(token: string): Promise<PrFetchResult> {
  const conn = await adoGet<ConnectionData>(
    '/_apis/connectionData?api-version=7.1-preview',
    token,
  );
  const userId = conn.authenticatedUser.id;

  const [created, reviewing] = await Promise.all([
    adoGet<PrListResponse>(
      `/_apis/git/pullrequests?searchCriteria.creatorId=${userId}&searchCriteria.status=active&api-version=7.1`,
      token,
    ),
    adoGet<PrListResponse>(
      `/_apis/git/pullrequests?searchCriteria.reviewerId=${userId}&searchCriteria.status=active&api-version=7.1`,
      token,
    ),
  ]);

  const { prs, roleByPr } = mergePrLists(created.value, reviewing.value);
  const policies = await fetchPoliciesForPrs(prs, token);

  return { userId, prs, policies, roleByPr };
}

/**
 * Dedup the creator-of and reviewer-on lists by PR id, recording which
 * role (or both) the user has on each PR.
 *
 * Pure helper, exported only so tests can exercise the merge logic.
 */
export function mergePrLists(
  created: RawPullRequest[],
  reviewing: RawPullRequest[],
): { prs: RawPullRequest[]; roleByPr: Map<number, PrRole> } {
  const byId = new Map<number, RawPullRequest>();
  const roleByPr = new Map<number, PrRole>();

  for (const p of created) {
    byId.set(p.pullRequestId, p);
    roleByPr.set(p.pullRequestId, 'creator');
  }
  for (const p of reviewing) {
    if (byId.has(p.pullRequestId)) {
      roleByPr.set(p.pullRequestId, 'both');
    } else {
      byId.set(p.pullRequestId, p);
      roleByPr.set(p.pullRequestId, 'reviewer');
    }
  }

  return { prs: Array.from(byId.values()), roleByPr };
}

/**
 * Fetch blocking policy evaluations for every PR in parallel. A failed fetch
 * for a single PR records `null` (unknown) rather than an empty list, so the
 * colour rules can keep that PR yellow instead of mistaking a fetch failure
 * for "no blocking policies" and showing it as green.
 */
async function fetchPoliciesForPrs(
  prs: RawPullRequest[],
  token: string,
): Promise<Map<number, PolicyEvaluations>> {
  const result = new Map<number, PolicyEvaluations>();

  await Promise.all(
    prs.map(async pr => {
      const evaluations = await fetchPolicyForPr(pr, token);
      result.set(pr.pullRequestId, evaluations);
    }),
  );

  return result;
}

/**
 * Fetch blocking policy evaluations for a single PR. Returns the (possibly
 * empty) list of blocking, applicable evaluations on success, or `null` when
 * the fetch fails - so callers can tell "confirmed no policies" apart from
 * "could not determine". A `null` never resolves to green.
 */
async function fetchPolicyForPr(
  pr: RawPullRequest,
  token: string,
): Promise<PolicyEvaluations> {
  const artifactRaw = `vstfs:///CodeReview/CodeReviewId/${pr.repository.project.id}/${pr.pullRequestId}`;
  const artifact = encodeURIComponent(artifactRaw);
  const project = encodeURIComponent(pr.repository.project.name);
  const path = `/${project}/_apis/policy/evaluations?artifactId=${artifact}&api-version=7.1-preview`;
  try {
    const data = await adoGet<PolicyListResponse>(path, token);
    return data.value.filter(
      p => p.configuration.isBlocking && p.status !== 'notApplicable',
    );
  } catch {
    // Unknown - a transient/auth failure must not be read as "no policies"
    // (which would now show green). Degrade to yellow via the null sentinel.
    return null;
  }
}
