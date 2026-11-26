// End-to-end self check: serve a demo page, capture, build, check and render a draft.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "..", "skills", "walkthrough-skill", "scripts");
const page = readFileSync(join(here, "page.html"));
const server = createServer((_, res) => res.writeHead(200, { "content-type": "text/html" }).end(page));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const env = { ...process.env, DEMO_URL: `http://127.0.0.1:${server.address().port}/` };

// async spawn: the demo server must keep answering while the steps run
const step = (script, ...args) =>
  new Promise((ok, fail) => {
    spawn(process.execPath, [join(scripts, script), ...args], { cwd: here, env, stdio: "inherit" })
      .on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${script} ${args[0]} failed`))));
  });

try {
  await step("browser.mjs", "run", "capture.mjs", "--out", "output/frames");
  await step("build.mjs", "storyboard.json", "--frames", "output/frames", "--out", "output/composition");
  await step("video.mjs", "check", "output/composition");
  await step("video.mjs", "render", "output/composition", "output/video.mp4", "draft");
  await step("video.mjs", "finalize", "output/video.mp4", "1.5");
} finally {
  server.close();
}
