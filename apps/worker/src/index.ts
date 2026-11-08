/**
 * HTTP surface for the screening engine.
 *
 * Routes
 *   GET  /health             liveness + version probe
 *   GET  /api/questionnaire  public questionnaire + method metadata
 *   POST /api/evaluate       score an answer map
 *   GET  /api/*              404 JSON (never HTML)
 *   *                        static assets from ./public
 *
 * Design notes
 *   - No wildcard CORS: set ALLOWED_ORIGINS to a comma-separated allowlist.
 *   - No stack traces, pickled objects or internal paths in error bodies.
 *   - Answers are hold only for the duration of the request; nothing is logged
 *     or persisted, so minors' case data cannot leak through this service.
 */

import { CONFIG } from "./generated/config.js";
import { ScoringError, evaluate } from "./engine.js";
import type { AnswerMap, Evaluation } from "./types.js";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ALLOWED_ORIGINS?: string;
  ENVIRONMENT?: string;
}

const SERVICE = "proofreading-risk-worker";
const VERSION = "2.0.0";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ANSWER_KEYS = 200;

const BASE_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...BASE_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function fail(code: string, message: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, extraHeaders);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const allowlist = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!allowlist.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

function publicQuestionnaire(): Record<string, unknown> {
  return {
    questionnaire_version: CONFIG.questionnaire_version,
    engine_version: CONFIG.engine_version,
    title: CONFIG.title,
    description: CONFIG.description,
    scale: CONFIG.scale,
    sections: CONFIG.sections,
    groups: CONFIG.groups,
    thresholds: CONFIG.thresholds,
    coverage_floor: CONFIG.coverage_floor,
    neutral_coefficient: CONFIG.neutral_coefficient,
    protection_cap: CONFIG.protection_cap,
    alerts: CONFIG.alerts,
    roles: [...new Set(Object.values(CONFIG.calibration.maps).flatMap((byRole) => Object.keys(byRole)))].sort(),
    default_role: CONFIG.calibration.default_role,
    disclaimer: CONFIG.disclaimer,
  };
}

function readAnswers(payload: unknown): { answers: AnswerMap; role?: string } {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ScoringError("request body must be a JSON object");
  }
  const record = payload as Record<string, unknown>;
  const answers = record.answers;
  if (answers === null || answers === undefined || typeof answers !== "object" || Array.isArray(answers)) {
    throw new ScoringError("'answers' must be an object keyed by item key");
  }
  const keys = Object.keys(answers as Record<string, unknown>);
  if (keys.length > MAX_ANSWER_KEYS) {
    throw new ScoringError(`'answers' has more than ${MAX_ANSWER_KEYS} entries`);
  }
  const role = record.role;
  if (role !== undefined && typeof role !== "string") {
    throw new ScoringError("'role' must be a string");
  }
  return { answers: answers as AnswerMap, role: role as string | undefined };
}

async function handleEvaluate(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return fail("unsupported_media_type", "Content-Type must be application/json", 415, cors);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return fail("payload_too_large", `Request body exceeds ${MAX_BODY_BYTES} bytes`, 413, cors);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return fail("payload_too_large", `Request body exceeds ${MAX_BODY_BYTES} bytes`, 413, cors);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return fail("invalid_json", "Request body is not valid JSON", 400, cors);
  }
  try {
    const { answers, role } = readAnswers(payload);
    const evaluation: Evaluation = await evaluate(CONFIG, answers, { role });
    return json(evaluation, 200, cors);
  } catch (error) {
    if (error instanceof ScoringError) {
      return fail("invalid_answers", error.message, 422, cors);
    }
    return fail("internal_error", "The evaluation could not be completed", 500, cors);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...BASE_HEADERS, ...cors } });
    }

    if (path === "/health") {
      if (request.method !== "GET") return fail("method_not_allowed", "Use GET", 405, cors);
      return json(
        {
          status: "ok",
          service: SERVICE,
          version: VERSION,
          environment: env.ENVIRONMENT ?? "development",
          questionnaire_version: CONFIG.questionnaire_version,
          engine_version: CONFIG.engine_version,
          utc: new Date().toISOString(),
        },
        200,
        cors,
      );
    }

    if (path === "/api/questionnaire") {
      if (request.method !== "GET") return fail("method_not_allowed", "Use GET", 405, cors);
      return json(publicQuestionnaire(), 200, { ...cors, "cache-control": "public, max-age=300" });
    }

    if (path === "/api/evaluate") {
      if (request.method !== "POST") return fail("method_not_allowed", "Use POST", 405, cors);
      return handleEvaluate(request, env);
    }

    if (path.startsWith("/api/")) {
      return fail("not_found", `No API route for ${path}`, 404, cors);
    }

    return env.ASSETS.fetch(request);
  },
};
