# Au10tix PR Status - Claude Handoff

A self-contained brief for a fresh Claude session opening this project. Read this file first; everything else flows from here.

---

## What this is

A personal VSCode extension that shows Yoav's active Azure DevOps PRs as a coloured indicator in the status bar. Click the indicator to reveal a dedicated **sidebar view** (its own activity-bar icon) listing the PRs; click a PR row to open it in the browser; click the inline X to dismiss a PR until something pushes new activity to it. The older QuickPick list is still available via the command palette (`PR Status: Show My PRs (Quick List)`).

- **Org**: `Au10tix-AD` (single-org tool, no multi-org support)
- **Distribution**: personal `.vsix`, no marketplace
- **Refresh cadence**: every 5 min + on window focus + on status-bar click + on activation
- **Auth**: VSCode's built-in Microsoft auth provider with the ADO AAD scope (no `az` CLI dependency)

---

## Current state (as of handoff)

- All modules implemented and wired up, including the PR sidebar view
- 135 unit tests passing (`npm test`)
- TypeScript clean (`npx tsc --noEmit`)
- Bundle builds to `dist/extension.js` (`npm run build`, ~24 KB)
- `pr-status.vsix` packaged at repo root
- Smoke-tested by user in Extension Development Host - working end to end, last iteration was a UX pass on the QuickPick label format and a slimming of the hover tooltip

---

## Key locations

| What | Where |
|---|---|
| Source code | [src/](../src/) |
| Tests | [tests/](../tests/) |
| Build config | [esbuild.config.mjs](../esbuild.config.mjs), [tsconfig.json](../tsconfig.json), [vitest.config.ts](../vitest.config.ts) |
| Extension manifest | [package.json](../package.json) |
| F5 debug config | [.vscode/launch.json](../.vscode/launch.json) |
| Packaged extension | `../pr-status.vsix` |
| Offline test fixture | [ado-sample-data.json](ado-sample-data.json) + [ado-data-contract.md](ado-data-contract.md) - the four ADO responses (synthetic, all render states) for testing without ADO access; validated by [tests/sampleData.test.ts](../tests/sampleData.test.ts) |
| Reference HTML POC | `C:\Users\yoav.keren\scripts\pr-status\pr-status.mjs` (the script the extension grew out of - reference for ADO call shapes, do not modify) |
| Original LLD plan | `C:\Users\yoav.keren\.claude\plans\dismiss-auto-undismiss-on-purring-wall.md` (the design doc Claude built against) |

---

## Architecture

Single-responsibility modules. Only `extension.ts` knows about every other module.

| File | Purpose | Touches `vscode`? |
|---|---|---|
| [src/constants.ts](../src/constants.ts) | Org slug, AAD app id, scope, refresh interval, command ids, vote labels | No |
| [src/types.ts](../src/types.ts) | `RawPullRequest`, `RawPolicyEvaluation`, `PrViewModel`, `DismissRecord`, `MementoLike` | No |
| [src/auth.ts](../src/auth.ts) | `getAdoToken({createIfNone})` via `vscode.authentication.getSession('microsoft', ...)` with pinned account id | Yes |
| [src/adoClient.ts](../src/adoClient.ts) | `adoGet<T>(path, token)` fetch wrapper with `AdoAuthError` / `AdoHttpError` | No (just `fetch`) |
| [src/prFetcher.ts](../src/prFetcher.ts) | `fetchMyPrs(token)` - connectionData, creator+reviewer list dedup, parallel policy fetch | No |
| [src/viewModel.ts](../src/viewModel.ts) | **Pure**: `colorForPr`, `aggregateColor`, `statusSummary`, `buildWebUrl`, `toViewModels`, `formatVote` | No |
| [src/dismissStore.ts](../src/dismissStore.ts) | **Pure-ish**: `loadActive`, `dismiss`, `undismissAll`, `allRecords`. Takes `MementoLike` for testability | No |
| [src/statusBar.ts](../src/statusBar.ts) | `StatusBarController` class - owns the singleton `StatusBarItem`. Footer click runs `COMMAND_REVEAL` (open sidebar) | Yes |
| [src/quickPick.ts](../src/quickPick.ts) | `showPrPicker(vms, handlers)` - uses `createQuickPick`, not `showQuickPick`. Kept as the command-palette fallback | Yes |
| [src/prTreePresentation.ts](../src/prTreePresentation.ts) | **Pure**: `buildLabel`, `buildDescription`, `buildTreeTooltip`, `iconForColor`, `truncateTitle`, `sortForTree`, `presentPr` - turns a `PrViewModel` into row strings + an icon descriptor | No |
| [src/categoryModel.ts](../src/categoryModel.ts) | **Pure**: `resolveGroups` (computed category + overrides + custom categories -> ordered groups), `effectiveCategoryId`, `categoryChoices`, `canCreateCategory`, `nextCustomId` | No |
| [src/categoryStore.ts](../src/categoryStore.ts) | **Pure-ish**: persists category overrides + custom categories to `globalState` via `MementoLike`. `loadOverrides`, `setOverride`, `clearOverride`, `loadCustomCategories`, `addCustomCategory`, `deleteCustomCategory` | No |
| [src/prTreeView.ts](../src/prTreeView.ts) | `PrTreeDataProvider` + `PrTreeItem` + `CategoryTreeItem` - the sidebar `TreeDataProvider`. Thin map from `categoryModel`/`prTreePresentation` onto `vscode` types | Yes |
| [src/categoryQuickPick.ts](../src/categoryQuickPick.ts) | `pickCategory(...)` - the "Move to category..." popup; its input box doubles as the add-new text bar | Yes |
| [src/undismissPicker.ts](../src/undismissPicker.ts) | `pickDismissedPr(...)` - the "Undismiss a PR..." `showQuickPick` over dismissed PRs | Yes |
| [src/extension.ts](../src/extension.ts) | `activate`, `deactivate`, command registration, shared `refresh()` with in-flight dedup, interval, focus listener. Pushes view models into both the status bar and the tree provider | Yes |

`viewModel.ts`, `dismissStore.ts`, `prTreePresentation.ts`, `categoryModel.ts`, and `categoryStore.ts` are pure / `vscode`-free and hold the bulk of the test coverage. UI modules (`statusBar`, `quickPick`, `prTreeView`, `categoryQuickPick`, `undismissPicker`) are imported only by `extension.ts`.

### Sidebar wiring (added after first release)

- **View container**: `prStatusContainer` (activity-bar icon, [media/pr-icon.svg](../media/pr-icon.svg)) holding one view `prStatus.prListView`. Both ids are duplicated between [src/constants.ts](../src/constants.ts) and [package.json](../package.json) `contributes` - keep them in sync.
- **Footer click** runs `COMMAND_REVEAL` -> `vscode.commands.executeCommand('prStatus.prListView.focus')` (VSCode auto-registers the `.focus` command per view) then a background `refresh()`.
- **Row click** runs `COMMAND_OPEN_PR` with the PR web url as the argument (set on each `PrTreeItem.command`).
- **Inline dismiss X** is `COMMAND_DISMISS_PR`, contributed via `menus > view/item/context` with `group: inline` and `when: viewItem == pr`. `PrTreeItem.contextValue` is `'pr'` (exported as `PR_NODE_CONTEXT`).
- **View title buttons**: refresh + undismiss-all via `menus > view/title`.
- **Empty state**: `contributes.viewsWelcome` (no PRs -> "Refresh now" / sign-in links), so `getChildren` just returns `[]`.
- `prStatus.openPr` / `prStatus.dismissPr` / `prStatus.moveToCategory` / `prStatus.deleteCategory` are hidden from the command palette via `when: false` `commandPalette` entries (they need a tree-node argument).
- **Move to category** is `COMMAND_MOVE_CATEGORY`, on PR rows via `view/item/context` group `1_modification` (right-click, not inline). **Delete category** is `COMMAND_DELETE_CATEGORY`, an inline trash button on **custom** category headers only (`viewItem == customCategory`). After either, `renderTree()` re-groups from the cached `lastGood.vms` plus the store - no network refresh.

---

## Locked-in design decisions (do not undo without checking with Yoav)

1. **Colour rules** (see [src/viewModel.ts](../src/viewModel.ts) `colorForPr`)
   - **Red** = `mergeStatus === 'conflicts'` OR any reviewer voted `-10`
   - **Yellow** = policy state **unknown** (`policies === null`, i.e. the fetch failed) OR any blocking policy not `approved` (includes `rejected`, `running`, `queued`, `broken`) OR any required reviewer at vote `0` or `-5`
   - **Green** = no merge conflicts, no `-10` votes, every blocking policy `approved` (or there are **no** blocking policies), and no required reviewer waiting
   - **Why**: Yoav explicitly wants policy `rejected` (e.g. FAIL Work item linking) to read as yellow ("action item for me"), not red. Red is for real blocking states - merge conflicts or human rejection.
   - **No-policy repos read as green** (changed after the `argocd` debug): a repo with zero blocking policies (e.g. gitops repos) is "ready", not "pending". This is safe because the policy fetch distinguishes a **known-empty** list from an **unknown** result: `fetchPolicyForPr` returns `null` on failure ([prFetcher.ts](../src/prFetcher.ts)), and `null` stays yellow. So a failed/loading fetch can never masquerade as "no policies -> green"; only ADO confirming zero blocking policies yields green. See [src/types.ts](../src/types.ts) `PolicyEvaluations`.

2. **Dismiss with auto-undismiss on new activity**
   - Persisted to `globalState` under key `prStatus.dismissed.v1`
   - Activity signal is `pr.lastMergeSourceCommit.commitId` - when it changes from what was captured at dismiss time, the dismissal is dropped
   - Comment-only activity (no new commits) does **not** auto-undismiss. Manual escape hatches: `PR Status: Undismiss a PR...` (pick one) or `PR Status: Undismiss All PRs` (clear all).
   - **Undismiss a single PR**: `undismissCommand` -> `pickDismissedPr` ([src/undismissPicker.ts](../src/undismissPicker.ts)) -> `undismissOne` ([src/dismissStore.ts](../src/dismissStore.ts)). Dismissed PRs are filtered out of the sidebar/QuickPick, so to give the picker titles, `refresh()` projects **all** PRs and splits them: active -> `lastGood.vms`, dismissed -> `lastGood.dismissedVms`. The two undismiss view-title buttons are gated by the `prStatus.hasDismissed` context key (set in `renderTree`) so they only appear when something is dismissed.

3. **Scope: creator + reviewer**, deduped by `pullRequestId` (with role tracked as `'creator' | 'reviewer' | 'both'`)

4. **Sort order in QuickPick: newest at top** (descending by `creationDate`)
   - Original plan said newest at bottom; Yoav flipped it after first smoke test.

5. **Tooltip stays small**
   - Hover tooltips in VSCode can't scroll. The tooltip shows colour breakdown only ("3 red, 12 yellow, 5 green") + "click for full list". The full PR list is for the QuickPick.

6. **Auth via `vscode.authentication.getSession('microsoft', ...)` with scope `499b84ac-1321-427f-aa17-267ca6975798/.default`**
   - Pinned account id (memoised in `auth.ts`) so a user signed into both a personal MSA and Au10tix AAD always gets the right token.
   - **Risk** (still open): could fail under Au10tix Conditional Access. If sign-in pops then immediately errors, fall back to a PAT-via-setting approach.

7. **Sidebar category grouping** (see `categorize` in [src/viewModel.ts](../src/viewModel.ts))
   - PRs in the sidebar are grouped into four buckets, top to bottom: **Approved (not merged)**, **User action required**, **Pending approval**, **Other**. Empty groups are hidden; each header shows a count.
   - The split is **role-aware** - it depends on whether Yoav authored the PR or is reviewing it, and on his own reviewer vote (`myVote`, matched by user id in `myVoteFor`):
     - **User action required**: he authored it AND it has conflicts / a `-10` rejection / a `rejected` or `broken` blocking policy; OR he is a reviewer who has not voted yet (`myVote === 0`).
     - **Approved (not merged)**: `color === 'green'` (ready to merge) and nothing above applies.
     - **Pending approval**: waiting on others - nothing for Yoav to do.
     - **Other**: drafts and non-`active` PRs.
   - Display order and labels live in `CATEGORY_ORDER` / `CATEGORY_LABEL` in [src/constants.ts](../src/constants.ts). Grouping itself is the pure `groupByCategory` in [src/prTreePresentation.ts](../src/prTreePresentation.ts).
   - The QuickPick is **not** grouped - it remains a flat newest-first list. Grouping is sidebar-only.

8. **Sidebar PR title is truncated to 15 chars** (`TREE_TITLE_MAX` in [src/constants.ts](../src/constants.ts), applied by `truncateTitle`). The full title is still shown in the row's hover tooltip. The QuickPick keeps its own `TITLE_MAX` of 30.

9. **Manual category overrides + custom categories** (right-click a PR -> "Move to category...")
   - The popup ([src/categoryQuickPick.ts](../src/categoryQuickPick.ts)) lists **Auto** + the 4 built-ins + every custom category; typing a new name surfaces a `+ Create "<name>"` row (its input box is the "add new category" text bar).
   - An override **wins over the computed category** and **persists until the user changes it** - it does NOT auto-clear on new commits (unlike dismissals). Picking **Auto** clears the override. Persisted to `globalState`: overrides under `prStatus.categoryOverrides.v1`, custom categories under `prStatus.customCategories.v1`.
   - **Known trade-off**: because an override is sticky, a PR pinned to e.g. "Approved" will stay there even if it later needs action. That was an explicit choice (overrides are organizational, not state-driven).
   - Custom categories render **after** the 4 built-ins and stay visible **even when empty** (with `(0)`), so they are not lost; delete one via the inline trash on its header (which also releases its PRs back to Auto). Custom ids are `custom-<n>` from `nextCustomId`.
   - PRs can be pinned into a built-in category too, not just custom ones. Grouping precedence and ordering live in `resolveGroups` ([src/categoryModel.ts](../src/categoryModel.ts)).

---

## Build, test, install

All commands from `C:\Users\yoav.keren\scripts\pr-status\extension\`:

```powershell
npm install                # one-time
npm test                   # vitest run, all pure logic
npx tsc --noEmit           # type check (esbuild does the actual bundling)
npm run build              # produces dist/extension.js
npm run watch              # esbuild --watch for F5 dev loop
npm run package            # produces pr-status.vsix at repo root
```

To install locally:
```powershell
code --install-extension C:/Users/yoav.keren/scripts/pr-status/extension/pr-status.vsix --force
```
Then reload VSCode (`Developer: Reload Window`).

To debug interactively:
1. Open this folder (`extension/`) in VSCode
2. Press F5 - opens an Extension Development Host with the extension loaded
3. After source edits, run `Developer: Reload Window` in the host

---

## Common change recipes

### Add a new colour rule
Edit `colorForPr` in [src/viewModel.ts](../src/viewModel.ts) and update the `statusSummary` helper if the new rule needs a distinct human label. Add a test case in [tests/viewModel.test.ts](../tests/viewModel.test.ts) under the appropriate colour `describe` block.

### Change the refresh interval
Update `REFRESH_MS` in [src/constants.ts](../src/constants.ts). Note: this is also a candidate for becoming a VSCode setting via `contributes.configuration`. Not yet implemented.

### Add a new ADO call
Add a typed response interface in [src/prFetcher.ts](../src/prFetcher.ts) (or a new module), then `adoGet<NewType>(path, token)`. Auth errors auto-propagate as `AdoAuthError` which `extension.ts` already handles by entering the re-auth state.

### Add a new command
1. Add the command id to [src/constants.ts](../src/constants.ts) as `COMMAND_XXX`
2. Add the entry under `contributes.commands` in [package.json](../package.json)
3. Implement the handler in [src/extension.ts](../src/extension.ts) and `registerCommand` it inside `activate`

### Change QuickPick row format
Edit `buildItems` in [src/quickPick.ts](../src/quickPick.ts). Title truncation is governed by `TITLE_MAX`.

### Change sidebar row format
Edit the pure helpers in [src/prTreePresentation.ts](../src/prTreePresentation.ts) (`buildLabel`, `buildDescription`, `buildTreeTooltip`, `iconForColor`, `truncateTitle`) and add a matching case in [tests/prTreePresentation.test.ts](../tests/prTreePresentation.test.ts). [src/prTreeView.ts](../src/prTreeView.ts) only maps those outputs onto `vscode` types, so layout changes rarely need to touch it. The sidebar title length is `TREE_TITLE_MAX` in [src/constants.ts](../src/constants.ts).

### Change the sidebar categories or their rules
- To change which bucket a PR lands in: edit `categorize` in [src/viewModel.ts](../src/viewModel.ts) and add cases under the `categorize` describe block in [tests/viewModel.test.ts](../tests/viewModel.test.ts).
- To rename a group or reorder/insert one: edit `CATEGORY_LABEL` / `CATEGORY_ORDER` (and the `PrCategory` union in [src/types.ts](../src/types.ts)) in [src/constants.ts](../src/constants.ts). `groupByCategory` and the tree pick the change up automatically.

### Change tooltip format
Edit `buildTooltip` in [src/statusBar.ts](../src/statusBar.ts). Reminder: tooltips can't scroll, so keep it tight.

---

## UX iterations already done (for context)

1. **First smoke test**: tooltip showed 48 PRs unscrollable; QuickPick sort was oldest-first (per original plan).
2. **Yoav's feedback**: flip to newest-first, label `repo #id: truncated_title`, status as pill in detail row.
3. **Current state**:
   - QuickPick label: `{colorIcon}  {repo} #{prId}: {title-truncated-to-30}...`
   - QuickPick description: `({role})`
   - QuickPick detail: `{colorIcon} [RED|YELLOW|GREEN]  {statusSummary}`
   - Tooltip: just colour breakdown counts + link to click for full list

If Yoav iterates further on visual layout, the change surface is small - mostly `buildItems` and `colorBadge`/`statusPill` in [src/quickPick.ts](../src/quickPick.ts).

---

## Open risks / known limitations

| Risk | Mitigation if it bites |
|---|---|
| `vscode.authentication.getSession('microsoft', ...)` may be blocked by Au10tix Conditional Access policies | Fall back to PAT via a `prStatus.pat` VSCode setting; auth.ts currently has no fallback |
| Comment-only PR activity doesn't auto-undismiss (only new commits do) | Use `PR Status: Undismiss All PRs` command. If this becomes painful, add per-PR threads fetch and store `latestThreadCommentId` in the `DismissRecord` |
| Required reviewer detection uses `reviewer.isRequired` only | If repos use a "minimum number of reviewers" policy where no one is `isRequired`, every reviewer reads as optional. Colour rule still works via "any blocking policy not approved -> yellow". Revisit if false-greens appear. |
| No VSCode settings yet | Hardcoded constants in [src/constants.ts](../src/constants.ts). Easy to lift into `contributes.configuration` when needed. |
| `vsce package` warns about missing LICENSE | Harmless for personal install. Add `LICENSE` file if it gets annoying. |

---

## Conventions in this repo

- TypeScript strict mode, no `any` unless absolutely necessary
- All imports use `.js` suffix (works with both Node16 and Bundler resolution)
- Pure modules (`viewModel`, `dismissStore`) must not import `vscode`
- Tests import directly from `src/` using `.js` suffix - no compilation step needed before vitest
- Use plain hyphens in all prose, never em or en dashes (Yoav's preference)
- Function-level docstrings on every exported function; inline comments only when the *why* is non-obvious

---

## When in doubt

- The original LLD: `C:\Users\yoav.keren\.claude\plans\dismiss-auto-undismiss-on-purring-wall.md`
- The reference HTML POC: `C:\Users\yoav.keren\scripts\pr-status\pr-status.mjs` (canonical ADO call shapes)
- ADO REST docs for PRs: `https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests`
- ADO REST docs for policy evaluations: `https://learn.microsoft.com/en-us/rest/api/azure/devops/policy/evaluations`
