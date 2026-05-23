/**
 * gitghost verify — GitHub Action entrypoint.
 *
 * On `pull_request` (or `pull_request_target`):
 *   1. List every commit in the PR.
 *   2. POST each to the gitghost verify API in `github` mode.
 *   3. Aggregate, render a sticky markdown comment, upsert it on the PR.
 *   4. Set step outputs and (optionally) fail the run on invalid commits.
 *
 * Designed to be safe on PRs from forks: we never run third-party code,
 * we only call a documented HTTP API and the GitHub REST API with the
 * action's own token.
 */

import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { verifyCommit, type VerifyOutcome } from "./verify.js";
import { aggregate, renderComment } from "./format.js";
import { upsertStickyComment } from "./comment.js";

function readBoolInput(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name);
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return fallback;
}

async function run(): Promise<void> {
  try {
    const apiUrl = core.getInput("api-url") || "https://gitghost.org/api/verify";
    const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
    const failOnInvalid = readBoolInput("fail-on-invalid", true);
    const shouldComment = readBoolInput("comment", true);

    if (!token) {
      core.setFailed(
        "no GitHub token available. pass `github-token: ${{ github.token }}` to the action's `with:` block, " +
          "or set GITHUB_TOKEN in env.",
      );
      return;
    }

    const eventName = context.eventName;
    if (eventName !== "pull_request" && eventName !== "pull_request_target") {
      core.warning(
        `unsupported event "${eventName}" — this action expects pull_request / pull_request_target. exiting cleanly.`,
      );
      return;
    }

    const pr = context.payload.pull_request;
    if (!pr || typeof pr.number !== "number") {
      core.setFailed("event payload did not contain a pull_request");
      return;
    }

    const owner = context.repo.owner;
    const repo = context.repo.repo;
    const prNumber = pr.number;

    const octokit = getOctokit(token);

    core.info(`fetching commits for ${owner}/${repo}#${prNumber}…`);

    const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    if (commits.length === 0) {
      core.warning("pr has no commits — nothing to verify");
      core.setOutput("total", "0");
      core.setOutput("ghost", "0");
      core.setOutput("verified", "0");
      core.setOutput("invalid", "0");
      return;
    }

    core.info(`verifying ${commits.length} commit(s) via ${apiUrl}`);

    // Sequential by design — keeps API rate-limit pressure low and produces
    // deterministic logs. PRs almost never exceed a few dozen commits.
    const outcomes: VerifyOutcome[] = [];
    for (const c of commits) {
      const sha = c.sha;
      const short = sha.slice(0, 7);
      core.info(`  · ${short} ${c.commit?.message?.split("\n")[0] ?? ""}`);
      const outcome = await verifyCommit(apiUrl, owner, repo, sha);
      outcomes.push(outcome);
      const tag =
        outcome.status === "verified"
          ? "verified"
          : outcome.status === "invalid"
            ? "INVALID"
            : outcome.status === "error"
              ? "error"
              : "not-ghost";
      core.info(`    → ${tag}: ${outcome.reason}`);
    }

    const agg = aggregate(outcomes);
    core.setOutput("total", String(agg.total));
    core.setOutput("ghost", String(agg.ghost));
    core.setOutput("verified", String(agg.verified));
    core.setOutput("invalid", String(agg.invalid));

    // Pull request summary panel — shows up under the run page in the UI.
    await core.summary
      .addHeading("gitghost verification", 2)
      .addRaw(
        `**${agg.verified}** verified · **${agg.invalid}** invalid · **${agg.ghost}** ghost · **${agg.total}** total`,
      )
      .write();

    if (shouldComment) {
      const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined;

      const body = renderComment(outcomes, {
        repoFullName: `${owner}/${repo}`,
        prNumber,
        runUrl,
      });

      try {
        const result = await upsertStickyComment({
          octokit,
          owner,
          repo,
          issueNumber: prNumber,
          body,
        });
        core.info(`${result.action} sticky comment: ${result.url}`);
      } catch (e) {
        // Posting a comment is non-essential and can fail on PRs from forks
        // when the workflow forgot `permissions: pull-requests: write`.
        core.warning(
          `could not post verification comment (${(e as Error).message}). ` +
            `add \`permissions: pull-requests: write\` to your workflow to enable comments.`,
        );
      }
    } else {
      core.info("comment posting disabled via input");
    }

    if (failOnInvalid && agg.invalid > 0) {
      core.setFailed(
        `${agg.invalid} ghost commit${agg.invalid === 1 ? "" : "s"} failed verification`,
      );
      return;
    }

    if (agg.errors > 0 && agg.ghost === 0) {
      core.warning(
        `${agg.errors} commit${agg.errors === 1 ? "" : "s"} could not be verified — see logs`,
      );
    }
  } catch (e) {
    core.setFailed(`gitghost verify failed: ${(e as Error).message}`);
  }
}

void run();
