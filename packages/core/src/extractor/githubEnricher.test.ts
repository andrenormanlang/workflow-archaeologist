import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WorkflowCommit } from '../types/index.js';
import { AnalysisError } from '../index.js';
import { enrichCommits } from './githubEnricher.js';

vi.mock('@octokit/rest', () => {
  const mockListPRs = vi.fn();
  const mockListReviewComments = vi.fn();
  const mockGetIssue = vi.fn();

  return {
    Octokit: vi.fn().mockImplementation(() => ({
      repos: {
        listPullRequestsAssociatedWithCommit: mockListPRs,
      },
      pulls: {
        listReviewComments: mockListReviewComments,
      },
      issues: {
        get: mockGetIssue,
      },
    })),
    __mockListPRs: mockListPRs,
    __mockListReviewComments: mockListReviewComments,
    __mockGetIssue: mockGetIssue,
  };
});

const baseCommit: WorkflowCommit = {
  sha: 'a'.repeat(40),
  message: 'Increase timeout on CI workflow',
  author: { name: 'Jane Doe', email: 'jane@example.com' },
  date: '2023-03-15T12:34:56Z',
  filePath: '.github/workflows/ci.yml',
  changeType: 'modified',
  diff: '@@ -10,7 +10,7 @@\n-  timeout: 30\n+  timeout: 45\n',
};

const mockPR = {
  number: 42,
  title: 'Fix flaky Selenium timeout',
  body: 'Increased timeout because of flaky test.\n\ncloses #99',
  user: { login: 'janedoe' },
  merged_at: '2023-03-15T12:00:00Z',
};

const mockIssue = {
  number: 99,
  title: 'Selenium test flakes on CI',
  body: 'The test fails intermittently when the page load exceeds 30 seconds.',
};

describe('githubEnricher', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array without making API calls for empty input', async () => {
    const { Octokit } = await import('@octokit/rest');
    const result = await enrichCommits([], {
      owner: 'acme',
      repo: 'infra',
      token: 'ghp_test',
    });
    expect(result).toEqual([]);
    expect(Octokit).not.toHaveBeenCalled();
  });

  it('throws GITHUB_AUTH_ERROR when token is missing', async () => {
    await expect(
      enrichCommits([baseCommit], { owner: 'acme', repo: 'infra', token: '' })
    ).rejects.toMatchObject({ code: 'GITHUB_AUTH_ERROR' });
  });

  it('throws GITHUB_AUTH_ERROR when owner is missing', async () => {
    await expect(
      enrichCommits([baseCommit], { owner: '', repo: 'infra', token: 'ghp_test' })
    ).rejects.toMatchObject({ code: 'GITHUB_AUTH_ERROR' });
  });

  it('returns EnrichedCommit with PR data when PR is found', async () => {
    const { __mockListPRs, __mockListReviewComments, __mockGetIssue } =
      await import('@octokit/rest') as any;

    __mockListPRs.mockResolvedValue({ data: [mockPR] });
    __mockListReviewComments.mockResolvedValue({ data: [] });
    __mockGetIssue.mockResolvedValue({ data: mockIssue });

    const result = await enrichCommits([baseCommit], {
      owner: 'acme',
      repo: 'infra',
      token: 'ghp_test',
    });

    expect(result).toHaveLength(1);
    expect(result[0].pullRequest).not.toBeNull();
    expect(result[0].pullRequest?.number).toBe(42);
    expect(result[0].pullRequest?.title).toBe('Fix flaky Selenium timeout');
    expect(result[0].pullRequest?.body).toContain('flaky test');
  });

  it('sets pullRequest to null when no PR is found', async () => {
    const { __mockListPRs } = await import('@octokit/rest') as any;
    __mockListPRs.mockResolvedValue({ data: [] });

    const result = await enrichCommits([baseCommit], {
      owner: 'acme',
      repo: 'infra',
      token: 'ghp_test',
    });

    expect(result[0].pullRequest).toBeNull();
  });

  it('parses linked issues from PR body', async () => {
    const { __mockListPRs, __mockListReviewComments, __mockGetIssue } =
      await import('@octokit/rest') as any;

    __mockListPRs.mockResolvedValue({ data: [mockPR] });
    __mockListReviewComments.mockResolvedValue({ data: [] });
    __mockGetIssue.mockResolvedValue({ data: mockIssue });

    const result = await enrichCommits([baseCommit], {
      owner: 'acme',
      repo: 'infra',
      token: 'ghp_test',
    });

    expect(result[0].pullRequest?.linkedIssues).toHaveLength(1);
    expect(result[0].pullRequest?.linkedIssues[0].number).toBe(99);
    expect(result[0].pullRequest?.linkedIssues[0].title).toBe(
      'Selenium test flakes on CI'
    );
  });

  it('returns empty linkedIssues when PR body has no issue references', async () => {
    const { __mockListPRs, __mockListReviewComments } =
      await import('@octokit/rest') as any;

    __mockListPRs.mockResolvedValue({
      data: [{ ...mockPR, body: 'No issue references here.' }],
    });
    __mockListReviewComments.mockResolvedValue({ data: [] });

    const result = await enrichCommits([baseCommit], {
      owner: 'acme',
      repo: 'infra',
      token: 'ghp_test',
    });

    expect(result[0].pullRequest?.linkedIssues).toEqual([]);
  });

  it('skips issue silently when issue fetch returns 404', async () => {
    const { __mockListPRs, __mockListReviewComments, __mockGetIssue } =
      await import('@octokit/rest') as any;

    __mockListPRs.mockResolvedValue({ data: [mockPR] });
    __mockListReviewComments.mockResolvedValue({ data: [] });
    __mockGetIssue.mockRejectedValue(
      Object.assign(new Error('Not Found'), { status: 404 })
    );

    const result = await enrichCommits([baseCommit], {
      owner: 'acme',
      repo: 'infra',
      token: 'ghp_test',
    });

    expect(result[0].pullRequest?.linkedIssues).toEqual([]);
  });

  it('throws GITHUB_RATE_LIMITED on 429 response', async () => {
    const { __mockListPRs } = await import('@octokit/rest') as any;
    __mockListPRs.mockRejectedValue(
      Object.assign(new Error('rate limit exceeded'), { status: 429 })
    );

    await expect(
      enrichCommits([baseCommit], {
        owner: 'acme',
        repo: 'infra',
        token: 'ghp_test',
      })
    ).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMITED' });
  });

  it('preserves all original WorkflowCommit fields on EnrichedCommit', async () => {
    const { __mockListPRs } = await import('@octokit/rest') as any;
    __mockListPRs.mockResolvedValue({ data: [] });

    const result = await enrichCommits([baseCommit], {
      owner: 'acme',
      repo: 'infra',
      token: 'ghp_test',
    });

    expect(result[0].sha).toBe(baseCommit.sha);
    expect(result[0].message).toBe(baseCommit.message);
    expect(result[0].author).toEqual(baseCommit.author);
    expect(result[0].date).toBe(baseCommit.date);
    expect(result[0].filePath).toBe(baseCommit.filePath);
    expect(result[0].changeType).toBe(baseCommit.changeType);
    expect(result[0].diff).toBe(baseCommit.diff);
  });

  it('caps review comments at 20', async () => {
    const { __mockListPRs, __mockListReviewComments, __mockGetIssue } =
      await import('@octokit/rest') as any;

    __mockListPRs.mockResolvedValue({
      data: [{ ...mockPR, body: 'no issues' }],
    });
    __mockListReviewComments.mockResolvedValue({
      data: Array.from({ length: 25 }, (_, i) => ({
        body: `comment ${i}`,
        id: i,
      })),
    });
    __mockGetIssue.mockResolvedValue({ data: mockIssue });

    const result = await enrichCommits([baseCommit], {
      owner: 'acme',
      repo: 'infra',
      token: 'ghp_test',
    });

    expect(result[0].pullRequest?.reviewComments.length).toBeLessThanOrEqual(20);
  });

});