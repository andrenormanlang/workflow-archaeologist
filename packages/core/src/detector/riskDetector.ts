import yaml from 'js-yaml';
import { RiskFlag } from '../types/index.js';

type FlagType = RiskFlag['type'];

const UNPINNED_REFS = /^(main|master|latest|head)$/i;
const SEMVER_REF = /^v\d+(\.\d+)*$/;
const FULL_SHA_REF = /^[0-9a-f]{40}$/i;
const GITHUB_PAT = /ghp_[A-Za-z0-9]{36}/;
const AWS_KEY = /AKIA[A-Z0-9]{16}/;
const INSTALL_COMMANDS = /\b(npm ci|npm install|pip install|yarn install)\b/;
const CACHE_ACTIONS = /^actions\/cache/;
const SETUP_ACTIONS_WITH_CACHE = /^actions\/(setup-node|setup-python)/;
const SECRETS_PATTERN = /\$\{\{\s*secrets\./;
const VARS_PATTERN = /\$\{\{\s*vars\./;

function flag(
  type: FlagType,
  filePath: string,
  description: string,
  line?: number
): RiskFlag {
  return { type, filePath, description, ...(line !== undefined ? { line } : {}) };
}

function checkUnpinnedActions(steps: any[], filePath: string): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (!Array.isArray(steps)) return flags;

  for (const step of steps) {
    if (!step?.uses || typeof step.uses !== 'string') continue;
    const [, ref] = step.uses.split('@');
    if (!ref) {
      flags.push(flag('UNPINNED_ACTION', filePath,
        `Action "${step.uses}" has no version ref — pin to a SHA or semver tag`));
      continue;
    }
    if (FULL_SHA_REF.test(ref) || SEMVER_REF.test(ref)) continue;
    if (UNPINNED_REFS.test(ref)) {
      flags.push(flag('UNPINNED_ACTION', filePath,
        `Action "${step.uses}" is pinned to "@${ref}" — use a SHA or semver tag instead`));
    }
  }
  return flags;
}

function checkHardcodedSecrets(steps: any[], env: any, filePath: string): RiskFlag[] {
  const flags: RiskFlag[] = [];

  function scanValue(value: unknown): void {
    if (typeof value !== 'string') return;
    if (SECRETS_PATTERN.test(value) || VARS_PATTERN.test(value)) return;
    if (GITHUB_PAT.test(value)) {
      flags.push(flag('HARDCODED_SECRET', filePath,
        'Possible hardcoded GitHub PAT detected — use ${{ secrets.* }} instead'));
    }
    if (AWS_KEY.test(value)) {
      flags.push(flag('HARDCODED_SECRET', filePath,
        'Possible hardcoded AWS access key detected — use ${{ secrets.* }} instead'));
    }
  }

  function scanObject(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    for (const val of Object.values(obj as Record<string, unknown>)) {
      if (typeof val === 'string') scanValue(val);
      else if (typeof val === 'object') scanObject(val);
    }
  }

  scanObject(env);
  if (Array.isArray(steps)) {
    for (const step of steps) {
      scanObject(step?.env);
      if (typeof step?.run === 'string') scanValue(step.run);
    }
  }
  return flags;
}

function checkMissingCache(jobName: string, steps: any[], filePath: string): RiskFlag[] {
  if (!Array.isArray(steps)) return [];

  const needsCache = steps.some(
    s => typeof s?.run === 'string' && INSTALL_COMMANDS.test(s.run)
  );
  if (!needsCache) return [];

  const hasCache = steps.some(s => {
    if (!s?.uses || typeof s.uses !== 'string') return false;
    if (CACHE_ACTIONS.test(s.uses)) return true;
    if (SETUP_ACTIONS_WITH_CACHE.test(s.uses)) {
      const cacheInput = s?.with?.cache;
      return typeof cacheInput === 'string' && cacheInput.length > 0;
    }
    return false;
  });

  if (hasCache) return [];

  return [flag('MISSING_CACHE', filePath,
    `Job "${jobName}" runs a package install but has no cache step — add actions/cache or use the built-in cache input`)];
}

function checkTimeouts(jobName: string, job: any, steps: any[], filePath: string): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (typeof job?.['timeout-minutes'] === 'number' && job['timeout-minutes'] > 60) {
    flags.push(flag('SUSPICIOUS_TIMEOUT', filePath,
      `Job "${jobName}" has timeout-minutes: ${job['timeout-minutes']} — values over 60 may indicate a flaky or slow step`));
  }

  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (typeof step?.['timeout-minutes'] === 'number' && step['timeout-minutes'] > 60) {
        const name = step.name ?? step.run ?? 'unnamed step';
        flags.push(flag('SUSPICIOUS_TIMEOUT', filePath,
          `Step "${name}" in job "${jobName}" has timeout-minutes: ${step['timeout-minutes']}`));
      }
    }
  }
  return flags;
}

export function detectRisks(workflowYaml: string, filePath: string): RiskFlag[] {
  if (!workflowYaml.trim()) return [];

  let parsed: any;
  try {
    parsed = yaml.load(workflowYaml);
  } catch (err: any) {
    return [flag('INVALID_YAML', filePath,
      `Failed to parse YAML: ${err?.message ?? String(err)}`)];
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.jobs) return [];

  const flags: RiskFlag[] = [];
  const jobs = parsed.jobs as Record<string, any>;

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;
    const steps: any[] = Array.isArray(job.steps) ? job.steps : [];
    const jobEnv = job.env ?? {};

    flags.push(...checkUnpinnedActions(steps, filePath));
    flags.push(...checkHardcodedSecrets(steps, jobEnv, filePath));
    flags.push(...checkMissingCache(jobName, steps, filePath));
    flags.push(...checkTimeouts(jobName, job, steps, filePath));
  }

  // also scan top-level env block
  if (parsed.env && typeof parsed.env === 'object') {
    flags.push(...checkHardcodedSecrets([], parsed.env, filePath));
  }

  return flags;
}