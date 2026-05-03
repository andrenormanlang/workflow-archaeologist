import Anthropic from '@anthropic-ai/sdk';
import type { EnrichedCommit } from '../extractor/githubEnricher.js';
import { AnalysisError } from '../index.js';
import type { Decision } from '../types/index.js';
import { buildAnalysisPrompt } from './prompts.js';


export interface AnalyzeOptions {
  model?: string;
  maxTokens?: number;
  apiKey?: string;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 1000;
const DELAY_MS = 200;
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const FENCE_PATTERN = /^```(?:json)?\n?([\s\S]*?)\n?```$/m;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripFences(text: string): string {
  const match = text.match(FENCE_PATTERN);
  return match ? match[1].trim() : text.trim();
}

function parseResponse(raw: string): {
  reason: string;
  confidence: Decision['confidence'];
  recommendation: string | null;
} | null {
  // first attempt — parse as-is
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    // second attempt — strip markdown fences
    try {
      const stripped = stripFences(raw);
      const parsed = JSON.parse(stripped);
      return parsed;
    } catch {
      return null;
    }
  }
}

function coerceConfidence(value: unknown): Decision['confidence'] {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}

function makePlaceholder(commit: EnrichedCommit): Decision {
  return {
    commitSha: commit.sha,
    filePath: commit.filePath,
    reason: 'Analysis could not be completed for this commit.',
    confidence: 'low',
    recommendation: null,
    isPlaceholder: true,
  };
}

async function analyzeOne(
  client: Anthropic,
  commit: EnrichedCommit,
  opts: AnalyzeOptions
): Promise<Decision> {
  const prompt = buildAnalysisPrompt(commit);

  let response;
  try {
    response = await client.messages.create({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (err: unknown) {
    if (err instanceof AnalysisError) throw err;
    throw new AnalysisError('AI_API_ERROR', { cause: err });
  }

  // check for empty response
  const firstBlock = response.content?.[0];
  if (
    !response.content?.length ||
    !firstBlock ||
    firstBlock.type !== 'text' ||
    !firstBlock.text.trim()
  ) {
    throw new AnalysisError('AI_EMPTY_RESPONSE');
  }

  const raw = firstBlock.text;
  const parsed = parseResponse(raw);

  if (!parsed) {
    return makePlaceholder(commit);
  }

  return {
    commitSha: commit.sha,
    filePath: commit.filePath,
    reason: typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason
      : 'Analysis could not be completed for this commit.',
    confidence: coerceConfidence(parsed.confidence),
    recommendation: typeof parsed.recommendation === 'string'
      ? parsed.recommendation
      : null,
    isPlaceholder: false,
  };
}

export async function analyzeCommits(
  commits: EnrichedCommit[],
  opts: AnalyzeOptions
): Promise<Decision[]> {
  if (!commits.length) return [];

  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnalysisError('AI_AUTH_ERROR');
  }

  const client = new Anthropic({ apiKey });
  const results: Decision[] = [];

  for (let i = 0; i < commits.length; i++) {
    if (i > 0) await sleep(DELAY_MS);
    const decision = await analyzeOne(client, commits[i], opts);
    results.push(decision);
  }

  return results;
}