import { describe, expect, it } from 'vitest';
import {
  canCreateCategory,
  categoryChoices,
  effectiveCategoryId,
  nextCustomId,
  resolveGroups,
} from '../src/categoryModel.js';
import { AUTO_CATEGORY_ID } from '../src/constants.js';
import { CustomCategory } from '../src/types.js';
import { vm } from './fixtures.js';

const NO_OVERRIDES = new Map<number, string>();
const NO_CUSTOM: CustomCategory[] = [];

describe('effectiveCategoryId', () => {
  it('uses the computed category when there is no override', () => {
    expect(effectiveCategoryId(vm({ prId: 1, category: 'pending' }), NO_OVERRIDES, new Set())).toBe(
      'pending',
    );
  });

  it('uses a built-in override over the computed category', () => {
    const overrides = new Map([[1, 'approved']]);
    expect(effectiveCategoryId(vm({ prId: 1, category: 'pending' }), overrides, new Set())).toBe(
      'approved',
    );
  });

  it('uses a known custom override', () => {
    const overrides = new Map([[1, 'custom-1']]);
    expect(
      effectiveCategoryId(vm({ prId: 1, category: 'pending' }), overrides, new Set(['custom-1'])),
    ).toBe('custom-1');
  });

  it('falls back to the computed category when the override custom is gone', () => {
    const overrides = new Map([[1, 'custom-9']]);
    expect(
      effectiveCategoryId(vm({ prId: 1, category: 'pending' }), overrides, new Set(['custom-1'])),
    ).toBe('pending');
  });
});

describe('resolveGroups', () => {
  it('orders built-ins approved, action-required, pending, other and drops empty ones', () => {
    const vms = [
      vm({ prId: 1, category: 'other' }),
      vm({ prId: 2, category: 'approved' }),
      vm({ prId: 3, category: 'actionRequired' }),
    ];
    expect(resolveGroups(vms, NO_OVERRIDES, NO_CUSTOM).map(g => g.id)).toEqual([
      'approved',
      'actionRequired',
      'other',
    ]);
  });

  it('folds the count into the header label', () => {
    const vms = [
      vm({ prId: 1, category: 'actionRequired' }),
      vm({ prId: 2, category: 'actionRequired' }),
    ];
    expect(resolveGroups(vms, NO_OVERRIDES, NO_CUSTOM)[0].label).toBe('User action required (2)');
  });

  it('sorts PRs within a group newest-first', () => {
    const vms = [
      vm({ prId: 1, category: 'pending', createdAt: '2026-01-01T00:00:00Z' }),
      vm({ prId: 2, category: 'pending', createdAt: '2026-03-01T00:00:00Z' }),
    ];
    expect(resolveGroups(vms, NO_OVERRIDES, NO_CUSTOM)[0].vms.map(v => v.prId)).toEqual([2, 1]);
  });

  it('appends custom groups after the built-ins and always shows them', () => {
    const customs: CustomCategory[] = [{ id: 'custom-1', name: 'Blocked on infra' }];
    const vms = [vm({ prId: 1, category: 'pending' })];
    const groups = resolveGroups(vms, NO_OVERRIDES, customs);
    expect(groups.map(g => g.id)).toEqual(['pending', 'custom-1']);
    // Empty custom group is still present, with a zero count.
    expect(groups[1]).toMatchObject({ id: 'custom-1', label: 'Blocked on infra (0)', isCustom: true });
  });

  it('routes an overridden PR into its target group', () => {
    const customs: CustomCategory[] = [{ id: 'custom-1', name: 'Watch' }];
    const overrides = new Map([[1, 'custom-1']]);
    const vms = [vm({ prId: 1, category: 'pending' })];
    const groups = resolveGroups(vms, overrides, customs);
    // No 'pending' group (its only PR moved); custom-1 now has the PR.
    expect(groups.map(g => g.id)).toEqual(['custom-1']);
    expect(groups[0].vms.map(v => v.prId)).toEqual([1]);
  });

  it('pins a PR into a built-in group via override', () => {
    const overrides = new Map([[1, 'approved']]);
    const vms = [vm({ prId: 1, category: 'pending' })];
    expect(resolveGroups(vms, overrides, NO_CUSTOM).map(g => g.id)).toEqual(['approved']);
  });

  it('returns no groups for an empty list and no customs', () => {
    expect(resolveGroups([], NO_OVERRIDES, NO_CUSTOM)).toEqual([]);
  });
});

describe('categoryChoices', () => {
  it('offers Auto first, then the four built-ins, then customs', () => {
    const customs: CustomCategory[] = [{ id: 'custom-1', name: 'Watch' }];
    expect(categoryChoices(customs).map(c => c.id)).toEqual([
      AUTO_CATEGORY_ID,
      'approved',
      'actionRequired',
      'pending',
      'other',
      'custom-1',
    ]);
  });

  it('tags each choice with its kind', () => {
    const customs: CustomCategory[] = [{ id: 'custom-1', name: 'Watch' }];
    const byId = new Map(categoryChoices(customs).map(c => [c.id, c.kind]));
    expect(byId.get(AUTO_CATEGORY_ID)).toBe('auto');
    expect(byId.get('approved')).toBe('builtin');
    expect(byId.get('custom-1')).toBe('custom');
  });
});

describe('canCreateCategory', () => {
  it('returns the trimmed name for a fresh value', () => {
    expect(canCreateCategory('  Blocked  ', NO_CUSTOM)).toBe('Blocked');
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(canCreateCategory('', NO_CUSTOM)).toBeNull();
    expect(canCreateCategory('   ', NO_CUSTOM)).toBeNull();
  });

  it('rejects a name that clashes with an existing custom (case-insensitive)', () => {
    const customs: CustomCategory[] = [{ id: 'custom-1', name: 'Watch' }];
    expect(canCreateCategory('watch', customs)).toBeNull();
  });

  it('rejects a name that clashes with a built-in label', () => {
    expect(canCreateCategory('Pending approval', NO_CUSTOM)).toBeNull();
  });
});

describe('nextCustomId', () => {
  it('starts at custom-1 for an empty list', () => {
    expect(nextCustomId(NO_CUSTOM)).toBe('custom-1');
  });

  it('uses one past the highest numeric suffix, surviving deletions', () => {
    const customs: CustomCategory[] = [
      { id: 'custom-1', name: 'A' },
      { id: 'custom-3', name: 'C' },
    ];
    expect(nextCustomId(customs)).toBe('custom-4');
  });
});
