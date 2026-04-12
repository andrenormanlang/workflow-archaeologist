# gitExtractor.spec

Module: `gitExtractor`

Purpose

Extract the sequence of commits that touch CI/workflow files (GitHub Actions YAML files) and return normalized metadata and diffs for downstream analysis.

Inputs

- `repoPath: string` — absolute path to a local git repository clone.
- `opts?: { maxCommits?: number, since?: string, until?: string }` — optional filters:
  - `maxCommits` (default 500) — maximum commits to return.
  - `since` / `until` — ISO dates or git revision expressions to bound the range.

Outputs

- `WorkflowCommit[]` — array ordered newest → oldest. Each `WorkflowCommit` has the shape:

```ts
type WorkflowCommit = {
    sha: string            // full commit SHA
    message: string        // commit message
    author: { name: string, email?: string }
    date: string           // ISO 8601 UTC timestamp
    filePath: string       // path to the workflow file changed (relative to repo root)
    changeType: 'added' | 'modified' | 'removed' | 'renamed'
    diff: string           // unified diff (text) limited to the changed file
}
```

Behavioral rules (contract)

- Only consider commits that modify files matching `.github/workflows/*.yml` or `.github/workflows/*.yaml`.
- Exclude merge commits (commits with multiple parents).
- If a commit touches multiple workflow files, emit one `WorkflowCommit` entry per file change (same SHA, different `filePath`).
- Diffs must be unified-format patches (git `diff --unified=3`) and must include context lines.
- For renamed files, set `changeType` to `renamed` and include both old and new paths in the diff header; set `filePath` to the new path.
- Respect `opts.since` / `opts.until` if provided; otherwise walk full history up to `maxCommits` matches.
- Limit results to `opts.maxCommits` matches; return fewer if repository history has fewer matches.

Errors & edge cases

- If `repoPath` does not exist or is not a git repository → throw `AnalysisError('REPO_NOT_FOUND')`.
- If repository has no matching workflow commits → return an empty array `[]` (not an error).
- If the repository contains binary workflow files (unlikely), skip binary diffs and emit a `diff` string noting "BINARY_FILE_SKIPPED".
- If the git command fails for transient reasons (lockfile, IO), throw `AnalysisError('GIT_ERROR', { cause })`.

Performance & limits

- Default maximum matches is 500. Implementations may stream results but must not exceed memory proportional to `maxCommits`.
- Avoid loading the full repository into memory; use streaming/diff-by-file operations provided by `simple-git` or `nodegit`.

Implementation notes

- Use `simple-git` (recommended) for simplicity; `nodegit` or libgit2 bindings are acceptable for very large repos.
- Use `git rev-list --no-merges --pretty=format:%H -- ...)` or `git log --name-status` to find commits touching workflow files efficiently.
- For each matching commit, use `git show --unified=3 <sha> -- <path>` to get a minimal diff for that file.
- Normalize timestamps to ISO 8601 UTC.

Acceptance criteria (tests)

Unit/integration tests must cover:

1. Repo not found → `AnalysisError('REPO_NOT_FOUND')`.
2. Repo with no workflow history → returns `[]`.
3. Single commit that adds a workflow file → returns one `WorkflowCommit` with `changeType: 'added'` and includes the file content in the diff.
4. Commit that modifies the same workflow file multiple times (history) → returns multiple entries ordered newest → oldest.
5. Commit that renames a workflow file → `changeType: 'renamed'`, `filePath` is new path, diff header contains rename info.
6. Merge commits are ignored (create a merge commit and ensure it is not returned even if it touched workflow files).
7. `maxCommits` truncation: create more than `maxCommits` matches and assert only `maxCommits` items returned.
8. Handling `since`/`until` boundaries: commits outside the date/range are excluded.
9. Simulate git failure: ensure `AnalysisError('GIT_ERROR')` is thrown and includes cause.

Test fixtures

- Provide a small git fixture repo under `test/fixtures/git-extractor` with commits for add/modify/rename/remove and a merge commit to validate behavior.

Example output (JSON)

```json
[
    {
        "sha": "a1b2c3...",
        "message": "Increase timeout on CI workflow",
        "author": { "name": "Jane Doe", "email": "jane@example.com" },
        "date": "2023-03-15T12:34:56Z",
        "filePath": ".github/workflows/e2e.yml",
        "changeType": "modified",
        "diff": "@@ -10,7 +10,7 @@\n-  timeout: 30\n+  timeout: 45\n"
    }
]
```

Notes for downstream modules

- `analyzer` will rely on `sha`, `filePath`, and `diff` to build context windows. Keep diffs readable and bounded in size.
- Store the `WorkflowCommit` entries by `sha:filePath` as cache keys to avoid re-analysis.
