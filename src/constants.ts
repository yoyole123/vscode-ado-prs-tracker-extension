/**
 * Centralised constants - any value that another module would otherwise
 * hard-code lives here. Keeps configuration discoverable and the rest
 * of the codebase free of magic strings.
 */

import { PrCategory } from './types.js';

/** Well-known AAD application id for Azure DevOps Services. */
export const ADO_APP_ID = '499b84ac-1321-427f-aa17-267ca6975798';

/** AAD scope passed to `vscode.authentication.getSession`. */
export const ADO_SCOPE = `${ADO_APP_ID}/.default`;

/** Host used for org-scoped ADO REST calls. */
export const ADO_BASE_HOST = 'https://dev.azure.com';

/** Host used for profile/account discovery APIs. */
export const ADO_PROFILE_HOST = 'https://app.vssps.visualstudio.com';

/** `globalState` key for the last discovered or user-chosen org slug. */
export const ORG_STATE_KEY = 'prStatus.selectedOrg.v1';

/** Polling interval for background refresh (5 minutes). */
export const REFRESH_MS = 5 * 60 * 1000;

/** `globalState` key used to persist the dismissed-PR list. The
 *  trailing `v1` allows future schema migrations without colliding
 *  with old data. */
export const GLOBAL_STATE_KEY = 'prStatus.dismissed.v1';

/** `globalState` key for per-PR manual category overrides. */
export const OVERRIDE_STATE_KEY = 'prStatus.categoryOverrides.v1';

/** `globalState` key for the list of user-created custom categories. */
export const CUSTOM_CATEGORIES_KEY = 'prStatus.customCategories.v1';

/**
 * Sentinel category id meaning "no override - let the rules decide".
 * Offered as the first choice in the move-to-category popup. Cannot
 * collide with a real custom id (those are `custom-<n>`).
 */
export const AUTO_CATEGORY_ID = '__auto__';

/** Status-bar priority - higher numbers go further left. 100 puts
 *  the item left of the git branch indicator (usually ~10000). */
export const STATUS_BAR_PRIORITY = 100;

/**
 * Sidebar view container id (the activity-bar icon) and the PR list
 * view id nested inside it. These strings are duplicated in
 * `package.json` under `contributes.viewsContainers` / `contributes.views`
 * - keep both in sync. VSCode auto-registers a `${VIEW_ID}.focus` command
 * which `COMMAND_REVEAL` delegates to.
 */
export const VIEW_CONTAINER_ID = 'prStatusContainer';
export const VIEW_ID = 'prStatus.prListView';

/** Command ids contributed by the extension. */
export const COMMAND_OPEN = 'prStatus.open';
export const COMMAND_REFRESH = 'prStatus.refresh';
export const COMMAND_UNDISMISS_ALL = 'prStatus.undismissAll';
/** Undismiss a single PR chosen from a picker. */
export const COMMAND_UNDISMISS = 'prStatus.undismiss';
export const COMMAND_SIGN_IN = 'prStatus.signIn';
/** Clear extension auth/org session hints and return to signed-out state. */
export const COMMAND_LOGOUT = 'prStatus.logout';

/**
 * Context key set true when there is at least one dismissed PR. Gates the
 * undismiss view-title buttons so they only appear when relevant. Mirrored
 * as a `when` clause in `package.json` - keep the string in sync.
 */
export const CONTEXT_HAS_DISMISSED = 'prStatus.hasDismissed';
/** Reveal/focus the PR sidebar - wired to the footer status-bar click. */
export const COMMAND_REVEAL = 'prStatus.reveal';
/** Open a single PR (web url) in the external browser - tree row click. */
export const COMMAND_OPEN_PR = 'prStatus.openPr';
/** Dismiss a single PR - tree row inline button. */
export const COMMAND_DISMISS_PR = 'prStatus.dismissPr';
/** Move a single PR to a category - tree row right-click. */
export const COMMAND_MOVE_CATEGORY = 'prStatus.moveToCategory';
/** Delete a custom category - custom category header inline button. */
export const COMMAND_DELETE_CATEGORY = 'prStatus.deleteCategory';

/** Order the category groups appear in the sidebar, top to bottom. */
export const CATEGORY_ORDER: readonly PrCategory[] = [
  'approved',
  'actionRequired',
  'pending',
  'other',
];

/** Human-readable header label for each category group. */
export const CATEGORY_LABEL: Record<PrCategory, string> = {
  actionRequired: 'User action required',
  pending: 'Pending approval',
  approved: 'Approved (not merged)',
  other: 'Other',
};

/** Maximum number of title characters shown on a sidebar PR row. */
export const TREE_TITLE_MAX = 15;

/** Human-readable vote labels for reviewer votes. */
export const VOTE_LABEL: Record<number, string> = {
  10: 'approved',
  5: 'approved with suggestions',
  0: 'no vote',
  [-5]: 'waiting for author',
  [-10]: 'rejected',
};
