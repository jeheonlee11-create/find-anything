import assert from "node:assert/strict";
import test from "node:test";
import {
  containsWord,
  countWords,
  firstWordPosition,
  MAX_QUERY_TERMS,
  queryTerms,
} from "../lib/workspace-search/matching.ts";
import { MATCHING_POLICY_VERSION, searchWorkspaceFiles } from "../lib/workspace-search/core.ts";

const DOC = "application/vnd.google-apps.document";

function file(id, name, text, extra = {}) {
  return {
    id,
    workspaceId: "ws_a",
    connectorId: "connector_a",
    sourceId: id,
    name,
    mimeType: DOC,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    webViewLink: null,
    indexStatus: "indexed",
    extractionError: null,
    extractionMode: "structured",
    structuralFallbackReason: null,
    units: [{ id: `unit_${id}`, unitType: "doc_paragraph", text, structuralLocation: { paragraphIndex: 0 }, contentHash: `hash_${id}` }],
    ...extra,
  };
}

function search(files, query, overrides = {}) {
  return searchWorkspaceFiles({ workspaceId: "ws_a", files, query, mode: "best", fileType: "all", ...overrides });
}

test("a term matches only whole words", () => {
  assert.equal(containsWord("the category list", "cat"), false);
  assert.equal(containsWord("concat these", "cat"), false);
  assert.equal(containsWord("a cat sat", "cat"), true);
  assert.equal(containsWord("cat.", "cat"), true);
  assert.equal(containsWord("(cat)", "cat"), true);
  assert.equal(containsWord("cat", "cat"), true);
  assert.equal(containsWord("cats", "cat"), false);
  assert.equal(containsWord("cat2", "cat"), false);
  assert.equal(containsWord("q3-plan draft", "q3-plan"), true);
  assert.equal(containsWord("xq3-plan", "q3-plan"), false);
});

test("matching is case-insensitive at the query and accent-sensitive in the text", () => {
  assert.deepEqual(queryTerms("CAT"), ["cat"]);
  assert.equal(containsWord("café", "cafe"), false);
  assert.equal(containsWord("cafe", "café"), false);
  assert.equal(containsWord("le café", "café"), true);
});

test("word boundaries work next to non-Latin text and astral characters", () => {
  assert.equal(containsWord("価格 plan", "plan"), true);
  assert.equal(containsWord("価格plan", "plan"), false);
  assert.equal(containsWord("😀plan", "plan"), true);
});

test("counts and positions use the same whole-word rule", () => {
  assert.equal(countWords("cat category cat concat cat.", "cat"), 3);
  assert.equal(firstWordPosition("category cat", ["cat"]), 9);
  assert.equal(firstWordPosition("nothing here", ["cat"]), -1);
});

test("query terms drop punctuation, stop words, and duplicates, and are capped", () => {
  assert.deepEqual(queryTerms("'Quoted' - plan, plan!"), ["quoted", "plan"]);
  assert.deepEqual(queryTerms("What is the launch date?"), ["launch", "date"]);
  assert.deepEqual(queryTerms("don't"), ["don't"]);
  assert.deepEqual(queryTerms("-- ''"), []);
  const many = Array.from({ length: 40 }, (_, index) => `term${index}`).join(" ");
  assert.equal(queryTerms(many).length, MAX_QUERY_TERMS);
});

test("search does not return substring-only matches", () => {
  const result = search([file("substring", "Notes", "The category list"), file("word", "Notes", "The cat sat")], "cat");
  assert.deepEqual(result.results.map((item) => item.id), ["word"]);
  assert.equal(result.matchingPolicyVersion, MATCHING_POLICY_VERSION);
});

test("the exact-phrase factor needs the phrase on word boundaries", () => {
  const [inside] = search([file("inside", "Notes", "alpha betamax")], "alpha beta").results;
  assert.equal(inside, undefined, "beta is not a whole word in betamax");
  const [phrase] = search([file("phrase", "Notes", "alpha beta, then more")], "alpha beta").results;
  assert.ok(phrase.explanation.includes("exact phrase in content"));
  const exactPhrase = phrase.ranking.factors.find((item) => item.key === "exact_phrase");
  assert.equal(exactPhrase.contribution, 45);
});

test("the returned score is the itemized ranking total and nothing else", () => {
  const files = [
    file("title", "Launch plan", "unrelated"),
    file("content", "Notes", "launch plan launch plan launch"),
    file("mime", "Other", "", { mimeType: "application/launch-plan" }),
  ];
  const result = search(files, "launch plan");
  assert.equal(result.results.length, 3);
  for (const item of result.results) {
    const total = item.ranking.factors.reduce((sum, factor) => sum + factor.contribution, 0);
    assert.equal(item.score, item.ranking.finalScore);
    assert.equal(item.score, total);
    assert.equal("scoreBreakdown" in item, false);
  }
  assert.equal(result.results[0].id, "title");
});

test("explanations describe why a file matched, including metadata-only matches", () => {
  const [mime] = search([file("mime", "Other", "", { mimeType: "application/needle" })], "needle").results;
  assert.ok(mime.explanation.includes("MIME-type match"));
  assert.equal(mime.explanation.includes("content match"), false);
});

test("search accepts a subset of units that contains every matching unit", () => {
  const full = file("f", "Notes", "");
  full.units = [
    { id: "u1", unitType: "doc_paragraph", text: "intro", structuralLocation: { paragraphIndex: 0 }, contentHash: "h1" },
    { id: "u2", unitType: "doc_paragraph", text: "the needle is here", structuralLocation: { paragraphIndex: 1 }, contentHash: "h2" },
    { id: "u3", unitType: "doc_paragraph", text: "outro", structuralLocation: { paragraphIndex: 2 }, contentHash: "h3" },
  ];
  const subset = { ...full, units: [full.units[1]] };
  const a = search([full], "needle").results[0], b = search([subset], "needle").results[0];
  assert.equal(a.score, b.score);
  assert.deepEqual(a.citations.map((c) => c.unitId), b.citations.map((c) => c.unitId));
  assert.equal(a.snippet, b.snippet);
});
