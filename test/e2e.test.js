/**
 * End-to-end: real runtime + shared browser (headless Chromium) against the mock LMS.
 * Needs ffmpeg to generate a short test clip; skipped otherwise.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startMockLms } from "./fixtures/mock-lms.js";
import { runJob } from "../src/runtime.js";
import { getWorkingPage, closeSharedBrowser } from "../src/shared-browser.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mediaDir = path.join(here, "fixtures", "media");
const clip = path.join(mediaDir, "clip.webm");

function ensureClip() {
  if (fs.existsSync(clip)) return true;
  fs.mkdirSync(mediaDir, { recursive: true });
  const r = spawnSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc=duration=3:size=320x180:rate=15",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-c:v", "libvpx", "-b:v", "200k", "-c:a", "libvorbis", "-shortest", clip,
  ]);
  return r.status === 0 && fs.existsSync(clip);
}

const hasClip = ensureClip();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "study-bot-"));
const common = {
  profileDir: path.join(tmp, "profile"),
  downloadDir: path.join(tmp, "downloads"),
  resourcesPath: path.join(here, ".."),
  headless: true,
};
const baseSettings = { browserChannel: "chromium", docReadSeconds: 3, maxVideoMinutes: 2 };

function collector() {
  const lines = [];
  return { lines, onLog: (level, message) => lines.push(`[${level}] ${message}`) };
}

test("moodle flow: manual login, videos, documents, quizzes skipped", { skip: !hasClip, timeout: 240_000 }, async (t) => {
  const lms = await startMockLms({ videoFile: clip });
  t.after(async () => {
    await closeSharedBrowser(() => {});
    await lms.close();
  });
  const settings = { ...baseSettings, courseUrl: `${lms.origin}/course/view.php?id=1` };

  // Login: the "user" types credentials into the shared window while the bot waits.
  const log1 = collector();
  const loginJob = runJob({ ...common, settings, mode: "login", onLog: log1.onLog });
  let page = null;
  for (let i = 0; i < 50 && !page; i++) {
    await new Promise((r) => setTimeout(r, 200));
    page = getWorkingPage();
  }
  await page.waitForSelector('input[type="password"]');
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(!log1.lines.some((l) => l.startsWith("[ok]")), "must not report success before login");
  await page.fill('input[name="username"]', "student");
  await page.fill('input[type="password"]', "secret");
  await page.click("#loginbtn");
  const login = await loginJob;
  assert.equal(login.ok, true, log1.lines.join("\n"));
  assert.equal(login.strong, true);
  assert.ok(!page.isClosed(), "window stays open after login");

  // Everything in order, in the same window.
  const log2 = collector();
  const all = await runJob({ ...common, settings, mode: "all", onLog: log2.onLog });
  const text = log2.lines.join("\n");
  assert.equal(all.ok, true, text);
  assert.equal(getWorkingPage(), page, "same window reused");

  assert.ok(!lms.hits.some((h) => h.startsWith("/mod/quiz/")), "quiz never opened");
  assert.ok(!lms.hits.some((h) => h.startsWith("/mod/assign/")), "assignment never opened");
  assert.ok(!lms.hits.some((h) => h.startsWith("/mod/forum/")), "forum skipped");
  assert.ok(!lms.hits.includes("/mod/page/view.php?id=8"), "completed item skipped");
  assert.ok(lms.hits.includes("/mod/book/view.php?id=5&chapterid=3"), "book read to the last chapter");
  assert.match(text, /วิดีโอ 1: ดูจบแล้ว/);
  assert.match(text, /\(ในกรอบ embed\)/);
  // page video (1), iframe embed (3), workaround link (10)
  assert.equal(all.summary.video, 3, text);
  // resource (4), book (5), download (9)
  assert.equal(all.summary.document, 3, text);
  assert.ok(fs.existsSync(path.join(common.downloadDir, "slides.pptx")), "download saved");

  // Video-only mode skips documents without opening them.
  lms.hits.length = 0;
  const log3 = collector();
  const vids = await runJob({ ...common, settings, mode: "videos", onLog: log3.onLog });
  assert.equal(vids.summary.video, 3, log3.lines.join("\n"));
  assert.ok(!lms.hits.some((h) => h.startsWith("/mod/resource/") || h.startsWith("/mod/book/")));

  // Document-only mode skips the videos.
  const log4 = collector();
  const docs = await runJob({ ...common, settings, mode: "documents", onLog: log4.onLog });
  assert.equal(docs.summary.video, 0);
  assert.equal(docs.summary.document, 3, log4.lines.join("\n"));
});

test("generic fallback: non-Moodle site", { skip: !hasClip, timeout: 120_000 }, async (t) => {
  const lms = await startMockLms({ videoFile: clip });
  t.after(async () => {
    await closeSharedBrowser(() => {});
    await lms.close();
  });
  const settings = { ...baseSettings, courseUrl: `${lms.origin}/generic/course` };
  const log = collector();
  const r = await runJob({ ...common, settings, mode: "all", onLog: log.onLog });
  const text = log.lines.join("\n");
  assert.equal(r.ok, true, text);
  assert.equal(r.platform, "generic");
  assert.match(text, /ไม่ใช่ Moodle/);
  assert.equal(r.summary.video, 1, text);
  assert.equal(r.summary.document, 1, text);
  assert.ok(!lms.hits.includes("/generic/quiz/1"), "quiz link not opened");
  assert.ok(!lms.hits.includes("/generic/profile") && !lms.hits.includes("/generic/random"));
});
