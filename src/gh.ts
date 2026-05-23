/**
 * Tiny shim so the rest of the action can import an `Octokit` type without
 * pulling Octokit's full type graph at every callsite.
 */

import { getOctokit } from "@actions/github";

export type Octokit = ReturnType<typeof getOctokit>;
