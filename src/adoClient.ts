/**
 * Tiny authenticated REST client for Azure DevOps. All other modules
 * route their HTTP through this one function so error handling and
 * URL construction live in a single place.
 *
 * The error classes let callers distinguish "bad credentials" from
 * "network / server problem" without inspecting status codes.
 */

import { ADO_BASE_URL } from './constants.js';

export class AdoAuthError extends Error {
  constructor(public readonly status: number, body: string) {
    super(`ADO auth failure (HTTP ${status}): ${body.slice(0, 200)}`);
    this.name = 'AdoAuthError';
  }
}

export class AdoHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    body: string,
  ) {
    super(`ADO ${path} -> HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'AdoHttpError';
  }
}

/**
 * GET an ADO REST endpoint and parse the JSON response.
 *
 * @param path   path part starting with `/` (e.g. `/_apis/git/pullrequests?...`).
 *               Do NOT include the org or host - those come from `ADO_BASE_URL`.
 * @param token  bearer access token (typically from `getAdoToken`)
 *
 * @throws {AdoAuthError} when ADO returns 401 or 403.
 * @throws {AdoHttpError} for any other non-2xx response.
 */
export async function adoGet<T = unknown>(path: string, token: string): Promise<T> {
  const url = `${ADO_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (res.ok) return (await res.json()) as T;

  const body = await res.text().catch(() => '');
  if (res.status === 401 || res.status === 403) {
    throw new AdoAuthError(res.status, body);
  }
  throw new AdoHttpError(res.status, path, body);
}
