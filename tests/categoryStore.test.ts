import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCustomCategory,
  clearOverride,
  deleteCustomCategory,
  loadCustomCategories,
  loadOverrides,
  setOverride,
} from '../src/categoryStore.js';
import { MementoLike } from '../src/types.js';

/**
 * Minimal Map-backed `Memento` so categoryStore.ts can be exercised without
 * importing `vscode`. Mirrors the fake used in dismissStore.test.ts.
 */
function makeMemento(): MementoLike {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      if (store.has(key)) return store.get(key) as T;
      return defaultValue;
    },
    async update(key: string, value: unknown) {
      store.set(key, value);
    },
  };
}

describe('categoryStore overrides', () => {
  let memento: MementoLike;
  beforeEach(() => {
    memento = makeMemento();
  });

  it('round-trips a single override', async () => {
    await setOverride(memento, 7, 'approved');
    expect(loadOverrides(memento).get(7)).toBe('approved');
  });

  it('replaces an existing override for the same PR', async () => {
    await setOverride(memento, 7, 'approved');
    await setOverride(memento, 7, 'custom-1');
    const overrides = loadOverrides(memento);
    expect(overrides.get(7)).toBe('custom-1');
    expect(overrides.size).toBe(1);
  });

  it('keeps overrides for other PRs when setting one', async () => {
    await setOverride(memento, 1, 'approved');
    await setOverride(memento, 2, 'pending');
    expect(loadOverrides(memento).size).toBe(2);
  });

  it('clears an override', async () => {
    await setOverride(memento, 7, 'approved');
    await clearOverride(memento, 7);
    expect(loadOverrides(memento).has(7)).toBe(false);
  });

  it('clearing a non-existent override is a no-op', async () => {
    await clearOverride(memento, 99);
    expect(loadOverrides(memento).size).toBe(0);
  });
});

describe('categoryStore custom categories', () => {
  let memento: MementoLike;
  beforeEach(() => {
    memento = makeMemento();
  });

  it('adds a custom category with a generated id', async () => {
    const created = await addCustomCategory(memento, 'Blocked on infra');
    expect(created).toEqual({ id: 'custom-1', name: 'Blocked on infra' });
    expect(loadCustomCategories(memento)).toEqual([created]);
  });

  it('trims the name and assigns sequential ids', async () => {
    const a = await addCustomCategory(memento, '  First  ');
    const b = await addCustomCategory(memento, 'Second');
    expect(a).toEqual({ id: 'custom-1', name: 'First' });
    expect(b).toEqual({ id: 'custom-2', name: 'Second' });
  });

  it('does not duplicate a category with the same name (case-insensitive)', async () => {
    const a = await addCustomCategory(memento, 'Watch');
    const b = await addCustomCategory(memento, 'watch');
    expect(b).toEqual(a);
    expect(loadCustomCategories(memento)).toHaveLength(1);
  });

  it('deletes a custom category', async () => {
    await addCustomCategory(memento, 'Watch');
    await deleteCustomCategory(memento, 'custom-1');
    expect(loadCustomCategories(memento)).toEqual([]);
  });

  it('clears overrides that pointed at a deleted custom category', async () => {
    await addCustomCategory(memento, 'Watch'); // custom-1
    await setOverride(memento, 1, 'custom-1');
    await setOverride(memento, 2, 'approved');
    await deleteCustomCategory(memento, 'custom-1');
    const overrides = loadOverrides(memento);
    expect(overrides.has(1)).toBe(false); // pointed at the deleted custom
    expect(overrides.get(2)).toBe('approved'); // built-in override untouched
  });

  it('reuses ids past the highest suffix after a deletion', async () => {
    await addCustomCategory(memento, 'A'); // custom-1
    await addCustomCategory(memento, 'B'); // custom-2
    await deleteCustomCategory(memento, 'custom-1');
    const c = await addCustomCategory(memento, 'C');
    expect(c.id).toBe('custom-3');
  });
});
