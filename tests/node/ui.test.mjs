// Static checks on the shipped front-end.
//
// The original UI was a broken merge of two versions: duplicated markup, duplicated
// element ids and a script that no browser could parse. These tests catch that class of
// defect without needing a browser or a headless runtime.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../../apps/worker/public");
const html = readFileSync(path.join(publicDir, "index.html"), "utf8");
const js = readFileSync(path.join(publicDir, "app.js"), "utf8");
const css = readFileSync(path.join(publicDir, "style.css"), "utf8");
const headers = readFileSync(path.join(publicDir, "_headers"), "utf8");

const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const staticRefs = [...js.matchAll(/getElementById\("([^"`$]+)"\)/g)].map((match) => match[1]);

test("no element id is declared twice", () => {
  const seen = new Set();
  const duplicates = new Set();
  for (const id of htmlIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  assert.deepEqual([...duplicates], [], `duplicated ids in index.html: ${[...duplicates].join(", ")}`);
});

test("every id the script looks up exists in the markup", () => {
  const missing = [...new Set(staticRefs)].filter((id) => !htmlIds.includes(id));
  assert.deepEqual(missing, [], `app.js references ids that index.html does not define: ${missing.join(", ")}`);
});

test("the page is English and declares its language", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>[^<]*[A-Za-z][^<]*<\/title>/);
});

test("each scored control group is exposed as a fieldset with a legend", () => {
  assert.ok(js.includes('el("fieldset"'), "form controls should be grouped in fieldsets");
  assert.ok(js.includes('el("legend"'), "each fieldset needs a legend");
  assert.ok(/el\("label", \{ for: /.test(js), "inputs need associated labels");
});

test("case-derived text never goes through innerHTML", () => {
  // The only innerHTML use may be clearing a container, never filling it with data.
  // Only wiping a container with innerHTML = "" is tolerated; anything else must be textContent.
  const uses = [...js.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((match) => match[1].trim());
  const offenders = uses.filter((value) => value !== '""');
  assert.deepEqual(offenders, [], `unexpected innerHTML assignment: ${offenders.join(" | ")}`);
  assert.ok(!js.includes("document.write"), "document.write is not allowed");
  assert.ok(!/\beval\(/.test(js), "eval is not allowed");
});

test("security headers ship with the assets", () => {
  assert.match(headers, /content-security-policy/i);
  assert.match(headers, /default-src 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /x-content-type-options:\s*nosniff/i);
});

test("the stylesheet keeps the dark surface and honours reduced motion", () => {
  assert.match(css, /#050a14/i);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});
