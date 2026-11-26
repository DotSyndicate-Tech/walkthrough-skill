# walkthrough-video

A Claude Code plugin that turns a new feature or change in a web app into a captioned walkthrough video, recorded from the real app running on your machine.

## Install

From a local copy:

```
/plugin marketplace add D:/walkthrough-video
/plugin install walkthrough-video@walkthrough-video
```

After the repository is on GitHub, use `/plugin marketplace add <owner>/<repo>` instead. Then restart the session or run `/reload-plugins`.

## Use

In a project, ask for it or type the command:

```
/walkthrough-video the new bulk import
/walkthrough-video the last 3 commits
```

Claude interviews you, shows a storyboard, records the app with throwaway data, shows sample frames, then renders the video. It stops for your approval at the storyboard and at the frames.

## Requirements

Windows, macOS or Linux with Node 22+, ffmpeg and Chrome, Edge or Chromium. Check with:

```
node skills/walkthrough-video/scripts/doctor.mjs
```

[HyperFrames](https://github.com/heygen-com/hyperframes) is downloaded through npm at a pinned version, with telemetry off. The page template loads GSAP from jsDelivr, so rendering needs a network connection.

## Sound and licensing

Music and effects are read from the [brag](https://github.com/latent-spaces/brag) plugin if it is installed. Nothing is bundled here. Its effects are published as CC0. **The licence of its music tracks has not been verified**: confirm it before sending a video outside your company, or set `"sound": false`.

## Develop

```
node --test skills/walkthrough-video/scripts/test.mjs
node example/run.mjs
```

The second command serves a one-page demo app, records it and renders a short video into `example/output/`.
