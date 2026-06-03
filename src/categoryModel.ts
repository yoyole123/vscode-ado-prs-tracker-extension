/**
 * Pure category logic: resolving a PR's effective group (computed bucket
 * plus any manual override), grouping PRs for the sidebar, and the helpers
 * the move-to-category popup needs (selectable choices, new-name validation,
 * id generation).
 *
 * No VSCode or storage access here - storage lives in `categoryStore.ts`
 * and rendering in `prTreeView.ts`. Everything is a pure function of its
 * arguments so the rules stay unit-testable.
 */

import {
  AUTO_CATEGORY_ID,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
} from './constants.js';
import { CustomCategory, PrCategory, PrViewModel } from './types.js';
import { sortForTree } from './prTreePresentation.js';

/** A resolved sidebar group, ready to render as a header with its rows. */
export interface ResolvedGroup {
  /** Built-in `PrCategory` value or a `CustomCategory.id`. */
  id: string;
  /** Bare group name without the count, e.g. "Pending approval". */
  name: string;
  /** Header label including the count, e.g. "Pending approval (3)". */
  label: string;
  /** True for user-created categories (shown even when empty, deletable). */
  isCustom: boolean;
  /** PRs in this group, sorted newest-first. */
  vms: PrViewModel[];
}

/** Kind of target offered in the move-to-category popup. */
export type CategoryChoiceKind = 'auto' | 'builtin' | 'custom';

/** A selectable target in the move-to-category popup. */
export interface CategoryChoice {
  /** `AUTO_CATEGORY_ID`, a built-in `PrCategory`, or a custom id. */
  id: string;
  label: string;
  kind: CategoryChoiceKind;
}

/** True when `id` names one of the built-in categories. */
function isBuiltinCategory(id: string): id is PrCategory {
  return (CATEGORY_ORDER as readonly string[]).includes(id);
}

/**
 * Resolve the group a PR is displayed in: the manual override when present
 * and still valid, otherwise the computed category. An override pointing at
 * a deleted custom category falls back to the computed bucket.
 *
 * @param vm                the PR view model (carries the computed category)
 * @param overrides         map of PR id -> overridden category id
 * @param knownCustomIds    set of currently-existing custom category ids
 * @returns the effective category id for the PR
 */
export function effectiveCategoryId(
  vm: PrViewModel,
  overrides: Map<number, string>,
  knownCustomIds: Set<string>,
): string {
  const override = overrides.get(vm.prId);
  if (override && (isBuiltinCategory(override) || knownCustomIds.has(override))) {
    return override;
  }
  return vm.category;
}

/**
 * Group PRs for the sidebar. Built-in groups appear first in `CATEGORY_ORDER`
 * and are dropped when empty; custom groups follow in their stored order and
 * are always shown (even at count 0) so a user-created category is never lost.
 * Each group's PRs are sorted newest-first.
 *
 * @param vms                the active PR view models
 * @param overrides          map of PR id -> overridden category id
 * @param customCategories   the user-created categories, in display order
 * @returns the groups to render, in top-to-bottom order
 */
export function resolveGroups(
  vms: PrViewModel[],
  overrides: Map<number, string>,
  customCategories: CustomCategory[],
): ResolvedGroup[] {
  const knownCustomIds = new Set(customCategories.map(c => c.id));
  const byId = new Map<string, PrViewModel[]>();
  for (const vm of vms) {
    const id = effectiveCategoryId(vm, overrides, knownCustomIds);
    const bucket = byId.get(id);
    if (bucket) bucket.push(vm);
    else byId.set(id, [vm]);
  }

  const groups: ResolvedGroup[] = [];

  for (const category of CATEGORY_ORDER) {
    const list = sortForTree(byId.get(category) ?? []);
    if (list.length === 0) continue;
    groups.push({
      id: category,
      name: CATEGORY_LABEL[category],
      label: `${CATEGORY_LABEL[category]} (${list.length})`,
      isCustom: false,
      vms: list,
    });
  }

  for (const custom of customCategories) {
    const list = sortForTree(byId.get(custom.id) ?? []);
    groups.push({
      id: custom.id,
      name: custom.name,
      label: `${custom.name} (${list.length})`,
      isCustom: true,
      vms: list,
    });
  }

  return groups;
}

/**
 * Build the ordered list of targets for the move-to-category popup:
 * "Auto" first, then the four built-ins, then every custom category.
 *
 * @param customCategories the user-created categories, in display order
 * @returns the selectable choices, in display order
 */
export function categoryChoices(customCategories: CustomCategory[]): CategoryChoice[] {
  const choices: CategoryChoice[] = [
    { id: AUTO_CATEGORY_ID, label: 'Auto (let the rules decide)', kind: 'auto' },
  ];
  for (const category of CATEGORY_ORDER) {
    choices.push({ id: category, label: CATEGORY_LABEL[category], kind: 'builtin' });
  }
  for (const custom of customCategories) {
    choices.push({ id: custom.id, label: custom.name, kind: 'custom' });
  }
  return choices;
}

/**
 * Decide whether a typed value can become a new custom category. Rejects
 * empty input and names that collide (case-insensitively) with an existing
 * custom category or a built-in label.
 *
 * @param typedValue        raw text from the popup input box
 * @param customCategories  existing custom categories
 * @returns the trimmed name to create, or null when creation is not allowed
 */
export function canCreateCategory(
  typedValue: string,
  customCategories: CustomCategory[],
): string | null {
  const name = typedValue.trim();
  if (name === '') return null;
  const lower = name.toLowerCase();
  const customClash = customCategories.some(c => c.name.toLowerCase() === lower);
  const builtinClash = CATEGORY_ORDER.some(
    c => CATEGORY_LABEL[c].toLowerCase() === lower,
  );
  return customClash || builtinClash ? null : name;
}

/**
 * Generate the next custom category id (`custom-<n>`) given the existing
 * list. Uses one past the highest numeric suffix in use so ids stay unique
 * even after deletions.
 *
 * @param customCategories existing custom categories
 * @returns a fresh, unused custom id
 */
export function nextCustomId(customCategories: CustomCategory[]): string {
  let max = 0;
  for (const c of customCategories) {
    const match = /^custom-(\d+)$/.exec(c.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `custom-${max + 1}`;
}
