import { simpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';
import { WorkflowCommit } from '../types/index.js';
import { AnalysisError } from '../index.js';

export interface ExtractOptions {
  maxCommits?: number;
  since?: string;
  until?: string;
}

const WORKFLOW_GLOB = '.github/workflows';
const MAX_COMMITS_DEFAULT = 500;

function isGitRepo(repoPath: string): boolean {
  try {
    return fs.existsSync(path.join(repoPath, '.git'));
  } catch {
    return false;
  }
}

function detectChangeType(status: string): WorkflowCommit['changeType'] {
  if (status.startsWith('A')) return 'added';
  if (status.startsWith('D')) return 'removed';
  if (status.startsWith('R')) return 'renamed';
  return 'modified';
}

export async function extractWorkflowCommits(
  repoPath: string,
  opts?: ExtractOptions
): Promise<WorkflowCommit[]> {
  if (!fs.existsSync(repoPath) || !isGitRepo(repoPath)) {
    throw new AnalysisError('REPO_NOT_FOUND');
  }

  const git = simpleGit(repoPath);
  const maxCommits = opts?.maxCommits ?? MAX_COMMITS_DEFAULT;
  const results: WorkflowCommit[] = [];

  try {
    // build log args
    const logArgs = [
      '--no-merges',
      '--name-status',
      '--pretty=format:COMMIT:%H|%s|%an|%ae|%aI',
      '--diff-filter=AMDRT',
      `--max-count=${maxCommits * 10}`, // over-fetch since we filter by path
      '--',
      `${WORKFLOW_GLOB}/*.yml`,
      `${WORKFLOW_GLOB}/*.yaml`,
    ];

    if (opts?.since) logArgs.splice(logArgs.indexOf('--'), 0, `--after=${opts.since}`);
    if (opts?.until) logArgs.splice(logArgs.indexOf('--'), 0, `--before=${opts.until}`);

    const raw = await git.raw(['log', ...logArgs]);

    if (!raw.trim()) return [];

    // parse the raw log output into commit blocks
    const blocks = raw.trim().split(/(?=COMMIT:)/);

    for (const block of blocks) {
      if (!block.trim()) continue;

      const lines = block.trim().split('\n');
      const headerLine = lines.find(l => l.startsWith('COMMIT:'));
      if (!headerLine) continue;

      const [sha, message, authorName, authorEmail, date] = headerLine
        .replace('COMMIT:', '')
        .split('|');

      // find file status lines (e.g. "M .github/workflows/ci.yml")
      const fileLines = lines.filter(
        l => !l.startsWith('COMMIT:') && l.trim() && /^[AMDRT]/i.test(l)
      );

      for (const fileLine of fileLines) {
        const parts = fileLine.trim().split(/\s+/);
        const status = parts[0];
        const isRename = status.startsWith('R');
        const filePath = isRename ? parts[2] : parts[1];

        if (!filePath) continue;
        if (!filePath.includes(WORKFLOW_GLOB)) continue;

        let diff = '';
        try {
          if (isRename) {
            const oldPath = parts[1];
            diff = await git.raw([
              'show',
              '--unified=3',
              '-M',
              sha,
              '--',
              oldPath,
              filePath,
            ]);
          } else {
            diff = await git.raw([
              'show',
              '--unified=3',
              sha,
              '--',
              filePath,
            ]);
          }
        } catch {
          diff = 'BINARY_FILE_SKIPPED';
        }

        results.push({
          sha: sha.trim(),
          message: message.trim(),
          author: {
            name: authorName.trim(),
            email: authorEmail.trim() || undefined,
          },
          date: date.trim(),
          filePath: filePath.trim(),
          changeType: detectChangeType(status),
          diff: diff.trim(),
        });

        if (results.length >= maxCommits) break;
      }

      if (results.length >= maxCommits) break;
    }
  } catch (err) {
    if (err instanceof AnalysisError) throw err;
    throw new AnalysisError('GIT_ERROR', { cause: err });
  }

  return results;
}