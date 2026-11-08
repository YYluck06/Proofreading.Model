/** Types shared by the scoring engine, the HTTP layer and the generated config module. */

export type ItemType = "mcq" | "multi" | "scale" | "group" | "hybrid" | "hybrid_multi";

export type AlertLevel = "insufficient" | "green" | "blue" | "yellow" | "red";

export interface Weights {
  risk: number;
  neutral: number;
  protection: number;
}

export interface OptionDef {
  id: string;
  label: string;
  risk: number;
  neutral: number;
  protection: number;
  hard_trigger?: boolean;
  activates_scale?: boolean;
}

export interface ScaleDef {
  label: string;
  map_to: "risk" | "protection";
  hard_threshold?: number | null;
}

export interface ItemDef {
  key: string;
  title: string;
  type: ItemType;
  section_id: string;
  section_title: string;
  weights: Weights;
  options?: OptionDef[];
  scale?: ScaleDef | null;
  max_risk?: number | null;
  parent?: string | null;
}

export interface SectionDef {
  id: string;
  title: string;
  description: string;
  items: ItemDef[];
}

/** Display-only container: several items are presented together. */
export interface GroupDef {
  key: string;
  title: string;
  item_keys: string[];
}

export interface AlertDef {
  id: AlertLevel;
  label: string;
  headline: string;
  actions: string[];
}

export interface EngineConfig {
  questionnaire_version: string;
  engine_version: string;
  title: string;
  description: string;
  scale: { min: number; max: number };
  sections: SectionDef[];
  groups: Record<string, GroupDef>;
  core_items: string[];
  thresholds: { green_max: number; blue_max: number; yellow_max: number };
  neutral_coefficient: number;
  coverage_floor: number;
  protection_cap: {
    any_hard_flag: number;
    core_risk_at_or_above_threshold: number;
    core_risk_threshold: number;
    default: number;
  };
  alerts: Record<AlertLevel, AlertDef>;
  disclaimer: string;
  calibration: {
    default_role: string;
    version: string;
    maps: Record<string, Record<string, Record<string, number>>>;
  };
}

/** Accepted answer shapes. ``scale`` items take a number, option items take an id or ids. */
export type AnswerValue =
  | string
  | number
  | string[]
  | {
      options?: string | string[];
      option?: string;
      scale?: number | string | null;
    }
  | null;

export type AnswerMap = Record<string, AnswerValue>;

export interface NormalizedAnswer {
  options: string[];
  scale: number | null;
}

export interface ItemScoreOut {
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
  net: number;
  hard_flag: boolean;
  notes: string[];
}

export interface EvaluationScores {
  total_risk: number;
  total_neutral: number;
  total_protection: number;
  effective_neutral: number;
  effective_protection: number;
  protection_cap_factor: number;
  core_risk: number;
  net_risk_score: number;
}

export interface HardFlag {
  key: string;
  title: string;
  reason: string;
}

export interface Evaluation {
  eval_id: string;
  generated_at: string;
  engine_version: string;
  questionnaire_version: string;
  role: string;
  alert: AlertDef & { id: AlertLevel };
  scores: EvaluationScores;
  hard_flags: HardFlag[];
  items: ItemScoreOut[];
  coverage: {
    answered_items: number;
    scoreable_items: number;
    ratio: number;
    complete: boolean;
  };
  answers: Record<string, { options?: string[]; scale?: number }>;
  notes: string[];
  disclaimer: string;
}
