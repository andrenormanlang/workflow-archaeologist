# analyzer.spec

Module: `analyzer`

## Purpose

Orchestrate AI analysis of enriched workflow commits. For each commit, build
a structured prompt, call the Claude API, parse the response into a `Decision`
object, and handle errors and retries gracefully. This module is the reasoning
core of the engine — it explains *why* a CI configuration change was made.

---

## Inputs

- `commits: EnrichedCommit[]` — output from `githubEnricher`. Each commit
  contains the raw diff, commit message, author, date, and optional PR context
  (body, linked issues, review comments).
- `opts?: AnalyzeOptions`:
  - `model?: string` — Claude model to use (default: `claude-sonnet-4-20250514`)
  - `maxTokens?: number` — max tokens per response (default: `1000`)
  - `apiKey?: string` — Anthropic API key (falls back to `ANTHROPIC_API_KEY` env var)

---

## Outputs

`Decision[]` — one entry per input commit, preserving order.

```ts
type Decision = {
  commitSha: string;        // matches input commit SHA
  filePath: string;         // matches input commit filePath
  reason: string;           // non-empty plain-English explanation
  confidence: 'high' | 'medium' | 'low';
  recommendation: string | null;  // actionable suggestion, or null if none
  isPlaceholder: boolean;   // true if AI failed and a fallback was used
};
```

---

## AI response contract

The prompt instructs Claude to respond with **only** a JSON object — no
markdown fences, no preamble. The expected shape:

```json
{
  "reason": "string",
  "confidence": "high" | "medium" | "low",
  "recommendation": "string or null"
}
```

The `commitSha` and `filePath` are injected by the analyzer from the input
commit — they are not part of the AI response.

---

## Prompt design rules

- The prompt must include: commit SHA (short), commit message, file path,
  unified diff, and — if available — PR title, PR body, linked issue titles.
- Diff must be truncated to 3000 characters maximum before inclusion to avoid
  exceeding context limits.
- PR body must be truncated to 1000 characters maximum.
- Each linked issue body must be truncated to 500 characters maximum.
- The prompt must explicitly instruct Claude to respond only in JSON with no
  markdown or extra text.
- The prompt must specify the exact JSON schema Claude should follow.

---

## Behavioral rules

### Happy path

- Parse the raw Claude response string as JSON.
- Map `reason`, `confidence`, and `recommendation` from the parsed object.
- Set `isPlaceholder: false`.
- Set `commitSha` and `filePath` from the input commit.

### Malformed JSON (retry)

- If `JSON.parse` throws on the first attempt → strip markdown fences
  (` ```json `, ` ``` `) and retry parsing once.
- If parsing still fails after stripping → return a placeholder `Decision`:
  - `reason`: `"Analysis could not be completed for this commit."`
  - `confidence`: `"low"`
  - `recommendation`: `null`
  - `isPlaceholder`: `true`
- Do NOT throw — degrade gracefully.

### Empty response

- If the Claude API returns an empty `content` array or the first content
  block has an empty `text` field → throw `AnalysisError('AI_EMPTY_RESPONSE')`.

### Missing API key

- If `opts.apiKey` is not provided and `ANTHROPIC_API_KEY` env var is not set
  → throw `AnalysisError('AI_AUTH_ERROR')` before making any API calls.

### Invalid confidence value

- If Claude returns a `confidence` value outside `high | medium | low` →
  coerce it to `"low"` rather than failing.

### Batching

- Process commits sequentially with a 200ms delay between calls to avoid
  API rate limits. Do not use `Promise.all` for API calls.

---

## Errors & edge cases

- Empty `commits` array → return `[]` immediately, no API calls made.
- `AI_EMPTY_RESPONSE` → thrown, not caught — caller must handle.
- `AI_AUTH_ERROR` → thrown immediately before any API calls.
- Network errors from the Anthropic SDK → throw
  `AnalysisError('AI_API_ERROR', { cause })`.

---

## Performance

- Each commit results in exactly one API call (no parallelism).
- Prompt construction must complete in under 5ms per commit.
- Total analysis time is bounded by API latency × number of commits.

---

## Implementation notes

- Use `@anthropic-ai/sdk` — already in `core` dependencies.
- Instantiate `new Anthropic({ apiKey })` inside the function, not at module
  level, so the API key can be injected per-call in tests.
- Keep prompt templates in `src/ai/prompts.ts` as typed string-returning
  functions, not constants, so they can accept commit data as arguments.
- Strip markdown fences before JSON parsing using:
  `/^```(?:json)?\n?([\s\S]*?)\n?```$/m`

---

## Acceptance criteria (tests)

Tests must mock the Anthropic SDK — no live API calls.

1. Empty commits array → returns `[]`, no API calls made.
2. Missing API key (no env var, no opt) → throws `AnalysisError('AI_AUTH_ERROR')`.
3. Valid Claude response → returns `Decision` with correct `reason`,
   `confidence`, `recommendation`, `commitSha`, `filePath`, `isPlaceholder: false`.
4. Claude returns JSON wrapped in markdown fences → fences are stripped,
   JSON parsed successfully, returns valid `Decision`.
5. Claude returns malformed JSON (unfixable) → returns placeholder `Decision`
   with `confidence: 'low'` and `isPlaceholder: true`, does not throw.
6. Claude returns empty response → throws `AnalysisError('AI_EMPTY_RESPONSE')`.
7. Claude returns invalid `confidence` value → coerced to `'low'`.
8. Claude returns `recommendation: null` → `Decision.recommendation` is `null`.
9. Commit with PR context → PR title and body are included in the prompt.
10. Long diff → diff is truncated to 3000 characters in the prompt.
11. Multiple commits → returns one `Decision` per commit, in order.
12. Network error from SDK → throws `AnalysisError('AI_API_ERROR')`.

---

## Example output

```json
[
  {
    "commitSha": "a1b2c3d4e5f6...",
    "filePath": ".github/workflows/e2e.yml",
    "reason": "The timeout was increased from 30 to 45 minutes following a series of intermittent Selenium test failures logged in issue #312. The test suite was timing out on slower CI runners during peak hours.",
    "confidence": "high",
    "recommendation": "Monitor current failure rates. If the Selenium suite has been stable for 30+ days, consider reducing the timeout to 35 minutes.",
    "isPlaceholder": false
  }
]
```
