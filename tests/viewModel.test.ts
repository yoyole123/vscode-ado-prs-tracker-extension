import { describe, expect, it } from 'vitest';
import {
  aggregateColor,
  buildWebUrl,
  categorize,
  colorForPr,
  formatVote,
  myVoteFor,
  statusSummary,
  toViewModels,
} from '../src/viewModel.js';
import { PrViewModel } from '../src/types.js';
import { policy, pr, reviewer } from './fixtures.js';

describe('colorForPr', () => {
  describe('red', () => {
    it('merge conflicts beats every other state', () => {
      const p = pr({
        mergeStatus: 'conflicts',
        reviewers: [reviewer('Alice', 10, true)],
      });
      expect(colorForPr(p, [policy('approved')])).toBe('red');
    });

    it('any reviewer at -10 is red', () => {
      const p = pr({ reviewers: [reviewer('Bob', -10)] });
      expect(colorForPr(p, [policy('approved')])).toBe('red');
    });

    it('conflicts wins even when queued policies are also present', () => {
      const p = pr({ mergeStatus: 'conflicts' });
      expect(colorForPr(p, [policy('queued')])).toBe('red');
    });
  });

  describe('yellow', () => {
    it('unknown policy state (null - fetch failed) is yellow, never green', () => {
      // A failed policy fetch must not be mistaken for "no policies" / green.
      const p = pr({ reviewers: [reviewer('Alice', 10, true)] });
      expect(colorForPr(p, null)).toBe('yellow');
    });

    it('unknown policy state stays yellow even with no reviewers', () => {
      expect(colorForPr(pr(), null)).toBe('yellow');
    });

    it('a queued policy is yellow', () => {
      expect(colorForPr(pr(), [policy('queued')])).toBe('yellow');
    });

    it('a running policy is yellow', () => {
      expect(colorForPr(pr(), [policy('running')])).toBe('yellow');
    });

    it('a rejected policy is yellow (user-correctable per spec)', () => {
      expect(colorForPr(pr(), [policy('rejected', 'Work item linking')])).toBe('yellow');
    });

    it('a broken policy is yellow', () => {
      expect(colorForPr(pr(), [policy('broken')])).toBe('yellow');
    });

    it('required reviewer at vote 0 is yellow', () => {
      const p = pr({ reviewers: [reviewer('Alice', 0, true)] });
      expect(colorForPr(p, [policy('approved')])).toBe('yellow');
    });

    it('required reviewer at vote -5 is yellow', () => {
      const p = pr({ reviewers: [reviewer('Alice', -5, true)] });
      expect(colorForPr(p, [policy('approved')])).toBe('yellow');
    });
  });

  describe('green', () => {
    it('no blocking policies configured (known empty) is green', () => {
      // ADO confirmed there are no blocking policies, nothing else gates it.
      expect(colorForPr(pr(), [])).toBe('green');
    });

    it('no policies and an approved reviewer is green', () => {
      const p = pr({ reviewers: [reviewer('Alice', 10, true)] });
      expect(colorForPr(p, [])).toBe('green');
    });

    it('all blocking policies approved with no required reviewers waiting', () => {
      const p = pr({ reviewers: [reviewer('Alice', 10, true)] });
      expect(colorForPr(p, [policy('approved')])).toBe('green');
    });

    it('non-required reviewer at vote 0 does not block green', () => {
      const p = pr({
        reviewers: [
          reviewer('Required', 10, true),
          reviewer('Optional', 0, false),
        ],
      });
      expect(colorForPr(p, [policy('approved')])).toBe('green');
    });

    it('non-required reviewer at vote -5 does not block green', () => {
      const p = pr({
        reviewers: [
          reviewer('Required', 10, true),
          reviewer('Optional', -5, false),
        ],
      });
      expect(colorForPr(p, [policy('approved')])).toBe('green');
    });

    it('approved with suggestions (vote 5) is green', () => {
      const p = pr({ reviewers: [reviewer('Alice', 5, true)] });
      expect(colorForPr(p, [policy('approved')])).toBe('green');
    });
  });
});

describe('aggregateColor', () => {
  const vm = (color: 'green' | 'yellow' | 'red'): PrViewModel =>
    ({ color }) as PrViewModel;

  it('empty list is green', () => {
    expect(aggregateColor([])).toBe('green');
  });

  it('any red wins', () => {
    expect(aggregateColor([vm('green'), vm('yellow'), vm('red')])).toBe('red');
  });

  it('yellow wins over green', () => {
    expect(aggregateColor([vm('green'), vm('yellow'), vm('green')])).toBe('yellow');
  });

  it('all green is green', () => {
    expect(aggregateColor([vm('green'), vm('green')])).toBe('green');
  });
});

describe('statusSummary', () => {
  it('reports merge conflicts first', () => {
    const p = pr({ mergeStatus: 'conflicts', reviewers: [reviewer('Bob', -10)] });
    expect(statusSummary(p, [], 'red')).toMatch(/conflicts/i);
  });

  it('names the reviewer who rejected', () => {
    const p = pr({ reviewers: [reviewer('Bob', -10)] });
    expect(statusSummary(p, [], 'red')).toContain('Bob');
  });

  it('reports the failing policy name', () => {
    const p = pr();
    const result = statusSummary(p, [policy('rejected', 'Work item linking')], 'yellow');
    expect(result).toContain('Work item linking');
    expect(result).toMatch(/FAIL/);
  });

  it('reports running/queued policy name', () => {
    const p = pr();
    expect(statusSummary(p, [policy('queued', 'Build')], 'yellow')).toContain('Build');
  });

  it('says "no blocking policies" when none configured and not green', () => {
    expect(statusSummary(pr(), [], 'yellow')).toMatch(/no blocking policies/i);
  });

  it('says ready to merge when a green PR has no required policies', () => {
    expect(statusSummary(pr(), [], 'green')).toMatch(/ready to merge/i);
  });

  it('reports unknown when the policy fetch failed (null)', () => {
    expect(statusSummary(pr(), null, 'yellow')).toMatch(/unknown/i);
  });

  it('says ready to merge for fully green PRs', () => {
    const p = pr({ reviewers: [reviewer('Alice', 10, true)] });
    expect(statusSummary(p, [policy('approved')], 'green')).toMatch(/ready/i);
  });
});

describe('buildWebUrl', () => {
  it('uses the project name and repo name', () => {
    const p = pr({
      pullRequestId: 12345,
      url: 'https://dev.azure.com/my-org/_apis/git/repositories/r/pullRequests/12345',
      repository: { id: 'r', name: 'my-repo', project: { id: 'p', name: 'My Project' } },
    });
    expect(buildWebUrl(p)).toBe(
      'https://dev.azure.com/my-org/My%20Project/_git/my-repo/pullrequest/12345',
    );
  });
});

describe('toViewModels', () => {
  it('filters out dismissed PRs', () => {
    const p1 = pr();
    const p2 = pr();
    const dismissed = new Set<number>([p1.pullRequestId]);
    const result = toViewModels([p1, p2], new Map(), new Map(), dismissed);
    expect(result.map(v => v.prId)).toEqual([p2.pullRequestId]);
  });

  it('attaches the role from the role map', () => {
    const p = pr();
    const roles = new Map([[p.pullRequestId, 'reviewer' as const]]);
    const [vm] = toViewModels([p], new Map(), roles, new Set());
    expect(vm.myRole).toBe('reviewer');
  });

  it('defaults role to "creator" when missing from map', () => {
    const p = pr();
    const [vm] = toViewModels([p], new Map(), new Map(), new Set());
    expect(vm.myRole).toBe('creator');
  });

  it('captures last commit id for the dismiss store', () => {
    const p = pr({ lastMergeSourceCommit: { commitId: 'abc123' } });
    const [vm] = toViewModels([p], new Map(), new Map(), new Set());
    expect(vm.lastActivityCommitId).toBe('abc123');
  });

  it('handles missing lastMergeSourceCommit by storing null', () => {
    const p = pr({ lastMergeSourceCommit: null });
    const [vm] = toViewModels([p], new Map(), new Map(), new Set());
    expect(vm.lastActivityCommitId).toBeNull();
  });
});

describe('myVoteFor', () => {
  it('returns null when the user id is empty', () => {
    const p = pr({ reviewers: [reviewer('Me', 10)] });
    expect(myVoteFor(p, '')).toBeNull();
  });

  it('returns null when the user is not on the reviewer list', () => {
    const p = pr({ reviewers: [reviewer('Alice', 10)] });
    expect(myVoteFor(p, 'id-Me')).toBeNull();
  });

  it('returns the user own vote when present', () => {
    const p = pr({ reviewers: [reviewer('Alice', 10), reviewer('Me', -5)] });
    expect(myVoteFor(p, 'id-Me')).toBe(-5);
  });
});

describe('categorize', () => {
  it('puts drafts in "other" even when otherwise approved', () => {
    const p = pr({ isDraft: true });
    expect(categorize(p, [policy('approved')], 'creator', 'green', null)).toBe('other');
  });

  it('puts non-active PRs in "other"', () => {
    const p = pr({ status: 'abandoned' });
    expect(categorize(p, [], 'creator', 'yellow', null)).toBe('other');
  });

  describe('user action required', () => {
    it('author with merge conflicts', () => {
      const p = pr({ mergeStatus: 'conflicts' });
      expect(categorize(p, [], 'creator', 'red', null)).toBe('actionRequired');
    });

    it('author whose PR was rejected', () => {
      const p = pr({ reviewers: [reviewer('Alice', -10)] });
      expect(categorize(p, [policy('approved')], 'both', 'red', null)).toBe('actionRequired');
    });

    it('author with a failed blocking policy', () => {
      const p = pr();
      expect(categorize(p, [policy('rejected')], 'creator', 'yellow', null)).toBe('actionRequired');
    });

    it('author with a broken blocking policy', () => {
      const p = pr();
      expect(categorize(p, [policy('broken')], 'creator', 'yellow', null)).toBe('actionRequired');
    });

    it('reviewer who has not voted yet', () => {
      const p = pr({ reviewers: [reviewer('Me', 0)] });
      expect(categorize(p, [policy('approved')], 'reviewer', 'yellow', 0)).toBe('actionRequired');
    });

    it('does not flag a reviewer-only PR with conflicts as my action', () => {
      // I am only a reviewer and I have already voted; conflicts are the
      // author problem, not mine.
      const p = pr({ mergeStatus: 'conflicts' });
      expect(categorize(p, [], 'reviewer', 'red', 10)).toBe('pending');
    });
  });

  describe('approved', () => {
    it('green author PR is approved (ready to merge)', () => {
      const p = pr();
      expect(categorize(p, [policy('approved')], 'creator', 'green', null)).toBe('approved');
    });

    it('green author PR with no blocking policies is approved', () => {
      // The argocd / gitops case: no policies, no conflicts, no reviewers.
      const p = pr();
      expect(categorize(p, [], 'creator', 'green', null)).toBe('approved');
    });

    it('green reviewer PR I already approved is approved', () => {
      const p = pr({ reviewers: [reviewer('Me', 10)] });
      expect(categorize(p, [policy('approved')], 'reviewer', 'green', 10)).toBe('approved');
    });
  });

  describe('pending', () => {
    it('yellow author PR with nothing failing waits on others', () => {
      const p = pr();
      expect(categorize(p, [policy('running')], 'creator', 'yellow', null)).toBe('pending');
    });

    it('reviewer who voted -5 (waiting for author) is not my action', () => {
      const p = pr({ reviewers: [reviewer('Me', -5)] });
      expect(categorize(p, [policy('approved')], 'reviewer', 'yellow', -5)).toBe('pending');
    });

    it('unknown policy state (null) stays pending, not approved', () => {
      const p = pr();
      expect(categorize(p, null, 'creator', 'yellow', null)).toBe('pending');
    });
  });
});

describe('formatVote', () => {
  it('maps the canonical votes', () => {
    expect(formatVote(10)).toBe('approved');
    expect(formatVote(-10)).toBe('rejected');
    expect(formatVote(0)).toBe('no vote');
  });

  it('falls back gracefully for unknown values', () => {
    expect(formatVote(42)).toMatch(/42/);
  });
});
