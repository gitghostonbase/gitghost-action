/**
 * Sticky-comment upsert.
 *
 * On every run we look at the PR's existing comments, find one whose body
 * starts with the marker we control, and either edit it in place or create
 * a new one. This keeps the PR conversation tidy on long-lived branches —
 * you get one canonical verification comment that always reflects HEAD.
 */

import type { Octokit } from "./gh.js";
import { COMMENT_MARKER } from "./format.js";

export interface UpsertOpts {
  octokit: Octokit;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export async function upsertStickyComment(opts: UpsertOpts): Promise<{
  action: "created" | "updated";
  id: number;
  url: string;
}> {
  const { octokit, owner, repo, issueNumber, body } = opts;

  const iterator = octokit.paginate.iterator(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  let existingId: number | undefined;
  for await (const page of iterator) {
    for (const c of page.data) {
      if (typeof c.body === "string" && c.body.includes(COMMENT_MARKER)) {
        existingId = c.id;
        break;
      }
    }
    if (existingId !== undefined) break;
  }

  if (existingId !== undefined) {
    const { data } = await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingId,
      body,
    });
    return { action: "updated", id: data.id, url: data.html_url };
  }

  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return { action: "created", id: data.id, url: data.html_url };
}
