import { describe, it, expect } from 'vitest';
import { detectRisks } from './riskDetector.js';

const filePath = '.github/workflows/ci.yml';

const pinnedWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
      - uses: actions/setup-node@v3.6.0
        with:
          node-version: 18
      - run: npm ci
        timeout-minutes: 10
`;

const unpinnedMainWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
      - uses: actions/setup-node@master
      - run: npm test
`;

const secretWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      TOKEN: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;

const safeSecretWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      TOKEN: \${{ secrets.MY_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;

const missingCacheWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
`;

const withCacheActionWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v3
        with:
          path: ~/.npm
          key: \${{ runner.os }}-node
      - run: npm ci
      - run: npm test
`;

const withSetupNodeCacheWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: npm
      - run: npm ci
      - run: npm test
`;

const suspiciousTimeoutWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;

const safeTimeoutWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;

const mixedRisksWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@main
      - run: npm ci
      - run: npm test
`;

const noJobsWorkflow = `
name: CI
on: [push]
`;

describe('riskDetector', () => {

  it('returns empty array for empty string', () => {
    const result = detectRisks('', filePath);
    expect(result).toEqual([]);
  });

  it('returns INVALID_YAML flag for invalid YAML', () => {
    const result = detectRisks('{ invalid: yaml: [}', filePath);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('INVALID_YAML');
    expect(result[0].filePath).toBe(filePath);
    expect(result[0].description).toBeTruthy();
  });

  it('does not flag actions pinned to full SHA or semver tag', () => {
    const result = detectRisks(pinnedWorkflow, filePath);
    const unpinned = result.filter(r => r.type === 'UNPINNED_ACTION');
    expect(unpinned).toHaveLength(0);
  });

  it('flags actions pinned to @main', () => {
    const result = detectRisks(unpinnedMainWorkflow, filePath);
    const unpinned = result.filter(r => r.type === 'UNPINNED_ACTION');
    expect(unpinned.length).toBeGreaterThanOrEqual(1);
    expect(unpinned.some(f => f.description.includes('main'))).toBe(true);
  });

  it('flags actions pinned to @master', () => {
    const result = detectRisks(unpinnedMainWorkflow, filePath);
    const unpinned = result.filter(r => r.type === 'UNPINNED_ACTION');
    expect(unpinned.some(f => f.description.includes('master'))).toBe(true);
  });

  it('does not flag semver tags like @v3 or @v3.1.2', () => {
    const result = detectRisks(pinnedWorkflow, filePath);
    const unpinned = result.filter(r => r.type === 'UNPINNED_ACTION');
    expect(unpinned).toHaveLength(0);
  });

  it('flags raw GitHub PAT token in env', () => {
    const result = detectRisks(secretWorkflow, filePath);
    const secrets = result.filter(r => r.type === 'HARDCODED_SECRET');
    expect(secrets.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag ${{ secrets.* }} references', () => {
    const result = detectRisks(safeSecretWorkflow, filePath);
    const secrets = result.filter(r => r.type === 'HARDCODED_SECRET');
    expect(secrets).toHaveLength(0);
  });

  it('flags job with npm ci and no cache step', () => {
    const result = detectRisks(missingCacheWorkflow, filePath);
    const missing = result.filter(r => r.type === 'MISSING_CACHE');
    expect(missing).toHaveLength(1);
  });

  it('does not flag job with actions/cache step', () => {
    const result = detectRisks(withCacheActionWorkflow, filePath);
    const missing = result.filter(r => r.type === 'MISSING_CACHE');
    expect(missing).toHaveLength(0);
  });

  it('does not flag job with setup-node cache:npm', () => {
    const result = detectRisks(withSetupNodeCacheWorkflow, filePath);
    const missing = result.filter(r => r.type === 'MISSING_CACHE');
    expect(missing).toHaveLength(0);
  });

  it('flags timeout-minutes over 60 at job level', () => {
    const result = detectRisks(suspiciousTimeoutWorkflow, filePath);
    const timeouts = result.filter(r => r.type === 'SUSPICIOUS_TIMEOUT');
    expect(timeouts).toHaveLength(1);
  });

  it('does not flag timeout-minutes of 30', () => {
    const result = detectRisks(safeTimeoutWorkflow, filePath);
    const timeouts = result.filter(r => r.type === 'SUSPICIOUS_TIMEOUT');
    expect(timeouts).toHaveLength(0);
  });

  it('returns all risk types present in one file', () => {
    const result = detectRisks(mixedRisksWorkflow, filePath);
    const types = result.map(r => r.type);
    expect(types).toContain('UNPINNED_ACTION');
    expect(types).toContain('MISSING_CACHE');
    expect(types).toContain('SUSPICIOUS_TIMEOUT');
  });

  it('returns empty array when workflow has no jobs key', () => {
    const result = detectRisks(noJobsWorkflow, filePath);
    expect(result).toEqual([]);
  });

});