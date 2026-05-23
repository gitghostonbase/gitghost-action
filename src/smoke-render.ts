/**
 * Render-only smoke test for the comment template. No network — feeds
 * synthetic outcomes (one verified, one invalid, one error) through the
 * formatter so we can eyeball the markdown shape and catch regressions.
 */
import { renderComment } from "./format.js";
import type { VerifyOutcome } from "./verify.js";

const verifiedReal: VerifyOutcome = {
  sha: "b64cd94efa1f075e0c0d6c8824e1a20001b3233b",
  shortSha: "b64cd94",
  status: "verified",
  reason: "lsag signature valid; ring root matches",
  ringName: "frontend-frameworks-demo",
  ringSize: 4,
  keyImage:
    "03b8ae00de72b505e2bab4e723f016f8c899807ab4b916ebb13e5ab6359e0dd502",
  anchor: {
    onChain: true,
    blockNumber: 46343294,
    basescanUrl:
      "https://basescan.org/address/0x4dc8911fd65aa7cdcac410549ee80323bbcb2206#events",
    registryAddress: "0x4dc8911fd65aa7cdcac410549ee80323bbcb2206",
  },
  htmlUrl:
    "https://github.com/gitghostonbase/public-ring-test/commit/b64cd94efa1f075e0c0d6c8824e1a20001b3233b",
};

const invalid: VerifyOutcome = {
  sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  shortSha: "deadbee",
  status: "invalid",
  reason: "ring root mismatch — supplied ring does not match commit",
  ringName: "frontend-frameworks-demo",
  ringSize: 4,
  htmlUrl:
    "https://github.com/gitghostonbase/public-ring-test/commit/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
};

const errored: VerifyOutcome = {
  sha: "feedfacefeedfacefeedfacefeedfacefeedface",
  shortSha: "feedfac",
  status: "error",
  reason: "network error contacting verify api: getaddrinfo ENOTFOUND",
  htmlUrl:
    "https://github.com/gitghostonbase/public-ring-test/commit/feedfacefeedfacefeedfacefeedfacefeedface",
};

const allGood = renderComment([verifiedReal], {
  repoFullName: "gitghostonbase/public-ring-test",
  prNumber: 1,
  runUrl: "https://github.com/gitghostonbase/public-ring-test/actions/runs/123",
});

const mixed = renderComment([verifiedReal, invalid, errored], {
  repoFullName: "gitghostonbase/public-ring-test",
  prNumber: 2,
  runUrl: "https://github.com/gitghostonbase/public-ring-test/actions/runs/124",
});

const noGhost = renderComment(
  [
    { sha: "0".repeat(40), shortSha: "0000000", status: "not-ghost", reason: "regular commit" },
    { sha: "1".repeat(40), shortSha: "1111111", status: "not-ghost", reason: "regular commit" },
  ],
  {
    repoFullName: "gitghostonbase/public-ring-test",
    prNumber: 3,
  },
);

console.log("=== ALL VERIFIED ===\n" + allGood);
console.log("\n\n=== MIXED ===\n" + mixed);
console.log("\n\n=== NO GHOSTS ===\n" + noGhost);
