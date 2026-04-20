export type WorkflowCommit = {
  sha: string;
  message: string;
  author: { name: string; email?: string };
  changeType: 'added' | 'modified' | 'removed' | 'renamed';
  date: string;
  filePath: string;
  diff: string;
};

export type Decision = {
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  recommendation: string | null;
  commitSha: string;
};

export type RiskFlag = {
  type: string;
  filePath: string;
  description: string;
  line?: number;
};

export type Report = {
  repoPath: string;
  generatedAt: string;
  decisions: Decision[];
  risks: RiskFlag[];
  quickWins: string[];
};

export type { EnrichedCommit, PullRequestContext, LinkedIssue } from '../extractor/githubEnricher.js';
