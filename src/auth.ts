/**
 * Thin wrapper around `vscode.authentication.getSession` for the
 * Azure DevOps AAD scope. Centralising it here means the rest of the
 * code never has to know about scope strings or session shapes.
 */

import * as vscode from 'vscode';
import { ADO_SCOPE } from './constants.js';

/**
 * Memoised account id - once we see a successful session, we pin
 * subsequent lookups to the same account so a user signed in to both
 * a personal MSA and the Au10tix AAD doesn't accidentally get the
 * wrong token.
 */
let pinnedAccountId: string | undefined;

export interface AdoSession {
  accessToken: string;
  accountId: string;
}

/**
 * Acquire an ADO access token via VSCode's built-in Microsoft auth provider.
 *
 * @param opts.createIfNone  when true, triggers the interactive AAD
 *                           consent flow if no session is cached.
 *                           When false (default), only silent lookups -
 *                           returns null when no session exists.
 */
export async function getAdoSession(
  opts: { createIfNone?: boolean } = {},
): Promise<AdoSession | null> {
  const createIfNone = opts.createIfNone ?? false;
  const session = await vscode.authentication.getSession(
    'microsoft',
    [ADO_SCOPE],
    {
      createIfNone,
      silent: !createIfNone,
      account: pinnedAccountId ? { id: pinnedAccountId, label: '' } : undefined,
    },
  );
  if (!session) return null;
  pinnedAccountId = session.account.id;
  return { accessToken: session.accessToken, accountId: session.account.id };
}

/** Convenience: just the token, or null. */
export async function getAdoToken(
  opts: { createIfNone?: boolean } = {},
): Promise<string | null> {
  const session = await getAdoSession(opts);
  return session?.accessToken ?? null;
}

/**
 * Drop the pinned account id - call after sign-out or when we detect
 * a 401 that survives a fresh `getSession` call.
 */
export function clearPinnedAccount(): void {
  pinnedAccountId = undefined;
}
