/**
 * The PR sidebar: a `TreeDataProvider` that renders the active PRs as a
 * flat, newest-first list of rows in the activity-bar view.
 *
 * Rendering logic (labels, tooltip, icon, sort) lives in the pure
 * `prTreePresentation` module; this file only maps those descriptors onto
 * `vscode` types and owns the change-notification lifecycle. `extension.ts`
 * is the only caller - it pushes fresh view models in via `setPrs`.
 */

import * as vscode from 'vscode';
import { COMMAND_OPEN_PR } from './constants.js';
import { ResolvedGroup, resolveGroups } from './categoryModel.js';
import { presentPr } from './prTreePresentation.js';
import { CustomCategory, PrViewModel } from './types.js';

/** `contextValue` used by the `view/item/context` inline-dismiss menu. */
export const PR_NODE_CONTEXT = 'pr';
/** `contextValue` for a built-in category header row. */
export const CATEGORY_NODE_CONTEXT = 'category';
/** `contextValue` for a custom category header (enables the delete action). */
export const CUSTOM_CATEGORY_NODE_CONTEXT = 'customCategory';

/**
 * A collapsible category header (e.g. "User action required (2)") that
 * holds the PR rows for one group. Expanded by default. Custom categories
 * get a distinct `contextValue` and carry their id so the delete command
 * knows what to remove.
 */
export class CategoryTreeItem extends vscode.TreeItem {
  /** The category id (built-in `PrCategory` or custom id). */
  public readonly categoryId: string;
  /** The bare category name without the count (for confirmation prompts). */
  public readonly categoryName: string;

  constructor(group: ResolvedGroup, public readonly children: PrTreeItem[]) {
    super(group.label, vscode.TreeItemCollapsibleState.Expanded);
    this.categoryId = group.id;
    this.categoryName = group.name;
    this.contextValue = group.isCustom
      ? CUSTOM_CATEGORY_NODE_CONTEXT
      : CATEGORY_NODE_CONTEXT;
  }
}

/**
 * A single PR row. Carries its `vm` so the inline dismiss command can act
 * on the right PR without a lookup.
 */
export class PrTreeItem extends vscode.TreeItem {
  constructor(public readonly vm: PrViewModel) {
    const p = presentPr(vm);
    super(p.label, vscode.TreeItemCollapsibleState.None);
    this.description = p.description;
    this.iconPath = new vscode.ThemeIcon(
      p.icon.codicon,
      new vscode.ThemeColor(p.icon.themeColorId),
    );
    this.tooltip = new vscode.MarkdownString(p.tooltipMarkdown, true);
    this.contextValue = PR_NODE_CONTEXT;
    // Single click opens the PR in the browser.
    this.command = {
      command: COMMAND_OPEN_PR,
      title: 'Open PR in browser',
      arguments: [vm.webUrl],
    };
  }
}

/** Either node kind the tree renders. */
type TreeNode = CategoryTreeItem | PrTreeItem;

/**
 * Provides the category-grouped PR rows to the sidebar view and notifies
 * VSCode when the underlying data changes. The root level is the set of
 * non-empty category headers; each header's children are its PR rows.
 * The all-empty state is handled by the `viewsWelcome` contribution in
 * `package.json`, so the root simply returns `[]` when there are no PRs.
 */
export class PrTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private groups: CategoryTreeItem[] = [];

  /**
   * Replace the rendered groups and refresh the view. Grouping combines the
   * computed category, the manual overrides, and the custom category list.
   *
   * @param vms                the current active PR view models
   * @param overrides          map of PR id -> overridden category id
   * @param customCategories   the user-created categories, in display order
   */
  setData(
    vms: PrViewModel[],
    overrides: Map<number, string>,
    customCategories: CustomCategory[],
  ): void {
    this.groups = resolveGroups(vms, overrides, customCategories).map(
      g => new CategoryTreeItem(g, g.vms.map(vm => new PrTreeItem(vm))),
    );
    this.emitter.fire();
  }

  /**
   * Return the tree item to render for a node. Nodes are already fully
   * built, so they are returned unchanged.
   *
   * @param element the node to render
   * @returns the same node, as required by the TreeDataProvider contract
   */
  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  /**
   * Return a node's children: category headers at the root, PR rows under a
   * header, and nothing under a PR row.
   *
   * @param element the parent node, or undefined for the root
   * @returns the child nodes to render
   */
  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) return this.groups;
    if (element instanceof CategoryTreeItem) return element.children;
    return [];
  }

  /** Dispose the change-event emitter. */
  dispose(): void {
    this.emitter.dispose();
  }
}
