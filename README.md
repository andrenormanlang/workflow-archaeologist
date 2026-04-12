# Workflow Archaeologist

Workflow Archaeologist is a tool that analyzes a repository's Git history and reverse-engineers the reasons behind CI/workflow configuration choices. Example output: "This 45-minute timeout was added after a flaky Selenium test in March 2026, commit abc123. It is likely safe to reduce it now."

The product is intended for teams that inherit pipelines without institutional memory of past decisions; it reduces time spent investigating CI issues and supports informed configuration changes.

Workflow ArchaeoRun the CLI against a local repo

```bash
pnpm --filter @workflow-archaeologist/cli run start -- ./path/to/repo
```

That will currently call the core stubs and print a JSON result. Implementations for `extractWorkflowCommits` and `analyzeCommits` live in `packages/core/src`.

Development steps

1. Implement `extractWorkflowCommits` using `simple-git` and add unit/integration tests (Vitest).
2. Implement the enrichment layer to fetch PR and issue text via GitHub API (Octokit).
3. Implement `analyzeCommits` orchestration: apply cheap heuristics, generate prompts, call the LLM, parse outputs robustly, and map to the `Decision` model.
4. Add a report renderer (Markdown → PDF via Puppeteer) and a stable `report` JSON schema.
5. Add caching (better-sqlite3 or Postgres + Redis) and worker queue for long-running analyses.
