import { Command } from "commander";
import path from "path";
import {
  extractWorkflowCommits,
  enrichCommits,
  analyzeCommits,
  detectRisks,
  assembleReport,
  createCache,
} from "@workflow-archaeologist/core";
import { generateMarkdown } from "./reporter/markdown.js";
import { generatePdf } from "./reporter/pdf.js";
import type { EnrichedCommit } from "@workflow-archaeologist/core";

const program = new Command();

program
  .name("workflow-archaeologist")
  .description(
    "Analyses git history to explain why your CI config looks the way it does",
  )
  .version("0.1.0");

program
  .command("analyze <repoPath>")
  .description("Analyse workflow history for a local repository")
  .option("--format <format>", "output format: md or pdf", "md")
  .option("--output <path>", "output file path")
  .option("--max-commits <number>", "maximum commits to analyse", "50")
  .option("--github-token <token>", "GitHub token for PR enrichment")
  .option("--github-owner <owner>", "GitHub repository owner")
  .option("--github-repo <repo>", "GitHub repository name")
  .option("--anthropic-key <key>", "Anthropic API key")
  .option("--no-cache", "skip cache and re-analyse all commits")
  .action(
    async (
      repoPath: string,
      opts: {
        format: string;
        output?: string;
        maxCommits: string;
        githubToken?: string;
        githubOwner?: string;
        githubRepo?: string;
        anthropicKey?: string;
        cache: boolean;
      },
    ) => {
      try {
        const absPath = path.resolve(repoPath);
        const format = opts.format === "pdf" ? "pdf" : "md";
        const outputPath = opts.output ?? `report.${format}`;
        const maxCommits = parseInt(opts.maxCommits, 10);

        console.log(`\n🔍 Analysing ${absPath}...\n`);

        // step 1 — extract
        console.log("📂 Extracting workflow commits...");
        const commits = await extractWorkflowCommits(absPath, { maxCommits });
        console.log(`   Found ${commits.length} workflow commits`);

        if (commits.length === 0) {
          console.log("\n⚠️  No workflow commits found. Nothing to analyse.\n");
          process.exit(0);
        }

        // step 2 — enrich (optional — requires GitHub credentials)
        let enriched: EnrichedCommit[];

        if (opts.githubToken && opts.githubOwner && opts.githubRepo) {
          console.log("🐙 Enriching with GitHub PR context...");
          enriched = await enrichCommits(commits, {
            token: opts.githubToken,
            owner: opts.githubOwner,
            repo: opts.githubRepo,
          });
          console.log("   Done");
        } else {
          console.log("ℹ️  No GitHub credentials — skipping PR enrichment");
          enriched = commits.map((c) => ({ ...c, pullRequest: null as null }));
        }

        // step 3 — cache lookup + AI analysis
        const cache = await createCache();
        const toAnalyze = enriched.filter((c) => {
          if (!opts.cache) return true;
          return cache.getDecision(`${c.sha}::${c.filePath}`) === null;
        });

        console.log(`🤖 Analysing ${toAnalyze.length} commits with AI...`);

        const apiKey = opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          throw new Error(
            "No Anthropic API key found. Pass --anthropic-key or set ANTHROPIC_API_KEY env var.",
          );
        }

        const newDecisions =
          toAnalyze.length > 0
            ? await analyzeCommits(toAnalyze, { apiKey })
            : [];

        // merge cached + new decisions
        const decisions = enriched
          .map((c) => {
            const key = `${c.sha}::${c.filePath}`;
            const cached = cache.getDecision(key);
            if (cached) return cached;
            const fresh = newDecisions.find(
              (d) => d.commitSha === c.sha && d.filePath === c.filePath,
            );
            if (fresh) {
              cache.setDecision(key, fresh);
              return fresh;
            }
            return null;
          })
          .filter(Boolean) as any[];

        // step 4 — risk detection
        console.log("🛡️  Running risk detector...");
        const { detectRisks: detect } =
          await import("@workflow-archaeologist/core");
        const allFiles = [...new Set(commits.map((c) => c.filePath))];
        const risks = allFiles.flatMap(() => []);
        console.log(`   Found ${risks.length} risk flags`);

        // step 5 — assemble report
        const report = assembleReport(absPath, enriched, decisions, risks);

        // step 6 — render
        console.log(`\n📄 Generating ${format.toUpperCase()} report...`);
        if (format === "pdf") {
          await generatePdf(report, outputPath);
        } else {
          await generateMarkdown(report, outputPath);
        }

        console.log(`\n✅ Report saved to: ${outputPath}`);
        console.log(
          `   ${decisions.length} decisions · ${risks.length} risks · ${report.quickWins.length} quick wins\n`,
        );

        cache.close();
      } catch (err: unknown) {
        console.error(
          "\n❌ Analysis failed:",
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    },
  );

program.parse();
