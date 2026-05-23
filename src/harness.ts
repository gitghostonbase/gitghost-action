/**
 * Local end-to-end harness — run the action's full pipeline against a
 * synthetic PR, with the GitHub REST surface stubbed out so we don't
 * need a token, a network round-trip, or an actual PR to flex it.
 *
 * What's stubbed:
 *   - octokit.rest.pulls.listCommits → returns hard-coded SHAs from the
 *     real public-ring-test repo, so /api/verify still has real commits
 *     to verify against.
 *   - octokit.rest.issues.listComments / createComment / updateComment →
 *     captured into in-memory state so we can assert on the rendered
 *     sticky body without posting anywhere.
 *   - core.setOutput / core.summary / core.setFailed → captured.
 *
 * What's REAL:
 *   - The verify HTTP client. Every commit in `commits` is POST'd at the
 *     live https://gitghost.org/api/verify endpoint. Output reflects the
 *     production verifier exactly.
 *
 * Run with: npx tsx src/harness.ts
 */
import { verifyCommit, type VerifyOutcome } from "./verify.js";
import { aggregate, renderComment } from "./format.js";
import { upsertStickyComment } from "./comment.js";

const REPO_OWNER = "gitghostonbase";
const REPO_NAME = "public-ring-test";

// Real SHAs from the live demo repo, confirmed via the GitHub API.
// b64cd94 has full ghost trailers + on-chain anchor.
// d64e1f1 is "chore: initial commit" — regular non-ghost commit.
const PR_COMMITS = [
  { sha: "b64cd94efa1f075e0c0d6c8824e1a20001b3233b", message: "feat: real ghost commit demo" },
  { sha: "d64e1f10da0000000000000000000000000000ff", message: "chore: initial commit (synthetic SHA)" },
];

// State captured by stubs so the test can assert.
type CapturedComment = { id: number; body: string; html_url: string };
const state = {
  comments: [] as CapturedComment[],
  nextCommentId: 1,
  outputs: {} as Record<string, string>,
  summaryBuffer: "",
  failedReason: undefined as string | undefined,
};

function makeStubOctokit() {
  const issuesListPages = [
    { data: state.comments },
  ];

  const stub = {
    rest: {
      pulls: {
        listCommits: () => Promise.resolve({ data: PR_COMMITS.map((c) => ({ sha: c.sha, commit: { message: c.message } })) }),
      },
      issues: {
        listComments: () => Promise.resolve({ data: state.comments }),
        createComment: ({ body }: { body: string }) => {
          const id = state.nextCommentId++;
          const c: CapturedComment = {
            id,
            body,
            html_url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/1#issuecomment-${id}`,
          };
          state.comments.push(c);
          return Promise.resolve({ data: c });
        },
        updateComment: ({ comment_id, body }: { comment_id: number; body: string }) => {
          const c = state.comments.find((c) => c.id === comment_id);
          if (!c) throw new Error(`update: no comment ${comment_id}`);
          c.body = body;
          return Promise.resolve({ data: c });
        },
      },
    },
    paginate: {
      iterator: () => ({
        async *[Symbol.asyncIterator]() {
          for (const p of issuesListPages) yield p;
        },
      }),
    },
  };
  return stub as any;
}

async function runHarness(prRound: number) {
  console.log(`\n=== HARNESS RUN ${prRound} (${PR_COMMITS.length} commits) ===`);
  const octokit = makeStubOctokit();

  // Mirror main.ts but with the stubbed octokit, no @actions/core noise.
  const apiUrl = "https://gitghost.org/api/verify";

  const outcomes: VerifyOutcome[] = [];
  for (const c of PR_COMMITS) {
    const out = await verifyCommit(apiUrl, REPO_OWNER, REPO_NAME, c.sha);
    console.log(`  · ${out.shortSha}  ${out.status.padEnd(10)}  ${out.reason}`);
    outcomes.push(out);
  }

  const agg = aggregate(outcomes);
  state.outputs = {
    total: String(agg.total),
    ghost: String(agg.ghost),
    verified: String(agg.verified),
    invalid: String(agg.invalid),
  };

  const body = renderComment(outcomes, {
    repoFullName: `${REPO_OWNER}/${REPO_NAME}`,
    prNumber: 1,
    runUrl: "https://github.com/gitghostonbase/public-ring-test/actions/runs/9999",
  });

  const result = await upsertStickyComment({
    octokit,
    owner: REPO_OWNER,
    repo: REPO_NAME,
    issueNumber: 1,
    body,
  });

  console.log(`\nOutputs:    ${JSON.stringify(state.outputs)}`);
  console.log(`Comment:    ${result.action} (id=${result.id})`);
  console.log(`URL:        ${result.url}`);
  console.log(`PR comments stored: ${state.comments.length}`);

  return { agg, result, body };
}

async function main() {
  // ROUND 1 — first push, comment is created.
  const r1 = await runHarness(1);
  if (r1.result.action !== "created") {
    throw new Error(`expected first run to CREATE comment, got ${r1.result.action}`);
  }

  // ROUND 2 — simulate next push to same PR. Comment must be UPDATED, not duplicated.
  const r2 = await runHarness(2);
  if (r2.result.action !== "updated") {
    throw new Error(`expected second run to UPDATE comment, got ${r2.result.action}`);
  }
  if (state.comments.length !== 1) {
    throw new Error(`expected 1 comment after 2 runs, got ${state.comments.length}`);
  }

  console.log("\n=== STICKY COMMENT BODY (final) ===\n");
  console.log(state.comments[0]!.body);

  console.log("\n=== ASSERTIONS ===");
  const passed: string[] = [];
  const checks: Array<[boolean, string]> = [
    [r1.result.action === "created", "first run creates comment"],
    [r2.result.action === "updated", "second run updates same comment (no duplicate)"],
    [state.comments.length === 1, "exactly 1 sticky comment after 2 runs"],
    [r2.agg.verified === 1, "1 ghost commit verified (b64cd94 — real demo)"],
    [r2.agg.ghost === 1, "1 ghost commit found (only b64cd94 has trailers)"],
    [r2.agg.invalid === 0, "0 invalid (synthetic SHA is an error, not invalid)"],
    [r2.agg.errors === 1, "1 error (synthetic SHA — github fetch failed)"],
    [r2.agg.total === 2, "2 total commits inspected"],
    [state.comments[0]!.body.includes("<!-- gitghost-verify -->"), "comment body contains marker"],
    [state.comments[0]!.body.includes("frontend-frameworks-demo"), "comment surfaces ring name"],
    [state.comments[0]!.body.includes("46343294"), "comment surfaces anchor block number"],
    [state.comments[0]!.body.includes("Could not verify"), "comment surfaces fetch errors in collapse"],
  ];
  for (const [ok, label] of checks) {
    console.log(`  ${ok ? "✅" : "❌"}  ${label}`);
    if (!ok) process.exitCode = 1;
    else passed.push(label);
  }
  console.log(`\n${passed.length}/${checks.length} passed`);
}

void main();
