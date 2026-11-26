// storyboard.json + captured frames -> a HyperFrames composition.
//   node build.mjs <storyboard.json> --frames <dir> --out <compositionDir>
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findBragAssets } from "./lib.mjs";

const MAX_CAPTION = 70;
const f = (n) => Number(n.toFixed(3));
const escape = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/\n/g, "<br>");
const words = (...texts) => texts.flat().filter(Boolean).join(" ").split(/\s+/).filter(Boolean).length;
const reading = (...texts) => 0.5 + 0.3 * words(...texts);

/** Seconds a scene needs so a viewer can read it. */
export function defaultDuration(scene) {
  const boxes = (scene.boxes ?? []).flatMap((b) => [b.label, b.value, b.note]);
  const by = {
    title: () => Math.max(3.5, reading(scene.heading, scene.sub)),
    example: () => Math.max(5, 1.4 * boxes.length / 3 + reading(scene.heading, boxes) * 0.8),
    chapter: () => Math.max(2, reading(scene.title)),
    shot: () => Math.max(scene.click ? 2.4 : 3, reading(scene.caption)),
    list: () => Math.max(5, (scene.items ?? []).reduce((sum, item) => sum + 0.9 + 0.22 * words(item), 1)),
    end: () => Math.max(3.2, reading(scene.heading, scene.sub)),
  };
  if (!by[scene.type]) throw new Error(`Unknown scene type "${scene.type}"`);
  return f(by[scene.type]());
}

/** Mixes a #rrggbb colour towards black (amount < 0) or white (amount > 0). */
const mix = (hex, amount) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`brand colours must look like #a37933, got "${hex}"`);
  const to = amount < 0 ? 0 : 255;
  return "#" + [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (to - v) * Math.abs(amount)).toString(16).padStart(2, "0");
  }).join("");
};

export function build(storyboardPath, framesDir, outDir) {
  const story = JSON.parse(readFileSync(storyboardPath, "utf8"));
  const base = dirname(resolve(storyboardPath));
  const brand = story.brand ?? {};
  const primary = brand.primary ?? "#3554d1";
  const dark = brand.dark ?? mix(primary, -0.25);
  const ground = brand.ground ?? mix(primary, 0.93);
  const maxSeconds = story.maxSeconds ?? 120;
  const assets = join(outDir, "assets");
  for (const dir of ["frames", "sfx", "fonts"]) mkdirSync(join(assets, dir), { recursive: true });
  const warnings = [];

  const copyBrand = (file, name) => {
    if (!file) return null;
    const target = `assets/${name}${extname(file)}`;
    copyFileSync(resolve(base, file), join(outDir, target));
    return target;
  };
  const logo = copyBrand(brand.logo, "logo");
  const font = copyBrand(brand.fontFile, "fonts/brand");

  const durations = story.scenes.map((scene) => {
    const needed = defaultDuration(scene);
    if (scene.dur && scene.dur < needed - 0.8) warnings.push(`${scene.type} "${scene.caption ?? scene.title ?? scene.heading}": ${scene.dur}s is short to read (about ${needed}s)`);
    return scene.dur ?? needed;
  });
  const total = f(durations.reduce((a, b) => a + b, 0));
  if (total > maxSeconds) throw new Error(`Video is ${total}s, over the ${maxSeconds}s limit. Cut scenes or shorten captions.`);

  // sound is optional: without the brag plugin the video is silent
  const brag = story.sound === false ? null : findBragAssets();
  if (story.sound !== false && !brag) warnings.push("brag plugin not found: rendering silent");
  const library = {
    click: "sfx/ui/mouseclick1.ogg",
    drop: "sfx/interface/drop_001.ogg",
    bell: "sfx/impact/impactBell_heavy_000.ogg",
    key1: "sfx/keyboard/keypress-001.wav",
    key2: "sfx/keyboard/keypress-007.wav",
    key3: "sfx/keyboard/keypress-012.wav",
  };

  const images = [];
  const clips = [];
  const tweens = [];
  const sounds = [];
  const lanes = [];
  const used = new Set();
  const sound = (name, at, volume, length) => {
    if (!brag) return;
    if (!library[name]) throw new Error(`Unknown sound "${name}"`);
    used.add(name);
    let lane = lanes.findIndex((end) => end <= at);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = at + length;
    sounds.push(`<audio id="sfx${sounds.length + 1}" class="clip" data-start="${f(at)}" data-duration="${length}" data-track-index="${11 + lane}" data-volume="${volume}" src="assets/sfx/${name}${extname(library[name])}"></audio>`);
  };
  const rise = (selector, at) => tweens.push(`tl.fromTo("${selector}", {opacity:0, y:20}, {opacity:1, y:0, duration:0.45, ease:"power3.out"}, ${f(at)});`);
  const card = (id, start, dur, inner, extra = "") => {
    clips.push(`<div id="${id}" class="clip card ${extra}" data-start="${f(start)}" data-duration="${f(dur)}" data-track-index="3"><div class="in">${inner}</div></div>`);
    rise(`#${id} .in`, start + 0.05);
    tweens.push(`tl.to("#${id} .in", {opacity:0, duration:0.25}, ${f(start + dur - 0.28)});`);
  };
  const logoTag = logo ? `<img class="logo" src="${logo}" alt="">` : "";

  const shots = [];
  let t = 0;
  let chapter = 0;
  story.scenes.forEach((scene, i) => {
    const id = `s${i}`;
    const dur = durations[i];
    const heading = scene.heading ? escape(scene.heading) : "";
    const sub = scene.sub ? `<p>${escape(scene.sub)}</p>` : "";
    if (scene.type === "title" || scene.type === "end") {
      card(id, t, dur, `${logoTag}<h1>${heading}</h1>${sub}`, "dark");
      if (scene.type === "end") sound("bell", t + 0.1, 0.45, 1.5);
    } else if (scene.type === "chapter") {
      card(id, t, dur, `<div class="num">${++chapter}</div><h1>${escape(scene.title)}</h1>`);
      sound("drop", t + 0.1, 0.4, 0.11);
    } else if (scene.type === "example") {
      const boxes = scene.boxes.map((box, n) => `<div class="box ${n === scene.boxes.length - 1 ? "win" : ""}" id="${id}b${n}"><span>${escape(box.label)}</span><b>${escape(box.value)}</b><span>${escape(box.note ?? "")}</span></div>`);
      card(id, t, dur, `<h2>${heading}</h2><div class="row">${boxes.join("")}</div>`);
      boxes.forEach((_, n) => rise(`#${id}b${n}`, t + 0.4 + (n * (dur * 0.5)) / boxes.length));
    } else if (scene.type === "list") {
      card(id, t, dur, `<h2>${heading}</h2><ul>${scene.items.map((item, n) => `<li id="${id}i${n}">${escape(item)}</li>`).join("")}</ul>`);
      scene.items.forEach((_, n) => rise(`#${id}i${n}`, t + 0.4 + (n * (dur * 0.55)) / scene.items.length));
    } else {
      if (!scene.caption || scene.caption.length > MAX_CAPTION) throw new Error(`Shot "${scene.frame}" needs a caption of 1 to ${MAX_CAPTION} characters`);
      shots.push({ ...scene, id, start: t, dur });
    }
    t = f(t + dur);
  });

  let W = 1440;
  let H = 810;
  let K = 1;
  let viewport;
  let cursor = null;
  shots.forEach((s, n) => {
    const meta = JSON.parse(readFileSync(join(framesDir, `${s.frame}.json`), "utf8"));
    if (!viewport) {
      viewport = meta.viewport;
      K = Math.min(1440 / viewport[0], 810 / viewport[1]);
      [W, H] = [Math.round(viewport[0] * K), Math.round(viewport[1] * K)];
    } else if (String(viewport) !== String(meta.viewport)) {
      throw new Error(`Frame "${s.frame}" has a different viewport. Capture all frames at one size.`);
    }
    cursor ??= { x: W * 0.55, y: H * 0.7 };
    copyFileSync(join(framesDir, `${s.frame}.png`), join(assets, "frames", `${s.frame}.png`));

    const near = (other) => other && Math.abs(other.start - (s.start + s.dur)) < 0.01;
    const next = shots[n + 1];
    const joins = near(next);
    const first = n === 0 || Math.abs(shots[n - 1].start + shots[n - 1].dur - s.start) > 0.01;
    images.push(`<img id="${s.id}" class="clip shot" data-start="${f(s.start)}" data-duration="${f(s.dur + (joins ? 0.3 : 0))}" data-track-index="${n % 2}" style="z-index:${n + 1}" src="assets/frames/${s.frame}.png" alt="">`);
    if (!first) tweens.push(`tl.fromTo("#${s.id}", {opacity:0}, {opacity:1, duration:0.25}, ${f(s.start)});`);

    // camera: the given focus, else a gentle zoom on the target, else the whole screen
    const rect = meta.rect;
    const [fx, fy, zoom] = s.focus ?? (rect ? [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2, 1.3] : [viewport[0] / 2, viewport[1] / 2, 1]);
    const clamp = (v, min) => Math.min(0, Math.max(min, v));
    const camera = JSON.stringify({ scale: zoom, x: f(clamp(W / 2 - fx * K * zoom, W - W * zoom)), y: f(clamp(H / 2 - fy * K * zoom, H - H * zoom)) });
    tweens.push(first ? `tl.set("#cam", ${camera}, ${f(s.start)});` : `tl.to("#cam", {...${camera}, duration:0.9, ease:"power2.inOut"}, ${f(s.start + 0.05)});`);

    clips.push(`<div id="${s.id}c" class="clip caption" data-start="${f(s.start)}" data-duration="${f(s.dur)}" data-track-index="2"><div class="pill">${escape(s.caption)}</div></div>`);
    rise(`#${s.id}c .pill`, s.start + 0.1);
    if (s.typing) [0.15, 0.27, 0.41].forEach((d, k) => sound(`key${k + 1}`, s.start + d, 0.35, 0.06));
    if (s.sound) sound(s.sound, s.start + 0.15, 0.4, 1.5);

    if (s.click) {
      if (!rect) throw new Error(`Shot "${s.frame}" says click but was captured without a target`);
      const [x, y, w, h] = rect;
      // wide targets: aim near the left, where the label usually is
      const to = { x: f((x + Math.min(w / 2, 90)) * K), y: f((y + h / 2) * K) };
      const move = s.start + s.dur - 1.35;
      const hit = s.start + s.dur - 0.3;
      if (first) tweens.push(`tl.set("#cursor", {x:${f(cursor.x)}, y:${f(cursor.y)}}, ${f(s.start)});`);
      tweens.push(`tl.to("#cursor", {opacity:1, duration:0.2}, ${f(move - 0.2)});`);
      tweens.push(`tl.to("#cursor", {x:${to.x}, y:${to.y}, duration:0.85, ease:"power2.inOut"}, ${f(move)});`);
      tweens.push(`tl.fromTo("#ring", {x:${to.x}, y:${to.y}, scale:0.3, opacity:0.9}, {scale:1.6, opacity:0, duration:0.4, immediateRender:false}, ${f(hit)});`);
      sound("click", hit, 0.7, 0.06);
      cursor = to;
    }
    if (!joins || !next.click) tweens.push(`tl.to("#cursor", {opacity:0, duration:0.15}, ${f(s.start + s.dur - 0.05)});`);
  });

  for (const name of used) copyFileSync(join(brag, library[name]), join(assets, "sfx", `${name}${extname(library[name])}`));
  let music = "";
  if (brag) {
    // the steady track, or the longest one when the video outlasts it
    const track = total <= 117 ? 12 : 1;
    if (total > 164) warnings.push("video is longer than every music track: the end is silent");
    copyFileSync(join(brag, "music", `happy-beats-business-moves-vol-${track}-by-ende-dot-app.mp3`), join(assets, "music.mp3"));
    music = `<audio id="music" class="clip" data-start="0" data-duration="${total}" data-track-index="10" data-volume="0.22" data-fade-in="1" data-fade-out="3" src="assets/music.mp3"></audio>`;
    warnings.push("music licence (ende.app tracks shipped with brag) is not verified: confirm before sharing outside your company");
  }

  const family = font ? `"Brand", sans-serif` : `"Inter", sans-serif`;
  const html = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1920, height=1080">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>
  ${font ? `@font-face { font-family: "Brand"; src: url("${font}"); font-weight: 200 800; }` : ""}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; background: ${ground}; }
  #root { position: relative; width: 100%; height: 100%; font-family: ${family}; color: #1f1f1f; }
  #window { position: absolute; left: ${(1920 - W) / 2}px; top: ${66 + (810 - H) / 2}px; width: ${W}px; height: ${H}px; overflow: hidden; border-radius: 18px; background: #fff; border: 2px solid ${mix(primary, 0.75)}; box-shadow: 0 18px 60px rgba(0,0,0,0.16); }
  #cam { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 0 0; }
  .shot { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
  #cursor { position: absolute; left: 0; top: 0; width: 34px; height: 34px; z-index: 1000; opacity: 0; }
  #cursor svg { position: absolute; left: -5px; top: -3px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); }
  #ring { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 999; opacity: 0; }
  #ring::after { content: ""; position: absolute; left: -26px; top: -26px; width: 52px; height: 52px; border-radius: 50%; border: 4px solid ${primary}; }
  .caption { position: absolute; left: 96px; right: 96px; top: 900px; height: 80px; display: flex; justify-content: center; align-items: center; z-index: 10; }
  .pill { background: ${dark}; color: #fff; font-size: 38px; font-weight: 600; padding: 14px 36px; border-radius: 50px; white-space: nowrap; }
  .card { position: absolute; inset: 0; background: ${ground}; z-index: 20; }
  .card .in { position: absolute; inset: 108px 192px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 36px; }
  .card h1 { font-size: 82px; font-weight: 800; line-height: 1.15; }
  .card h2 { font-size: 58px; font-weight: 700; }
  .card p { font-size: 40px; }
  .dark { background: ${dark}; color: #fff; }
  .logo { max-height: 160px; max-width: 640px; min-height: 90px; background: #fff; padding: 22px 36px; border-radius: 20px; }
  .num { width: 140px; height: 140px; border-radius: 50%; background: ${dark}; color: #fff; font-size: 70px; font-weight: 800; display: grid; place-items: center; }
  .row { display: flex; gap: 36px; }
  .box { width: 480px; background: #fff; border: 2px solid ${mix(primary, 0.75)}; border-radius: 24px; padding: 48px 20px; display: flex; flex-direction: column; gap: 20px; font-size: 32px; }
  .box b { font-size: 50px; font-weight: 800; }
  .box.win { background: ${dark}; color: #fff; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 26px; }
  li { font-size: 40px; font-weight: 600; background: #fff; border-left: 10px solid ${primary}; border-radius: 14px; padding: 24px 40px; text-align: left; width: 1300px; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080">
<div id="window"><div id="cam" data-layout-allow-overflow>
${images.join("\n")}
<div id="ring" data-layout-ignore></div>
<div id="cursor" data-layout-ignore><svg width="34" height="34" viewBox="0 0 24 24"><path d="M5 2l14 11h-8l-4 8z" fill="#1f1f1f" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></div>
</div></div>
${clips.join("\n")}
${music}
${sounds.join("\n")}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${tweens.join("\n")}
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`;
  writeFileSync(join(outDir, "index.html"), html);
  return { total, shots: shots.length, warnings, html };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const [story, frames, out] = [args[0], flag("--frames"), flag("--out")];
  if (!story || !frames || !out) {
    console.error("usage: node build.mjs <storyboard.json> --frames <dir> --out <compositionDir>");
    process.exit(2);
  }
  try {
    const result = build(story, frames, out);
    result.warnings.forEach((w) => console.log(`warning: ${w}`));
    console.log(`${join(out, "index.html")}: ${result.total}s, ${result.shots} shots`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
