/**
 * Resolve which Azure DevOps organization to query.
 *
 * Order of precedence:
 *  1) explicit setting: `prStatus.organization`
 *  2) cached org in globalState from a previous discovery/pick
 *  3) discover org memberships from profile APIs; auto-pick if one,
 *     otherwise prompt once and persist
 */

import * as vscode from 'vscode';
import { ADO_BASE_HOST, ADO_PROFILE_HOST, ORG_STATE_KEY } from './constants.js';

const MOCK_ORGS = ['example-org', 'contoso-dev', 'fabrikam-platform'];

interface ProfileResponse {
  id: string;
}

interface AccountsResponse {
  value: Array<{ accountName: string }>;
}

export function orgBaseUrl(org: string): string {
  return `${ADO_BASE_HOST}/${org}`;
}

export async function clearRememberedOrg(state: vscode.Memento): Promise<void> {
  await state.update(ORG_STATE_KEY, undefined);
}

export async function resolveMockAdoBaseUrl(state: vscode.Memento): Promise<string> {
  const configured = normalizeOrgName(
    vscode.workspace
      .getConfiguration('prStatus')
      .get<string>('organization', ''),
  );
  if (configured) return orgBaseUrl(configured);

  const cached = normalizeOrgName(state.get<string>(ORG_STATE_KEY, ''));
  if (cached) return orgBaseUrl(cached);

  const picked = await vscode.window.showQuickPick(
    MOCK_ORGS.map(org => ({
      label: org,
      description: `${orgBaseUrl(org)} (mock)`,
    })),
    {
      title: 'Choose Azure DevOps organization (mock)',
      placeHolder: 'Mock mode simulates multi-org membership',
    },
  );
  if (!picked) throw new Error('Organization selection was cancelled.');

  await state.update(ORG_STATE_KEY, picked.label);
  return orgBaseUrl(picked.label);
}

export async function resolveAdoBaseUrl(
  token: string,
  state: vscode.Memento,
): Promise<string> {
  const configured = normalizeOrgName(
    vscode.workspace
      .getConfiguration('prStatus')
      .get<string>('organization', ''),
  );
  if (configured) return orgBaseUrl(configured);

  const cached = normalizeOrgName(state.get<string>(ORG_STATE_KEY, ''));
  if (cached) return orgBaseUrl(cached);

  const orgs = await discoverOrgs(token);
  if (orgs.length === 0) {
    throw new Error(
      'No Azure DevOps organizations were found for this account.',
    );
  }

  let selectedOrg = orgs[0];
  if (orgs.length > 1) {
    const picked = await vscode.window.showQuickPick(
      orgs.map(org => ({
        label: org,
        description: orgBaseUrl(org),
      })),
      {
        title: 'Choose Azure DevOps organization',
        placeHolder: 'Select the organization this extension should query',
      },
    );
    if (!picked) throw new Error('Organization selection was cancelled.');
    selectedOrg = picked.label;
  }

  await state.update(ORG_STATE_KEY, selectedOrg);
  return orgBaseUrl(selectedOrg);
}

function normalizeOrgName(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  // Allow users to paste either an org slug or a full URL.
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const firstPath = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
      return firstPath;
    } catch {
      return '';
    }
  }

  return trimmed;
}

async function discoverOrgs(token: string): Promise<string[]> {
  const profile = await fetchJson<ProfileResponse>(
    `${ADO_PROFILE_HOST}/_apis/profile/profiles/me?api-version=7.1-preview.3`,
    token,
  );

  const accounts = await fetchJson<AccountsResponse>(
    `${ADO_PROFILE_HOST}/_apis/accounts?memberId=${encodeURIComponent(profile.id)}&api-version=7.1-preview.1`,
    token,
  );

  const seen = new Set<string>();
  const orgs: string[] = [];
  for (const account of accounts.value ?? []) {
    const name = normalizeOrgName(account.accountName);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    orgs.push(name);
  }

  return orgs.sort((a, b) => a.localeCompare(b));
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Azure DevOps discovery failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
    );
  }

  return (await res.json()) as T;
}
