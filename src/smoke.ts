/**
 * Quick smoke test for the verify client. Runs against the public demo
 * commit on gitghostonbase/public-ring-test to prove end-to-end wiring.
 *
 * Run with: node dist-smoke/smoke.js
 */
import { verifyCommit } from "./verify.js";

async function main() {
  const out = await verifyCommit(
    "https://gitghost.org/api/verify",
    "gitghostonbase",
    "public-ring-test",
    "b64cd94efa1f075e0c0d6c8824e1a20001b3233b",
  );
  console.log(JSON.stringify({
    sha: out.sha,
    status: out.status,
    reason: out.reason,
    ringName: out.ringName,
    ringSize: out.ringSize,
    keyImage: out.keyImage,
    anchor: out.anchor,
  }, null, 2));
  if (out.status !== "verified") {
    console.error("expected verified, got", out.status);
    process.exit(1);
  }
}

void main();
