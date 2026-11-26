// HyperFrames and ffmpeg steps.
//   node video.mjs check <compositionDir>
//   node video.mjs snapshot <compositionDir> <t1,t2,...>
//   node video.mjs render <compositionDir> <out.mp4> [draft|delivery]
//   node video.mjs finalize <out.mp4> [posterSeconds]
import { spawnSync } from "node:child_process";
import { renameSync } from "node:fs";
import { resolve } from "node:path";
import { envWithFfmpeg } from "./lib.mjs";

const HYPERFRAMES = "hyperframes@0.9.97";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
  return result;
}

function hyperframes(dir, args) {
  const env = { ...envWithFfmpeg(), HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" };
  const all = ["-y", HYPERFRAMES, ...args];
  // npx is a .cmd file on Windows, which needs a shell, so quote every argument
  if (process.platform === "win32") {
    if (all.some((a) => /["%]/.test(a))) throw new Error('Paths must not contain " or %');
    run(`npx ${all.map((a) => `"${a}"`).join(" ")}`, [], { cwd: dir, env, shell: true });
  } else {
    run("npx", all, { cwd: dir, env });
  }
}

function finalize(video, posterSeconds = "2.5") {
  const env = envWithFfmpeg();
  const poster = video.replace(/\.mp4$/i, ".jpg");
  const temp = video.replace(/\.mp4$/i, ".final.mp4");
  run("ffmpeg", ["-y", "-loglevel", "error", "-ss", posterSeconds, "-i", video, "-frames:v", "1", "-q:v", "2", poster], { env });
  const probe = run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", video], { env, stdio: "pipe" });
  const audio = String(probe.stdout).trim() !== "";
  // poster becomes frame 0 (the idle thumbnail everywhere); sound is levelled for laptop speakers
  const filters = "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]" + (audio ? ";[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]" : "");
  run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", video, "-i", poster, "-filter_complex", filters, "-map", "[v]",
    ...(audio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
    "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", temp,
  ], { env });
  renameSync(temp, video);
  run("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,width,height", "-of", "compact", video], { env });
  console.log(`${video}\n${poster}`);
}

const [command, first, second, third] = process.argv.slice(2);
try {
  if (command === "check" && first) hyperframes(first, ["check"]);
  else if (command === "snapshot" && second) hyperframes(first, ["snapshot", "--at", second]);
  else if (command === "render" && second) hyperframes(first, ["render", "--quality", third ?? "delivery", "--output", resolve(second)]);
  else if (command === "finalize" && first) finalize(resolve(first), second);
  else throw new Error("usage: node video.mjs check|snapshot|render|finalize ... (see the top of this file)");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
