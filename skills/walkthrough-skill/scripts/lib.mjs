// Shared lookups and safety guards. CLI: node lib.mjs check-url <url>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const win = process.platform === "win32";

/** True only for URLs that point at this machine. Covers http, ws and database URLs. */
export function isLocalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // libpq lets ?host= override the authority, so a "localhost" URL could still be remote.
  if (["host", "hostaddr"].some((key) => url.searchParams.has(key))) return false;
  const host = url.hostname.toLowerCase();
  return LOCAL_HOSTS.has(host) || host.endsWith(".localhost") || /^127\.\d+\.\d+\.\d+$/.test(host);
}

const works = (command) => spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0;

/** Folder to add to PATH so ffmpeg and ffprobe resolve, "" when already on PATH, null when missing. */
export function findFfmpegDir() {
  if (works("ffmpeg") && works("ffprobe")) return "";
  const candidates = ["/opt/homebrew/bin", "/usr/local/bin", "C:\\ffmpeg\\bin", "C:\\ProgramData\\chocolatey\\bin"];
  // winget does not update PATH for shells that are already open
  const packages = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (win && existsSync(packages)) {
    for (const pkg of readdirSync(packages).filter((name) => name.startsWith("Gyan.FFmpeg"))) {
      for (const build of readdirSync(join(packages, pkg))) candidates.push(join(packages, pkg, build, "bin"));
    }
  }
  return candidates.find((dir) => existsSync(join(dir, win ? "ffmpeg.exe" : "ffmpeg"))) ?? null;
}

export function envWithFfmpeg() {
  const dir = findFfmpegDir();
  if (dir === null) throw new Error("ffmpeg not found. Run doctor.mjs for install steps.");
  // Windows calls the variable "Path"; writing a second "PATH" key would be ignored.
  const key = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  return dir ? { ...process.env, [key]: `${dir}${delimiter}${process.env[key]}` } : { ...process.env };
}

export function findBrowser() {
  if (process.env.WALKTHROUGH_BROWSER) return process.env.WALKTHROUGH_BROWSER;
  const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  const paths = win
    ? roots.flatMap((root) => [
        join(root, "Google", "Chrome", "Application", "chrome.exe"),
        join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      ])
    : [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/microsoft-edge",
        "/snap/bin/chromium",
      ];
  return paths.find((p) => existsSync(p)) ?? null;
}

/** The sound folder of the installed brag plugin, or null. */
export function findBragAssets() {
  const config = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  try {
    const { plugins } = JSON.parse(readFileSync(join(config, "plugins", "installed_plugins.json"), "utf8"));
    const installs = Object.entries(plugins)
      .filter(([name]) => name.startsWith("brag@"))
      .flatMap(([, list]) => list);
    return (
      installs
        .map((i) => join(i.installPath, "skills", "brag", "assets"))
        .find((dir) => existsSync(join(dir, "music"))) ?? null
    );
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, value] = process.argv.slice(2);
  if (command !== "check-url" || !value) {
    console.error("usage: node lib.mjs check-url <url>");
    process.exit(2);
  }
  const local = isLocalUrl(value);
  // never echo the URL: database URLs carry passwords
  console.log(local ? "local: ok" : "NOT local: refuse to use this URL");
  process.exit(local ? 0 : 1);
}
