/**
 * The "Move to category..." popup. A `QuickPick` whose built-in input box
 * doubles as the "add new category" text bar: when the user types a name
 * that does not match an existing category, a "Create" item is surfaced.
 *
 * This module only collects the user's intent and returns it; persistence
 * and re-rendering happen in `extension.ts`. The selectable choices and the
 * create-name validation come from the pure `categoryModel`.
 */

import * as vscode from 'vscode';
import {
  CategoryChoice,
  canCreateCategory,
  categoryChoices,
} from './categoryModel.js';
import { AUTO_CATEGORY_ID } from './constants.js';
import { CustomCategory } from './types.js';

/** The outcome of the move popup. */
export type MoveCategoryResult =
  | { kind: 'auto' }
  | { kind: 'existing'; categoryId: string }
  | { kind: 'create'; name: string };

interface CategoryQuickPickItem extends vscode.QuickPickItem {
  /** Set for the "create new" item; absent for existing choices. */
  createName?: string;
  /** Set for existing choices; absent for the create item. */
  choice?: CategoryChoice;
}

/**
 * Show the move-to-category popup for a single PR and resolve with the user's
 * choice, or undefined if they dismissed it.
 *
 * @param prTitle           short PR label used in the popup title
 * @param customCategories  current custom categories (for choices + dedupe)
 */
export function pickCategory(
  prTitle: string,
  customCategories: CustomCategory[],
): Promise<MoveCategoryResult | undefined> {
  const qp = vscode.window.createQuickPick<CategoryQuickPickItem>();
  qp.title = `Move ${prTitle} to category`;
  qp.placeholder = 'Pick a category, or type a new name and press Enter to create it';

  const baseItems = toItems(categoryChoices(customCategories));
  qp.items = baseItems;

  // Surface a "Create" row whenever the typed text is a valid new name.
  qp.onDidChangeValue(value => {
    const name = canCreateCategory(value, customCategories);
    qp.items = name
      ? [...baseItems, { label: `$(add) Create "${name}"`, createName: name }]
      : baseItems;
  });

  return new Promise(resolve => {
    let result: MoveCategoryResult | undefined;
    qp.onDidAccept(() => {
      const item = qp.selectedItems[0];
      if (item) result = toResult(item);
      qp.hide();
    });
    qp.onDidHide(() => {
      qp.dispose();
      resolve(result);
    });
    qp.show();
  });
}

/** Map category choices to QuickPick items. */
function toItems(choices: CategoryChoice[]): CategoryQuickPickItem[] {
  return choices.map(choice => ({ label: choice.label, choice }));
}

/** Map the accepted QuickPick item to a move result. */
function toResult(item: CategoryQuickPickItem): MoveCategoryResult {
  if (item.createName) return { kind: 'create', name: item.createName };
  if (item.choice?.kind === 'auto' || item.choice?.id === AUTO_CATEGORY_ID) {
    return { kind: 'auto' };
  }
  return { kind: 'existing', categoryId: item.choice!.id };
}
