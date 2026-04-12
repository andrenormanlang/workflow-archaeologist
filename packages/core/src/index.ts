export type WorkflowCommit = {
  sha: string;
  message: string;
  author: string;
  date: string;
  filePath: string;
  diff: string;
};

export class AnalysisError extends Error {}

export async function extractWorkflowCommits(
  repoPath: string,
): Promise<WorkflowCommit[]> {
  // stub: implement git traversal using simple-git or nodegit
  if (!repoPath) throw new AnalysisError("REPO_NOT_FOUND");
  return [];
}

export async function analyzeCommits(commits: WorkflowCommit[]) {
  // stub: implement analyzer orchestration (AI + heuristics)
  return [];
}
