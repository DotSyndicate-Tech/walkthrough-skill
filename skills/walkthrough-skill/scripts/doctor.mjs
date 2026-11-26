// Reports what this machine is missing. Installs nothing.
import { findBragAssets, findBrowser, findFfmpegDir } from "./lib.mjs";

const hint = (windows, mac, linux) =>
  ({ win32: windows, darwin: mac })[process.platform] ?? linux;
const checks = [
  ["Node 22 or newer", Number(process.versions.node.split(".")[0]) >= 22, "Install from https://nodejs.org"],
  ["ffmpeg and ffprobe", findFfmpegDir() !== null, hint("winget install -e --id Gyan.FFmpeg", "brew install ffmpeg", "sudo apt install ffmpeg")],
  ["Chrome, Edge or Chromium", findBrowser() !== null, "Install Google Chrome, or set WALKTHROUGH_BROWSER to the executable path"],
  ["brag plugin sounds (optional)", findBragAssets() !== null, "Without it the video is silent. In Claude Code: /plugin marketplace add latent-spaces/brag, then /plugin install brag@brag"],
];
for (const [name, ok, fix] of checks) console.log(`${ok ? "ok     " : "MISSING"} ${name}${ok ? "" : `\n        ${fix}`}`);
process.exit(checks.slice(0, 3).every(([, ok]) => ok) ? 0 : 1);
