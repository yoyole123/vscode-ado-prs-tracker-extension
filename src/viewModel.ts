/**
 * Pure transformations from raw ADO shapes into UI-ready view models.
 *
 * No VSCode API access here. Every function is a pure function of its
 * arguments so it can be unit-tested without mocking.
 */

import { VOTE_LABEL } from './constants.js';
import {
  PolicyEvaluations,
  PrCategory,
  PrColor,
  PrPolicySummary,
  PrReviewerSummary,
  PrRole,
  PrViewModel,
  RawPullRequest,
} from './types.js';

/**
 * Decide the colour of a single PR. Precedence: red > yellow > green.
 *
 * @param pr        raw PR record from `/_apis/git/pullrequests`
 * @param policies  blocking policy evaluations (already filtered to
 *                  `isBlocking === true` and `status !== 'notApplicable'`),
 *                  or `null` when the policy fetch failed (state unknown)
 */
export function colorForPr(
  pr: RawPullRequest,
  policies: PolicyEvaluations,
): PrColor {
  // RED - terminal states requiring substantial rework.
  if (pr.mergeStatus === 'conflicts') return 'red';
  if (pr.reviewers.some(r => r.vote === -10)) return 'red';

  // YELLOW - action items still pending, or policy state we could not
  // determine. `null` (fetch failed) must stay yellow - we never claim green
  // on missing data. A known-empty list is fine: ADO confirmed there are no
  // blocking policies, so there is nothing to wait on.
  if (policies === null) return 'yellow';
  if (policies.some(p => p.status !== 'approved')) return 'yellow';
  if (pr.reviewers.some(r => r.isRequired === true && (r.vote === 0 || r.vote === -5))) {
    return 'yellow';
  }

  // GREEN - no merge conflicts, no rejections, every (if any) blocking policy
  // approved, and no required reviewer waiting. Includes repos with no
  // blocking policies configured at all.
  return 'green';
}

/**
 * Aggregate the per-PR colours into a single footer colour. Zero PRs
 * is treated as green (nothing to action).
 */
export function aggregateColor(vms: PrViewModel[]): PrColor {
  if (vms.length === 0) return 'green';
  if (vms.some(v => v.color === 'red')) return 'red';
  if (vms.some(v => v.color === 'yellow')) return 'yellow';
  return 'green';
}

/**
 * Build the human-readable single-line status string used by the
 * QuickPick `detail` field. Picks the most salient problem first.
 */
export function statusSummary(
  pr: RawPullRequest,
  policies: PolicyEvaluations,
  color: PrColor,
): string {
  if (pr.mergeStatus === 'conflicts') return 'Merge conflicts - rebase needed';
  const rejected = pr.reviewers.find(r => r.vote === -10);
  if (rejected) return `Rejected by ${rejected.displayName}`;

  if (policies === null) return 'Policy status unknown - try refresh';

  const failing = policies.find(p => p.status === 'rejected' || p.status === 'broken');
  if (failing) return `FAIL: ${failing.configuration.type.displayName}`;

  const running = policies.find(p => p.status === 'running' || p.status === 'queued');
  if (running) {
    return `${running.status.toUpperCase()}: ${running.configuration.type.displayName}`;
  }

  const waiting = pr.reviewers.find(r => r.isRequired === true && r.vote === -5);
  if (waiting) return `Waiting for author response (${waiting.displayName})`;

  const pending = pr.reviewers.find(r => r.isRequired === true && r.vote === 0);
  if (pending) return `Awaiting required reviewer: ${pending.displayName}`;

  if (policies.length === 0) {
    return color === 'green' ? 'Ready to merge - no required policies' : 'No blocking policies configured';
  }

  return color === 'green' ? 'Ready to merge' : 'Pending';
}

/**
 * Find the current user's own reviewer vote on a PR.
 *
 * @param pr      the raw PR record
 * @param userId  the authenticated user's id (empty when unknown)
 * @returns the user's vote, or null when they are not on the reviewer list
 */
export function myVoteFor(pr: RawPullRequest, userId: string): number | null {
  if (!userId) return null;
  const me = pr.reviewers.find(r => r.id === userId);
  return me ? me.vote : null;
}

/**
 * Decide which sidebar group a PR belongs to, from the current user's
 * perspective. Precedence: drafts and non-active PRs are `other`; then
 * "I must act" beats everything else; then ready-to-merge; otherwise it
 * is waiting on someone other than me.
 *
 * "I must act" means either:
 *  - I authored it (creator/both) and it has merge conflicts, a rejection,
 *    or a failed/broken blocking policy I need to address, or
 *  - I am a reviewer (reviewer/both) and have not cast a vote yet (vote 0).
 *
 * @param pr        the raw PR record
 * @param policies  blocking policy evaluations for the PR
 * @param role      the user's role on the PR
 * @param color     the PR's resolved colour (reused as the ready-to-merge signal)
 * @param myVote    the user's own reviewer vote, or null
 */
export function categorize(
  pr: RawPullRequest,
  policies: PolicyEvaluations,
  role: PrRole,
  color: PrColor,
  myVote: number | null,
): PrCategory {
  if (pr.isDraft || pr.status !== 'active') return 'other';

  const isAuthor = role === 'creator' || role === 'both';
  const isReviewer = role === 'reviewer' || role === 'both';

  const authorMustAct =
    pr.mergeStatus === 'conflicts' ||
    pr.reviewers.some(r => r.vote === -10) ||
    (policies?.some(p => p.status === 'rejected' || p.status === 'broken') ?? false);
  if (isAuthor && authorMustAct) return 'actionRequired';

  // A reviewer who has not voted yet (vote 0) still owes a review.
  if (isReviewer && myVote === 0) return 'actionRequired';

  if (color === 'green') return 'approved';

  return 'pending';
}

/**
 * Build the ADO web URL for a PR. The REST `url` field points at the
 * API endpoint, not the human-facing page.
 */
export function buildWebUrl(pr: RawPullRequest): string {
  const org = orgFromApiUrl(pr.url);
  if (!org) return pr.url;

  const project = encodeURIComponent(pr.repository.project.name);
  const repo = encodeURIComponent(pr.repository.name);
  return `https://dev.azure.com/${org}/${project}/_git/${repo}/pullrequest/${pr.pullRequestId}`;
}

function orgFromApiUrl(apiUrl: string): string | null {
  try {
    const parsed = new URL(apiUrl);
    if (parsed.hostname !== 'dev.azure.com') return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Map raw ADO entities into the projected view models the UI renders.
 * `dismissed` is the set of PR ids currently hidden; dismissed PRs are
 * filtered out of the result.
 */
export function toViewModels(
  prs: RawPullRequest[],
  policiesByPr: Map<number, PolicyEvaluations>,
  roleByPr: Map<number, PrRole>,
  dismissed: Set<number>,
  userId = '',
): PrViewModel[] {
  return prs
    .filter(pr => !dismissed.has(pr.pullRequestId))
    .map(pr => {
      // Missing entry defaults to null (unknown), never [] - an absent or
      // failed fetch must not read as "no policies" and turn the PR green.
      const policies = policiesByPr.get(pr.pullRequestId) ?? null;
      const color = colorForPr(pr, policies);
      const role = roleByPr.get(pr.pullRequestId) ?? 'creator';
      const myVote = myVoteFor(pr, userId);
      const policySummaries: PrPolicySummary[] = (policies ?? []).map(p => ({
        name: p.configuration.type.displayName,
        status: p.status,
      }));
      const reviewerSummaries: PrReviewerSummary[] = pr.reviewers.map(r => ({
        displayName: r.displayName,
        vote: r.vote,
        isRequired: r.isRequired === true,
      }));
      return {
        prId: pr.pullRequestId,
        title: pr.title,
        repo: pr.repository.name,
        project: pr.repository.project.name,
        webUrl: buildWebUrl(pr),
        createdAt: pr.creationDate,
        isDraft: pr.isDraft,
        myRole: role,
        myVote,
        lastActivityCommitId: pr.lastMergeSourceCommit?.commitId ?? null,
        color,
        category: categorize(pr, policies, role, color, myVote),
        statusSummary: statusSummary(pr, policies, color),
        policies: policySummaries,
        reviewers: reviewerSummaries,
      };
    });
}

/**
 * Format a reviewer vote into the canonical human label used in tooltips.
 */
export function formatVote(vote: number): string {
  return VOTE_LABEL[vote] ?? `vote=${vote}`;
}
