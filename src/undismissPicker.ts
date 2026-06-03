/**
 * The "Undismiss a PR..." picker. A simple `showQuickPick` listing the
 * currently-dismissed PRs so the user can restore one without clearing them
 * all. Returns the chosen PR (or undefined if cancelled / none dismissed);
 * persistence and refresh happen in `extension.ts`.
 */

import * as vscode from 'vscode';
import { sortForTree } from './prTreePresentation.js';
import { PrViewModel } from './types.js';

interface DismissedItem extends vscode.QuickPickItem {
  vm: PrViewModel;
}

/**
 * Show the undismiss picker. When nothing is dismissed, informs the user and
 * resolves undefined rather than opening an empty list.
 *
 * @param dismissedVms view models of the currently-dismissed PRs
 * @returns the PR the user chose to restore, or undefined
 */
export async function pickDismissedPr(
  dismissedVms: PrViewModel[],
): Promise<PrViewModel | undefined> {
  if (dismissedVms.length === 0) {
    void vscode.window.showInformationMessage('No dismissed PRs to restore.');
    return undefined;
  }

  const items: DismissedItem[] = sortForTree(dismissedVms).map(vm => ({
    label: `${vm.repo} #${vm.prId}: ${vm.title}`,
    description: `(${vm.myRole})`,
    detail: vm.statusSummary,
    vm,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Undismiss a PR',
    placeHolder: 'Select a dismissed PR to restore to the list',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.vm;
}
