/**
 * Persistence layer for manual category overrides and user-created custom
 * categories. Same conventions as `dismissStore.ts`: storage is a
 * `MementoLike` so tests can pass a Map-backed fake, reads are synchronous,
 * and writes are awaited `update()` calls.
 *
 * Overrides are intentionally NOT auto-cleared on PR activity (unlike
 * dismissals) - a category assignment is organizational and stays until the
 * user changes it or deletes the target custom category.
 */

import { CUSTOM_CATEGORIES_KEY, OVERRIDE_STATE_KEY } from './constants.js';
import { nextCustomId } from './categoryModel.js';
import {
  CategoryOverrideRecord,
  CustomCategory,
  MementoLike,
} from './types.js';

/**
 * Load the manual overrides as a `prId -> categoryId` map.
 *
 * @param memento storage backend
 * @returns map of overridden PR ids to their target category id
 */
export function loadOverrides(memento: MementoLike): Map<number, string> {
  const stored = memento.get<CategoryOverrideRecord[]>(OVERRIDE_STATE_KEY) ?? [];
  return new Map(stored.map(r => [r.prId, r.categoryId]));
}

/**
 * Pin a PR to a category, replacing any existing override for that PR.
 *
 * @param memento     storage backend
 * @param prId        the PR to pin
 * @param categoryId  built-in `PrCategory` value or a custom category id
 */
export async function setOverride(
  memento: MementoLike,
  prId: number,
  categoryId: string,
): Promise<void> {
  const stored = memento.get<CategoryOverrideRecord[]>(OVERRIDE_STATE_KEY) ?? [];
  const withoutThisPr = stored.filter(r => r.prId !== prId);
  await memento.update(OVERRIDE_STATE_KEY, [
    ...withoutThisPr,
    { prId, categoryId },
  ]);
}

/**
 * Remove a PR's override so it returns to automatic (computed) grouping.
 *
 * @param memento storage backend
 * @param prId    the PR to release
 */
export async function clearOverride(
  memento: MementoLike,
  prId: number,
): Promise<void> {
  const stored = memento.get<CategoryOverrideRecord[]>(OVERRIDE_STATE_KEY) ?? [];
  const remaining = stored.filter(r => r.prId !== prId);
  if (remaining.length !== stored.length) {
    await memento.update(OVERRIDE_STATE_KEY, remaining);
  }
}

/**
 * Load the user-created custom categories in display order.
 *
 * @param memento storage backend
 * @returns the stored custom categories
 */
export function loadCustomCategories(memento: MementoLike): CustomCategory[] {
  return memento.get<CustomCategory[]>(CUSTOM_CATEGORIES_KEY) ?? [];
}

/**
 * Add a custom category. If a category with the same name (case-insensitive)
 * already exists it is returned unchanged rather than duplicated.
 *
 * @param memento storage backend
 * @param name    the display name to create
 * @returns the created (or pre-existing) custom category
 */
export async function addCustomCategory(
  memento: MementoLike,
  name: string,
): Promise<CustomCategory> {
  const existing = loadCustomCategories(memento);
  const lower = name.trim().toLowerCase();
  const match = existing.find(c => c.name.toLowerCase() === lower);
  if (match) return match;

  const created: CustomCategory = { id: nextCustomId(existing), name: name.trim() };
  await memento.update(CUSTOM_CATEGORIES_KEY, [...existing, created]);
  return created;
}

/**
 * Delete a custom category and clear any overrides that pointed at it, so the
 * affected PRs fall back to automatic grouping.
 *
 * @param memento storage backend
 * @param id      the custom category id to delete
 */
export async function deleteCustomCategory(
  memento: MementoLike,
  id: string,
): Promise<void> {
  const existing = loadCustomCategories(memento);
  const remaining = existing.filter(c => c.id !== id);
  if (remaining.length !== existing.length) {
    await memento.update(CUSTOM_CATEGORIES_KEY, remaining);
  }

  const overrides = memento.get<CategoryOverrideRecord[]>(OVERRIDE_STATE_KEY) ?? [];
  const keptOverrides = overrides.filter(r => r.categoryId !== id);
  if (keptOverrides.length !== overrides.length) {
    await memento.update(OVERRIDE_STATE_KEY, keptOverrides);
  }
}
