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
  commitSha: string;
  filePath: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  recommendation: string | null;
  isPlaceholder: boolean;
};

export type RiskFlag = {
  type: 'UNPINNED_ACTION' | 'HARDCODED_SECRET' | 'MISSING_CACHE' | 'SUSPICIOUS_TIMEOUT' | 'INVALID_YAML';
  filePath: string;
  description: string;
  line?: number;
};

export type QuickWin = {
  type: 'decision' | 'risk';
  description: string;
  filePath: string;
  commitSha?: string;
};

export type Report = {
  repoPath: string;
  generatedAt: string;
  totalCommitsAnalysed: number;
  decisions: Decision[];
  risks: RiskFlag[];
  quickWins: QuickWin[];
};

export type { EnrichedCommit, PullRequestContext, LinkedIssue } from '../extractor/githubEnricher.js';
