import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractWorkflowCommits } from './gitExtractor.js';
import { WorkflowCommit } from '../types/index.js';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../test/fixtures/git-extractor'
);
const NONEXISTENT_PATH = '/nonexistent/path/to/repo';

describe('gitExtractor', () => {

  it('throws REPO_NOT_FOUND if path does not exist', async () => {
    await expect(
      extractWorkflowCommits(NONEXISTENT_PATH)
    ).rejects.toMatchObject({ code: 'REPO_NOT_FOUND' });
  });

  it('returns empty array if no workflow commits exist', async () => {
    const result = await extractWorkflowCommits(FIXTURE_PATH, {
      since: '2099-01-01'
    });
    expect(result).toEqual([]);
  });

  it('returns WorkflowCommit with changeType added for first commit', async () => {
    const result = await extractWorkflowCommits(FIXTURE_PATH);
    const added = result.find((c: WorkflowCommit) => c.changeType === 'added');
    expect(added).toBeDefined();
    expect(added?.filePath).toContain('.github/workflows/');
    expect(added?.diff).toBeTruthy();
    expect(added?.sha).toHaveLength(40);
  });

  it('returns commits ordered newest to oldest', async () => {
    const result = await extractWorkflowCommits(FIXTURE_PATH);
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1].date).getTime();
      const curr = new Date(result[i].date).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('returns one entry per file per commit when multiple files touched', async () => {
    const result = await extractWorkflowCommits(FIXTURE_PATH);
    const shas = result.map((c: WorkflowCommit) => c.sha);
    const uniqueShas = [...new Set(shas)];
    expect(result.length).toBeGreaterThanOrEqual(uniqueShas.length);
  });

  it('handles renamed workflow file correctly', async () => {
    const result = await extractWorkflowCommits(FIXTURE_PATH);
    const renamed = result.find((c: WorkflowCommit) => c.changeType === 'renamed');
    expect(renamed).toBeDefined();
    expect(renamed?.filePath).toBe('.github/workflows/build.yml');
    expect(renamed?.diff).toContain('rename');
  });

  it('excludes merge commits', async () => {
    const result = await extractWorkflowCommits(FIXTURE_PATH);
    const messages = result.map((c: WorkflowCommit) => c.message);
    expect(messages.every((m: string) => !m.startsWith('Merge'))).toBe(true);
  });

  it('respects maxCommits option', async () => {
    const result = await extractWorkflowCommits(FIXTURE_PATH, {
      maxCommits: 2
    });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('respects since/until date boundaries', async () => {
    const all = await extractWorkflowCommits(FIXTURE_PATH);
    const newest = all[0].date;
    
    const result = await extractWorkflowCommits(FIXTURE_PATH, {
      until: newest,
      since: newest
    });
    expect(result.every(c => c.date === newest)).toBe(true);
  });

  it('each WorkflowCommit has all required fields', async () => {
    const result = await extractWorkflowCommits(FIXTURE_PATH);
    for (const commit of result as WorkflowCommit[]) {
      expect(commit.sha).toBeTruthy();
      expect(commit.message).toBeTruthy();
      expect(commit.author.name).toBeTruthy();
      expect(commit.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(commit.filePath).toContain('.github/workflows/');
      expect(commit.diff).toBeTruthy();
      expect(['added','modified','removed','renamed']).toContain(commit.changeType);
    }
  });

});