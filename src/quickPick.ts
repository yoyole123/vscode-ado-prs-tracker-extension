/**
 * Builds and shows the QuickPick PR list. Uses `createQuickPick`
 * (not the simpler `showQuickPick`) so we can keep the picker open
 * after a dismiss button press and refresh its items in place.
 */

import * as vscode from 'vscode';
import { PrViewModel } from './types.js';

export interface QuickPickHandlers {
  /** Called when the user clicks the dismiss X on a PR. */
  onDismiss: (vm: PrViewModel) => Promise<void>;
  /**
   * Called to obtain a fresh list of view models after a dismiss.
   * Implementations should re-run the refresh pipeline.
   */
  onReload: () => Promise<PrViewModel[]>;
  /** Called when the user activates "Refresh now" in the empty state. */
  onRefreshClicked: () => Promise<void>;
}

interface PrItem extends vscode.QuickPickItem {
  vm?: PrViewModel;
  action?: 'refresh' | 'open';
}

const DISMISS_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('close'),
  tooltip: 'Dismiss until next push',
};

/**
 * Show the PR picker. Returns once the user closes it; while it is
 * open the function holds VSCode's focus.
 *
 * @param initial    initial view models to render
 * @param handlers   wiring back into the extension
 */
export function showPrPicker(
  initial: PrViewModel[],
  handlers: QuickPickHandlers,
): void {
  const qp = vscode.window.createQuickPick<PrItem>();
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.placeholder = 'Click a PR to open in browser. Use the X button to dismiss until the next push.';
  qp.items = buildItems(initial);

  qp.onDidAccept(async () => {
    const item = qp.selectedItems[0];
    if (!item) return;
    if (item.action === 'refresh') {
      await handlers.onRefreshClicked();
      qp.items = buildItems(await handlers.onReload());
      return;
    }
    if (item.vm) {
      await vscode.env.openExternal(vscode.Uri.parse(item.vm.webUrl));
      qp.hide();
    }
  });

  qp.onDidTriggerItemButton(async e => {
    if (!e.item.vm) return;
    await handlers.onDismiss(e.item.vm);
    const fresh = await handlers.onReload();
    qp.items = buildItems(fresh);
    if (fresh.length === 0) {
      // Surface the empty state immediately rather than waiting for
      // the user to clear the search box.
      qp.value = '';
    }
  });

  qp.onDidHide(() => qp.dispose());
  qp.show();
}

/** Maximum number of title characters shown in the QuickPick label. */
const TITLE_MAX = 30;

/**
 * Build the QuickPick item list. Sorts by creationDate descending so the
 * newest PR sits at the top of the list (closest to the cursor / search box).
 */
function buildItems(vms: PrViewModel[]): PrItem[] {
  if (vms.length === 0) {
    return [
      {
        label: '$(check) No active PRs',
        description: 'Everything is caught up.',
        action: 'refresh',
        alwaysShow: true,
      },
      {
        label: '$(refresh) Refresh now',
        description: 'Re-check Azure DevOps for new PRs.',
        action: 'refresh',
        alwaysShow: true,
      },
    ];
  }

  const sorted = vms.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted.map(vm => ({
    label: `${colorBadge(vm.color)}  ${vm.repo} #${vm.prId}: ${truncate(vm.title, TITLE_MAX)}${vm.isDraft ? '  [DRAFT]' : ''}`,
    description: `(${vm.myRole})`,
    detail: `${statusPill(vm.color)}  ${vm.statusSummary}`,
    buttons: [DISMISS_BUTTON],
    vm,
  }));
}

/**
 * Compact codicon prefix matching the per-PR colour, so the list
 * reads at a glance even before the user reads the title.
 */
function colorBadge(color: PrViewModel['color']): string {
  if (color === 'red') return '$(error)';
  if (color === 'yellow') return '$(warning)';
  return '$(pass-filled)';
}

/**
 * Pill-style status indicator for the detail row. Uppercase bracketed
 * label gives a clear visual chip without needing real CSS.
 */
function statusPill(color: PrViewModel['color']): string {
  if (color === 'red') return '$(error) [RED]';
  if (color === 'yellow') return '$(warning) [YELLOW]';
  return '$(pass-filled) [GREEN]';
}

/**
 * Truncate a string to `max` characters, appending an ellipsis when
 * the string was actually shortened. Keeps labels predictable in width.
 */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}...`;
}
