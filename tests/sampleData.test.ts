import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergePrLists } from '../src/prFetcher.js';
import { resolveGroups } from '../src/categoryModel.js';
import { toViewModels } from '../src/viewModel.js';
import {
  PolicyEvaluations,
  PrCategory,
  PrColor,
  RawPolicyEvaluation,
  RawPullRequest,
} from '../src/types.js';

/**
 * Loads the offline sample fixture (docs/ado-sample-data.json), drives it
 * through the real pure pipeline exactly as fetchMyPrs would, and asserts
 * each PR's resolved colour/category. This guards docs/ado-data-contract.md:
 * if the colour/category rules change, the documented expectation table must
 * be updated to match (or this test fails).
 */

interface PrListResponse {
  value: RawPullRequest[];
}
interface PolicyResponse {
  value: RawPolicyEvaluation[];
}
interface SampleData {
  connectionData: { authenticatedUser: { id: string } };
  pullRequestsByCreator: PrListResponse;
  pullRequestsByReviewer: PrListResponse;
  policyEvaluationsByPullRequestId: Record<string, PolicyResponse>;
}

const data = JSON.parse(
  readFileSync(new URL('../docs/ado-sample-data.json', import.meta.url), 'utf8'),
) as SampleData;

/** Build the policy map the way fetchPolicyForPr does (filter blocking, applicable). */
function buildPolicyMap(prs: RawPullRequest[]): Map<number, PolicyEvaluations> {
  const map = new Map<number, PolicyEvaluations>();
  for (const pr of prs) {
    const raw = data.policyEvaluationsByPullRequestId[String(pr.pullRequestId)];
    map.set(
      pr.pullRequestId,
      raw.value.filter(
        p => p.configuration.isBlocking && p.status !== 'notApplicable',
      ),
    );
  }
  return map;
}

const userId = data.connectionData.authenticatedUser.id;
const { prs, roleByPr } = mergePrLists(
  data.pullRequestsByCreator.value,
  data.pullRequestsByReviewer.value,
);
const vms = toViewModels(prs, buildPolicyMap(prs), roleByPr, new Set(), userId);
const byId = new Map(vms.map(v => [v.prId, v]));

const EXPECTED: Record<number, { color: PrColor; category: PrCategory }> = {
  101: { color: 'green', category: 'approved' },
  102: { color: 'green', category: 'approved' },
  110: { color: 'green', category: 'approved' },
  103: { color: 'red', category: 'actionRequired' },
  104: { color: 'yellow', category: 'actionRequired' },
  107: { color: 'red', category: 'actionRequired' },
  201: { color: 'yellow', category: 'actionRequired' },
  105: { color: 'yellow', category: 'pending' },
  202: { color: 'yellow', category: 'pending' },
  106: { color: 'green', category: 'other' },
};

describe('ado-sample-data.json fixture', () => {
  it('dedups to 10 unique PRs (110 appears in both lists)', () => {
    expect(prs).toHaveLength(10);
  });

  it('marks PR 110 as role "both"', () => {
    expect(roleByPr.get(110)).toBe('both');
  });

  for (const [prId, expected] of Object.entries(EXPECTED)) {
    it(`PR ${prId} resolves to ${expected.color} / ${expected.category}`, () => {
      const vm = byId.get(Number(prId));
      expect(vm, `PR ${prId} missing from view models`).toBeDefined();
      expect(vm!.color).toBe(expected.color);
      expect(vm!.category).toBe(expected.category);
    });
  }

  it('groups into Approved (3), User action required (4), Pending (2), Other (1)', () => {
    const groups = resolveGroups(vms, new Map(), []);
    const counts = Object.fromEntries(groups.map(g => [g.id, g.vms.length]));
    expect(counts).toEqual({
      approved: 3,
      actionRequired: 4,
      pending: 2,
      other: 1,
    });
  });
});
