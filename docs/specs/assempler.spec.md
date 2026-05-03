# assembler.spec

Module: `reporter/assembler`

## Purpose

Combine the outputs of `analyzeCommits`, `detectRisks`, and `enrichCommits`
into a single `Report` object ready for rendering. Extract a prioritised
list of quick wins from decisions and risk flags so consumers get an
actionable summary without reading the full report.

---

## Inputs

```ts
assembleReport(
  repoPath: string,
  commits: EnrichedCommit[],
  decisions: Decision[],
  risks: RiskFlag[]
): Report
```

- `repoPath` — absolute path to the analysed repository
- `commits` — enriched commits from `githubEnricher`
- `decisions` — one per commit from `analyzer`
- `risks` — all risk flags from `riskDetector` across all workflow files

---

## Outputs

```ts
type Report = {
  repoPath: string;
  generatedAt: string;       // ISO 8601 UTC timestamp
  totalCommitsAnalysed: number;
  decisions: Decision[];
  risks: RiskFlag[];
  quickWins: QuickWin[];
};

type QuickWin = {
  type: 'decision' | 'risk';
  description: string;
  filePath: string;
  commitSha?: string;        // present when type is 'decision'
};
```

---

## Behavioral rules

### `generatedAt`

- Always set to `new Date().toISOString()` at the moment of assembly.

### `totalCommitsAnalysed`

- Equal to `commits.length`.

### `decisions`

- Passed through in the same order as received.
- Placeholder decisions (`isPlaceholder: true`) are included — not filtered out.

### `risks`

- Passed through in the same order as received.

### `quickWins` extraction rules

A quick win is extracted from a **decision** when ALL of the following:

- `confidence` is `'high'` or `'medium'`
- `recommendation` is a non-null, non-empty string
- `isPlaceholder` is `false`

A quick win is extracted from a **risk** when:

- `type` is `'SUSPICIOUS_TIMEOUT'` or `'MISSING_CACHE'` (these are actionable; `UNPINNED_ACTION` and `HARDCODED_SECRET` are higher severity and flagged separately)

Quick wins are ordered: decisions first, then risks. Maximum 10 quick wins total — truncate if more qualify.

---

## Errors & edge cases

- Empty `commits` → `totalCommitsAnalysed: 0`, `decisions: []`, valid Report.
- Empty `risks` → `risks: []`, valid Report.
- All decisions are placeholders → `quickWins` contains no decision entries.
- No qualifying risks → `quickWins` contains no risk entries.
- `repoPath` is not validated — passed through as-is.

---

## Implementation notes

- Pure synchronous function — no async, no I/O.
- `extractQuickWins` should be an exported helper so it can be tested
  independently and reused by other consumers.
- Keep under 60 lines — this is intentionally simple glue code.

---

## Acceptance criteria (tests)

1. Returns a `Report` with correct `repoPath` and `totalCommitsAnalysed`.
2. `generatedAt` is a valid ISO 8601 string.
3. `decisions` array is passed through unchanged.
4. `risks` array is passed through unchanged.
5. High-confidence decision with recommendation → included in `quickWins`.
6. Medium-confidence decision with recommendation → included in `quickWins`.
7. Low-confidence decision → NOT included in `quickWins`.
8. Placeholder decision → NOT included in `quickWins`.
9. Decision with `recommendation: null` → NOT included in `quickWins`.
10. `SUSPICIOUS_TIMEOUT` risk → included in `quickWins`.
11. `MISSING_CACHE` risk → included in `quickWins`.
12. `UNPINNED_ACTION` risk → NOT included in `quickWins`.
13. `HARDCODED_SECRET` risk → NOT included in `quickWins`.
14. Quick wins are ordered: decisions first, then risks.
15. Maximum 10 quick wins returned even when more qualify.
16. Empty commits and risks → valid Report with empty arrays and no quick wins.
