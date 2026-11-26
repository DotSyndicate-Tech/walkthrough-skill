---
name: walkthrough-video
description: Make a captioned walkthrough video of a new feature or change in a web app, recorded from the real app running locally. Use when the user asks for a walkthrough, tutorial, how-to or release video of something in their project, or types /walkthrough-video.
---

# Walkthrough video

Turn a feature or change into a 1920x1080 video that teaches someone to use it: title, worked example, real screens with a moving cursor and captions, rules, end card. Optionally a short PDF guide from the same screenshots.

`<skill>` below is the folder holding this file. Run its scripts with `node "<skill>/scripts/<name>.mjs"`.

## Safety rules

These hold even when the user is in a hurry.

- **Record only an app running on this machine.** The recorder refuses other addresses and blocks writes to other machines.
- **Use throwaway data.** Never record against a shared, staging or production database. Before any data step run `node "<skill>/scripts/lib.mjs" check-url "<database url>"` and stop if it says NOT local. Pass the URL from an environment variable so the password is never printed.
- **Leave the user's own setup alone.** Start separate app instances on spare ports. Do not restart, stop or reconfigure their running servers, and do not write to their working database.
- **Disable outbound effects** in the instances you start: email, SMS, push, payments, webhooks, queues, third-party APIs and cloud storage writes. Check the app's configuration for each one. If one cannot be disabled, ask before continuing.
- **Never save or print passwords.** Settings files hold the names of environment variables only. Create a demo login inside the throwaway data.
- **Delete what you created** (temporary database, processes, browser profile), and only that.
- **Report honestly.** Say what was exercised, what was only shown, and what was faked or trimmed for the camera.

## 1. Check the machine

Run `doctor.mjs`. If a required item is missing, show the install command and ask before installing. The first render downloads HyperFrames through npm.

## 2. Interview

Read `.walkthrough/project.json` in the project if it exists. Interview the user with AskUserQuestion on **every** run; saved values become the first, recommended option. Ask in rounds, only what can be answered now. Each question carries a short real example and each option says what the viewer sees and what it costs. Look facts up yourself instead of asking.

Cover:

1. What to show: feature name, branch, commits or pull request.
2. Audience (end users, client staff, developers, buyers) and language.
3. Length. Default about 60 to 120 seconds for teaching.
4. Scenes, proposed from your research, including what to leave out.
5. Look: brand colour, logo, font, taken from the project's theme files.
6. Sound: brag plugin music and clicks, or silent. State that the music licence is unverified.
7. Data: copy of the local database or a fresh seed.
8. PDF guide as well, or video only.

End with a one-paragraph summary and wait for a yes.

Then save `.walkthrough/project.json`: brand colours and logo path, how to start each app, the ports and environment overrides you used, the login route, the *names* of secret variables, and the answers to 2, 3, 6 and 8. No passwords, tokens or connection strings.

## 3. Research the feature

Read the diff, docs and UI source. Take button and field names exactly from the code. Note the rules a viewer must know (timing, limits, what is irreversible). Never invent behaviour; ask when the code and docs disagree.

## 4. Storyboard (first stop)

Show a table: scene, what is on screen, caption, seconds. **Wait for approval.**

Captions: one action each, up to 70 characters, in the viewer's words. Shape: title, a worked example with real numbers, then per task a chapter card and its steps, a "remember" list, an end card.

## 5. Prepare the app and data

Follow the project's own setup docs. Create a temporary database (copy or migrate and seed), apply the overrides that disable outbound effects, and start the API and web app on spare ports. Add the demo records each scene needs, with invented names. Make dates and amounts tell a consistent story, and check that earlier scenes leave the data the later ones expect.

## 6. Capture

Work in `walkthrough-output/<feature>/`. Write `capture.mjs` and run it:

```
node "<skill>/scripts/browser.mjs" run capture.mjs --out frames --profile .browser
```

```js
export default async (b) => {
  await b.goto("http://localhost:3001/login");
  await b.fill("#email", "demo@example.com");
  await b.fill("#password", process.env.DEMO_PASSWORD);
  await b.click("button[type=submit]");
  await b.goto("http://localhost:3001/customers");
  await b.act("c1", { css: "button", text: "Add customer" }); // screenshot, then click
  await b.shot("c2");                                          // screenshot only
};
```

| Call | Use |
| --- | --- |
| `goto(url)` | open a local page |
| `act(id, target)` | screenshot and remember the target, then click it |
| `shot(id, target?)` | screenshot, optionally remembering where to zoom or click |
| `click`, `fill(target, value)`, `hover` | act without a screenshot |
| `wheel(target, deltaY)` | scroll a dropdown or virtual list before clicking inside it |
| `css(rules)` | hide irrelevant parts of the page (disclose this) |
| `js(expression)`, `waitFor(target)`, `sleep(ms)` | anything else |

A target is a CSS selector, `{ css, text, nth }`, or `{ js }`. Capture the state *before* each click, so the video can move the cursor there. For typing, capture the empty field, fill it, then capture the next step.

**Look at every frame** before building. Check for: leftover toasts or tooltips, wrong or personal data, cut-off dialogs, a failed save. On failure read `frames/_failure.png`. A "BLOCKED writes" message means the app calls a remote service: fix the configuration, do not work around the guard.

## 7. Build, check, preview (second stop)

Write `storyboard.json` (full format: `references/storyboard.md`), then:

```
node "<skill>/scripts/build.mjs" storyboard.json --frames frames --out composition
node "<skill>/scripts/video.mjs" check composition
node "<skill>/scripts/video.mjs" snapshot composition 2,8,14,20,30
```

Fix every check error. Layout-structure warnings are expected from this template. Read the snapshot sheets, covering at least one moment in each scene: captions readable, zoom keeps dialog titles and the clicked control visible, cursor on its target. Adjust `focus` or `dur` and rebuild. Show the user sample frames and **wait for approval**.

## 8. Render and deliver

```
node "<skill>/scripts/video.mjs" render composition video.mp4
node "<skill>/scripts/video.mjs" finalize video.mp4 2.5
```

A two-minute video takes about six minutes to render: run it in the background. `finalize` writes `video.jpg`, makes it the first frame and levels the sound. Extract a few frames from the finished file and look at them. Write `share-copy.txt` (one to three sentences). Say that you cannot hear the audio.

For a PDF guide, write `guide.html` from the same frames (A4 pages with `@page { size: A4; margin: 0 }`, brand colours, short numbered steps, four pages or fewer), run `browser.mjs pdf guide.html guide.pdf`, and read the PDF back.

## 9. Clean up and report

Stop the processes you started, drop the temporary database, delete `.browser`. Confirm the user's own servers still run. Tell them: file paths and length, what was exercised for real, what was not tested, data that was invented, parts hidden for the camera, bugs noticed, and the music licence caveat. Suggest keeping `walkthrough-output/` out of git.
