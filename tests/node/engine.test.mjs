// Cross-language parity + behaviour tests for the TypeScript engine.
//
// The fixtures in tests/fixtures/parity_cases.json are generated from the Python
// engine. If this file passes, the Worker and the Streamlit dashboard agree on
// every band, every protection cap branch and every answer-normalisation shape.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { CONFIG } from "../../apps/worker/dist/generated/config.js";
import { evaluate, rankContributions, domainSummary, roundHalfUp, ScoringError } from "../../apps/worker/dist/engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, "..", "fixtures", "parity_cases.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));

function withoutTimestamp(evaluation) {
  const clone = JSON.parse(JSON.stringify(evaluation));
  delete clone.generated_at;
  return clone;
}

for (const testCase of fixtures.cases) {
  test(`parity: ${testCase.name}`, async () => {
    const evaluation = await evaluate(CONFIG, testCase.answers, {
      role: testCase.role,
      generatedAt: new Date(fixtures.generated_at),
    });
    assert.deepEqual(withoutTimestamp(evaluation), testCase.expected);
  });
}

test("parity: every fixture case produces a stable evaluation id", async () => {
  const seen = new Set();
  for (const testCase of fixtures.cases) {
    const evaluation = await evaluate(CONFIG, testCase.answers, {
      role: testCase.role,
      generatedAt: new Date(fixtures.generated_at),
    });
    assert.match(evaluation.eval_id, /^EV-\d{8}-[0-9a-f]{16}$/);
    assert.ok(!seen.has(evaluation.eval_id), `duplicate evaluation id for ${testCase.name}`);
    seen.add(evaluation.eval_id);
  }
});

test("answer order does not change the evaluation id", async () => {
  const answers = { a3_1: 3, a1: ["single_parent"], b2: { options: ["extreme_views"], scale: 4 } };
  const sameAnswers = { b2: { scale: 4, options: ["extreme_views"] }, a1: ["single_parent"], a3_1: 3 };
  const first = await evaluate(CONFIG, answers, { generatedAt: new Date(fixtures.generated_at) });
  const second = await evaluate(CONFIG, sameAnswers, { generatedAt: new Date(fixtures.generated_at) });
  assert.equal(first.eval_id, second.eval_id);
  assert.deepEqual(first.scores, second.scores);
});

test("empty answers are scored as insufficient, never as green", async () => {
  const evaluation = await evaluate(CONFIG, {});
  assert.equal(evaluation.alert.id, "insufficient");
  assert.equal(evaluation.coverage.answered_items, 0);
  assert.equal(evaluation.coverage.complete, false);
  assert.equal(evaluation.scores.net_risk_score, 0);
  assert.ok(evaluation.notes.length > 0);
});

test("hard flags cap effective protection at the configured ratio", async () => {
  const evaluation = await evaluate(CONFIG, {
    a1: ["guardian_engaged"],
    a2: "violent",
    a3_1: 0,
    a3_2: 0,
  });
  assert.ok(evaluation.hard_flags.length >= 1);
  assert.equal(evaluation.scores.protection_cap_factor, CONFIG.protection_cap.any_hard_flag);
  assert.ok(evaluation.scores.effective_protection <= evaluation.scores.total_risk * CONFIG.protection_cap.any_hard_flag);
});

test("unknown roles, items, options and out-of-range scales are rejected", async () => {
  await assert.rejects(() => evaluate(CONFIG, {}, { role: "not-a-role" }), ScoringError);
  await assert.rejects(() => evaluate(CONFIG, { zz_unknown: 1 }), ScoringError);
  await assert.rejects(() => evaluate(CONFIG, { a2: "does_not_exist" }), /unknown option/);
  await assert.rejects(() => evaluate(CONFIG, { a3_1: 9 }), /outside 0-5/);
  await assert.rejects(() => evaluate(CONFIG, { a3_1: 2.5 }), /whole number/);
  await assert.rejects(() => evaluate(CONFIG, { a2: ["traditional", "permissive"] }), /exactly one option/);
  await assert.rejects(() => evaluate(CONFIG, { a3_1: { options: [], scale: 1, extra: true } }), /unknown answer fields/);
});

test("a scale without an activating option contributes nothing and says so", async () => {
  const withScale = await evaluate(CONFIG, { b2: { scale: 5 } });
  const withoutScale = await evaluate(CONFIG, { b2: {} });
  assert.deepEqual(withScale.scores, withoutScale.scores);
  const item = withScale.items.find((entry) => entry.key === "b2");
  assert.ok(item.notes.some((note) => note.includes("scale ignored")));
});

test("an activating option turns the scale into scored units", async () => {
  const baseline = await evaluate(CONFIG, { b2: { options: ["extreme_views"] } });
  const withScale = await evaluate(CONFIG, { b2: { options: ["extreme_views"], scale: 5 } });
  const before = baseline.items.find((entry) => entry.key === "b2");
  const after = withScale.items.find((entry) => entry.key === "b2");
  assert.ok(after.risk > before.risk, "scale units must be added on top of the option risk");
  assert.equal(after.hard_flag, true, "scale at the hard threshold must raise a hard flag");
  assert.equal(before.hard_flag, false);
});

test("rounding is deterministic and half-up", () => {
  assert.equal(roundHalfUp(0.125), 0.13);
  assert.equal(roundHalfUp(-0.125), -0.13);
  assert.equal(roundHalfUp(2.5), 2.5);
  assert.equal(roundHalfUp(0), 0);
});

test("ranking and domain summaries cover every section", async () => {
  const evaluation = await evaluate(CONFIG, { a2: "violent", a3_1: 5, c1: { option: "delinquent_gang", scale: 5 } });
  const ranked = rankContributions(evaluation, 3);
  assert.equal(ranked.length, 3);
  assert.ok(ranked[0].net >= ranked[1].net && ranked[1].net >= ranked[2].net);

  const summary = domainSummary(evaluation);
  assert.equal(summary.length, CONFIG.sections.length);
  const totalRisk = summary.reduce((sum, entry) => sum + Math.round(entry.risk * 100), 0);
  assert.equal(totalRisk, Math.round(evaluation.scores.total_risk * 100));
});
