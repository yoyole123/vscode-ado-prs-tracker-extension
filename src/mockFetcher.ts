/**
 * Offline mock for `fetchMyPrs`. Assembles a `PrFetchResult` from the
 * static fixture at docs/ado-sample-data.json so the extension can be
 * exercised on a machine that has no Azure DevOps access.
 *
 * Enable via VS Code setting: `prStatus.mockMode: true`
 */

import { mergePrLists, PrFetchResult } from './prFetcher.js';
import { PolicyEvaluations, RawPolicyEvaluation, RawPullRequest } from './types.js';
import sampleData from '../docs/ado-sample-data.json';

type PolicyEntry = { value: RawPolicyEvaluation[] };
type PolicyMap = Record<string, PolicyEntry | string>;

export async function fetchMockPrs(): Promise<PrFetchResult> {
  const userId = sampleData.connectionData.authenticatedUser.id;

  const created = sampleData.pullRequestsByCreator.value as unknown as RawPullRequest[];
  const reviewing = sampleData.pullRequestsByReviewer.value as unknown as RawPullRequest[];

  const { prs, roleByPr } = mergePrLists(created, reviewing);

  const rawPolicies = sampleData.policyEvaluationsByPullRequestId as unknown as PolicyMap;
  const policies = new Map<number, PolicyEvaluations>();
  for (const [key, entry] of Object.entries(rawPolicies)) {
    // Skip metadata fields (_endpoint, _note, etc.)
    const prId = parseInt(key, 10);
    if (isNaN(prId)) continue;
    policies.set(prId, (entry as PolicyEntry).value as RawPolicyEvaluation[]);
  }

  return { userId, prs, policies, roleByPr };
}
