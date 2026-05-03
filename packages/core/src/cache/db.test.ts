import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCache } from "./db.js";
import type { Decision } from "../types/index.js";
import type { Cache } from "./db.js";

const sampleDecision: Decision = {
  commitSha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  filePath: ".github/workflows/ci.yml",
  reason: "Timeout increased due to flaky Selenium tests.",
  confidence: "high",
  recommendation: "Reduce timeout once tests stabilise.",
  isPlaceholder: false,
};

const sampleDecision2: Decision = {
  ...sampleDecision,
  reason: "Updated reason after further investigation.",
  confidence: "medium",
};

const sampleEnrichment = {
  pullRequest: {
    number: 42,
    title: "Fix flaky timeout",
    body: "Closes #99",
  },
};

describe("cache/db", () => {
  let cache: Cache;
  beforeEach(async () => {
    cache = await createCache();
  });

  afterEach(() => {
    cache.close();
  });

  it("getDecision returns null for unknown key", () => {
    expect(cache.getDecision("unknown:key")).toBeNull();
  });

  it("setDecision then getDecision returns original Decision", () => {
    const key = `${sampleDecision.commitSha}::${sampleDecision.filePath}`;
    cache.setDecision(key, sampleDecision);
    const result = cache.getDecision(key);
    expect(result).toEqual(sampleDecision);
  });

  it("setDecision twice with same key overwrites — returns second value", () => {
    const key = `${sampleDecision.commitSha}::${sampleDecision.filePath}`;
    cache.setDecision(key, sampleDecision);
    cache.setDecision(key, sampleDecision2);
    const result = cache.getDecision(key);
    expect(result).toEqual(sampleDecision2);
    expect(result?.reason).toBe(sampleDecision2.reason);
  });

  it("getEnrichment returns null for unknown key", () => {
    expect(cache.getEnrichment("unknown-sha")).toBeNull();
  });

  it("setEnrichment then getEnrichment returns original value", () => {
    cache.setEnrichment("sha123", sampleEnrichment);
    const result = cache.getEnrichment("sha123");
    expect(result).toEqual(sampleEnrichment);
  });

  it("clearAll removes all decisions — countDecisions returns 0", () => {
    cache.setDecision("key1", sampleDecision);
    cache.setDecision("key2", sampleDecision2);
    cache.clearAll();
    expect(cache.countDecisions()).toBe(0);
  });

  it("clearAll removes all enrichments — getEnrichment returns null", () => {
    cache.setEnrichment("sha123", sampleEnrichment);
    cache.clearAll();
    expect(cache.getEnrichment("sha123")).toBeNull();
  });

  it("countDecisions returns correct count after multiple inserts", () => {
    cache.setDecision("key1", sampleDecision);
    cache.setDecision("key2", sampleDecision2);
    cache.setDecision("key3", { ...sampleDecision, commitSha: "abc" });
    expect(cache.countDecisions()).toBe(3);
  });

  it("close can be called twice without throwing", () => {
    expect(() => {
      cache.close();
      cache.close();
    }).not.toThrow();
  });

  it("two separate in-memory instances do not share state", async () => {
    const cache2 = await createCache();
    cache.setDecision("key1", sampleDecision);
    expect(cache2.getDecision("key1")).toBeNull();
    cache2.close();
  });
});
