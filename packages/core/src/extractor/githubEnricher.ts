import { Octokit } from '@octokit/rest';
import pLimit from 'p-limit';
import { WorkflowCommit } from '../types/index.js';
import { AnalysisError } from '../index.js';

export interface EnrichOptions {
  owner: string;
  repo: string;
  token: string;
}

export type LinkedIssue = {
  number: number;
  title: string;
  body: string | null;
};

export type PullRequestContext = {
  number: number;
  title: string;
  body: string | null;
  author: string;
  reviewComments: string[];
  linkedIssues: LinkedIssue[];
};

export type EnrichedCommit = WorkflowCommit & {
  pullRequest: PullRequestContext | null;
};

const ISSUE_REF_PATTERN = /(?:closes|fixes|resolves)\s+#(\d+)/gi;
const MAX_REVIEW_COMMENTS = 20;
const BATCH_CONCURRENCY = 5;
const ISSUE_BODY_LIMIT = 500;

function parseIssueNumbers(body: string | null): number[] {
  if (!body) return [];
  const matches = [...body.matchAll(ISSUE_REF_PATTERN)];
  return matches.map(m => parseInt(m[1], 10));
}

function isRateLimitError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    ((err as any).status === 429 || (err as any).status === 403)
  );
}

async function fetchLinkedIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  body: string | null
): Promise<LinkedIssue[]> {
  const issueNumbers = parseIssueNumbers(body);
  if (!issueNumbers.length) return [];

  const issues: LinkedIssue[] = [];

  for (const number of issueNumbers) {
    try {
      const { data } = await octokit.issues.get({ owner, repo, issue_number: number });
      issues.push({
        number: data.number,
        title: data.title,
        body: data.body ? data.body.slice(0, ISSUE_BODY_LIMIT) : null,
      });
    } catch (err: unknown) {
      // silently skip deleted, private, or not-found issues
      if (
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as any).status === 404
      ) {
        continue;
      }
      // re-throw rate limit errors
      if (isRateLimitError(err)) throw err;
    }
  }

  return issues;
}

async function enrichCommit(
  octokit: Octokit,
  commit: WorkflowCommit,
  owner: string,
  repo: string
): Promise<EnrichedCommit> {
  try {
    const { data: prs } = await octokit.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: commit.sha,
    });

    if (!prs.length) {
      return { ...commit, pullRequest: null };
    }

    // use the most recently merged PR
    const pr = prs
      .filter(p => p.merged_at)
      .sort((a, b) =>
        new Date(b.merged_at!).getTime() - new Date(a.merged_at!).getTime()
      )[0] ?? prs[0];

    const { data: reviewCommentsRaw } = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pr.number,
    });

    const reviewComments = reviewCommentsRaw
      .slice(0, MAX_REVIEW_COMMENTS)
      .map(c => c.body);

    const linkedIssues = await fetchLinkedIssues(octokit, owner, repo, pr.body ?? null);

    return {
      ...commit,
      pullRequest: {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? null,
        author: pr.user?.login ?? 'unknown',
        reviewComments,
        linkedIssues,
      },
    };
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      throw new AnalysisError('GITHUB_RATE_LIMITED', { cause: err });
    }
    if (
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      (err as any).status === 404
    ) {
      return { ...commit, pullRequest: null };
    }
    if (err instanceof AnalysisError) throw err;
    throw new AnalysisError('GITHUB_API_ERROR', { cause: err });
  }
}

export async function enrichCommits(
  commits: WorkflowCommit[],
  opts: EnrichOptions
): Promise<EnrichedCommit[]> {
  if (!commits.length) return [];

  if (!opts.token || !opts.owner || !opts.repo) {
    throw new AnalysisError('GITHUB_AUTH_ERROR');
  }

  const octokit = new Octokit({ auth: opts.token });
  const limit = pLimit(BATCH_CONCURRENCY);

  const results = await Promise.all(
    commits.map(commit =>
      limit(() => enrichCommit(octokit, commit, opts.owner, opts.repo))
    )
  );

  return results;
}