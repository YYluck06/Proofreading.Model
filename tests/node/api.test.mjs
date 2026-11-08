// HTTP-level tests for the Worker: routing, validation, CORS and error contracts.
//
// The handler is called directly with a mocked assets binding, so these tests need
// no miniflare, no network and no wrangler.

import assert from "node:assert/strict";
import test from "node:test";

import worker from "../../apps/worker/dist/index.js";

function makeEnv(overrides = {}) {
  return {
    ENVIRONMENT: "test",
    ALLOWED_ORIGINS: "",
    ASSETS: {
      async fetch(request) {
        return new Response(`asset:${new URL(request.url).pathname}`, { status: 200 });
      },
    },
    ...overrides,
  };
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

function call(path, init = {}, env = makeEnv()) {
  return worker.fetch(new Request(`https://screening.example${path}`, init), env, ctx);
}

test("GET /health reports service, version and config versions", async () => {
  const response = await call("/health");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.service, "proofreading-risk-worker");
  assert.match(body.version, /^\d+\.\d+\.\d+$/);
  assert.equal(body.questionnaire_version, body.engine_version);
});

test("GET /api/questionnaire returns the form definition and never any answers", async () => {
  const response = await call("/api/questionnaire");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /max-age=300/);
  const body = await response.json();
  assert.equal(body.sections.length, 7);
  assert.ok(body.roles.includes("default"));
  assert.ok(Array.isArray(body.thresholds.blue_max === undefined ? [] : [body.thresholds.blue_max]));
  assert.equal(body.answers, undefined);
  assert.equal(body.evaluation, undefined);
});

test("POST /api/evaluate returns a full evaluation record", async () => {
  const response = await call("/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers: { a2: "violent", a3_1: 5, a3_2: 4 } }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.eval_id, /^EV-\d{8}-[0-9a-f]{16}$/);
  assert.ok(body.alert.id);
  assert.equal(typeof body.scores.net_risk_score, "number");
  assert.equal(body.coverage.scoreable_items, 20);
});

test("the same answers produce the same evaluation id twice", async () => {
  const body = JSON.stringify({ answers: { a1: ["single_parent"], a3_1: 3 } });
  const request = () =>
    call("/api/evaluate", { method: "POST", headers: { "content-type": "application/json" }, body });
  const first = await (await request()).json();
  const second = await (await request()).json();
  assert.equal(first.eval_id, second.eval_id);
});

test("errors carry a machine-readable code", async () => {
  const cases = [
    [{ method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }, 415, "unsupported_media_type"],
    [{ method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }, 400, "invalid_json"],
    [
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: { a3_1: 99 } }) },
      422,
      "invalid_answers",
    ],
    [
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "default" }) },
      422,
      "invalid_answers",
    ],
    [
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: {}, padding: "x".repeat(70 * 1024) }),
      },
      413,
      "payload_too_large",
    ],
  ];

  for (const [init, status, code] of cases) {
    const response = await call("/api/evaluate", init);
    assert.equal(response.status, status, `expected ${status} for ${code}`);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, "string");
  }
});

test("routing: unknown API paths 404, wrong verbs 405, static assets fall through", async () => {
  assert.equal((await call("/api/unknown")).status, 404);
  assert.equal((await call("/health", { method: "POST" })).status, 405);
  assert.equal((await call("/api/evaluate", { method: "GET" })).status, 405);
  const asset = await call("/");
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "asset:/");
});

test("OPTIONS preflight returns 204", async () => {
  const response = await call("/api/evaluate", { method: "OPTIONS" });
  assert.equal(response.status, 204);
});

test("CORS grants only allowlisted origins", async () => {
  const allowed = makeEnv({ ALLOWED_ORIGINS: "https://one.example, https://two.example" });
  const granted = await call("/health", { headers: { origin: "https://two.example" } }, allowed);
  assert.equal(granted.headers.get("access-control-allow-origin"), "https://two.example");
  assert.equal(granted.headers.get("vary"), "origin");

  const denied = await call("/health", { headers: { origin: "https://evil.example" } }, allowed);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);

  const noAllowlist = await call("/health", { headers: { origin: "https://one.example" } });
  assert.equal(noAllowlist.headers.get("access-control-allow-origin"), null);
});
