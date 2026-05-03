# cache-db.spec

Module: `cache/db`

## Purpose

Persist `Decision` objects to a local SQLite database keyed by `sha:filePath` so that re-running the tool on the same repository skips commits already analysed. Also caches raw GitHub API enrichment data to avoid redundant Octokit calls across runs.

---

## Inputs / Outputs

```ts
// Store a decision
setDecision(key: string, decision: Decision): void

// Retrieve a decision (null if not cached)
getDecision(key: string): Decision | null

// Store enrichment data (raw JSON)
setEnrichment(key: string, data: unknown): void

// Retrieve enrichment data (null if not cached)
getEnrichment(key: string): unknown | null

// Delete all rows from both tables
clearAll(): void

// Return total number of cached decisions
countDecisions(): number

// Close the database connection
close(): void
```

## Cache key convention

- Decisions: `sha:filePath` — e.g. `a1b2c3d4::.github/workflows/ci.yml`
- Enrichment: `sha` — the full commit SHA

---

## Behavioral rules

- `setDecision` serialises the `Decision` object to JSON before storing.
- `getDecision` deserialises and returns a typed `Decision`, or `null` if the key does not exist.
- `setEnrichment` serialises any value to JSON before storing.
- `getEnrichment` deserialises and returns the value, or `null` if not found.
- `clearAll` truncates both the `decisions` and `enrichments` tables.
- `countDecisions` returns the integer row count of the `decisions` table.
- Calling `setDecision` twice with the same key overwrites the first value (upsert semantics).
- The database file path is configurable via the constructor. If no path is provided, defaults to `:memory:` (in-memory, useful for tests).
- `close` must be idempotent — calling it twice must not throw.

---

## Schema

```sql
CREATE TABLE IF NOT EXISTS decisions (
  key       TEXT PRIMARY KEY,
  value     TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrichments (
  key       TEXT PRIMARY KEY,
  value     TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
```

---

## Errors & edge cases

- If the database file path directory does not exist → throw
  `AnalysisError('CACHE_INIT_ERROR', { cause })`.
- If JSON deserialisation fails on a stored value → return `null` and silently log a warning rather than throwing.
- All methods except the constructor are synchronous.

---

## Implementation notes

- Use `sql.js` — already installed, pure JS, no native build required.
- Initialise the schema in the constructor with `CREATE TABLE IF NOT EXISTS`.
- Use `INSERT OR REPLACE` for upsert semantics on both tables.
- Export a `createCache(dbPath?: string): Cache` factory function as the public API rather than exposing the class directly.

---

## Acceptance criteria (tests)

1. `getDecision` returns `null` for a key that has never been set.
2. `setDecision` then `getDecision` with the same key returns the original `Decision` object (deep equal).
3. `setDecision` called twice with the same key overwrites — `getDecision` returns the second value.
4. `getEnrichment` returns `null` for a key that has never been set.
5. `setEnrichment` then `getEnrichment` returns the original value (deep equal).
6. `clearAll` removes all decisions — `countDecisions` returns 0 after clear.
7. `clearAll` removes all enrichments — `getEnrichment` returns null after clear.
8. `countDecisions` returns the correct count after multiple inserts.
9. `close` can be called twice without throwing.
10. Two separate cache instances with the same in-memory path do not share state (each `:memory:` instance is independent).
