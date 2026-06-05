/**
 * Encapsulates the status bar item lifecycle and rendering. The rest
 * of the extension only ever calls `update`, `setSignedOut`, or
 * `setError` - it never touches the underlying `StatusBarItem`.
 */

import * as vscode from 'vscode';
import {
  COMMAND_REFRESH,
  COMMAND_REVEAL,
  COMMAND_LOGOUT,
  COMMAND_SIGN_IN,
  COMMAND_UNDISMISS_ALL,
  STATUS_BAR_PRIORITY,
} from './constants.js';
import { PrColor, PrViewModel } from './types.js';
import { aggregateColor } from './viewModel.js';

export interface StatusBarState {
  vms: PrViewModel[];
  /** True when the most recent refresh failed; we show cached data. */
  stale: boolean;
  /** Last refresh error - used in the tooltip when stale. */
  error?: Error;
  /** Count of dismissed PRs - shown in the tooltip as a hint. */
  dismissedCount: number;
}

/**
 * Owns the singleton `StatusBarItem`. Disposed via the lifetime
 * registered in `extension.ts`.
 */
export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      STATUS_BAR_PRIORITY,
    );
    this.item.text = '$(sync~spin) PRs';
    this.item.tooltip = 'Loading PR status...';
    this.item.show();
  }

  /** Render normal "we have data" state. */
  update(state: StatusBarState): void {
    const color = aggregateColor(state.vms);
    const count = state.vms.length;

    const icon = pickIcon(color, count);
    const stalePrefix = state.stale ? '$(sync~spin) ' : '';
    const dismissedSuffix = state.dismissedCount > 0
      ? ` (${state.dismissedCount} hidden)`
      : '';

    this.item.text = `${stalePrefix}${icon} PRs${count ? ` ${count}` : ''}${dismissedSuffix}`;
    this.item.color = foregroundColor(color);
    this.item.backgroundColor = backgroundColor(color);
    this.item.command = COMMAND_REVEAL;
    this.item.tooltip = buildTooltip(state, color);
  }

  /** Render the "no auth session yet" state. */
  setSignedOut(): void {
    this.item.text = '$(account) PRs: sign in';
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
    this.item.command = COMMAND_SIGN_IN;
    this.item.tooltip = 'Click to sign in to Azure DevOps.';
  }

  /** Render the "refresh failed and we have no cache" state. */
  setError(message: string): void {
    this.item.text = '$(alert) PRs: error';
    this.item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.item.command = COMMAND_REFRESH;
    this.item.tooltip = `${message}\n\nClick to retry.`;
  }

  /** Render the "session expired / token rejected" state. */
  setReauth(): void {
    this.item.text = '$(alert) PRs: re-auth';
    this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.command = COMMAND_SIGN_IN;
    this.item.tooltip = 'Azure DevOps rejected the cached token. Click to re-authenticate.';
  }

  dispose(): void {
    this.item.dispose();
  }
}

/**
 * Choose the leading codicon based on aggregate colour and PR count.
 * `$(check)` for an empty list reads as "all good"; `$(pass-filled)`
 * for non-empty greens still conveys "good" while differentiating.
 */
function pickIcon(color: PrColor, count: number): string {
  if (color === 'red') return '$(error)';
  if (color === 'yellow') return '$(warning)';
  return count === 0 ? '$(check)' : '$(pass-filled)';
}

/** Theme-adaptive foreground colour for the status bar text. */
function foregroundColor(color: PrColor): vscode.ThemeColor {
  if (color === 'red') return new vscode.ThemeColor('statusBarItem.errorForeground');
  if (color === 'yellow') return new vscode.ThemeColor('statusBarItem.warningForeground');
  return new vscode.ThemeColor('charts.green');
}

/**
 * Theme-adaptive background colour. VSCode only honours warning/error
 * backgrounds on status bar items - there is no green background, so
 * green returns undefined (the default).
 */
function backgroundColor(color: PrColor): vscode.ThemeColor | undefined {
  if (color === 'red') return new vscode.ThemeColor('statusBarItem.errorBackground');
  if (color === 'yellow') return new vscode.ThemeColor('statusBarItem.warningBackground');
  return undefined;
}

/**
 * Build a compact markdown tooltip - VSCode tooltips can't scroll, so
 * listing every PR is pointless once you have more than a handful.
 * Show breakdown by colour and direct the user to click for the full list.
 */
function buildTooltip(state: StatusBarState, color: PrColor): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;

  if (state.stale && state.error) {
    md.appendMarkdown(`**Stale data** - last refresh failed: ${escapeMd(state.error.message)}\n\n`);
  }

  if (state.vms.length === 0) {
    md.appendMarkdown(`$(check) No active PRs\n\n`);
  } else {
    const reds = state.vms.filter(v => v.color === 'red').length;
    const yellows = state.vms.filter(v => v.color === 'yellow').length;
    const greens = state.vms.filter(v => v.color === 'green').length;

    md.appendMarkdown(
      `**${state.vms.length} active PR${state.vms.length === 1 ? '' : 's'}** (${color})\n\n`,
    );
    if (reds > 0) md.appendMarkdown(`- $(error) **${reds} red** - rejected / conflicts\n`);
    if (yellows > 0) md.appendMarkdown(`- $(warning) **${yellows} yellow** - action needed\n`);
    if (greens > 0) md.appendMarkdown(`- $(pass-filled) **${greens} green** - ready to merge\n`);
    md.appendMarkdown(`\n_Click to open the PR sidebar._\n`);
  }

  if (state.dismissedCount > 0) {
    md.appendMarkdown(
      `\n_${state.dismissedCount} dismissed - [undismiss all](command:${COMMAND_UNDISMISS_ALL})_\n`,
    );
  }
  md.appendMarkdown(
    `\n_[Refresh now](command:${COMMAND_REFRESH})_ | _[Log out](command:${COMMAND_LOGOUT})_`,
  );

  return md;
}

/** Escape markdown special characters in interpolated values. */
function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, m => `\\${m}`);
}
