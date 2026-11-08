# Data protection

This software processes information about children. Treat every deployment as a system holding
special-category data, even during a pilot, even in a test environment.

The rules below are requirements, not aspirations. If a change to the code would make one of them
impossible to satisfy, the change is wrong.

## 1. No case data in the repository

- `data/`, `exports/`, `cases/`, `*.csv`, `*.pkl`, `*.joblib` and `.streamlit/secrets.toml` are
  ignored by git.
- Fixtures in `tests/fixtures/` are synthetic. Do not regenerate them from real cases.
- If case data has already been committed, rewriting history is not enough: treat the data as
  disclosed and follow your organisation's incident process.

## 2. Collect the minimum

- Free-text fields are limited to a **case reference** and an **assessor name**. Use internal
  reference codes. Never enter a child's name, date of birth, address, school name or ID number.
- The questionnaire asks only what the model scores. Nothing is collected "for later".

## 3. Keep data in the session

- The dashboard stores answers in Streamlit session state only. Closing the session discards them.
- The Worker is stateless: it does not log answers, does not write to storage and returns nothing
  that is retained server-side.
- Exports are explicit user actions (a JSON or CSV download). Nothing is written to disk by the
  application itself.

## 4. Protect anything you export

An exported evaluation contains the answers and the resulting narrative. It is personal data.

- Store exports in the case management system that is already approved for such data, not in
  shared drives, chat messages or email attachments.
- Keep the `eval_id` in the case record so that the numbers in the export can be reproduced.
- Delete local copies when the case is closed.

## 5. Access control is the deployer's job

- Put the Worker behind Cloudflare Access (or an equivalent authenticating proxy) before use with
  real cases. The API has no built-in authentication; it is designed to run inside a trust boundary.
- Set `ALLOWED_ORIGINS` to the exact hostnames of your deployments. Never use `*`.
- Serve over HTTPS only. The CSP in `public/_headers` and the security headers in `src/index.ts`
  are defence in depth, not a substitute.

## 6. Human decision, recorded

- A band is input to a decision, never the decision. The red band requires escalation within the
  same working day and an explicit human review; the green band does not close a case.
- The dashboard's audit trail records who scored what and when. Keep that record with the case.

## 7. Retention

- Working session: whatever the assessor needs to complete the assessment.
- Audit records: per your jurisdiction and organisational policy. The software imposes no
  retention, and issues no deletion reminders — schedule that elsewhere.

## 8. Transparency towards the young person and their guardians

Explain, in age-appropriate language, what is being recorded, who will see it, and what happens
next. The questionnaire is a structured conversation aid, not an interrogation: an assessor who
cannot explain an item should not be scoring it.

## 9. Incident response

If case data is exposed — committed, cached, exported to the wrong place, or served to an
unauthenticated client — treat it as a personal-data breach, notify according to local law and
your organisation's policy, and record what the software allowed to happen so the failure mode
can be closed here.
