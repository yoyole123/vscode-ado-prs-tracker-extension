/**
 * Pure presentation helpers for the PR sidebar tree.
 *
 * No VSCode API access here - these functions turn a `PrViewModel` into
 * plain strings and a colour-icon descriptor, so the tree-item rendering
 * (in `prTreeView.ts`) stays a thin mapping layer and all the formatting
 * logic is unit-testable without mocking `vscode`.
 */

import { TREE_TITLE_MAX } from './constants.js';
import { PrColor, PrViewModel } from './types.js';
import { formatVote } from './viewModel.js';

/**
 * Codicon id + theme-colour id describing the leading icon for a PR row.
 * `prTreeView.ts` maps this to a `vscode.ThemeIcon` with a `ThemeColor`.
 */
export interface PrIconSpec {
  /** Codicon id (without the `$()` wrapper). */
  codicon: string;
  /** VSCode theme colour id applied to the icon. */
  themeColorId: string;
}

/** Everything needed to render one PR as a tree row. */
export interface PrTreePresentation {
  label: string;
  description: string;
  icon: PrIconSpec;
  /** Markdown body for the row hover tooltip. */
  tooltipMarkdown: string;
}

/**
 * Truncate a title to `TREE_TITLE_MAX` characters, appending an ellipsis
 * when it was shortened. Keeps sidebar rows narrow.
 *
 * @param title the PR title
 * @returns the truncated title
 */
export function truncateTitle(title: string): string {
  if (title.length <= TREE_TITLE_MAX) return title;
  return `${title.slice(0, TREE_TITLE_MAX).trimEnd()}...`;
}

/**
 * Map a PR colour to its tree-row icon. Mirrors the QuickPick badge
 * mapping (error / warning / pass-filled) and uses the `charts.*` theme
 * palette so the icon tint reads correctly in both light and dark themes.
 *
 * @param color the resolved PR colour
 * @returns codicon id and theme colour id for the row icon
 */
export function iconForColor(color: PrColor): PrIconSpec {
  if (color === 'red') return { codicon: 'error', themeColorId: 'charts.red' };
  if (color === 'yellow') return { codicon: 'warning', themeColorId: 'charts.yellow' };
  return { codicon: 'pass-filled', themeColorId: 'charts.green' };
}

/**
 * Build the primary tree-row label: `{repo} #{prId}: {title}`, with a
 * trailing `[DRAFT]` marker for draft PRs. The tree truncates long labels
 * with an ellipsis itself, so the full title is kept here.
 *
 * @param vm the PR view model
 * @returns the row label string
 */
export function buildLabel(vm: PrViewModel): string {
  const draft = vm.isDraft ? '  [DRAFT]' : '';
  return `${vm.repo} #${vm.prId}: ${truncateTitle(vm.title)}${draft}`;
}

/**
 * Build the dimmed description shown after the label - the single-line
 * status summary, which is the most actionable piece of information.
 *
 * @param vm the PR view model
 * @returns the row description string
 */
export function buildDescription(vm: PrViewModel): string {
  return vm.statusSummary;
}

/**
 * Build the markdown hover tooltip for a PR row: title, role, status, and
 * the full policy and reviewer breakdown that does not fit on the row.
 *
 * @param vm the PR view model
 * @returns markdown string for the tooltip
 */
export function buildTreeTooltip(vm: PrViewModel): string {
  const lines: string[] = [];
  lines.push(`**${vm.repo} #${vm.prId}**  (${vm.myRole})`);
  lines.push('');
  lines.push(vm.title + (vm.isDraft ? '  _[draft]_' : ''));
  lines.push('');
  lines.push(`**${vm.color.toUpperCase()}** - ${vm.statusSummary}`);

  if (vm.policies.length > 0) {
    lines.push('');
    lines.push('**Policies**');
    for (const p of vm.policies) lines.push(`- ${p.name}: ${p.status}`);
  }

  if (vm.reviewers.length > 0) {
    lines.push('');
    lines.push('**Reviewers**');
    for (const r of vm.reviewers) {
      const required = r.isRequired ? ' _(required)_' : '';
      lines.push(`- ${r.displayName}: ${formatVote(r.vote)}${required}`);
    }
  }

  return lines.join('\n');
}

/**
 * Sort PRs newest-first (descending by `createdAt`) so the most recent PR
 * sits at the top of the sidebar. Matches the QuickPick ordering. Returns a
 * new array; the input is not mutated.
 *
 * @param vms the PR view models to order
 * @returns a new, sorted array
 */
export function sortForTree(vms: PrViewModel[]): PrViewModel[] {
  return vms.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Compose the full presentation for a single PR row.
 *
 * @param vm the PR view model
 * @returns label, description, icon spec, and tooltip markdown
 */
export function presentPr(vm: PrViewModel): PrTreePresentation {
  return {
    label: buildLabel(vm),
    description: buildDescription(vm),
    icon: iconForColor(vm.color),
    tooltipMarkdown: buildTreeTooltip(vm),
  };
}
