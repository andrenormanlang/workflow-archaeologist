# Workflow Archaeologist

Workflow ArchaeoRun the CLI against a local repo

```bash
pnpm --filter @workflow-archaeologist/cli run start -- ./path/to/repo
```

That will currently call the core stubs and print a JSON result. Implementations for `extractWorkflowCommits` and `analyzeCommits` live in `packages/core/src`.

Next steps (recommended)

1. Implement `extractWorkflowCommits` using `simple-git` and add unit/integration tests (Vitest).
2. Implement the enrichment layer to fetch PR and issue text via GitHub API (Octokit).
3. Implement `analyzeCommits` orchestration: apply cheap heuristics, generate prompts, call the LLM, parse outputs robustly, and map to the `Decision` model.
4. Add a report renderer (Markdown → PDF via Puppeteer) and a stable `report` JSON schema.
5. Add caching (better-sqlite3 or Postgres + Redis) and worker queue for long-running analyses.

If you want, I can implement `extractWorkflowCommits` next with tests and a small sample repo run.

License

Unlicensed prototype. Add a license file if you intend to publish.
