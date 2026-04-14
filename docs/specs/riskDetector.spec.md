# riskDetector.spec

Module: `riskDetector`

## Purpose
Statically analyse a GitHub Actions workflow YAML string and return a list
of risk flags without making any network or filesystem calls.

## Inputs
- `workflowYaml: string` — raw YAML content of a single workflow file
- `filePath: string` — relative path of the file (used in flag metadata)

## Outputs
`RiskFlag[]` — may be empty if no issues are found. Each `RiskFlag`:

```tstype RiskFlag = {
type: 'UNPINNED_ACTION' | 'HARDCODED_SECRET' | 'MISSING_CACHE' | 'SUSPICIOUS_TIMEOUT' | 'INVALID_YAML';
filePath: string;
description: string;
line?: number;
};
```

## Behavioral rules

### UNPINNED_ACTION

- Flag any `uses:` value where the version ref is `main`, `master`,
  `latest`, or is absent entirely.
- Pinned means: a full 40-char SHA (`@abcdef1234...`) or a semver tag
  (`@v3`, `@v3.1.2`). These are safe and must NOT be flagged.
- One flag per unpinned `uses:` occurrence.

### HARDCODED_SECRET

- Flag any scalar value (not inside `${{ secrets.* }}` or
  `${{ vars.* }}`) that matches known token patterns:
  - GitHub PAT: `ghp_[A-Za-z0-9]{36}`
  - AWS key ID: `AKIA[A-Z0-9]{16}`
  - Generic high-entropy string: 40+ char hex or base64 NOT used as a
    pinned action SHA (i.e. not in a `uses:` field)
- Do NOT flag `${{ secrets.MY_SECRET }}` — that is the correct pattern.

### MISSING_CACHE

- For each job, if any step runs `npm install`, `npm ci`, `pip install`,
  or `yarn install`, and no step in that job uses
  `actions/cache` or the built-in `cache:` input on a setup action
  (`actions/setup-node`, `actions/setup-python`), emit one flag per job.

### SUSPICIOUS_TIMEOUT

- Flag any `timeout-minutes` value greater than 60.
- Flag at the job level and at the step level.

## Errors & edge cases

- If `workflowYaml` is not valid YAML → return a single `RiskFlag` with
  `type: 'INVALID_YAML'` and include the parse error message in
  `description`. Do NOT throw.
- If `workflowYaml` is an empty string → return `[]`.
- Unknown top-level keys or non-standard workflow shapes should be
  skipped gracefully without throwing.

## Performance

- Must complete in under 50 ms for files up to 1 000 lines.
- No async operations — this is a pure synchronous function.

## Implementation notes

- Use `js-yaml` for parsing.
- After parsing, walk the job/step tree structurally rather than with
  regex on the raw string (except for HARDCODED_SECRET pattern matching).
- For line numbers, use `js-yaml`'s `loadAll` with the `listener`
  callback or the `LINE` mark on AST nodes to attach source positions.
  If line resolution is not practical, omit `line` rather than guess.

## Acceptance criteria (tests)

1. Empty string → returns `[]`.
2. Invalid YAML → returns one flag with `type: 'INVALID_YAML'`.
3. Workflow with all actions pinned to SHA → no `UNPINNED_ACTION` flags.
4. Workflow with `@main` ref → one `UNPINNED_ACTION` flag per occurrence.
5. Workflow with `@master` ref → flagged.
6. Workflow with semver tag (`@v3`, `@v3.1.2`) → NOT flagged.
7. Workflow containing a raw `ghp_` token → one `HARDCODED_SECRET` flag.
8. Workflow using `${{ secrets.TOKEN }}` → NOT flagged.
9. Job with `npm ci` and no cache step → one `MISSING_CACHE` flag.
10. Job with `npm ci` and `actions/cache` step → NOT flagged.
11. Job with `actions/setup-node` with `cache: npm` → NOT flagged.
12. `timeout-minutes: 120` at job level → one `SUSPICIOUS_TIMEOUT` flag.
13. `timeout-minutes: 30` → NOT flagged.
14. Multiple risk types in one file → all are returned.
15. Workflow with no jobs key → returns `[]` without throwing.
    