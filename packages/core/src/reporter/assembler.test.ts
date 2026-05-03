import { describe, it, expect } from 'vitest';
import { assembleReport, extractQuickWins } from './assembler.js';
import type { Decision, RiskFlag, QuickWin } from '../types/index.js';
import type { EnrichedCommit } from '../extractor/githubEnricher.js';

const baseCommit: EnrichedCommit = {
  sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  message: 'Increase timeout',
  author: { name: 'Jane Doe', email: 'jane@example.com' },
  date: '2023-03-15T12:34:56Z',
  filePath: '.github/workflows/ci.yml',
  changeType: 'modified',
  diff: '@@ -10,7 +10,7 @@\n-  timeout: 30\n+  timeout: 45\n',
  pullRequest: null,
};

const highDecision: Decision = {
  commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  filePath: '.github/workflows/ci.yml',
  reason: 'Timeout increased due to flaky Selenium tests.',
  confidence: 'high',
  recommendation: 'Reduce timeout to 35 minutes once tests stabilise.',
  isPlaceholder: false,
};

const mediumDecision: Decision = {
  ...highDecision,
  commitSha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
  confidence: 'medium',
  recommendation: 'Consider adding a retry step instead.',
};

const lowDecision: Decision = {
  ...highDecision,
  commitSha: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  confidence: 'low',
  recommendation: 'Review this change manually.',
};

const placeholderDecision: Decision = {
  ...highDecision,
  commitSha: 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
  isPlaceholder: true,
  recommendation: 'Some recommendation.',
};

const nullRecommendationDecision: Decision = {
  ...highDecision,
  commitSha: 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
  recommendation: null,
};

const timeoutRisk: RiskFlag = {
  type: 'SUSPICIOUS_TIMEOUT',
  filePath: '.github/workflows/ci.yml',
  description: 'Job "build" has timeout-minutes: 120',
};

const missingCacheRisk: RiskFlag = {
  type: 'MISSING_CACHE',
  filePath: '.github/workflows/ci.yml',
  description: 'Job "build" runs npm ci without a cache step.',
};

const unpinnedRisk: RiskFlag = {
  type: 'UNPINNED_ACTION',
  filePath: '.github/workflows/ci.yml',
  description: 'Action "actions/checkout@main" is unpinned.',
};

const secretRisk: RiskFlag = {
  type: 'HARDCODED_SECRET',
  filePath: '.github/workflows/ci.yml',
  description: 'Possible hardcoded GitHub PAT detected.',
};

const REPO_PATH = '/home/user/projects/my-repo';

describe('assembler', () => {

  it('returns Report with correct repoPath and totalCommitsAnalysed', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [highDecision], []);
    expect(report.repoPath).toBe(REPO_PATH);
    expect(report.totalCommitsAnalysed).toBe(1);
  });

  it('generatedAt is a valid ISO 8601 string', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [highDecision], []);
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });

  it('decisions array is passed through unchanged', () => {
    const decisions = [highDecision, mediumDecision];
    const report = assembleReport(REPO_PATH, [baseCommit], decisions, []);
    expect(report.decisions).toEqual(decisions);
  });

  it('risks array is passed through unchanged', () => {
    const risks = [timeoutRisk, unpinnedRisk];
    const report = assembleReport(REPO_PATH, [baseCommit], [highDecision], risks);
    expect(report.risks).toEqual(risks);
  });

  it('high-confidence decision with recommendation is included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [highDecision], []);
    const win = report.quickWins.find(w => w.commitSha === highDecision.commitSha);
    expect(win).toBeDefined();
    expect(win?.type).toBe('decision');
  });

  it('medium-confidence decision with recommendation is included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [mediumDecision], []);
    const win = report.quickWins.find(w => w.commitSha === mediumDecision.commitSha);
    expect(win).toBeDefined();
  });

  it('low-confidence decision is NOT included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [lowDecision], []);
    const win = report.quickWins.find(w => w.commitSha === lowDecision.commitSha);
    expect(win).toBeUndefined();
  });

  it('placeholder decision is NOT included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [placeholderDecision], []);
    const win = report.quickWins.find(w => w.commitSha === placeholderDecision.commitSha);
    expect(win).toBeUndefined();
  });

  it('decision with null recommendation is NOT included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [nullRecommendationDecision], []);
    const win = report.quickWins.find(w => w.commitSha === nullRecommendationDecision.commitSha);
    expect(win).toBeUndefined();
  });

  it('SUSPICIOUS_TIMEOUT risk is included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [], [timeoutRisk]);
    const win = report.quickWins.find(w => w.type === 'risk' && w.description === timeoutRisk.description);
    expect(win).toBeDefined();
  });

  it('MISSING_CACHE risk is included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [], [missingCacheRisk]);
    const win = report.quickWins.find(w => w.type === 'risk' && w.description === missingCacheRisk.description);
    expect(win).toBeDefined();
  });

  it('UNPINNED_ACTION risk is NOT included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [], [unpinnedRisk]);
    const win = report.quickWins.find(w => w.description === unpinnedRisk.description);
    expect(win).toBeUndefined();
  });

  it('HARDCODED_SECRET risk is NOT included in quickWins', () => {
    const report = assembleReport(REPO_PATH, [baseCommit], [], [secretRisk]);
    const win = report.quickWins.find(w => w.description === secretRisk.description);
    expect(win).toBeUndefined();
  });

  it('quick wins are ordered — decisions first then risks', () => {
    const report = assembleReport(
      REPO_PATH,
      [baseCommit],
      [highDecision],
      [timeoutRisk]
    );
    const types = report.quickWins.map((w: QuickWin) => w.type);
    const decisionIdx = types.indexOf('decision');
    const riskIdx = types.indexOf('risk');
    expect(decisionIdx).toBeLessThan(riskIdx);
  });

  it('maximum 10 quick wins returned even when more qualify', () => {
    const manyDecisions: Decision[] = Array.from({ length: 15 }, (_, i) => ({
      ...highDecision,
      commitSha: `sha${i}`.padEnd(40, '0'),
    }));
    const report = assembleReport(REPO_PATH, [baseCommit], manyDecisions, []);
    expect(report.quickWins.length).toBeLessThanOrEqual(10);
  });

  it('empty commits and risks returns valid Report with empty arrays', () => {
    const report = assembleReport(REPO_PATH, [], [], []);
    expect(report.totalCommitsAnalysed).toBe(0);
    expect(report.decisions).toEqual([]);
    expect(report.risks).toEqual([]);
    expect(report.quickWins).toEqual([]);
  });

});