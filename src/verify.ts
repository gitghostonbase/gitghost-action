/**
 * HTTP client for the gitghost verify API.
 *
 * The API exposes two modes; this action only uses `github` mode because we
 * already have the owner/repo/sha from the PR commit list. The API server
 * fetches the commit message and ring.json for us, runs the full LSAG
 * verification path, and returns a result that includes optional on-chain
 * anchor information.
 */

export interface VerifyAnchor {
  onChain: boolean;
  blockNumber?: number;
  basescanUrl?: string;
  registryAddress?: string;
}

export interface VerifyTrailers {
  ringName?: string;
  ringRoot?: string;
  keyImage?: string;
  signaturePresent?: boolean;
  ringSize?: number;
}

export interface VerifyRing {
  name?: string;
  members?: Array<{ github: string; publicKey: string }>;
  computedRoot?: string;
  rootMatches?: boolean;
  sourceUrl?: string;
}

export interface VerifyApiResponse {
  ok: boolean;
  error?: string;
  trailers?: VerifyTrailers;
  ring?: VerifyRing;
  verification?: {
    signatureValid: boolean;
    keyImage?: string;
  };
  anchor?: VerifyAnchor;
  commit?: {
    source?: string;
    owner?: string;
    repo?: string;
    sha?: string;
    message?: string;
    htmlUrl?: string;
  };
}

export interface VerifyOutcome {
  sha: string;
  shortSha: string;
  status: "verified" | "invalid" | "not-ghost" | "error";
  /**
   * Human-readable reason summarising the outcome. Always set.
   */
  reason: string;
  ringName?: string;
  ringSize?: number;
  keyImage?: string;
  anchor?: VerifyAnchor;
  htmlUrl?: string;
  apiResponse?: VerifyApiResponse;
}

/**
 * Verify a single commit by calling POST <apiUrl> in github mode.
 *
 * Network errors and non-JSON responses are surfaced as `status: "error"`
 * rather than thrown — the caller aggregates many of these and we don't
 * want one transient hiccup to abort the whole action.
 */
export async function verifyCommit(
  apiUrl: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<VerifyOutcome> {
  const shortSha = sha.slice(0, 7);
  const input = `${owner}/${repo}@${sha}`;
  const htmlUrl = `https://github.com/${owner}/${repo}/commit/${sha}`;

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "gitghost-action",
      },
      body: JSON.stringify({ mode: "github", input }),
    });
  } catch (e) {
    return {
      sha,
      shortSha,
      status: "error",
      reason: `network error contacting verify api: ${(e as Error).message}`,
      htmlUrl,
    };
  }

  let data: VerifyApiResponse;
  try {
    data = (await res.json()) as VerifyApiResponse;
  } catch (e) {
    return {
      sha,
      shortSha,
      status: "error",
      reason: `verify api returned non-json (HTTP ${res.status}): ${(e as Error).message}`,
      htmlUrl,
    };
  }

  // Map error strings from the verify API back to our outcome taxonomy.
  // We DO NOT want to surface "this commit doesn't exist" or "ring.json is
  // not in this repo" as `invalid` — that would scream FAILED on benign
  // commits. Only commits with valid Ghost-* trailers AND a real signature
  // mismatch should be `invalid`.
  const errorMsg = data.error ?? "";
  const lowered = errorMsg.toLowerCase();

  // "regular commit" signals — repo or commit just isn't a ghost.
  const looksMissingRing =
    lowered.includes("no ring.json") ||
    lowered.includes("ring.json not found") ||
    lowered.includes(".gitghost/ring.json") ||
    lowered.includes("ring.json on commit is not valid json");
  const looksMissingTrailers = lowered.includes("missing ghost-* trailers");

  // "couldn't actually check" signals — we never got to verify anything.
  const looksFetchFailed =
    lowered.includes("github commit fetch failed") ||
    lowered.includes("could not parse input");

  if (!data.ok && (looksMissingRing || looksMissingTrailers)) {
    return {
      sha,
      shortSha,
      status: "not-ghost",
      reason: "regular commit (no ghost trailers or ring.json)",
      htmlUrl: data.commit?.htmlUrl ?? htmlUrl,
      apiResponse: data,
    };
  }

  if (!data.ok && looksFetchFailed) {
    return {
      sha,
      shortSha,
      status: "error",
      reason: errorMsg,
      htmlUrl,
      apiResponse: data,
    };
  }

  if (!data.ok) {
    return {
      sha,
      shortSha,
      status: "invalid",
      reason: errorMsg || `verify failed (HTTP ${res.status})`,
      ringName: data.ring?.name,
      ringSize: data.ring?.members?.length,
      keyImage: data.trailers?.keyImage ?? data.verification?.keyImage,
      anchor: data.anchor,
      htmlUrl: data.commit?.htmlUrl ?? htmlUrl,
      apiResponse: data,
    };
  }

  return {
    sha,
    shortSha,
    status: "verified",
    reason: "lsag signature valid; ring root matches",
    ringName: data.ring?.name,
    ringSize: data.ring?.members?.length,
    keyImage: data.trailers?.keyImage ?? data.verification?.keyImage,
    anchor: data.anchor,
    htmlUrl: data.commit?.htmlUrl ?? htmlUrl,
    apiResponse: data,
  };
}
