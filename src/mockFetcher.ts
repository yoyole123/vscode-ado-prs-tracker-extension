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

export async function fetchMockPrs(baseUrl: string): Promise<PrFetchResult> {
  const userId = sampleData.connectionData.authenticatedUser.id;

  const created = rewriteOrgInPrUrls(
    sampleData.pullRequestsByCreator.value as unknown as RawPullRequest[],
    baseUrl,
  );
  const reviewing = rewriteOrgInPrUrls(
    sampleData.pullRequestsByReviewer.value as unknown as RawPullRequest[],
    baseUrl,
  );

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

function rewriteOrgInPrUrls(prs: RawPullRequest[], baseUrl: string): RawPullRequest[] {
  return prs.map(pr => ({
    ...pr,
    url: rewriteUrlBase(pr.url, baseUrl),
  }));
}

function rewriteUrlBase(rawUrl: string, baseUrl: string): string {
  try {
    const parsedUrl = new URL(rawUrl);
    const parsedBase = new URL(baseUrl);
    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return rawUrl;

    parts[0] = parsedBase.pathname.split('/').filter(Boolean)[0] ?? parts[0];
    parsedUrl.protocol = parsedBase.protocol;
    parsedUrl.host = parsedBase.host;
    parsedUrl.pathname = `/${parts.join('/')}`;
    return parsedUrl.toString();
  } catch {
    return rawUrl;
  }
}
