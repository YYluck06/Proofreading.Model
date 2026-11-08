/**
 * Screening UI.
 *
 * Rendering rules that keep this file honest:
 *   - All case-derived text is inserted with textContent / createElement. No
 *     innerHTML is ever fed with API or user data.
 *   - Every control is inside a fieldset/legend and has an explicit label.
 *   - The result region is a live region, so screen readers announce the band.
 */

const state = {
  schema: null,
  answers: new Map(),
  leaves: [],
  result: null,
};

const dom = {
  sections: document.getElementById("sections"),
  progress: document.getElementById("progress"),
  version: document.getElementById("version-badge"),
  neutralCoefficient: document.getElementById("neutral-coefficient"),
  disclaimer: document.getElementById("disclaimer"),
  form: document.getElementById("assessment"),
  result: document.getElementById("result"),
  resultBody: document.getElementById("result-body"),
  resultHeading: document.getElementById("result-heading"),
  evaluate: document.getElementById("evaluate"),
  demo: document.getElementById("load-demo"),
  reset: document.getElementById("reset-form"),
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "text") node.textContent = String(value);
    else if (name === "class") node.className = String(value);
    else if (name.startsWith("on") && typeof value === "function") {
      node.addEventListener(name.slice(2), value);
    } else {
      node.setAttribute(name, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === "") continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function fmt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "—";
}

function answerFor(key) {
  if (!state.answers.has(key)) state.answers.set(key, { options: [], scale: null });
  return state.answers.get(key);
}

function activatingIds(item) {
  return new Set((item.options ?? []).filter((option) => option.activates_scale).map((option) => option.id));
}

function scaleRequiredHere(item) {
  const answer = answerFor(item.key);
  if (item.type === "scale") return true;
  if (!item.scale) return false;
  const activating = activatingIds(item);
  return answer.options.some((id) => activating.has(id));
}

function syncScaleVisibility(item) {
  const field = document.getElementById(`scale-field-${item.key}`);
  const select = document.getElementById(`scale-${item.key}`);
  if (!field || !select) return;
  const required = scaleRequiredHere(item);
  field.hidden = !required;
  if (!required) {
    select.value = "";
    answerFor(item.key).scale = null;
  }
}

function updateProgress() {
  const answered = state.leaves.filter((item) => {
    const answer = answerFor(item.key);
    return answer.options.length > 0 || answer.scale !== null;
  }).length;
  dom.progress.textContent = `${answered} of ${state.leaves.length} items answered`;
}

function scaleField(item) {
  const select = el(
    "select",
    {
      id: `scale-${item.key}`,
      name: `scale-${item.key}`,
      "aria-describedby": `scale-hint-${item.key}`,
    },
    [el("option", { value: "", text: "Not assessed" })].concat(
      Array.from({ length: 6 }, (_, value) => el("option", { value: String(value), text: String(value) })),
    ),
  );

  select.addEventListener("change", () => {
    const raw = select.value;
    answerFor(item.key).scale = raw === "" ? null : Number(raw);
    updateProgress();
  });

  const field = el(
    "div",
    { class: "scale", id: `scale-field-${item.key}`, hidden: !scaleRequiredHere(item) },
    [
      el("label", { for: `scale-${item.key}`, text: item.scale.label }),
      select,
      el("span", { class: "hint", id: `scale-hint-${item.key}`, text: "0 = lowest, 5 = highest" }),
    ],
  );
  return field;
}

function optionRow(item, option, isMulti) {
  const inputId = `${item.key}-opt-${option.id}`;
  const input = el("input", {
    type: isMulti ? "checkbox" : "radio",
    id: inputId,
    name: isMulti ? `${item.key}[]` : item.key,
    value: option.id,
  });

  input.addEventListener("change", () => {
    const answer = answerFor(item.key);
    if (isMulti) {
      const selected = new Set(answer.options);
      if (input.checked) selected.add(option.id);
      else selected.delete(option.id);
      answer.options = [...selected].sort();
    } else {
      answer.options = input.checked ? [option.id] : [];
    }
    syncScaleVisibility(item);
    updateProgress();
  });

  return el("div", { class: "option" }, [
    input,
    el("label", { for: inputId }, [
      option.label,
      option.hard_trigger ? el("span", { class: "tag", text: "escalation flag" }) : null,
    ]),
  ]);
}

function renderLeaf(item) {
  const isMulti = item.type === "multi" || item.type === "hybrid_multi";
  const rows = (item.options ?? []).map((option) => optionRow(item, option, isMulti));
  const children = [];

  if (item.type === "scale") {
    children.push(el("p", { class: "hint", text: "Select one value, or leave it as Not assessed." }));
  } else {
    children.push(
      el("p", {
        class: "hint",
        text: isMulti ? "Select all that apply." : "Select one option.",
      }),
    );
  }

  if (item.max_risk !== undefined && item.max_risk !== null) {
    children.push(el("p", { class: "hint", text: `Combined risk from this item is capped at ${item.max_risk}.` }));
  }

  children.push(rows);
  if (item.scale) children.push(scaleField(item));

  return el("fieldset", { class: "item", id: `item-${item.key}` }, [
    el("legend", { text: item.title }),
    children,
  ]);
}

function renderGroup(group, items) {
  return el("fieldset", { class: "item" }, [
    el("legend", { text: group.title }),
    el("p", { class: "hint", text: "Each aspect below is scored separately." }),
    items.map((item) => renderLeaf(item)),
  ]);
}

function groupIndex(schema) {
  const byItemKey = new Map();
  for (const group of Object.values(schema.groups ?? {})) {
    for (const key of group.item_keys) byItemKey.set(key, group);
  }
  return byItemKey;
}

function renderForm() {
  dom.sections.replaceChildren();
  const byItemKey = groupIndex(state.schema);

  for (const section of state.schema.sections) {
    const rendered = new Set();
    const blocks = [];
    for (const item of section.items) {
      if (rendered.has(item.key)) continue;
      const group = byItemKey.get(item.key);
      if (group) {
        const siblings = section.items.filter((candidate) => group.item_keys.includes(candidate.key));
        siblings.forEach((candidate) => rendered.add(candidate.key));
        blocks.push(renderGroup(group, siblings));
      } else {
        rendered.add(item.key);
        blocks.push(renderLeaf(item));
      }
    }

    dom.sections.append(
      el("fieldset", { class: "section" }, [
        el("legend", { text: `${section.id}. ${section.title}` }),
        section.description ? el("p", { class: "section__description", text: section.description }) : null,
        blocks,
      ]),
    );
  }
  updateProgress();
}

function collectAnswers() {
  const payload = {};
  for (const item of state.leaves) {
    const answer = answerFor(item.key);
    const entry = {};
    if (answer.options.length) entry.options = [...answer.options];
    if (answer.scale !== null && answer.scale !== undefined) entry.scale = answer.scale;
    if (Object.keys(entry).length) payload[item.key] = entry;
  }
  return payload;
}

function resetForm() {
  state.answers.clear();
  for (const input of dom.form.querySelectorAll("input[type=radio], input[type=checkbox]")) {
    input.checked = false;
  }
  for (const select of dom.form.querySelectorAll("select")) {
    select.value = "";
  }
  for (const item of state.leaves) syncScaleVisibility(item);
  updateProgress();
  dom.result.hidden = true;
  state.result = null;
}

function loadDemo() {
  resetForm();
  for (const item of state.leaves) {
    const answer = answerFor(item.key);
    const options = item.options ?? [];
    if (options.length) {
      const worst = [...options].sort((a, b) => b.risk - a.risk)[0];
      answer.options = [worst.id];
      const input = document.getElementById(`${item.key}-opt-${worst.id}`);
      if (input) input.checked = true;
    }
    if (item.scale) {
      answer.scale = 3;
      syncScaleVisibility(item);
      const select = document.getElementById(`scale-${item.key}`);
      if (select && !document.getElementById(`scale-field-${item.key}`).hidden) select.value = "3";
    }
  }
  updateProgress();
}

function scoreCell(label, value, modifier = "") {
  return el("div", { class: `score ${modifier}`.trim() }, [
    el("dt", { text: label }),
    el("dd", { text: value }),
  ]);
}

function downloadResult() {
  if (!state.result) return;
  const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: `${state.result.eval_id}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function itemsTable(evaluation) {
  const rows = evaluation.items.map((item) =>
    el("tr", {}, [
      el("td", { text: item.title }),
      el("td", { text: item.selected_labels.join("; ") || (item.scale_value === null ? "not assessed" : "—") }),
      el("td", { class: "num", text: item.scale_value === null ? "—" : String(item.scale_value) }),
      el("td", { class: "num", text: fmt(item.risk) }),
      el("td", { class: "num", text: fmt(item.protection) }),
      el("td", { class: "num", text: fmt(item.net) }),
      el("td", { text: item.hard_flag ? "yes" : "" }),
    ]),
  );

  return el("details", {}, [
    el("summary", { text: `Item-level evidence (${evaluation.items.length} items)` }),
    el("table", {}, [
      el("caption", { text: "Weights already applied. Net = weighted risk − weighted protection." }),
      el(
        "thead",
        {},
        el("tr", {}, [
          el("th", { text: "Item" }),
          el("th", { text: "Answer" }),
          el("th", { class: "num", text: "Scale" }),
          el("th", { class: "num", text: "Risk" }),
          el("th", { class: "num", text: "Protection" }),
          el("th", { class: "num", text: "Net" }),
          el("th", { text: "Flag" }),
        ]),
      ),
      el("tbody", {}, rows),
    ]),
  ]);
}

function renderResult(evaluation) {
  const alert = evaluation.alert;
  const scores = evaluation.scores;
  const ranked = [...evaluation.items].sort((a, b) => b.net - a.net).slice(0, 5).filter((item) => item.net > 0);

  const header = el("div", { class: "result-header" }, [
    el("span", { class: `badge badge--${alert.id}` }, [el("span", { class: "badge__dot", "aria-hidden": "true" }), alert.label]),
    el("p", { class: "hint", text: `${evaluation.eval_id} · ${evaluation.generated_at} · role ${evaluation.role}` }),
  ]);

  const grid = el("dl", { class: "score-grid" }, [
    scoreCell("Net risk", fmt(scores.net_risk_score), "score--net"),
    scoreCell("Total risk", fmt(scores.total_risk)),
    scoreCell("Effective protection", fmt(scores.effective_protection)),
    scoreCell("Protection cap", `${Math.round(scores.protection_cap_factor * 100)}%`),
    scoreCell("Core-domain risk", fmt(scores.core_risk)),
    scoreCell("Neutral (counted)", fmt(scores.effective_neutral)),
    scoreCell("Coverage", `${Math.round(evaluation.coverage.ratio * 100)}%`),
  ]);

  const actionList = el(
    "ul",
    { class: "actions" },
    alert.actions.map((action) => el("li", { text: action })),
  );

  const flags = evaluation.hard_flags.length
    ? el("div", {}, [
        el("h3", { text: "Hard flags" }),
        el(
          "ul",
          { class: "flags" },
          evaluation.hard_flags.map((flag) => el("li", {}, [el("strong", { text: flag.title }), ` — ${flag.reason}`])),
        ),
      ])
    : el("p", { class: "muted", text: "No hard flags were raised." });

  const ranking = ranked.length
    ? el("div", {}, [
        el("h3", { text: "Top contributing items" }),
        el(
          "ol",
          { class: "ranking" },
          ranked.map((item) =>
            el("li", {}, [el("strong", { text: item.title }), ` — net ${fmt(item.net)} (risk ${fmt(item.risk)}, protection ${fmt(item.protection)})`]),
          ),
        ),
      ])
    : el("p", { class: "muted", text: "No item shows a positive net contribution." });

  const notes = evaluation.notes.length
    ? el("div", {}, [el("h3", { text: "Data quality notes" }), el("ul", { class: "flags" }, evaluation.notes.map((note) => el("li", { text: note })))])
    : null;

  const toolbar = el("div", { class: "toolbar" }, [
    el("button", { type: "button", onclick: downloadResult, text: "Download JSON" }),
    el("p", { class: "hint", text: evaluation.disclaimer }),
  ]);

  dom.resultBody.replaceChildren(
    header,
    el("p", { class: "headline", text: alert.headline }),
    grid,
    el("h3", { text: "Recommended next steps" }),
    actionList,
    flags,
    ranking,
    notes,
    itemsTable(evaluation),
    toolbar,
  );

  dom.result.hidden = false;
  dom.resultHeading.focus();
}

function showError(message) {
  dom.resultBody.replaceChildren(el("p", { class: "error", role: "alert", text: message }));
  dom.result.hidden = false;
  dom.resultHeading.focus();
}

async function submitEvaluation(event) {
  event.preventDefault();
  dom.evaluate.disabled = true;
  dom.evaluate.textContent = "Evaluating…";
  try {
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ answers: collectAnswers() }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && payload.error ? payload.error.message : `Request failed with status ${response.status}`;
      throw new Error(message);
    }
    state.result = payload;
    renderResult(payload);
  } catch (error) {
    showError(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    dom.evaluate.disabled = false;
    dom.evaluate.textContent = "Evaluate case";
  }
}

function flattenLeaves(schema) {
  const leaves = [];
  for (const section of schema.sections) {
    for (const item of section.items) leaves.push(item);
  }
  return leaves;
}

async function init() {
  dom.form.addEventListener("submit", submitEvaluation);
  dom.reset.addEventListener("click", resetForm);
  dom.demo.addEventListener("click", loadDemo);
  dom.demo.title = "Fills every item with its highest-risk option and scale 3.";

  try {
    const response = await fetch("/api/questionnaire", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`schema request failed with status ${response.status}`);
    state.schema = await response.json();
  } catch (error) {
    dom.version.textContent = "engine unavailable";
    showError("The questionnaire could not be loaded. Check that the Worker is running, then reload.");
    return;
  }

  state.leaves = flattenLeaves(state.schema);
  dom.version.textContent = `engine ${state.schema.engine_version} · questionnaire ${state.schema.questionnaire_version}`;
  dom.neutralCoefficient.textContent = String(state.schema.neutral_coefficient);
  dom.disclaimer.textContent = state.schema.disclaimer;
  renderForm();
}

init();
