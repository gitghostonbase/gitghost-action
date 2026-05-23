# gitghost verify — GitHub Action

> Verify ghost commits (LSAG ring signatures) on every pull request.
> Posts a single sticky comment summarising what's anonymous, what's
> verified, and what's anchored on Base.

For maintainers running rings: drop this action into `.github/workflows/`
and every PR gets a verifiable proof panel without leaving GitHub.

## Live demo

See it running on a real PR:
[gitghostonbase/public-ring-test#1](https://github.com/gitghostonbase/public-ring-test/pull/1).

The sticky comment, the workflow run logs, and the on-chain anchor link
are all public and reproducible — no fake data, no curated screenshots.

This repo's commits are themselves signed with `gitghost` — eat your own
dogfood. Run `gitghost verify <sha>` on any commit here to see the LSAG
math hold.

---

## Quickstart

`.github/workflows/gitghost.yml`

```yaml
name: gitghost
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: gitghostonbase/gitghost-action@v1
        with:
          github-token: ${{ github.token }}
```

That's it. The action:

1. lists every commit in the PR
2. calls `https://gitghost.org/api/verify` for each
3. upserts a single comment on the PR with the verdict

It works the same on PRs from forks. The action only reads commits and
writes a comment — it never executes third-party code.

---

## What you get

A comment that updates in place across every push:

> ### gitghost · ring signature verification
>
> **✅ All 3 ghost commits verified.**
>
> `5` total · `3` ghost · `3` verified · `0` invalid
>
> | | commit | ring | key image | anchor |
> |:-:|:--|:--|:--|:--|
> | ✅ | `a1b2c3d` | linux-kernel-core (4) | `02a1b2c3d4…f6abcd` | [block 46343294](https://basescan.org/...) |
> | ✅ | `e4f5g6h` | linux-kernel-core (4) | `02a1b2c3d4…f6abcd` | off-chain |
> | ✅ | `i7j8k9l` | linux-kernel-core (4) | `037788991a…aabbcc` | [block 46343512](https://basescan.org/...) |

Regular (non-ghost) commits are silently skipped — the action only
surfaces commits that opted in to ring signing.

---

## Inputs

| Input             | Default                              | Description                                                                                          |
| ----------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `api-url`         | `https://gitghost.org/api/verify`    | Override the verify endpoint (self-host or staging).                                                 |
| `github-token`    | `${{ github.token }}`                | Token used to read PR commits and write the sticky comment.                                          |
| `fail-on-invalid` | `true`                               | Fail the run when at least one ghost commit fails verification.                                      |
| `comment`         | `true`                               | Set to `false` to skip posting the sticky comment (useful in audit-only setups).                     |

## Outputs

| Output     | Description                                          |
| ---------- | ---------------------------------------------------- |
| `total`    | Total commits inspected.                             |
| `ghost`    | Number of ghost commits found.                       |
| `verified` | Number of ghost commits whose LSAG signature passed. |
| `invalid`  | Number of ghost commits that failed verification.    |

---

## Permissions

The action needs:

- `contents: read` — implicit for `actions/checkout`-style jobs (not strictly required here).
- `pull-requests: write` — to post and update the verification comment.

Forked PRs against public repos run with a read-only `GITHUB_TOKEN` by
default. To allow comments on fork PRs, switch the trigger to
`pull_request_target` (and accept the security trade-offs documented
[here](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/)).

---

## Tying verification to merges

Make this action a required check:

1. Settings → Branches → branch protection rule for `main`
2. "Require status checks to pass" → tick **gitghost / verify**
3. (Recommended) tick **Require branches to be up to date before merging**

Now any PR with an invalid ghost signature is blocked at the merge gate.

---

## Self-hosting

The action is a thin client over the public verify endpoint. To run
against your own deployment, set `api-url`:

```yaml
- uses: gitghostonbase/gitghost-action@v1
  with:
    api-url: https://verify.example.com/api/verify
```

The endpoint must speak the same JSON contract as
[`POST /api/verify`](https://github.com/0xlazydep/gitghost/blob/main/ui/app/api/verify/route.ts)
in the upstream repo.

---

## License

MIT.
