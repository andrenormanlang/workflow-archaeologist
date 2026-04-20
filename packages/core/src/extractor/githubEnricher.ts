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

export async function enrichCommits(
  commits: WorkflowCommit[],
  opts: EnrichOptions
): Promise<EnrichedCommit[]> {
  return [];
}