# analyzer.spec

Module: analyzer (AI orchestration)

Input: WorkflowCommit[] (from gitExtractor), optional enrichment (PR body, issue links)

Output: Decision[] where each Decision contains:

- reason: string (non-empty)
- confidence: "high" | "medium" | "low"
- recommendation: string | null
- commitSha: string

Rules:

- If AI returns malformed JSON → retry once, then return Decision with confidence: "low" and a terse placeholder reason.
- If AI returns empty response → throw AnalysisError("AI_EMPTY_RESPONSE").
