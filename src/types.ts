/**
 * Shared type definitions used across the extension.
 *
 * `Raw*` types describe the subset of fields we actually read from the
 * ADO REST response. They intentionally omit dozens of unused fields
 * to keep the surface small and the code readable.
 *
 * `PrViewModel` is the projected, internal shape that all UI code
 * (status bar, quick pick) renders from.
 */

export type ReviewerVote = -10 | -5 | 0 | 5 | 10;

export type PolicyStatus =
  | 'approved'
  | 'rejected'
  | 'running'
  | 'queued'
  | 'broken'
  | 'notApplicable';

export type PrStatus = 'active' | 'completed' | 'abandoned';

/** Subset of the ADO PR list response fields the extension consumes. */
export interface RawPullRequest {
  pullRequestId: number;
  title: string;
  isDraft: boolean;
  status: PrStatus;
  /**
   * BOS field name kept verbatim. We care about the value `conflicts`
   * to drive the red colour rule; other values are ignored.
   */
  mergeStatus: string;
  creationDate: string;
  sourceRefName: string;
  targetRefName: string;
  /** API URL returned by ADO. Web URL is constructed separately. */
  url: string;
  repository: {
    id: string;
    name: string;
    project: { id: string; name: string };
  };
  reviewers: Array<{
    id: string;
    displayName: string;
    vote: ReviewerVote;
    isRequired?: boolean;
  }>;
  lastMergeSourceCommit?: { commitId: string } | null;
}

/** Subset of the ADO policy evaluation response. */
export interface RawPolicyEvaluation {
  status: PolicyStatus;
  configuration: {
    isBlocking: boolean;
    type: { displayName: string };
  };
}

/**
 * The blocking-policy evaluations for a PR, or `null` when the policy fetch
 * failed and the state is genuinely unknown. The `null` case is kept distinct
 * from an empty array (which means "ADO confirmed there are no blocking
 * policies") so that a failed fetch is never mistaken for "nothing to gate
 * on" and shown as green.
 */
export type PolicyEvaluations = RawPolicyEvaluation[] | null;

export type PrColor = 'green' | 'yellow' | 'red';

export type PrRole = 'creator' | 'reviewer' | 'both';

/**
 * Sidebar grouping bucket for a PR, decided from the user's role and state:
 * - `approved`       - ready to merge, not merged yet
 * - `actionRequired` - something needs the current user (fix their PR, or review)
 * - `pending`        - waiting on others, nothing for the user to do
 * - `other`          - drafts and anything that fits nowhere else
 */
export type PrCategory = 'approved' | 'actionRequired' | 'pending' | 'other';

export interface PrPolicySummary {
  name: string;
  status: PolicyStatus;
}

export interface PrReviewerSummary {
  displayName: string;
  vote: number;
  isRequired: boolean;
}

/** Projected, UI-friendly view of a single PR. */
export interface PrViewModel {
  prId: number;
  title: string;
  repo: string;
  project: string;
  webUrl: string;
  createdAt: string;
  isDraft: boolean;
  myRole: PrRole;
  /**
   * The current user's own reviewer vote on this PR, or null when they
   * are not on the reviewer list. Drives the action-required grouping.
   */
  myVote: number | null;
  /** Commit id used as the activity signal for the dismiss store. */
  lastActivityCommitId: string | null;
  color: PrColor;
  /** Sidebar grouping bucket. */
  category: PrCategory;
  /** Short, single-line summary suitable for the QuickPick `detail` field. */
  statusSummary: string;
  policies: PrPolicySummary[];
  reviewers: PrReviewerSummary[];
}

/** A user-created sidebar category. Built-in categories use `PrCategory`. */
export interface CustomCategory {
  /** Stable id (e.g. `custom-1`) referenced by override records. */
  id: string;
  /** Display name as typed by the user. */
  name: string;
}

/**
 * Record persisted to globalState pinning a PR to a specific category,
 * overriding the role-aware computed bucket. `categoryId` is either a
 * built-in `PrCategory` value or a `CustomCategory.id`.
 */
export interface CategoryOverrideRecord {
  prId: number;
  categoryId: string;
}

/** Record persisted to globalState for each dismissed PR. */
export interface DismissRecord {
  prId: number;
  dismissedAtIso: string;
  /**
   * The commit id at the moment of dismissal. When the PR's current
   * commit differs, we auto-undismiss.
   */
  lastActivityCommitIdAtDismiss: string | null;
}

/**
 * Minimal Memento-like interface so tests can supply a Map-backed fake
 * without requiring the real `vscode` module.
 */
export interface MementoLike {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}
