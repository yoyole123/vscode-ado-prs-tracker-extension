import { describe, expect, it } from 'vitest';
import { mergePrLists } from '../src/prFetcher.js';
import { pr } from './fixtures.js';

describe('mergePrLists', () => {
  it('PRs only in the created list get role "creator"', () => {
    const a = pr();
    const { prs, roleByPr } = mergePrLists([a], []);
    expect(prs).toHaveLength(1);
    expect(roleByPr.get(a.pullRequestId)).toBe('creator');
  });

  it('PRs only in the reviewer list get role "reviewer"', () => {
    const a = pr();
    const { prs, roleByPr } = mergePrLists([], [a]);
    expect(prs).toHaveLength(1);
    expect(roleByPr.get(a.pullRequestId)).toBe('reviewer');
  });

  it('PRs in both lists get role "both" and appear once', () => {
    const a = pr();
    const { prs, roleByPr } = mergePrLists([a], [a]);
    expect(prs).toHaveLength(1);
    expect(roleByPr.get(a.pullRequestId)).toBe('both');
  });

  it('preserves PRs from both lists', () => {
    const a = pr();
    const b = pr();
    const c = pr();
    const { prs } = mergePrLists([a, b], [b, c]);
    const ids = prs.map(p => p.pullRequestId).sort();
    expect(ids).toEqual(
      [a.pullRequestId, b.pullRequestId, c.pullRequestId].sort(),
    );
  });

  it('returns empty result for two empty lists', () => {
    const { prs, roleByPr } = mergePrLists([], []);
    expect(prs).toHaveLength(0);
    expect(roleByPr.size).toBe(0);
  });
});
