import { Command } from 'commander';
import { extractWorkflowCommits } from '@workflow-archaeologist/core';

const program = new Command();

program
  .name('workflow-archaeologist')
  .description('Analyses git history to explain why your CI config looks the way it does')
  .version('0.1.0');

program
  .command('analyze <repoPath>')
  .description('Analyse workflow history for a local repository')
  .option('--max-commits <number>', 'maximum commits to analyse', '500')
  .option('--since <date>', 'only analyse commits after this date')
  .option('--until <date>', 'only analyse commits before this date')
  .action(async (repoPath: string, opts: { maxCommits: string; since?: string; until?: string }) => {
    try {
      console.log(`Analysing ${repoPath}...`);
      const commits = await extractWorkflowCommits(repoPath, {
        maxCommits: parseInt(opts.maxCommits, 10),
        since: opts.since,
        until: opts.until,
      });
      console.log(`Found ${commits.length} workflow commits`);
      console.log(JSON.stringify(commits, null, 2));
    } catch (err: unknown) {
      console.error('Analysis failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();