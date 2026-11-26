// node --test skills/walkthrough-video/scripts/test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build, defaultDuration } from "./build.mjs";
import { isLocalUrl } from "./lib.mjs";

test("only this machine counts as local", () => {
  for (const url of ["http://localhost:3000/x", "postgresql://u:p@127.0.0.1:5432/db", "http://[::1]:80", "http://app.localhost"])
    assert.equal(isLocalUrl(url), true, url);
  for (const url of [
    "https://erp.example.com",
    "postgresql://u:p@db.neon.tech/db",
    "postgresql://localhost/db?host=db.example.com",
    "http://localhost.evil.com",
    "http://localhost@evil.com",
    "http://127.0.0.1.evil.com",
    "not a url",
  ])
    assert.equal(isLocalUrl(url), false, url);
});

const project = (scenes, extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "wt-test-"));
  writeFileSync(join(dir, "a.png"), "png");
  writeFileSync(join(dir, "a.json"), JSON.stringify({ rect: [10, 20, 100, 30], viewport: [1600, 900] }));
  writeFileSync(join(dir, "s.json"), JSON.stringify({ sound: false, scenes, ...extra }));
  return [join(dir, "s.json"), dir, join(dir, "out")];
};

test("builds a timeline whose length is the sum of its scenes", () => {
  const scenes = [{ type: "title", heading: "<b>Hi</b>", dur: 3 }, { type: "shot", frame: "a", caption: "Click it", click: true, dur: 2.5 }];
  const result = build(...project(scenes));
  assert.equal(result.total, 5.5);
  assert.match(result.html, /data-composition-id="main" data-start="0" data-duration="5.5"/);
  assert.match(result.html, /&lt;b&gt;Hi&lt;\/b&gt;/);
  assert.doesNotMatch(result.html, /<audio/);
});

test("refuses a video over the limit, a long caption and an unknown scene", () => {
  assert.throws(() => build(...project([{ type: "title", heading: "x", dur: 20 }], { maxSeconds: 10 })), /over the 10s limit/);
  assert.throws(() => build(...project([{ type: "shot", frame: "a", caption: "x".repeat(71) }])), /caption/);
  assert.throws(() => build(...project([{ type: "wipe" }])), /Unknown scene type/);
});

test("gives longer captions more time", () => {
  const short = defaultDuration({ type: "shot", caption: "Done" });
  const long = defaultDuration({ type: "shot", caption: "Pick the sale, check the amount, then click Apply reward now please" });
  assert.ok(long > short);
});
