import { describe, expect, it } from 'vitest';
import {
  buildDescription,
  buildLabel,
  buildTreeTooltip,
  iconForColor,
  presentPr,
  sortForTree,
  truncateTitle,
} from '../src/prTreePresentation.js';
import { vm } from './fixtures.js';

describe('iconForColor', () => {
  it('maps red to an error icon tinted charts.red', () => {
    expect(iconForColor('red')).toEqual({ codicon: 'error', themeColorId: 'charts.red' });
  });

  it('maps yellow to a warning icon tinted charts.yellow', () => {
    expect(iconForColor('yellow')).toEqual({ codicon: 'warning', themeColorId: 'charts.yellow' });
  });

  it('maps green to a pass-filled icon tinted charts.green', () => {
    expect(iconForColor('green')).toEqual({ codicon: 'pass-filled', themeColorId: 'charts.green' });
  });
});

describe('buildLabel', () => {
  it('formats as "{repo} #{id}: {title}"', () => {
    expect(buildLabel(vm())).toBe('my-repo #42: Add the thing');
  });

  it('appends a [DRAFT] marker for draft PRs', () => {
    expect(buildLabel(vm({ isDraft: true }))).toBe('my-repo #42: Add the thing  [DRAFT]');
  });

  it('truncates the title via truncateTitle', () => {
    const long = 'This title is definitely longer than fifteen';
    expect(buildLabel(vm({ title: long }))).toBe(`my-repo #42: ${truncateTitle(long)}`);
    expect(buildLabel(vm({ title: long })).length).toBeLessThan(
      `my-repo #42: ${long}`.length,
    );
  });
});

describe('truncateTitle', () => {
  it('leaves a 15-character title untouched', () => {
    expect(truncateTitle('123456789012345')).toBe('123456789012345');
  });

  it('cuts a 16-character title to 15 chars plus an ellipsis', () => {
    expect(truncateTitle('1234567890123456')).toBe('123456789012345...');
  });

  it('trims trailing whitespace before the ellipsis', () => {
    // First 15 chars are "Fix the things " - the trailing space is trimmed.
    expect(truncateTitle('Fix the things please')).toBe('Fix the things...');
  });
});

describe('buildDescription', () => {
  it('is the status summary', () => {
    expect(buildDescription(vm({ statusSummary: 'Awaiting required reviewer: Bob' }))).toBe(
      'Awaiting required reviewer: Bob',
    );
  });
});

describe('buildTreeTooltip', () => {
  it('includes repo, id, role, title and status', () => {
    const t = buildTreeTooltip(vm({ myRole: 'both', statusSummary: 'Ready to merge' }));
    expect(t).toContain('my-repo #42');
    expect(t).toContain('(both)');
    expect(t).toContain('Add the thing');
    expect(t).toContain('GREEN');
    expect(t).toContain('Ready to merge');
  });

  it('lists policies when present', () => {
    const t = buildTreeTooltip(
      vm({ policies: [{ name: 'Build', status: 'running' }] }),
    );
    expect(t).toContain('**Policies**');
    expect(t).toContain('- Build: running');
  });

  it('lists reviewers with human vote labels and a required marker', () => {
    const t = buildTreeTooltip(
      vm({ reviewers: [{ displayName: 'Bob', vote: 10, isRequired: true }] }),
    );
    expect(t).toContain('**Reviewers**');
    expect(t).toContain('- Bob: approved _(required)_');
  });

  it('omits the policies and reviewers sections when both are empty', () => {
    const t = buildTreeTooltip(vm());
    expect(t).not.toContain('**Policies**');
    expect(t).not.toContain('**Reviewers**');
  });

  it('marks draft PRs in the tooltip body', () => {
    expect(buildTreeTooltip(vm({ isDraft: true }))).toContain('_[draft]_');
  });
});

describe('sortForTree', () => {
  it('orders newest createdAt first', () => {
    const older = vm({ prId: 1, createdAt: '2026-01-01T00:00:00Z' });
    const newer = vm({ prId: 2, createdAt: '2026-02-01T00:00:00Z' });
    const sorted = sortForTree([older, newer]);
    expect(sorted.map(v => v.prId)).toEqual([2, 1]);
  });

  it('does not mutate the input array', () => {
    const input = [
      vm({ prId: 1, createdAt: '2026-01-01T00:00:00Z' }),
      vm({ prId: 2, createdAt: '2026-02-01T00:00:00Z' }),
    ];
    const snapshot = input.map(v => v.prId);
    sortForTree(input);
    expect(input.map(v => v.prId)).toEqual(snapshot);
  });

  it('returns an empty array unchanged', () => {
    expect(sortForTree([])).toEqual([]);
  });
});

describe('presentPr', () => {
  it('composes label, description, icon and tooltip together', () => {
    const p = presentPr(vm({ color: 'yellow', statusSummary: 'Pending' }));
    expect(p.label).toBe('my-repo #42: Add the thing');
    expect(p.description).toBe('Pending');
    expect(p.icon).toEqual({ codicon: 'warning', themeColorId: 'charts.yellow' });
    expect(p.tooltipMarkdown).toContain('YELLOW');
  });
});
