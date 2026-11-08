/**
 * Deterministic scoring engine (TypeScript mirror of core/riskcore/engine.py).
 *
 * The two implementations are kept in lockstep by
 * tests/fixtures/parity_cases.json: the Python engine writes the expected
 * output, the Node test replays the same cases through this module. Any change
 * here must keep that test green.
 */

import type {
  AlertDef,
  AlertLevel,
  AnswerMap,
  AnswerValue,
  EngineConfig,
  Evaluation,
  ItemDef,
  ItemScoreOut,
  NormalizedAnswer,
  OptionDef,
  ScaleDef,
} from "./types.js";

export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringError";
  }
}

/** Round half away from zero, matching the Python helper bit for bit. */
export function roundHalfUp(value: number, digits = 2): number {
  const factor = Math.pow(10, digits);
  const scaled = value * factor;
  const rounded = Math.floor(Math.abs(scaled) + 0.5) / factor;
  return rounded === 0 ? 0 : Math.sign(value) * rounded;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function coerceScale(value: unknown, key: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") {
    throw new ScoringError(`'${key}': scale value must be an integer 0-5`);
  }
  let numeric: number;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^[+-]?\d+$/.test(trimmed)) {
      throw new ScoringError(`'${key}': scale value '${value}' is not an integer`);
    }
    numeric = Number.parseInt(trimmed, 10);
  } else if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new ScoringError(`'${key}': scale value must be a whole number`);
    }
    numeric = value;
  } else {
    throw new ScoringError(`'${key}': scale value must be an integer 0-5`);
  }
  if (numeric < 0 || numeric > 5) {
    throw new ScoringError(`'${key}': scale value ${numeric} is outside 0-5`);
  }
  return numeric;
}

function optionIndex(item: ItemDef): Map<string, OptionDef> {
  const index = new Map<string, OptionDef>();
  for (const option of item.options ?? []) index.set(option.id, option);
  return index;
}

function normalizeItemAnswer(item: ItemDef, raw: AnswerValue | undefined): NormalizedAnswer {
  if (raw === null || raw === undefined) return { options: [], scale: null };

  let optionsRaw: unknown = [];
  let scaleRaw: unknown = null;

  const record = asRecord(raw);
  if (record) {
    const allowed = new Set(["options", "option", "scale"]);
    const unknownFields = Object.keys(record)
      .filter((key) => !allowed.has(key))
      .sort();
    if (unknownFields.length) {
      throw new ScoringError(`'${item.key}': unknown answer fields ${JSON.stringify(unknownFields)}`);
    }
    optionsRaw = record.options ?? record.option ?? [];
    scaleRaw = record.scale ?? null;
  } else if (Array.isArray(raw)) {
    optionsRaw = raw;
  } else if (typeof raw === "boolean") {
    throw new ScoringError(`'${item.key}': boolean answers are not supported`);
  } else if (typeof raw === "number") {
    optionsRaw = [];
    scaleRaw = raw;
  } else if (typeof raw === "string") {
    optionsRaw = [raw];
  } else {
    throw new ScoringError(`'${item.key}': unsupported answer type ${typeof raw}`);
  }

  let optionIds: string[];
  if (typeof optionsRaw === "string") {
    optionIds = [optionsRaw];
  } else if (Array.isArray(optionsRaw)) {
    optionIds = optionsRaw.map((value) => {
      if (typeof value !== "string") throw new ScoringError(`'${item.key}': option ids must be strings`);
      return value;
    });
  } else {
    throw new ScoringError(`'${item.key}': 'options' must be a string or a list of strings`);
  }

  const index = optionIndex(item);
  const cleaned: string[] = [];
  for (const optionId of optionIds) {
    if (!index.has(optionId)) {
      throw new ScoringError(`'${item.key}': unknown option '${optionId}'`);
    }
    if (!cleaned.includes(optionId)) cleaned.push(optionId);
  }
  if (cleaned.length && index.size === 0) {
    throw new ScoringError(`'${item.key}': this item does not accept options`);
  }
  const isMulti = item.type === "multi" || item.type === "hybrid_multi";
  if (cleaned.length > 1 && !isMulti) {
    throw new ScoringError(`'${item.key}': exactly one option may be selected for a '${item.type}' item`);
  }

  let scaleValue: number | null = null;
  if (scaleRaw !== null && scaleRaw !== undefined) {
    if (!item.scale) {
      throw new ScoringError(`'${item.key}': this item has no scale`);
    }
    scaleValue = coerceScale(scaleRaw, item.key);
  }

  cleaned.sort();
  return { options: cleaned, scale: scaleValue };
}

/** Canonical form used for both scoring and the evaluation id digest. */
export function normalizeAnswers(
  config: EngineConfig,
  answers: AnswerMap | null | undefined,
): Map<string, NormalizedAnswer> {
  const items = new Map<string, ItemDef>();
  for (const section of config.sections) {
    for (const item of section.items) items.set(item.key, item);
  }
  const normalized = new Map<string, NormalizedAnswer>();
  if (!answers) return normalized;
  if (typeof answers !== "object" || Array.isArray(answers)) {
    throw new ScoringError("answers must be an object keyed by item key");
  }
  for (const [key, raw] of Object.entries(answers)) {
    const item = items.get(key);
    if (!item) {
      throw new ScoringError(`unknown item key '${key}'`);
    }
    normalized.set(key, normalizeItemAnswer(item, raw));
  }
  return normalized;
}

export function allItems(config: EngineConfig): ItemDef[] {
  const items: ItemDef[] = [];
  for (const section of config.sections) {
    for (const item of section.items) items.push(item);
  }
  return items;
}

function isDegenerate(values: Record<string, number>): boolean {
  const unique = new Set(Object.values(values).map((value) => roundHalfUp(value, 6)));
  return unique.size <= 1;
}

export function calibratedIntensity(
  config: EngineConfig,
  item: ItemDef,
  rawValue: number,
  role: string,
): { intensity: number; provenance: string } {
  const scaleMax = config.scale.max || 5;
  const linear = clamp01(rawValue / scaleMax);
  if (!item.scale) return { intensity: linear, provenance: "linear" };

  const byRole = config.calibration.maps[item.key];
  const values = byRole ? byRole[role] ?? byRole[config.calibration.default_role] : undefined;
  if (!values || isDegenerate(values)) {
    return { intensity: linear, provenance: "linear-fallback" };
  }
  const exact = values[String(rawValue)];
  if (exact !== undefined) {
    return { intensity: clamp01(exact), provenance: "calibration" };
  }
  const nearest = Object.entries(values)
    .map(([key, value]) => [Number(key), value] as const)
    .sort((a, b) => Math.abs(a[0] - rawValue) - Math.abs(b[0] - rawValue) || a[0] - b[0]);
  return { intensity: clamp01(nearest[0][1]), provenance: "calibration-nearest" };
}

interface ItemScore {
  key: string;
  title: string;
  section_id: string;
  section_title: string;
  selected_options: string[];
  selected_labels: string[];
  scale_value: number | null;
  raw_risk: number;
  raw_neutral: number;
  raw_protection: number;
  risk: number;
  neutral: number;
  protection: number;
  hard_flag: boolean;
  notes: string[];
}

/** Full-precision scoring; rounding happens on the way out, exactly like the Python engine. */
function scoreItem(config: EngineConfig, item: ItemDef, answer: NormalizedAnswer, role: string): ItemScore {
  const notes: string[] = [];
  const labels: string[] = [];
  let risk = 0;
  let neutral = 0;
  let protection = 0;
  let hardFlag = false;

  const index = optionIndex(item);
  if (answer.options.length) {
    for (const optionId of answer.options) {
      const option = index.get(optionId) as OptionDef;
      risk += option.risk;
      neutral += option.neutral;
      protection += option.protection;
      labels.push(option.label);
      if (option.hard_trigger) {
        hardFlag = true;
        notes.push(`hard flag: '${option.label}'`);
      }
    }
    if (item.max_risk !== undefined && item.max_risk !== null && risk > item.max_risk) {
      notes.push(`raw risk capped at ${item.max_risk} (was ${risk})`);
      risk = item.max_risk;
    }
  } else if (answer.scale !== null && item.type !== "scale") {
    notes.push("scale ignored: no activating option selected");
  }

  const scale: ScaleDef | null = item.scale ?? null;
  const scaleApplies =
    answer.scale !== null &&
    scale !== null &&
    (item.type === "scale" || answer.options.some((optionId) => index.get(optionId)?.activates_scale === true));

  if (scaleApplies && scale !== null && answer.scale !== null) {
    const { intensity, provenance } = calibratedIntensity(config, item, answer.scale, role);
    const units = intensity * (config.scale.max || 5);
    if (scale.map_to === "protection") {
      protection += units;
    } else {
      risk += units;
    }
    notes.push(`scale ${answer.scale}/${config.scale.max}: ${scale.map_to} ${units.toFixed(2)} (${provenance})`);
    if (scale.hard_threshold !== undefined && scale.hard_threshold !== null && answer.scale >= scale.hard_threshold) {
      hardFlag = true;
      notes.push(`hard flag: scale ${answer.scale} >= threshold ${scale.hard_threshold}`);
    }
  }

  return {
    key: item.key,
    title: item.title,
    section_id: item.section_id,
    section_title: item.section_title,
    selected_options: [...answer.options],
    selected_labels: labels,
    scale_value: answer.scale,
    raw_risk: risk,
    raw_neutral: neutral,
    raw_protection: protection,
    risk: risk * item.weights.risk,
    neutral: neutral * item.weights.neutral,
    protection: protection * item.weights.protection,
    hard_flag: hardFlag,
    notes,
  };
}

function itemToOut(item: ItemScore): ItemScoreOut {
  return {
    key: item.key,
    title: item.title,
    section_id: item.section_id,
    section_title: item.section_title,
    selected_options: item.selected_options,
    selected_labels: item.selected_labels,
    scale_value: item.scale_value,
    raw_risk: roundHalfUp(item.raw_risk),
    raw_neutral: roundHalfUp(item.raw_neutral),
    raw_protection: roundHalfUp(item.raw_protection),
    risk: roundHalfUp(item.risk),
    neutral: roundHalfUp(item.neutral),
    protection: roundHalfUp(item.protection),
    net: roundHalfUp(item.risk - item.protection),
    hard_flag: item.hard_flag,
    notes: item.notes,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",");
  return `{${body}}`;
}

function answerPayload(entry: NormalizedAnswer): { options?: string[]; scale?: number } {
  const payload: { options?: string[]; scale?: number } = {};
  if (entry.options.length) payload.options = [...entry.options];
  if (entry.scale !== null) payload.scale = entry.scale;
  return payload;
}

function canonicalPayload(
  config: EngineConfig,
  role: string,
  normalized: Map<string, NormalizedAnswer>,
): string {
  const answers: Record<string, { options?: string[]; scale?: number }> = {};
  for (const key of [...normalized.keys()].sort()) {
    const payload = answerPayload(normalized.get(key) as NormalizedAnswer);
    if (Object.keys(payload).length) answers[key] = payload;
  }
  return stableStringify({
    answers,
    engine_version: config.engine_version,
    questionnaire_version: config.questionnaire_version,
    role,
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface EvaluateOptions {
  role?: string;
  generatedAt?: Date;
}

function protectionCapFactor(config: EngineConfig, hasHardFlag: boolean, coreRisk: number): number {
  const cap = config.protection_cap;
  if (hasHardFlag) return cap.any_hard_flag;
  if (coreRisk >= cap.core_risk_threshold) return cap.core_risk_at_or_above_threshold;
  return cap.default;
}

export function pickAlertLevel(config: EngineConfig, netRisk: number, coverage: number): AlertLevel {
  if (coverage < config.coverage_floor) return "insufficient";
  if (netRisk <= config.thresholds.green_max) return "green";
  if (netRisk <= config.thresholds.blue_max) return "blue";
  if (netRisk <= config.thresholds.yellow_max) return "yellow";
  return "red";
}

function resolveAlert(config: EngineConfig, netRisk: number, coverage: number): AlertDef {
  const level = pickAlertLevel(config, netRisk, coverage);
  return config.alerts[level];
}

/** Score an answer map. Pure apart from the digest (Web Crypto) and the optional clock. */
export async function evaluate(
  config: EngineConfig,
  answers: AnswerMap | null | undefined,
  options: EvaluateOptions = {},
): Promise<Evaluation> {
  const role = options.role ?? config.calibration.default_role;
  const availableRoles = new Set<string>();
  for (const byRole of Object.values(config.calibration.maps)) {
    for (const key of Object.keys(byRole)) availableRoles.add(key);
  }
  if (!availableRoles.has(role)) {
    throw new ScoringError(`unknown role '${role}'; available: ${[...availableRoles].sort().join(", ")}`);
  }

  const normalized = normalizeAnswers(config, answers);
  const coreItems = new Set(config.core_items);
  const items: ItemScore[] = [];
  const hardFlags: { key: string; title: string; reason: string }[] = [];
  let totalRisk = 0;
  let totalNeutral = 0;
  let totalProtection = 0;
  let coreRisk = 0;
  let answered = 0;

  for (const section of config.sections) {
    for (const item of section.items) {
      const answer = normalized.get(item.key) ?? { options: [], scale: null };
      const score = scoreItem(config, item, answer, role);
      items.push(score);
      if (answer.options.length || answer.scale !== null) answered += 1;
      totalRisk += score.risk;
      totalNeutral += score.neutral;
      totalProtection += score.protection;
      if (coreItems.has(item.key)) coreRisk += score.risk;
      if (score.hard_flag) {
        const reasons = score.notes.filter((note) => note.startsWith("hard flag"));
        hardFlags.push({
          key: item.key,
          title: item.title,
          reason: reasons.length ? reasons.join("; ") : "hard flag",
        });
      }
    }
  }

  const capFactor = protectionCapFactor(config, hardFlags.length > 0, coreRisk);
  const effectiveProtection = Math.min(totalProtection, totalRisk * capFactor);
  const effectiveNeutral = totalNeutral * config.neutral_coefficient;
  const netRiskScore = totalRisk - effectiveProtection - effectiveNeutral;

  const scoreable = items.length;
  const coverage = scoreable ? answered / scoreable : 0;
  const alert = resolveAlert(config, netRiskScore, coverage);

  const generatedAt = options.generatedAt ?? new Date();
  const iso = generatedAt.toISOString();
  const digest = (await sha256Hex(canonicalPayload(config, role, normalized))).slice(0, 16);
  const evalId = `EV-${iso.slice(0, 10).replace(/-/g, "")}-${digest}`;

  const notes: string[] = [];
  if (answered < scoreable) {
    notes.push(
      `${scoreable - answered} of ${scoreable} items are unanswered; the result under-represents the case and must not be used for triage alone.`,
    );
  }
  if (coverage < config.coverage_floor) {
    notes.push(
      `coverage ${Math.round(coverage * 100)}% is below the ${Math.round(config.coverage_floor * 100)}% floor: the banded alert is replaced by 'insufficient data'.`,
    );
  }
  if (hardFlags.length) {
    notes.push(
      `hard flags present: protection credit is capped at ${Math.round(config.protection_cap.any_hard_flag * 100)}% of total risk`,
    );
  }

  const answersOut: Record<string, { options?: string[]; scale?: number }> = {};
  for (const key of [...normalized.keys()].sort()) {
    const payload = answerPayload(normalized.get(key) as NormalizedAnswer);
    if (Object.keys(payload).length) answersOut[key] = payload;
  }

  return {
    eval_id: evalId,
    generated_at: iso,
    engine_version: config.engine_version,
    questionnaire_version: config.questionnaire_version,
    role,
    alert,
    scores: {
      total_risk: roundHalfUp(totalRisk),
      total_neutral: roundHalfUp(totalNeutral),
      total_protection: roundHalfUp(totalProtection),
      effective_neutral: roundHalfUp(effectiveNeutral),
      effective_protection: roundHalfUp(effectiveProtection),
      protection_cap_factor: roundHalfUp(capFactor),
      core_risk: roundHalfUp(coreRisk),
      net_risk_score: roundHalfUp(netRiskScore),
    },
    hard_flags: hardFlags,
    items: items.map(itemToOut),
    coverage: {
      answered_items: answered,
      scoreable_items: scoreable,
      ratio: roundHalfUp(coverage, 4),
      complete: answered === scoreable,
    },
    answers: answersOut,
    notes,
    disclaimer: config.disclaimer,
  };
}

/** Items ordered by net contribution, highest first (mirror of rank_contributions). */
export function rankContributions(evaluation: Evaluation, limit = 5): ItemScoreOut[] {
  const ordered = [...evaluation.items].sort((a, b) => b.net - a.net || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return limit ? ordered.slice(0, limit) : ordered;
}

/** Per-section totals for charting (mirror of domain_summary). */
export function domainSummary(evaluation: Evaluation): {
  section_id: string;
  section_title: string;
  risk: number;
  protection: number;
  neutral: number;
  net: number;
}[] {
  const buckets = new Map<
    string,
    { section_id: string; section_title: string; risk: number; protection: number; neutral: number }
  >();
  for (const item of evaluation.items) {
    const bucket = buckets.get(item.section_id) ?? {
      section_id: item.section_id,
      section_title: item.section_title,
      risk: 0,
      protection: 0,
      neutral: 0,
    };
    bucket.risk += item.risk;
    bucket.protection += item.protection;
    bucket.neutral += item.neutral;
    buckets.set(item.section_id, bucket);
  }
  return [...buckets.values()].map((bucket) => ({
    section_id: bucket.section_id,
    section_title: bucket.section_title,
    risk: roundHalfUp(bucket.risk),
    protection: roundHalfUp(bucket.protection),
    neutral: roundHalfUp(bucket.neutral),
    net: roundHalfUp(bucket.risk - bucket.protection),
  }));
}
