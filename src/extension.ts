/**
 * Extension entry point. Activates on startup, registers commands,
 * owns the refresh interval and orchestration, and wires the auth /
 * fetcher / view-model / status-bar / quick-pick modules together.
 *
 * All other modules are side-effect-free or scoped to a single concern;
 * this file is the only place that imports them all.
 */

import * as vscode from 'vscode';
import { clearPinnedAccount, getAdoToken } from './auth.js';
import { AdoAuthError } from './adoClient.js';
import {
  COMMAND_DELETE_CATEGORY,
  COMMAND_DISMISS_PR,
  COMMAND_MOVE_CATEGORY,
  COMMAND_OPEN,
  COMMAND_OPEN_PR,
  COMMAND_REFRESH,
  COMMAND_REVEAL,
  COMMAND_SIGN_IN,
  COMMAND_UNDISMISS,
  COMMAND_UNDISMISS_ALL,
  CONTEXT_HAS_DISMISSED,
  REFRESH_MS,
  VIEW_ID,
} from './constants.js';
import {
  addCustomCategory,
  clearOverride,
  deleteCustomCategory,
  loadCustomCategories,
  loadOverrides,
  setOverride,
} from './categoryStore.js';
import { pickCategory } from './categoryQuickPick.js';
import {
  allRecords,
  dismiss as persistDismiss,
  loadActive,
  undismissAll,
  undismissOne,
} from './dismissStore.js';
import { fetchMyPrs } from './prFetcher.js';
import { fetchMockPrs } from './mockFetcher.js';
import { clearRememberedOrg, resolveAdoBaseUrl } from './orgResolver.js';
import { showPrPicker } from './quickPick.js';
import { pickDismissedPr } from './undismissPicker.js';
import { CategoryTreeItem, PrTreeDataProvider, PrTreeItem } from './prTreeView.js';
import { StatusBarController } from './statusBar.js';
import { PrViewModel } from './types.js';
import { toViewModels } from './viewModel.js';

interface CachedState {
  vms: PrViewModel[];
  /** View models of dismissed PRs, kept so the undismiss picker has titles. */
  dismissedVms: PrViewModel[];
  dismissedCount: number;
  capturedAt: number;
}

let statusBar: StatusBarController | undefined;
let treeProvider: PrTreeDataProvider | undefined;
let context: vscode.ExtensionContext | undefined;
let refreshInFlight: Promise<void> | null = null;
let lastGood: CachedState | null = null;
let refreshTimer: NodeJS.Timeout | undefined;

/**
 * Single shared refresh function. All triggers (activation, interval,
 * click, focus) funnel through here. A module-level `refreshInFlight`
 * promise deduplicates concurrent calls - callers who race share the
 * same in-flight refresh and resolve together.
 */
async function refresh(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  if (!statusBar || !context) return;

  refreshInFlight = (async () => {
    try {
      const isMockMode =
        process.env['PR_STATUS_MOCK'] === '1' ||
        vscode.workspace.getConfiguration('prStatus').get<boolean>('mockMode', false);
      const fetchResult = isMockMode
        ? await fetchMockPrs()
        : await (async () => {
            const token = await getAdoToken();
            if (!token) {
              statusBar!.setSignedOut();
              return null;
            }
            const baseUrl = await resolveAdoBaseUrl(token, context!.globalState);
            return fetchMyPrs(token, baseUrl);
          })();
      if (!fetchResult) return;

      const { prs, policies, roleByPr, userId } = fetchResult;
      const dismissedSet = loadActive(context!.globalState, prs);
      // Project all PRs, then split: the sidebar/QuickPick show the active
      // ones, while the dismissed view models are retained so the undismiss
      // picker can list them with titles.
      const allVms = toViewModels(prs, policies, roleByPr, new Set(), userId);
      const vms = allVms.filter(v => !dismissedSet.has(v.prId));
      const dismissedVms = allVms.filter(v => dismissedSet.has(v.prId));

      lastGood = {
        vms,
        dismissedVms,
        dismissedCount: dismissedSet.size,
        capturedAt: Date.now(),
      };
      statusBar!.update({
        vms,
        stale: false,
        dismissedCount: dismissedSet.size,
      });
      renderTree();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (err instanceof AdoAuthError) {
        // Token rejected by ADO - try one silent refresh in case VSCode
        // cached an expired session, then escalate to re-auth UI.
        clearPinnedAccount();
        await clearRememberedOrg(context!.globalState);
        statusBar!.setReauth();
        return;
      }
      if (lastGood) {
        statusBar!.update({
          vms: lastGood.vms,
          stale: true,
          error,
          dismissedCount: lastGood.dismissedCount,
        });
        renderTree();
      } else {
        statusBar!.setError(error.message);
      }
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Re-render the sidebar tree from the last good PR list plus the current
 * overrides and custom categories. Used after a category move/delete so the
 * grouping updates instantly without a network refresh.
 */
function renderTree(): void {
  if (!treeProvider || !context) return;
  const vms = lastGood?.vms ?? [];
  treeProvider.setData(
    vms,
    loadOverrides(context.globalState),
    loadCustomCategories(context.globalState),
  );
  // Gate the undismiss view-title buttons on there being something to restore.
  void vscode.commands.executeCommand(
    'setContext',
    CONTEXT_HAS_DISMISSED,
    (lastGood?.dismissedVms.length ?? 0) > 0,
  );
}

/**
 * Persist a dismissal for a single PR. Shared by the QuickPick dismiss
 * button and the sidebar inline dismiss button.
 *
 * @param vm the view model of the PR to dismiss
 */
async function dismissPr(vm: PrViewModel): Promise<void> {
  if (!context) return;
  // We persist by PR id, so synthesise a minimal RawPullRequest-shaped
  // object for the store. Activity baseline is the view model's commit id.
  await persistDismiss(
    context.globalState,
    {
      pullRequestId: vm.prId,
      lastMergeSourceCommit: vm.lastActivityCommitId
        ? { commitId: vm.lastActivityCommitId }
        : null,
    } as Parameters<typeof persistDismiss>[1],
    new Date().toISOString(),
  );
}

/** Open the PR list QuickPick. Always refreshes first to show current data. */
async function openPicker(): Promise<void> {
  await refresh();
  const vms = lastGood?.vms ?? [];
  showPrPicker(vms, {
    onDismiss: dismissPr,
    onReload: async () => {
      await refresh();
      return lastGood?.vms ?? [];
    },
    onRefreshClicked: async () => {
      await refresh();
    },
  });
}

/**
 * Reveal/focus the PR sidebar view (wired to the footer status-bar click)
 * and kick off a refresh so the list reflects current data.
 */
async function revealSidebar(): Promise<void> {
  await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  void refresh();
}

/**
 * Open a PR in the external browser. Invoked by a tree row's click command.
 *
 * @param webUrl the ADO web URL passed as the tree item's command argument
 */
async function openPrInBrowser(webUrl: string): Promise<void> {
  if (!webUrl) return;
  await vscode.env.openExternal(vscode.Uri.parse(webUrl));
}

/**
 * Dismiss the PR behind a sidebar row, then refresh so the row disappears.
 *
 * @param item the tree node whose inline dismiss button was clicked
 */
async function dismissPrFromTree(item: PrTreeItem | undefined): Promise<void> {
  if (!item?.vm) return;
  await dismissPr(item.vm);
  await refresh();
}

/**
 * Open the move-to-category popup for a sidebar PR row, apply the user's
 * choice (clear override / pin to a category / create-and-pin), then
 * re-render the tree.
 *
 * @param item the tree node whose "Move to category..." action was invoked
 */
async function movePrToCategory(item: PrTreeItem | undefined): Promise<void> {
  if (!item?.vm || !context) return;
  const store = context.globalState;
  const result = await pickCategory(
    `#${item.vm.prId}`,
    loadCustomCategories(store),
  );
  if (!result) return;

  if (result.kind === 'auto') {
    await clearOverride(store, item.vm.prId);
  } else if (result.kind === 'existing') {
    await setOverride(store, item.vm.prId, result.categoryId);
  } else {
    const created = await addCustomCategory(store, result.name);
    await setOverride(store, item.vm.prId, created.id);
  }
  renderTree();
}

/**
 * Delete a custom category after confirmation. PRs pinned to it fall back to
 * automatic grouping (handled by the store).
 *
 * @param item the custom category header whose delete action was invoked
 */
async function deleteCategory(item: CategoryTreeItem | undefined): Promise<void> {
  if (!item?.categoryId || !context) return;
  const confirm = await vscode.window.showWarningMessage(
    `Delete category "${item.categoryName}"? PRs in it return to automatic grouping.`,
    { modal: true },
    'Delete',
  );
  if (confirm !== 'Delete') return;
  await deleteCustomCategory(context.globalState, item.categoryId);
  renderTree();
}

/** Sign-in command - opens the AAD consent flow if no session exists. */
async function signIn(): Promise<void> {
  clearPinnedAccount();
  const token = await getAdoToken({ createIfNone: true });
  if (token) await refresh();
}

/**
 * Undismiss command - refreshes, lets the user pick a dismissed PR from a
 * QuickPick, restores just that one, and refreshes again.
 */
async function undismissCommand(): Promise<void> {
  if (!context) return;
  await refresh();
  const picked = await pickDismissedPr(lastGood?.dismissedVms ?? []);
  if (!picked) return;
  await undismissOne(context.globalState, picked.prId);
  await refresh();
}

/** Undismiss-all command - clears the dismissal store and refreshes. */
async function undismissAllCommand(): Promise<void> {
  if (!context) return;
  await undismissAll(context.globalState);
  await refresh();
  const count = allRecords(context.globalState).length;
  vscode.window.showInformationMessage(
    count === 0
      ? 'All dismissed PRs have been restored.'
      : `Undismiss left ${count} records (likely from PRs no longer active).`,
  );
}

export function activate(ctx: vscode.ExtensionContext): void {
  context = ctx;
  statusBar = new StatusBarController();
  treeProvider = new PrTreeDataProvider();
  ctx.subscriptions.push(
    statusBar,
    treeProvider,
    vscode.window.registerTreeDataProvider(VIEW_ID, treeProvider),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN, openPicker),
    vscode.commands.registerCommand(COMMAND_REVEAL, revealSidebar),
    vscode.commands.registerCommand(COMMAND_OPEN_PR, openPrInBrowser),
    vscode.commands.registerCommand(COMMAND_DISMISS_PR, dismissPrFromTree),
    vscode.commands.registerCommand(COMMAND_MOVE_CATEGORY, movePrToCategory),
    vscode.commands.registerCommand(COMMAND_DELETE_CATEGORY, deleteCategory),
    vscode.commands.registerCommand(COMMAND_REFRESH, refresh),
    vscode.commands.registerCommand(COMMAND_UNDISMISS, undismissCommand),
    vscode.commands.registerCommand(COMMAND_UNDISMISS_ALL, undismissAllCommand),
    vscode.commands.registerCommand(COMMAND_SIGN_IN, signIn),
  );

  // Refresh when the window regains focus - catches the common case
  // of "switched back to VSCode after an ADO update in the browser".
  ctx.subscriptions.push(
    vscode.window.onDidChangeWindowState(s => {
      if (s.focused) void refresh();
    }),
  );

  // Periodic background refresh.
  refreshTimer = setInterval(() => void refresh(), REFRESH_MS);

  // Fire the initial refresh but don't await it - we want activation
  // to return immediately so VSCode startup isn't blocked.
  void refresh();
}

export function deactivate(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  // statusBar and treeProvider are registered in ctx.subscriptions so
  // VSCode disposes them.
  statusBar = undefined;
  treeProvider = undefined;
  context = undefined;
  lastGood = null;
}
