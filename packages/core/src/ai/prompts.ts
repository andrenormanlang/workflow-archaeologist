import type { EnrichedCommit } from '../extractor/githubEnricher.js';

const DIFF_LIMIT = 3000;
const PR_BODY_LIMIT = 1000;
const ISSUE_BODY_LIMIT = 500;

export function buildAnalysisPrompt(commit: EnrichedCommit): string {
  const shortSha = commit.sha.slice(0, 8);
  const diff = commit.diff.slice(0, DIFF_LIMIT);
  const diffTruncated = commit.diff.length > DIFF_LIMIT
    ? `${diff}\n... [diff truncated]`
    : diff;

  let prContext = '';
  if (commit.pullRequest) {
    const pr = commit.pullRequest;
    const body = pr.body ? pr.body.slice(0, PR_BODY_LIMIT) : 'No description.';
    const issues = pr.linkedIssues.map(i => {
      const issueBody = i.body ? i.body.slice(0, ISSUE_BODY_LIMIT) : '';
      return `  - Issue #${i.number}: ${i.title}\n    ${issueBody}`;
    }).join('\n');

    prContext = `
Pull Request #${pr.number}: ${pr.title}
PR Description: ${body}
${issues ? `Linked Issues:\n${issues}` : ''}`.trim();
  }

  return `You are an expert CI/CD engineer analysing a GitHub Actions workflow change.
Your task is to explain WHY this change was made based on the available context.

Commit: ${shortSha}
File: ${commit.filePath}
Message: ${commit.message}
Author: ${commit.author.name}
Date: ${commit.date}

Diff:
${diffTruncated}

${prContext ? `Context:\n${prContext}` : 'No pull request context available.'}

Respond ONLY with a JSON object — no markdown, no explanation, no preamble.
Use exactly this schema:
{
  "reason": "Plain English explanation of why this change was made (non-empty string)",
  "confidence": "high" | "medium" | "low",
  "recommendation": "Actionable suggestion for the team, or null if none"
}

Confidence guide:
- high: clear evidence from PR body, issue, or commit message
- medium: reasonable inference from the diff and context
- low: little context available, best guess only`;
}