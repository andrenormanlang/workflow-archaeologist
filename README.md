# Workflow Archaeologist

Workflow Archaeologist analyses a repository's Git history and reverse-engineers
the reasons behind CI/workflow configuration choices.

> "This 45-minute timeout was added after a flaky Selenium test in March 2026,
> commit abc123. It is likely safe to reduce it now."

Built for teams that inherit pipelines without institutional memory of past
decisions — it reduces time spent investigating CI issues and supports informed
configuration changes.

---

## Monorepo structure

```bash
workflow-archaeologist/
├── packages/
│   ├── core/        — engine: git extraction, AI analysis, risk detection
│   └── cli/         — CLI consumer of the core engine
├── docs/
│   └── specs/       — spec-driven module contracts
├── turbo.json
└── pnpm-workspace.yaml
```

## Getting started

**Prerequisites:** Node.js 18+, pnpm 8+

```bash
pnpm install
pnpm build
```

Run the CLI against a local repo:

```bash
pnpm --filter @workflow-archaeologist/cli run start -- ./path/to/repo
```

---

## Development

This project follows a **spec-driven** workflow — every module has a written
spec in `docs/specs/` before any implementation is written. Tests are written
against the spec, then the implementation is written to pass the tests.

```bash
spec → review → tests → implement → review → merge
```

### Running tests

```bash
# all packages
pnpm test

# core engine only
pnpm --filter @workflow-archaeologist/core run test
```

### Building

```bash
pnpm build
```

---

## Implementation status

| Module | Spec | Tests | Implementation |
| --- | --- | --- | --- |
| `gitExtractor` | ✅ | ✅ 10/10 | ✅ |
| `riskDetector` | ✅ | ✅ 15/15 | ✅ |
| `githubEnricher` | ✅ | ✅ 11/11 | ✅ |
| `analyzer` | ✅ | ✅ 14/14 | ✅ |
| `cache/db` | ✅ | ✅ 10/10 | ✅ |
| `cli reporter` | ⬜ | ⬜ | ⬜ |

**105 tests passing across 5 modules.**

---

## Roadmap

1. ~~**`githubEnricher`**~~ — ✅ done
2. ~~**`analyzer`**~~ — ✅ done
3. **`cache/db`** — SQLite-backed cache keyed by `sha:filePath` to avoid
   re-analysing commits across runs.
4. **Report renderer** — Markdown and PDF output via Puppeteer, structured
   around: executive summary → decision registry → risk flags → quick wins.
5. **GitHub App** — post analysis comments automatically on PRs that touch
   `.github/workflows/`.

---

## Specs

Module contracts live in `docs/specs/`. Each spec defines inputs, outputs,
behavioral rules, error cases, and acceptance criteria before any code is
written.

- [gitExtractor.spec.md](docs/specs/gitExtractor.spec.md)
- [riskDetector.spec.md](docs/specs/riskDetector.spec.md)
- [githubEnricher.spec.md](docs/specs/githubEnricher.spec.md)
- [analyzer.spec.md](docs/specs/analyzer.spec.md)

---

## Tech stack

| Concern | Library |
| --- | --- |
| Git traversal | `simple-git` |
| GitHub API | `@octokit/rest` |
| AI reasoning | `@anthropic-ai/sdk` |
| YAML parsing | `js-yaml` |
| Local cache | `sql.js` |
| PDF export | `puppeteer` |
| CLI framework | `commander` |
| Tests | `vitest` |
| Build | `turbo` + `tsc` |
