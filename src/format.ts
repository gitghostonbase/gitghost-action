/**
 * Markdown formatting for the sticky verification comment.
 *
 * The first line is an HTML marker — the comment-upsert logic in
 * `comment.ts` greps for this exact string to find a prior comment and edit
 * it, instead of leaving a trail of stale comments on every new commit.
 */

import type { VerifyOutcome } from "./verify.js";

export const COMMENT_MARKER = "<!-- gitghost-verify -->";

export interface Aggregate {
  total: number;
  ghost: number;
  verified: number;
  invalid: number;
  errors: number;
}

export function aggregate(outcomes: VerifyOutcome[]): Aggregate {
  const a: Aggregate = { total: outcomes.length, ghost: 0, verified: 0, invalid: 0, errors: 0 };
  for (const o of outcomes) {
    if (o.status === "verified") {
      a.ghost++;
      a.verified++;
    } else if (o.status === "invalid") {
      a.ghost++;
      a.invalid++;
    } else if (o.status === "error") {
      a.errors++;
    }
  }
  return a;
}

function shortKeyImage(ki: string | undefined): string {
  if (!ki) return "—";
  if (ki.length <= 16) return ki;
  return `${ki.slice(0, 10)}…${ki.slice(-6)}`;
}

function statusIcon(status: VerifyOutcome["status"]): string {
  switch (status) {
    case "verified":
      return "✅";
    case "invalid":
      return "❌";
    case "error":
      return "⚠️";
    default:
      return "·";
  }
}

function anchorCell(o: VerifyOutcome): string {
  if (!o.anchor) return "—";
  if (o.anchor.onChain) {
    const block = o.anchor.blockNumber ? `block ${o.anchor.blockNumber}` : "anchored";
    if (o.anchor.basescanUrl) {
      return `[${block}](${o.anchor.basescanUrl})`;
    }
    return block;
  }
  return "off-chain";
}

function commitCell(o: VerifyOutcome): string {
  if (o.htmlUrl) return `[\`${o.shortSha}\`](${o.htmlUrl})`;
  return `\`${o.shortSha}\``;
}

function ringCell(o: VerifyOutcome): string {
  if (!o.ringName) return "—";
  const size = o.ringSize ? ` (${o.ringSize})` : "";
  return `${o.ringName}${size}`;
}

/**
 * Build the full sticky comment body. The very first line MUST be
 * COMMENT_MARKER so the upsert path can find it again on later runs.
 */
export function renderComment(
  outcomes: VerifyOutcome[],
  opts: { repoFullName: string; prNumber: number; runUrl?: string },
): string {
  const a = aggregate(outcomes);
  const ghostOutcomes = outcomes.filter(
    (o) => o.status === "verified" || o.status === "invalid",
  );
  const errorOutcomes = outcomes.filter((o) => o.status === "error");

  const lines: string[] = [COMMENT_MARKER];
  lines.push("");
  lines.push("## gitghost · ring signature verification");
  lines.push("");

  // Headline verdict.
  if (a.ghost === 0 && a.errors === 0) {
    lines.push("No ghost commits in this pull request.");
    lines.push("");
    lines.push(`_Inspected ${a.total} commit${a.total === 1 ? "" : "s"}._`);
  } else if (a.invalid > 0) {
    lines.push(
      `**❌ ${a.invalid} of ${a.ghost} ghost commit${a.ghost === 1 ? "" : "s"} failed verification.**`,
    );
  } else if (a.verified === a.ghost && a.ghost > 0) {
    lines.push(
      `**✅ All ${a.verified} ghost commit${a.verified === 1 ? "" : "s"} verified.**`,
    );
  } else if (a.errors > 0) {
    lines.push(`**⚠️ ${a.errors} commit${a.errors === 1 ? "" : "s"} could not be checked.**`);
  }

  // Headline counters row.
  lines.push("");
  lines.push(
    `\`${a.total}\` total · \`${a.ghost}\` ghost · \`${a.verified}\` verified · \`${a.invalid}\` invalid${
      a.errors > 0 ? ` · \`${a.errors}\` errors` : ""
    }`,
  );

  // Per-commit table for ghost outcomes.
  if (ghostOutcomes.length > 0) {
    lines.push("");
    lines.push("| | commit | ring | key image | anchor |");
    lines.push("|:-:|:--|:--|:--|:--|");
    for (const o of ghostOutcomes) {
      lines.push(
        `| ${statusIcon(o.status)} | ${commitCell(o)} | ${ringCell(o)} | \`${shortKeyImage(o.keyImage)}\` | ${anchorCell(o)} |`,
      );
    }

    // Surface the failure reason for any invalid rows.
    const invalids = ghostOutcomes.filter((o) => o.status === "invalid");
    if (invalids.length > 0) {
      lines.push("");
      lines.push("<details><summary>Verification errors</summary>");
      lines.push("");
      for (const o of invalids) {
        lines.push(`- \`${o.shortSha}\` — ${o.reason}`);
      }
      lines.push("");
      lines.push("</details>");
    }
  }

  // Errors block (network / api failures).
  if (errorOutcomes.length > 0) {
    lines.push("");
    lines.push("<details><summary>Could not verify</summary>");
    lines.push("");
    for (const o of errorOutcomes) {
      lines.push(`- \`${o.shortSha}\` — ${o.reason}`);
    }
    lines.push("");
    lines.push("</details>");
  }

  // Footer.
  lines.push("");
  lines.push("---");
  const verifyLink = `https://gitghost.org/verify`;
  const docsLink = `https://gitghost.org`;
  const pieces = [
    `[Verify in browser](${verifyLink})`,
    `[Learn more](${docsLink})`,
  ];
  if (opts.runUrl) pieces.push(`[Workflow run](${opts.runUrl})`);
  lines.push(`<sub>${pieces.join(" · ")}</sub>`);

  return lines.join("\n");
}
