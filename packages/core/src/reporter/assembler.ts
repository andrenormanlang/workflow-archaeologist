import type { Decision, RiskFlag, Report, QuickWin } from '../types/index.js';
import type { EnrichedCommit } from '../extractor/githubEnricher.js';

const MAX_QUICK_WINS = 10;
const ACTIONABLE_RISKS = new Set<RiskFlag['type']>(['SUSPICIOUS_TIMEOUT', 'MISSING_CACHE']);

export function extractQuickWins(
  decisions: Decision[],
  risks: RiskFlag[]
): QuickWin[] {
  const wins: QuickWin[] = [];

  // decisions first
  for (const d of decisions) {
    if (wins.length >= MAX_QUICK_WINS) break;
    if (d.isPlaceholder) continue;
    if (d.confidence === 'low') continue;
    if (!d.recommendation || !d.recommendation.trim()) continue;

    wins.push({
      type: 'decision',
      description: d.recommendation,
      filePath: d.filePath,
      commitSha: d.commitSha,
    });
  }

  // risks second
  for (const r of risks) {
    if (wins.length >= MAX_QUICK_WINS) break;
    if (!ACTIONABLE_RISKS.has(r.type)) continue;

    wins.push({
      type: 'risk',
      description: r.description,
      filePath: r.filePath,
    });
  }

  return wins;
}

export function assembleReport(
  repoPath: string,
  commits: EnrichedCommit[],
  decisions: Decision[],
  risks: RiskFlag[]
): Report {
  return {
    repoPath,
    generatedAt: new Date().toISOString(),
    totalCommitsAnalysed: commits.length,
    decisions,
    risks,
    quickWins: extractQuickWins(decisions, risks),
  };
}