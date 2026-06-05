# ADO Data Contract (and offline test fixture)

What the extension fetches from Azure DevOps, the exact shapes it reads, and a synthetic dataset ([ado-sample-data.json](ado-sample-data.json)) that exercises every colour and sidebar category - so the rendering logic can be tested on a machine with no ADO access.

> The sample file contains only the **subset of fields the extension reads** (see the `Raw*` types in [src/types.ts](../src/types.ts)). Real ADO responses carry many more fields; the extension ignores them, so they are omitted here for clarity.

---

## The four requests

All requests go to base URL `https://dev.azure.com/<organization>` with an `Authorization: Bearer <AAD token>` header. They run in this order inside [`fetchMyPrs`](../src/prFetcher.ts):

| # | Purpose | Method + path | Response (read fields) |
|---|---|---|---|
| 1 | Who am I | `GET /_apis/connectionData?api-version=7.1-preview` | `{ authenticatedUser: { id } }` |
| 2 | PRs I created | `GET /_apis/git/pullrequests?searchCriteria.creatorId={id}&searchCriteria.status=active&api-version=7.1` | `{ value: RawPullRequest[] }` |
| 3 | PRs I review | `GET /_apis/git/pullrequests?searchCriteria.reviewerId={id}&searchCriteria.status=active&api-version=7.1` | `{ value: RawPullRequest[] }` |
| 4 | Policy state (per PR, in parallel) | `GET /{project}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{project.id}/{prId}&api-version=7.1-preview` | `{ value: RawPolicyEvaluation[] }` |

Lists 2 and 3 are merged and deduped by `pullRequestId` ([`mergePrLists`](../src/prFetcher.ts)); a PR in both lists gets role `both`.

---

## Shapes (the fields that matter)

### `RawPullRequest`
| Field | Type | Used for |
|---|---|---|
| `pullRequestId` | number | identity, dismiss key, policy lookup |
| `title` | string | row label |
| `isDraft` | boolean | `other` category |
| `status` | `'active' \| 'completed' \| 'abandoned'` | non-active -> `other` |
| `mergeStatus` | string | value `'conflicts'` -> red. **String form (api-version 7.1)**, not the numeric enum some APIs return |
| `creationDate` | ISO string | newest-first sort |
| `repository.name` / `repository.project.name` | string | row label, web URL |
| `repository.project.id` | string | policy `artifactId` |
| `reviewers[]` | `{ id, displayName, vote, isRequired? }` | colour, category, "my vote" |
| `reviewers[].vote` | `-10 \| -5 \| 0 \| 5 \| 10` | -10 = rejected, -5 = waiting for author, 0 = no vote, 5/10 = approved |
| `lastMergeSourceCommit.commitId` | string \| null | dismiss auto-undismiss signal |

### `RawPolicyEvaluation`
| Field | Type | Used for |
|---|---|---|
| `status` | `'approved' \| 'rejected' \| 'running' \| 'queued' \| 'broken' \| 'notApplicable'` | colour, category |
| `configuration.isBlocking` | boolean | only blocking policies count |
| `configuration.type.displayName` | string | status summary text |

The extension keeps only evaluations where `isBlocking === true && status !== 'notApplicable'`.

---

## How fields decide colour and category

Colour ([`colorForPr`](../src/viewModel.ts)), highest precedence first:
- **Red** - `mergeStatus === 'conflicts'` OR any reviewer voted `-10`.
- **Yellow** - policy state **unknown** (fetch failed -> `null`) OR any blocking policy not `approved` OR any required reviewer at vote `0`/`-5`.
- **Green** - none of the above; includes "no blocking policies exist at all".

Category ([`categorize`](../src/viewModel.ts)):
- **Other** - draft or non-`active`.
- **User action required** - I'm the author and (conflicts OR a `-10` OR a `rejected`/`broken` blocking policy); OR I'm a reviewer who hasn't voted (`myVote === 0`).
- **Approved (not merged)** - colour is green.
- **Pending approval** - anything else (waiting on others).

> **Known empty vs unknown policies**: an empty `value: []` (or a list with no blocking entries) means ADO confirmed there are no blocking policies -> can be green. A *failed* policy fetch is represented as `null` in code (`PolicyEvaluations`) and stays yellow. This fixture only encodes successful fetches; to simulate the unknown case in a test, pass `null` as a PR's policies instead of an array.

---

## What each sample PR exercises

From [ado-sample-data.json](ado-sample-data.json):

| PR | repo | role | what it tests | colour | category |
|---|---|---|---|---|---|
| 101 | gateway-service | creator | all blocking policies approved, approved reviewer; non-blocking + notApplicable entries get filtered out | green | Approved |
| 102 | argocd | creator | **no blocking policies** (gitops repo) - the case that motivated "no-policy = green" | green | Approved |
| 110 | platform-infra | both | appears in creator + reviewer lists -> role `both`; fully approved | green | Approved |
| 103 | gateway-service | creator | `mergeStatus: conflicts` | red | User action required |
| 104 | platform-infra | creator | a `rejected` blocking policy (Build) | yellow | User action required |
| 107 | gateway-service | creator | a reviewer voted `-10` | red | User action required |
| 201 | argocd | reviewer | I'm a required reviewer who hasn't voted (`vote: 0`) | yellow | User action required |
| 105 | gateway-service | creator | a `running` blocking policy, nothing failing | yellow | Pending approval |
| 202 | platform-infra | reviewer | I approved (`10`); another required reviewer (Carol) is at `0` | yellow | Pending approval |
| 106 | gateway-service | creator | `isDraft: true` | (n/a) | Other |

There are 11 list entries across the two PR responses; PR 110 is in both, so after dedup there are **10 unique PRs**. Expect groups: Approved (3) · User action required (4) · Pending approval (2) · Other (1).

Two edges worth knowing, not encoded as their own rows: a required reviewer at `-5` ("waiting for author") makes a PR yellow/Pending even though the author arguably should act; and a reviewer-only PR that is red because *someone else* rejected, where you already voted, lands in Pending (red icon, Pending group). Both follow from the rules above.

---

## Using the fixture as a mock

The single seam to stub is [`fetchMyPrs(token)`](../src/prFetcher.ts), which returns:

```ts
interface PrFetchResult {
  userId: string;
  prs: RawPullRequest[];
  policies: Map<number, PolicyEvaluations>; // PolicyEvaluations = RawPolicyEvaluation[] | null
  roleByPr: Map<number, PrRole>;
}
```

To build that from [ado-sample-data.json](ado-sample-data.json):

```ts
import data from './docs/ado-sample-data.json';
import { mergePrLists } from './src/prFetcher.js';
import { toViewModels } from './src/viewModel.js';

const userId = data.connectionData.authenticatedUser.id;
const { prs, roleByPr } = mergePrLists(
  data.pullRequestsByCreator.value,
  data.pullRequestsByReviewer.value,
);

const policies = new Map<number, RawPolicyEvaluation[] | null>();
for (const pr of prs) {
  const raw = data.policyEvaluationsByPullRequestId[String(pr.pullRequestId)];
  // Apply the same filter fetchPolicyForPr applies; use null to simulate a failed fetch.
  policies.set(
    pr.pullRequestId,
    raw.value.filter(p => p.configuration.isBlocking && p.status !== 'notApplicable'),
  );
}

// Drive the pure rendering pipeline with no ADO access:
const vms = toViewModels(prs, policies, roleByPr, new Set(), userId);
// vms now carries .color and .category for every PR - assert or render away.
```

Strip the `_README`, `_endpoint`, and `_note` helper keys if your loader is strict; they are documentation only and are ignored by the field-by-field access above.

> There is no built-in offline mode in the extension itself - `fetchMyPrs` always calls ADO. This file is for driving the **pure** logic (`mergePrLists`, `toViewModels`, `resolveGroups`) in a test or a small harness. If you later want the running extension to render from a file with no ADO, that needs a small code change (a `prStatus.mockDataPath` setting feeding `fetchMyPrs`) - ask and it can be added.
