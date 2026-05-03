import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeCommits } from './analyzer.js';
import { AnalysisError } from '../index.js';
import type { EnrichedCommit } from '../extractor/githubEnricher.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

const baseCommit: EnrichedCommit = {
  sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  message: 'Increase timeout on CI workflow',
  author: { name: 'Jane Doe', email: 'jane@example.com' },
  date: '2023-03-15T12:34:56Z',
  filePath: '.github/workflows/ci.yml',
  changeType: 'modified',
  diff: '@@ -10,7 +10,7 @@\n-  timeout-minutes: 30\n+  timeout-minutes: 45\n',
  pullRequest: null,
};

const commitWithPR: EnrichedCommit = {
  ...baseCommit,
  pullRequest: {
    number: 42,
    title: 'Fix flaky Selenium timeout',
    body: 'Increased timeout because Selenium tests were flaking on slow runners.',
    author: 'janedoe',
    reviewComments: ['LGTM', 'Good fix'],
    linkedIssues: [
      {
        number: 312,
        title: 'Selenium test flakes on CI',
        body: 'Tests fail intermittently when page load exceeds 30 seconds.',
      },
    ],
  },
};

const validAIResponse = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        reason: 'Timeout was increased due to flaky Selenium tests on slow runners.',
        confidence: 'high',
        recommendation: 'Consider reducing to 35 minutes if tests stabilise.',
      }),
    },
  ],
};

const fencedAIResponse = {
  content: [
    {
      type: 'text',
      text: '```json\n' + JSON.stringify({
        reason: 'Timeout was increased due to flaky Selenium tests.',
        confidence: 'medium',
        recommendation: null,
      }) + '\n```',
    },
  ],
};

const malformedAIResponse = {
  content: [{ type: 'text', text: 'This is not JSON at all { broken' }],
};

const emptyAIResponse = {
  content: [],
};

const emptyTextResponse = {
  content: [{ type: 'text', text: '' }],
};

const invalidConfidenceResponse = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        reason: 'Some reason.',
        confidence: 'very_high',
        recommendation: null,
      }),
    },
  ],
};

describe('analyzer', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('returns empty array for empty commits without making API calls', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const result = await analyzeCommits([], { apiKey: 'test-key' });
    expect(result).toEqual([]);
    expect(Anthropic).not.toHaveBeenCalled();
  });

  it('throws AI_AUTH_ERROR when no API key is provided and env var is not set', async () => {
    await expect(
      analyzeCommits([baseCommit], {})
    ).rejects.toMatchObject({ code: 'AI_AUTH_ERROR' });
  });

  it('uses ANTHROPIC_API_KEY env var when no apiKey opt is provided', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(validAIResponse);

    const result = await analyzeCommits([baseCommit], {});
    expect(result).toHaveLength(1);
  });

  it('returns Decision with correct fields for valid AI response', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(validAIResponse);

    const result = await analyzeCommits([baseCommit], { apiKey: 'test-key' });

    expect(result).toHaveLength(1);
    expect(result[0].commitSha).toBe(baseCommit.sha);
    expect(result[0].filePath).toBe(baseCommit.filePath);
    expect(result[0].reason).toBe('Timeout was increased due to flaky Selenium tests on slow runners.');
    expect(result[0].confidence).toBe('high');
    expect(result[0].recommendation).toBe('Consider reducing to 35 minutes if tests stabilise.');
    expect(result[0].isPlaceholder).toBe(false);
  });

  it('strips markdown fences and parses JSON successfully', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(fencedAIResponse);

    const result = await analyzeCommits([baseCommit], { apiKey: 'test-key' });

    expect(result[0].confidence).toBe('medium');
    expect(result[0].isPlaceholder).toBe(false);
  });

  it('returns placeholder Decision when JSON is malformed and unfixable', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(malformedAIResponse);

    const result = await analyzeCommits([baseCommit], { apiKey: 'test-key' });

    expect(result).toHaveLength(1);
    expect(result[0].isPlaceholder).toBe(true);
    expect(result[0].confidence).toBe('low');
    expect(result[0].reason).toBe('Analysis could not be completed for this commit.');
    expect(result[0].recommendation).toBeNull();
  });

  it('throws AI_EMPTY_RESPONSE when content array is empty', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(emptyAIResponse);

    await expect(
      analyzeCommits([baseCommit], { apiKey: 'test-key' })
    ).rejects.toMatchObject({ code: 'AI_EMPTY_RESPONSE' });
  });

  it('throws AI_EMPTY_RESPONSE when text content is empty string', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(emptyTextResponse);

    await expect(
      analyzeCommits([baseCommit], { apiKey: 'test-key' })
    ).rejects.toMatchObject({ code: 'AI_EMPTY_RESPONSE' });
  });

  it('coerces invalid confidence value to low', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(invalidConfidenceResponse);

    const result = await analyzeCommits([baseCommit], { apiKey: 'test-key' });

    expect(result[0].confidence).toBe('low');
    expect(result[0].isPlaceholder).toBe(false);
  });

  it('returns null recommendation when AI returns null', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          reason: 'No clear reason found.',
          confidence: 'low',
          recommendation: null,
        }),
      }],
    });

    const result = await analyzeCommits([baseCommit], { apiKey: 'test-key' });
    expect(result[0].recommendation).toBeNull();
  });

  it('includes PR context in prompt when pullRequest is present', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(validAIResponse);

    await analyzeCommits([commitWithPR], { apiKey: 'test-key' });

    const callArgs = __mockCreate.mock.calls[0][0];
    const promptText = JSON.stringify(callArgs);
    expect(promptText).toContain('Fix flaky Selenium timeout');
    expect(promptText).toContain('Selenium test flakes on CI');
  });

  it('truncates long diffs to 3000 characters in the prompt', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(validAIResponse);

    const longDiff = 'x'.repeat(5000);
    const commitWithLongDiff: EnrichedCommit = { ...baseCommit, diff: longDiff };

    await analyzeCommits([commitWithLongDiff], { apiKey: 'test-key' });

    const callArgs = __mockCreate.mock.calls[0][0];
    const promptText = JSON.stringify(callArgs);
    const diffInPrompt = 'x'.repeat(3000);
    expect(promptText).toContain(diffInPrompt);
    expect(promptText).not.toContain('x'.repeat(3001));
  });

  it('returns one Decision per commit in order for multiple commits', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockResolvedValue(validAIResponse);

    const commit2: EnrichedCommit = {
      ...baseCommit,
      sha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      message: 'Add deploy workflow',
    };

    const result = await analyzeCommits([baseCommit, commit2], { apiKey: 'test-key' });

    expect(result).toHaveLength(2);
    expect(result[0].commitSha).toBe(baseCommit.sha);
    expect(result[1].commitSha).toBe(commit2.sha);
    expect(__mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws AI_API_ERROR on network failure from SDK', async () => {
    const { __mockCreate } = await import('@anthropic-ai/sdk') as any;
    __mockCreate.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      analyzeCommits([baseCommit], { apiKey: 'test-key' })
    ).rejects.toMatchObject({ code: 'AI_API_ERROR' });
  });

});