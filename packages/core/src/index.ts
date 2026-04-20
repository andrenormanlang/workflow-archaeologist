export * from "./types/index.js";
export * from "./extractor/gitExtractor.js";
export * from "./ai/analyzer.js";
export * from "./detector/riskDetector.test.js";
export * from "./cache/db.js";

export class AnalysisError extends Error {
  public code: "REPO_NOT_FOUND" | "GIT_ERROR" | "AI_EMPTY_RESPONSE";
  public cause?: unknown;

  constructor(
    code: "REPO_NOT_FOUND" | "GIT_ERROR" | "AI_EMPTY_RESPONSE",
    options?: { cause?: unknown },
  ) {
    super(code);
    this.code = code;
    this.cause = options?.cause;
    this.name = "AnalysisError";
  }
}
