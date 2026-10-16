# Claude in CI

Three GitHub Actions workflows run Claude Code on pull requests. The
instructions they follow live in this directory.

| Workflow | When it runs | What it does | Instructions |
|---|---|---|---|
| `claude.yml` (review) | PR opened or marked ready | Code review: inline comments plus one summary comment | `pr-review.md` |
| `claude.yml` (mention) | `@claude` in a PR comment, review, or issue | Answers the request; can push a `claude/` branch when asked to make changes | `AGENTS.md` |
| `architecture-review.yml` | PR opened or marked ready, or on demand | Architecture review comment, posted only when there are findings | `architecture-review.md` |
| `architecture-summary.yml` | Every push to a PR, or on demand | Keeps a collapsed "Architecture summary" at the end of the PR description | `architecture-summary.md` |

Every workflow reads these files from the default branch, not from the pull
request, so a PR can't change the instructions that review it. Edits here
take effect on PRs after they merge. Draft PRs, fork PRs, and PRs opened by
bots (Dependabot) aren't reviewed automatically; fork PRs don't receive the
repository secret.

## Setup

1. Install the [Claude GitHub App](https://github.com/apps/claude) on this
   repository.
2. Create a token with `claude setup-token` and store it as the
   `CLAUDE_CODE_OAUTH_TOKEN` repository secret:

   ```bash
   gh secret set CLAUDE_CODE_OAUTH_TOKEN
   ```

## Running them by hand

```bash
gh workflow run architecture-review.yml -f pr=<number>
gh workflow run architecture-summary.yml -f pr_number=<number>
```

Comment `@claude review` on a PR for a fresh code review.

Locally, ask Claude Code to "do an architecture review of this branch
following `.github/claude/architecture-review.md`" (or `pr-review.md`).

## Limits

- A PR that changes one of these workflow files can't exercise it:
  claude-code-action declines to run a workflow that differs from the
  default branch. The first PR after merge is the real test.
- Removing the summary markers from a description only lasts until the next
  push, which adds the summary back.
