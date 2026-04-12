#!/usr/bin/env node
import { Command } from "commander";
import {
  extractWorkflowCommits,
  analyzeCommits,
} from "@workflow-archaeologist/core";

const program = new Command();

program
  .name("workflow-archaeologist")
  .argument("<repoPath>")
  .action(async (repoPath: string) => {
    console.log("Analyzing", repoPath);
    const commits = await extractWorkflowCommits(repoPath);
    const result = await analyzeCommits(commits);
    console.log(JSON.stringify(result, null, 2));
  });

program.parse(process.argv);
