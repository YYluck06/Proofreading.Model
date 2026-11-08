// AUTO-GENERATED FILE - DO NOT EDIT BY HAND.
// Source: config/questionnaire.json, config/scoring.json, config/calibration.json
// Regenerate with: python tools/sync_worker_config.py
// CI fails when this file is out of date.
import type { EngineConfig } from "../types.js";

export const CONFIG = {
  "questionnaire_version": "2.0.0",
  "engine_version": "2.0.0",
  "title": "Youth Risk & Protection Screening Questionnaire",
  "description": "Structured screening instrument covering family, individual, social, school, online, emotional and self-management domains. Every item contributes evidence to three independent channels: risk, neutral, and protection.",
  "scale": {
    "min": 0,
    "max": 5
  },
  "sections": [
    {
      "id": "A",
      "title": "Family & guardianship",
      "description": "Caregiver presence, parenting style and family functioning.",
      "items": [
        {
          "key": "a1",
          "title": "Guardianship status",
          "type": "multi",
          "section_id": "A",
          "section_title": "Family & guardianship",
          "weights": {
            "risk": 1.1,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "guardian_engaged",
              "label": "Guardian actively involved (protective)",
              "risk": 0.0,
              "neutral": 2.0,
              "protection": 5.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "single_parent",
              "label": "Single-parent household",
              "risk": 2.0,
              "neutral": 3.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "parental_unemployment",
              "label": "Parent(s) unemployed",
              "risk": 2.0,
              "neutral": 2.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "weak_supervision",
              "label": "Weak supervision",
              "risk": 2.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "chronic_illness",
              "label": "Chronic illness in the household",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "migrant_family",
              "label": "Migrant family (frequent relocation)",
              "risk": 3.0,
              "neutral": 2.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "left_behind",
              "label": "Left-behind child",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "parents_absent",
              "label": "Parents away for most of the year",
              "risk": 3.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "parents_unreachable",
              "label": "Parents out of contact",
              "risk": 3.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "no_caregiver",
              "label": "De facto no caregiver",
              "risk": 5.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": true,
              "activates_scale": false
            }
          ],
          "max_risk": 6.0
        },
        {
          "key": "a2",
          "title": "Parenting style",
          "type": "mcq",
          "section_id": "A",
          "section_title": "Family & guardianship",
          "weights": {
            "risk": 1.0,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "authoritative",
              "label": "Authoritative (balanced, reasoned)",
              "risk": 0.0,
              "neutral": 3.0,
              "protection": 4.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "traditional",
              "label": "Traditional (rule-focused)",
              "risk": 1.0,
              "neutral": 4.0,
              "protection": 2.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "permissive",
              "label": "Permissive / indulgent",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "neglectful",
              "label": "Neglectful",
              "risk": 3.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "violent",
              "label": "Violent / abusive",
              "risk": 5.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": true,
              "activates_scale": false
            }
          ]
        },
        {
          "key": "a3_1",
          "title": "Family communication",
          "type": "scale",
          "section_id": "A",
          "section_title": "Family & guardianship",
          "weights": {
            "risk": 0.7,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Difficulty communicating (0 = open, 5 = severely impaired)",
            "map_to": "risk",
            "hard_threshold": null
          },
          "parent": "a3"
        },
        {
          "key": "a3_2",
          "title": "Family conflict",
          "type": "scale",
          "section_id": "A",
          "section_title": "Family & guardianship",
          "weights": {
            "risk": 0.8,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Conflict intensity (0 = calm, 5 = violent conflict)",
            "map_to": "risk",
            "hard_threshold": null
          },
          "parent": "a3"
        }
      ]
    },
    {
      "id": "B",
      "title": "Individual cognition & psychology",
      "description": "Temperament, aggression, belief system and self-identity.",
      "items": [
        {
          "key": "b1_1",
          "title": "Impulse control",
          "type": "scale",
          "section_id": "B",
          "section_title": "Individual cognition & psychology",
          "weights": {
            "risk": 1.0,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Impulsivity (0 = composed, 5 = easily loses control)",
            "map_to": "risk",
            "hard_threshold": null
          },
          "parent": "b1"
        },
        {
          "key": "b1_2",
          "title": "Aggressive tendencies",
          "type": "scale",
          "section_id": "B",
          "section_title": "Individual cognition & psychology",
          "weights": {
            "risk": 1.0,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Aggressive behaviour frequency (0 = none, 5 = frequent)",
            "map_to": "risk",
            "hard_threshold": 4
          },
          "parent": "b1"
        },
        {
          "key": "b2",
          "title": "Belief system (extreme / defeatist views)",
          "type": "hybrid",
          "section_id": "B",
          "section_title": "Individual cognition & psychology",
          "weights": {
            "risk": 0.8,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "positive_values",
              "label": "Constructive values",
              "risk": 0.0,
              "neutral": 0.0,
              "protection": 5.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "peer_influenced",
              "label": "Values shaped by peers",
              "risk": 1.0,
              "neutral": 3.0,
              "protection": 1.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "unclear_values",
              "label": "Diffuse / unclear values",
              "risk": 1.0,
              "neutral": 2.0,
              "protection": 1.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "occasional_extreme",
              "label": "Occasional extreme views",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "extreme_views",
              "label": "Firmly extreme views",
              "risk": 4.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            }
          ],
          "scale": {
            "label": "Extremity of views (0 = none, 5 = extreme)",
            "map_to": "risk",
            "hard_threshold": 5
          }
        },
        {
          "key": "b3",
          "title": "Self-identity",
          "type": "scale",
          "section_id": "B",
          "section_title": "Individual cognition & psychology",
          "weights": {
            "risk": 0.9,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Identity confusion (0 = confident, 5 = confused / self-rejecting)",
            "map_to": "risk",
            "hard_threshold": null
          }
        }
      ]
    },
    {
      "id": "C",
      "title": "Social environment",
      "description": "Peer group and community context.",
      "items": [
        {
          "key": "c1",
          "title": "Peer relationships",
          "type": "hybrid",
          "section_id": "C",
          "section_title": "Social environment",
          "weights": {
            "risk": 1.0,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "no_delinquent_peers",
              "label": "No delinquent peers",
              "risk": 0.0,
              "neutral": 5.0,
              "protection": 5.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "occasional_delinquent_peers",
              "label": "Occasional contact with delinquent peers",
              "risk": 2.0,
              "neutral": 1.0,
              "protection": 1.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "delinquent_peers",
              "label": "Regular delinquent peer group",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "delinquent_gang",
              "label": "Member of an antisocial group",
              "risk": 4.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            }
          ],
          "scale": {
            "label": "Peer influence intensity (0 = none, 5 = very strong)",
            "map_to": "risk",
            "hard_threshold": 4
          }
        },
        {
          "key": "c2",
          "title": "Community environment",
          "type": "hybrid",
          "section_id": "C",
          "section_title": "Social environment",
          "weights": {
            "risk": 0.8,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "supportive_community",
              "label": "Well-resourced, safe community",
              "risk": 0.0,
              "neutral": 3.0,
              "protection": 4.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "average_community",
              "label": "Average community",
              "risk": 1.0,
              "neutral": 2.0,
              "protection": 2.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "resource_poor_community",
              "label": "Resource-poor community",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 1.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "unsafe_community",
              "label": "Poor public safety",
              "risk": 4.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "high_crime_community",
              "label": "Frequent community crime",
              "risk": 5.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": true,
              "activates_scale": true
            },
            {
              "id": "high_risk_community",
              "label": "Known high-risk community",
              "risk": 5.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": true,
              "activates_scale": true
            }
          ],
          "scale": {
            "label": "Community influence intensity (0 = none, 5 = very strong)",
            "map_to": "risk",
            "hard_threshold": 4
          }
        }
      ]
    },
    {
      "id": "D",
      "title": "School & education",
      "description": "Attendance, engagement and legal-awareness education.",
      "items": [
        {
          "key": "d1",
          "title": "School engagement",
          "type": "hybrid_multi",
          "section_id": "D",
          "section_title": "School & education",
          "weights": {
            "risk": 1.0,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "engaged_learner",
              "label": "Actively engaged in learning",
              "risk": 0.0,
              "neutral": 4.0,
              "protection": 4.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "occasional_absence",
              "label": "Occasional absence",
              "risk": 1.0,
              "neutral": 3.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "occasional_truancy",
              "label": "Occasional truancy",
              "risk": 2.0,
              "neutral": 2.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "chronic_absence",
              "label": "Chronic absence",
              "risk": 3.0,
              "neutral": 2.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "frequent_truancy",
              "label": "Frequent truancy",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "dropout",
              "label": "Dropped out of school",
              "risk": 4.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            }
          ],
          "scale": {
            "label": "Truancy frequency and persistence (0 = none, 5 = very frequent / ongoing)",
            "map_to": "risk",
            "hard_threshold": 4
          }
        },
        {
          "key": "d2",
          "title": "Legal-awareness education",
          "type": "hybrid",
          "section_id": "D",
          "section_title": "School & education",
          "weights": {
            "risk": 0.9,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "active_participation",
              "label": "Deeply involved in legal-awareness activities",
              "risk": 0.0,
              "neutral": 3.0,
              "protection": 5.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "scheduled_lessons",
              "label": "Scheduled lessons delivered",
              "risk": 1.0,
              "neutral": 2.0,
              "protection": 2.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "occasional_outreach",
              "label": "Occasional awareness campaigns only",
              "risk": 2.0,
              "neutral": 1.0,
              "protection": 1.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "no_legal_education",
              "label": "No legal-awareness education",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": false
            }
          ],
          "scale": {
            "label": "Effect of legal-awareness education (0 = none, 5 = good)",
            "map_to": "protection",
            "hard_threshold": null
          }
        }
      ]
    },
    {
      "id": "E",
      "title": "Online behaviour",
      "description": "Screen time, late-night use, harmful content exposure and online interaction.",
      "items": [
        {
          "key": "e1a",
          "title": "Screen time interfering with daily life",
          "type": "scale",
          "section_id": "E",
          "section_title": "Online behaviour",
          "weights": {
            "risk": 0.8,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Interference with daily life (0 = none, 5 = severely disrupted)",
            "map_to": "risk",
            "hard_threshold": null
          }
        },
        {
          "key": "e1b",
          "title": "Late-night internet use",
          "type": "scale",
          "section_id": "E",
          "section_title": "Online behaviour",
          "weights": {
            "risk": 0.9,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Late-night use frequency (0 = none, 5 = all night)",
            "map_to": "risk",
            "hard_threshold": null
          }
        },
        {
          "key": "e2",
          "title": "Harmful content exposure",
          "type": "hybrid_multi",
          "section_id": "E",
          "section_title": "Online behaviour",
          "weights": {
            "risk": 1.1,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "positive_content",
              "label": "Mostly positive / educational content",
              "risk": 0.0,
              "neutral": 3.0,
              "protection": 5.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "game_content",
              "label": "Gaming content",
              "risk": 1.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "sexual_content",
              "label": "Sexual content",
              "risk": 2.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "fraud_content",
              "label": "Fraud / scam material",
              "risk": 3.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": true,
              "activates_scale": true
            },
            {
              "id": "violent_content",
              "label": "Violent / graphic content",
              "risk": 4.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": true,
              "activates_scale": true
            },
            {
              "id": "illicit_market_content",
              "label": "Illicit-market / underground-economy material",
              "risk": 5.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": true,
              "activates_scale": true
            }
          ],
          "scale": {
            "label": "Exposure frequency / immersion (0 = none, 5 = frequent)",
            "map_to": "risk",
            "hard_threshold": 5
          }
        },
        {
          "key": "e3",
          "title": "Online social behaviour",
          "type": "multi",
          "section_id": "E",
          "section_title": "Online behaviour",
          "weights": {
            "risk": 1.0,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "healthy_online",
              "label": "Healthy online relationships",
              "risk": 0.0,
              "neutral": 3.0,
              "protection": 5.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "cyberbullied",
              "label": "Victim of cyberbullying",
              "risk": 2.0,
              "neutral": 2.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "risky_online_circle",
              "label": "Involved in risky online circles",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "cyberbullying_offender",
              "label": "Participates in or initiates cyberbullying",
              "risk": 5.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": true,
              "activates_scale": false
            }
          ],
          "scale": {
            "label": "Impact intensity (0 = none, 5 = very strong)",
            "map_to": "risk",
            "hard_threshold": 4
          }
        }
      ]
    },
    {
      "id": "F",
      "title": "Emotional development",
      "description": "Support received and capacity to regulate emotion.",
      "items": [
        {
          "key": "f1",
          "title": "Emotional support",
          "type": "scale",
          "section_id": "F",
          "section_title": "Emotional development",
          "weights": {
            "risk": 0.8,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Care and support received (0 = poor, 5 = strong)",
            "map_to": "protection",
            "hard_threshold": null
          }
        },
        {
          "key": "f2",
          "title": "Emotion regulation",
          "type": "scale",
          "section_id": "F",
          "section_title": "Emotional development",
          "weights": {
            "risk": 0.9,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Difficulty regulating emotion (0 = good, 5 = severe)",
            "map_to": "risk",
            "hard_threshold": null
          }
        }
      ]
    },
    {
      "id": "G",
      "title": "Self-management",
      "description": "Time and money management.",
      "items": [
        {
          "key": "g1",
          "title": "Time management & self-discipline",
          "type": "scale",
          "section_id": "G",
          "section_title": "Self-management",
          "weights": {
            "risk": 0.8,
            "neutral": 1.0,
            "protection": 1.0
          },
          "scale": {
            "label": "Time-management problems (0 = disciplined, 5 = chaotic)",
            "map_to": "risk",
            "hard_threshold": null
          }
        },
        {
          "key": "g2",
          "title": "Financial management",
          "type": "hybrid",
          "section_id": "G",
          "section_title": "Self-management",
          "weights": {
            "risk": 0.7,
            "neutral": 1.0,
            "protection": 1.0
          },
          "options": [
            {
              "id": "good_financial_skills",
              "label": "Good money management",
              "risk": 0.0,
              "neutral": 3.0,
              "protection": 5.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "no_debt",
              "label": "No debt",
              "risk": 0.0,
              "neutral": 4.0,
              "protection": 2.0,
              "hard_trigger": false,
              "activates_scale": false
            },
            {
              "id": "impulse_spending",
              "label": "Occasional impulse spending",
              "risk": 1.0,
              "neutral": 2.0,
              "protection": 1.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "scam_victim",
              "label": "Victim of a financial scam",
              "risk": 3.0,
              "neutral": 1.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "in_debt",
              "label": "Currently in debt",
              "risk": 3.0,
              "neutral": 2.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            },
            {
              "id": "severe_debt",
              "label": "Severe debt / predatory loan",
              "risk": 4.0,
              "neutral": 0.0,
              "protection": 0.0,
              "hard_trigger": false,
              "activates_scale": true
            }
          ],
          "scale": {
            "label": "Problematic money attitudes / behaviour (0 = good, 5 = severe)",
            "map_to": "risk",
            "hard_threshold": 4
          }
        }
      ]
    }
  ],
  "groups": {
    "a3": {
      "key": "a3",
      "title": "Family functioning",
      "item_keys": [
        "a3_1",
        "a3_2"
      ]
    },
    "b1": {
      "key": "b1",
      "title": "Personality & behaviour",
      "item_keys": [
        "b1_1",
        "b1_2"
      ]
    }
  },
  "core_items": [
    "a1",
    "a2",
    "a3_1",
    "a3_2",
    "b1_1",
    "b1_2",
    "c1",
    "c2",
    "d1",
    "d2",
    "e1a",
    "e1b",
    "e2"
  ],
  "thresholds": {
    "green_max": 0.0,
    "blue_max": 9.0,
    "yellow_max": 15.0
  },
  "neutral_coefficient": 0.3,
  "coverage_floor": 0.6,
  "protection_cap": {
    "any_hard_flag": 0.3,
    "core_risk_at_or_above_threshold": 0.5,
    "core_risk_threshold": 4.0,
    "default": 0.8
  },
  "alerts": {
    "insufficient": {
      "id": "insufficient",
      "label": "Insufficient data",
      "headline": "Too few items are answered to produce a banded result.",
      "actions": [
        "Complete at least the core family, individual, school and online items before scoring.",
        "Treat the case as unassessed: do not defer a safeguarding decision because the score looks low."
      ]
    },
    "green": {
      "id": "green",
      "label": "Stable",
      "headline": "No elevated risk signal. Continue routine support.",
      "actions": [
        "Keep the current support arrangement and re-screen at the next scheduled cycle.",
        "Record protective factors that are working (guardian involvement, school engagement, emotional support)."
      ]
    },
    "blue": {
      "id": "blue",
      "label": "Monitor",
      "headline": "Low-level risk signal. Watch the trend, do not escalate yet.",
      "actions": [
        "Re-screen within 4 weeks and compare the net risk score trend.",
        "Share the protective-factor summary with guardians or the class teacher, with consent.",
        "Target the highest-scoring domain only; avoid launching parallel interventions."
      ]
    },
    "yellow": {
      "id": "yellow",
      "label": "Elevated",
      "headline": "Elevated risk signal. A named case worker should review the profile.",
      "actions": [
        "Assign a case worker and confirm the facts behind the top three contributions with the guardian and school.",
        "Start a structured support plan with an explicit review date (within 2 weeks).",
        "Check whether any hard-flag item is present and document the follow-up for each one.",
        "Re-screen within 2 weeks and record changes in the audit log."
      ]
    },
    "red": {
      "id": "red",
      "label": "Urgent",
      "headline": "High risk signal. Escalate for human review the same working day.",
      "actions": [
        "Escalate to the designated safeguarding lead the same working day; do not rely on the score alone.",
        "Verify hard-flag findings directly with the guardian, school, or relevant agency.",
        "Activate the local multi-agency referral pathway if any hard flag is confirmed.",
        "Increase review frequency to weekly until the net risk score falls below the elevated band.",
        "Log every decision, its author, and its rationale in the audit trail."
      ]
    }
  },
  "disclaimer": "This instrument is a decision-support aid. It does not produce a legal, clinical, or safeguarding determination, and no action may be taken on a score alone. Every alert must be reviewed by a qualified professional together with the underlying evidence.",
  "calibration": {
    "default_role": "default",
    "version": "1.0.0",
    "maps": {
      "a3_1": {
        "default": {
          "0": 0.1806,
          "1": 0.2025,
          "2": 0.3471,
          "3": 0.5044,
          "4": 0.6389,
          "5": 0.6755
        }
      },
      "a3_2": {
        "default": {
          "0": 0.1957,
          "1": 0.2213,
          "2": 0.2834,
          "3": 0.5925,
          "4": 0.5925,
          "5": 0.5925
        }
      },
      "b1_1": {
        "default": {
          "0": 0.2149,
          "1": 0.235,
          "2": 0.2988,
          "3": 0.4947,
          "4": 0.5916,
          "5": 0.6637
        }
      },
      "b1_2": {
        "default": {
          "0": 0.2289,
          "1": 0.2361,
          "2": 0.3032,
          "3": 0.4972,
          "4": 0.5929,
          "5": 0.6703
        }
      },
      "b3": {
        "default": {
          "0": 0.1959,
          "1": 0.2189,
          "2": 0.2909,
          "3": 0.4803,
          "4": 0.5224,
          "5": 0.5224
        }
      },
      "c1": {
        "default": {
          "0": 0.2186,
          "1": 0.2359,
          "2": 0.2962,
          "3": 0.4949,
          "4": 0.6395,
          "5": 0.6395
        }
      },
      "c2": {
        "default": {
          "0": 0.2401,
          "1": 0.2401,
          "2": 0.2976,
          "3": 0.4879,
          "4": 0.5939,
          "5": 0.5939
        }
      },
      "d1": {
        "default": {
          "0": 0.2265,
          "1": 0.2371,
          "2": 0.3035,
          "3": 0.4971,
          "4": 0.6445,
          "5": 0.6445
        }
      },
      "d2": {
        "default": {
          "0": 0.4098,
          "1": 0.4098,
          "2": 0.4098,
          "3": 0.4098,
          "4": 0.4098,
          "5": 0.4098
        }
      },
      "e1a": {
        "default": {
          "0": 0.1911,
          "1": 0.2843,
          "2": 0.3045,
          "3": 0.5358,
          "4": 0.5724,
          "5": 0.6201
        }
      },
      "e1b": {
        "default": {
          "0": 0.2309,
          "1": 0.2722,
          "2": 0.4501,
          "3": 0.5966,
          "4": 0.6255,
          "5": 0.6255
        }
      },
      "e2": {
        "default": {
          "0": 0.1989,
          "1": 0.2703,
          "2": 0.3693,
          "3": 0.4891,
          "4": 0.5601,
          "5": 0.5601
        }
      },
      "g1": {
        "default": {
          "0": 0.1913,
          "1": 0.2968,
          "2": 0.2968,
          "3": 0.536,
          "4": 0.5753,
          "5": 0.6182
        }
      },
      "g2": {
        "default": {
          "0": 0.2264,
          "1": 0.2344,
          "2": 0.3026,
          "3": 0.4945,
          "4": 0.5275,
          "5": 0.743
        }
      },
      "f1": {
        "default": {
          "0": 0.7532,
          "1": 0.7532,
          "2": 0.7532,
          "3": 0.7532,
          "4": 0.7532,
          "5": 0.7532
        }
      },
      "f2": {
        "default": {
          "0": 0.2149,
          "1": 0.2354,
          "2": 0.297,
          "3": 0.4945,
          "4": 0.5265,
          "5": 0.7382
        }
      }
    }
  }
} satisfies EngineConfig;
