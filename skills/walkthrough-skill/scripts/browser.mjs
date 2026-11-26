// Drives a private headless Chrome/Edge over the DevTools protocol. No packages.
//   node browser.mjs run <capture.mjs> [--out frames] [--profile dir] [--viewport 1600x900]
//   node browser.mjs pdf <page.html> <out.pdf>
// A capture script is: export default async (b) => { await b.goto(...); await b.shot("id", target) }
// A target is a CSS selector, or { css, text, nth }, or { js: "expression returning an element" }.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findBrowser, isLocalUrl } from "./lib.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ out = "frames", profile, viewport = [1600, 900] } = {}) {
  const executable = findBrowser();
  if (!executable) throw new Error("No Chrome, Edge or Chromium found. Run doctor.mjs.");
  const temporary = !profile;
  profile = resolve(profile ?? mkdtempSync(join(tmpdir(), "walkthrough-")));
  mkdirSync(profile, { recursive: true });
  const portFile = join(profile, "DevToolsActivePort");
  rmSync(portFile, { force: true });
  // Port 0 + our own profile's port file: we can only ever reach the browser we started.
  const child = spawn(
    executable,
    ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"],
    { stdio: "ignore" },
  );
  const until = async (what, probe, ms = 20000) => {
    const end = Date.now() + ms;
    for (;;) {
      const value = await probe();
      if (value) return value;
      if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
      await sleep(150);
    }
  };
  const port = await until("the browser to start", () => existsSync(portFile) && readFileSync(portFile, "utf8").split("\n")[0].trim());
  const page = await until("a page", async () =>
    (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"),
  );
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = () => fail(new Error("Could not connect to the browser"));
  });

  let id = 0;
  const pending = new Map();
  const blocked = [];
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      pending.set(++id, (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      // Writes may only reach this machine, so a recording can never change a shared or live system.
      const safe = ["GET", "HEAD", "OPTIONS"].includes(request.method) || isLocalUrl(request.url);
      if (!safe) blocked.push(`${request.method} ${new URL(request.url).host}`);
      send(safe ? "Fetch.continueRequest" : "Fetch.failRequest", safe ? { requestId } : { requestId, errorReason: "BlockedByClient" }).catch(() => {});
      return;
    }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };

  // shortcut: guards this page only; popups and cross-origin iframes are not intercepted.
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Network.enable");
  await send("Network.setBypassServiceWorker", { bypass: true });
  const [width, height] = viewport;
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });

  const js = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "page error");
    return r.result.value;
  };
  const element = (target) => {
    if (typeof target === "object" && target.js) return `(${target.js})`;
    const { css, text = null, nth = 0 } = typeof target === "string" ? { css: target } : target;
    return `[...document.querySelectorAll(${JSON.stringify(css)})].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && (${JSON.stringify(text)} === null || e.textContent.trim() === ${JSON.stringify(text)}))[${nth}]`;
  };
  const locate = (target) =>
    js(`(() => {
      const e = ${element(target)};
      if (!e) return null;
      e.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { rect: [r.x, r.y, r.width, r.height].map(Math.round), reachable: !!top && (e.contains(top) || top.contains(e) || top.closest("label")?.contains(e) === true) };
    })()`);
  const waitFor = (target, ms) => until(`element ${JSON.stringify(target)}`, () => locate(target), ms);
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, ...extra });

  const b = {
    send,
    js,
    sleep,
    waitFor,
    blocked,
    async goto(url, settle = 1500) {
      if (!isLocalUrl(url) && !url.startsWith("file:")) throw new Error("Only apps running on this machine can be recorded.");
      const { errorText } = await send("Page.navigate", { url });
      if (errorText) throw new Error(`Could not open the page: ${errorText}`);
      await until("the page to load", () => js("document.readyState === 'complete'").catch(() => false), 60000);
      await sleep(settle);
    },
    async click(target, settle = 800) {
      // wait for menus and dialogs to finish animating before aiming
      await waitFor(target);
      await sleep(250);
      const { rect: [x, y, w, h], reachable } = await waitFor(target);
      if (!reachable) throw new Error(`Element is covered or off screen (scroll its list first): ${JSON.stringify(target)}`);
      const [cx, cy] = [x + w / 2, y + h / 2];
      await mouse("mouseMoved", cx, cy);
      await mouse("mousePressed", cx, cy, { button: "left", clickCount: 1 });
      await mouse("mouseReleased", cx, cy, { button: "left", clickCount: 1 });
      await sleep(settle);
    },
    /** Replaces whatever the field holds, including prefilled logins. */
    async fill(target, value, settle = 400) {
      await b.click(target, 150);
      await js("document.activeElement.select?.()");
      await send("Input.insertText", { text: String(value) });
      await sleep(settle);
    },
    async hover(target, settle = 900) {
      const { rect: [x, y, w, h] } = await waitFor(target);
      await mouse("mouseMoved", x + w / 2, y + h / 2);
      await sleep(settle);
    },
    /** For virtual lists, where scrollIntoView finds nothing to scroll to. */
    async wheel(target, deltaY, settle = 700) {
      const { rect: [x, y, w, h] } = await waitFor(target);
      await mouse("mouseWheel", x + w / 2, y + h / 2, { deltaX: 0, deltaY });
      await sleep(settle);
    },
    css: (rules) => js(`document.head.append(Object.assign(document.createElement("style"), { textContent: ${JSON.stringify(rules)} }))`),
    /** Saves <id>.png and <id>.json (where the next action happens). */
    async shot(name, target, settle = 600) {
      await sleep(settle);
      const rect = target ? (await waitFor(target)).rect : null;
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64"));
      writeFileSync(join(out, `${name}.json`), JSON.stringify({ rect, viewport }));
    },
    /** Capture the screen, then click: the usual step of a walkthrough. */
    async act(name, target, settle) {
      await b.shot(name, target);
      await b.click(target, settle);
    },
    async pdf(file) {
      await js("document.fonts.ready.then(() => true)");
      const { data } = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
      writeFileSync(file, Buffer.from(data, "base64"));
    },
    async close() {
      const exited = new Promise((r) => (child.exitCode === null ? child.once("exit", r) : r()));
      await send("Browser.close").catch(() => child.kill());
      await Promise.race([exited, sleep(5000).then(() => child.kill())]);
      ws.close();
      if (temporary) {
        await sleep(300);
        // Windows may still hold a lock; a leftover temp folder is harmless.
        try { rmSync(profile, { recursive: true, force: true }); } catch {}
      }
    },
  };
  return b;
}

async function main([command, first, second, ...rest]) {
  if (command === "pdf" && first && second) {
    const b = await launch();
    try {
      await b.goto(pathToFileURL(resolve(first)).href);
      await b.pdf(resolve(second));
    } finally {
      await b.close();
    }
    return;
  }
  if (command !== "run" || !first) throw new Error("usage: node browser.mjs run <capture.mjs> | pdf <page.html> <out.pdf>");
  const flags = [second, ...rest].filter(Boolean);
  const flag = (name) => (flags.includes(name) ? flags[flags.indexOf(name) + 1] : undefined);
  const script = (await import(pathToFileURL(resolve(first)).href)).default;
  const out = flag("--out") ?? "frames";
  const b = await launch({ out, profile: flag("--profile"), viewport: flag("--viewport")?.split("x").map(Number) });
  try {
    await script(b);
    console.log(`captured to ${resolve(out)}`);
  } catch (error) {
    await b.shot("_failure", null, 0).catch(() => {});
    console.error(`See ${join(out, "_failure.png")}`);
    throw error;
  } finally {
    if (b.blocked.length) console.error(`BLOCKED writes to other machines: ${[...new Set(b.blocked)].join(", ")}`);
    await b.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
