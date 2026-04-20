# githubEnricher.spec

Module: `githubEnricher`

## Purpose

Enrich a list of `WorkflowCommit` objects with human context pulled from the
GitHub API — PR descriptions, linked issue titles, and review comments. This
context is the primary input the `analyzer` uses to reason about *why* a
change was made.

## Inputs

- `commits: WorkflowCommit[]` — output from `gitExtractor`
- `opts: EnrichOptions` — required:
  - `owner: string` — GitHub repository owner (user or org)
  - `repo: string` — GitHub repository name
  - `token: string` — GitHub personal access token or App token

## Outputs

`EnrichedCommit[]` — one entry per input `WorkflowCommit`, preserving order.

```ts
type PullRequestContext = {
  number: number;
  title: string;
  body: string | null;
  author: string;
  reviewComments: string[];
  linkedIssues: LinkedIssue[];
};

type LinkedIssue = {
  number: number;
  title: string;
  body: string | null;
};

type EnrichedCommit = WorkflowCommit & {
  pullRequest: PullRequestContext | null;
};
```

## Behavioral rules

### PR resolution

- For each commit SHA, search for a merged PR that contains that commit
  using the GitHub Search API or `repos.listPullRequestsAssociatedWithCommit`.
- If multiple PRs are found, use the most recently merged one.
- If no PR is found, set `pullRequest: null` — this is not an error.

### Review comments

- Fetch review comments on the PR body (not inline code comments).
- Include only top-level review comments, not replies.
- Limit to 20 comments maximum per PR to avoid oversized context windows.

### Linked issues

- Parse the PR body for GitHub issue references:
  `closes #123`, `fixes #456`, `resolves #789` (case-insensitive).
- For each referenced issue number, fetch the issue title and body via
  the GitHub Issues API.
- Limit body to first 500 characters to avoid oversized payloads.
- If an issue fetch fails (deleted, private), skip it silently.

### Rate limiting & batching

- Process commits in batches of 5 with a 100ms delay between batches
  to avoid hitting GitHub API secondary rate limits.
- If a 403 or 429 response is received, throw
  `AnalysisError('GITHUB_RATE_LIMITED', { cause })`.

### Missing / partial data

- If the GitHub API returns a 404 for a commit → set `pullRequest: null`.
- If the PR body is null or empty → set `body: null`, still return the PR.
- Never throw for missing optional fields — degrade gracefully.

## Errors & edge cases

- `owner`, `repo`, or `token` missing or empty →
  throw `AnalysisError('GITHUB_AUTH_ERROR')`.
- Empty `commits` array → return `[]` immediately without any API calls.
- Network failure on a non-rate-limit error →
  throw `AnalysisError('GITHUB_API_ERROR', { cause })`.

## Performance

- Each commit requires at minimum 1 API call (PR lookup).
- Each PR with linked issues adds N additional calls (one per issue).
- Implementations must not make sequential unbatched calls for large
  commit arrays — use `p-limit` with concurrency 5.

## Implementation notes

- Use `@octokit/rest` — already in `core` dependencies.
- Use `octokit.repos.listPullRequestsAssociatedWithCommit` for PR lookup.
- Use `octokit.pulls.listReviewComments` for review comments.
- Use `octokit.issues.get` for linked issue details.
- Parse issue references from PR body with:
  `/(?:closes|fixes|resolves)\s+#(\d+)/gi`

## Acceptance criteria (tests)

1. Empty commits array → returns `[]`, no API calls made.
2. Missing `token` → throws `AnalysisError('GITHUB_AUTH_ERROR')`.
3. Commit with an associated PR → returns `EnrichedCommit` with
   `pullRequest.number`, `pullRequest.title`, and `pullRequest.body`.
4. Commit with no associated PR → returns `EnrichedCommit` with
   `pullRequest: null`.
5. PR with `closes #123` in body → `linkedIssues` contains issue 123
   with title and body.
6. PR body with no issue references → `linkedIssues` is `[]`.
7. Issue fetch returns 404 → issue is skipped, rest of enrichment succeeds.
8. API returns 429 → throws `AnalysisError('GITHUB_RATE_LIMITED')`.
9. All original `WorkflowCommit` fields are preserved on `EnrichedCommit`.
10. Review comments are included up to a maximum of 20.
