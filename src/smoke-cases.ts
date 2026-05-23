/**
 * Probe verify.ts against varied real commits to confirm the outcome
 * taxonomy holds across all the failure modes we saw at the API:
 *
 *   - real ghost commit, valid signature           → verified
 *   - real commit, regular repo (no ring.json)     → not-ghost
 *   - non-existent SHA                             → error
 */
import { verifyCommit } from "./verify.js";

interface Case {
  label: string;
  owner: string;
  repo: string;
  sha: string;
  expect: "verified" | "invalid" | "not-ghost" | "error";
}

const cases: Case[] = [
  {
    label: "real ghost commit (anchored)",
    owner: "gitghostonbase",
    repo: "public-ring-test",
    sha: "b64cd94efa1f075e0c0d6c8824e1a20001b3233b",
    expect: "verified",
  },
  {
    label: "real commit on regular repo (no ring.json)",
    owner: "vercel",
    repo: "next.js",
    sha: "56c9e85dd2c850f3c98dd175693019f85b9ff19b",
    expect: "not-ghost",
  },
  {
    label: "non-existent sha",
    owner: "gitghostonbase",
    repo: "public-ring-test",
    sha: "d64e1f10da0000000000000000000000000000ff",
    expect: "error",
  },
];

async function main() {
  let passed = 0;
  for (const c of cases) {
    const out = await verifyCommit("https://gitghost.org/api/verify", c.owner, c.repo, c.sha);
    const ok = out.status === c.expect;
    console.log(
      `  ${ok ? "✅" : "❌"}  [${c.label}] expected=${c.expect}  got=${out.status}  reason="${out.reason}"`,
    );
    if (ok) passed++;
  }
  console.log(`\n${passed}/${cases.length} cases passed`);
  if (passed !== cases.length) process.exit(1);
}

void main();
