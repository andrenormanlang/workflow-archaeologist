export * from './types/index.js';
export * from './extractor/gitExtractor.js';
export * from './extractor/githubEnricher.js';
export * from './ai/analyzer.js';
export * from './ai/prompts.js';
export * from './detector/riskDetector.js';
export * from './reporter/assembler.js';
export { createCache } from './cache/db.js';
export type { Cache } from './cache/db.js';
export class AnalysisError extends Error {
  public code:
    | 'REPO_NOT_FOUND'
    | 'GIT_ERROR'
    | 'AI_EMPTY_RESPONSE'
    | 'AI_AUTH_ERROR'
    | 'AI_API_ERROR'
    | 'GITHUB_AUTH_ERROR'
    | 'GITHUB_RATE_LIMITED'
    | 'GITHUB_API_ERROR'
    | 'CACHE_INIT_ERROR';
  public cause?: unknown;

  constructor(
    code:
      | 'REPO_NOT_FOUND'
      | 'GIT_ERROR'
      | 'AI_EMPTY_RESPONSE'
      | 'AI_AUTH_ERROR'
      | 'AI_API_ERROR'
      | 'GITHUB_AUTH_ERROR'
      | 'GITHUB_RATE_LIMITED'
      | 'GITHUB_API_ERROR'
      | 'CACHE_INIT_ERROR',
    options?: { cause?: unknown }
  ) {
    super(code);
    this.code = code;
    this.cause = options?.cause;
    this.name = 'AnalysisError';
  }
}