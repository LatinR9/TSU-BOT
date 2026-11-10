import test from "node:test";
import assert from "node:assert/strict";
import { classifyItem, isLoginUrl, isQuizLike, looksLikeLessonLink, formatClock } from "../src/lms/signals.js";
import { judgeLogin } from "../src/login.js";
import { normalizeSettings, parseLessonUrls } from "../src/settings.js";

test("quiz-like items are always detected", () => {
  assert.equal(classifyItem({ modtype: "quiz", url: "https://x/mod/quiz/view.php?id=1" }), "quiz");
  assert.equal(classifyItem({ url: "https://x/mod/assign/view.php?id=2" }), "quiz");
  assert.equal(classifyItem({ url: "https://x/a", name: "แบบทดสอบหลังเรียน บทที่ 2" }), "quiz");
  assert.equal(classifyItem({ url: "https://x/a", name: "Post-test unit 1" }), "quiz");
  assert.equal(classifyItem({ url: "https://site/course/exam/3" }), "quiz");
  assert.equal(isQuizLike({ name: "ตรวจสอบความเข้าใจเนื้อหา" }), false);
});

test("content items are classified by type, url and name", () => {
  assert.equal(classifyItem({ modtype: "hvp", url: "https://x/mod/hvp/view.php?id=1" }), "video");
  assert.equal(classifyItem({ url: "https://www.youtube.com/watch?v=abc" }), "video");
  assert.equal(classifyItem({ url: "https://x/file.pdf" }), "document");
  assert.equal(classifyItem({ modtype: "resource", url: "https://x/mod/resource/view.php?id=4" }), "document");
  assert.equal(classifyItem({ modtype: "forum", url: "https://x/mod/forum/view.php?id=4" }), "skip");
  assert.equal(classifyItem({ modtype: "page", url: "https://x/mod/page/view.php?id=4", name: "บทที่ 1" }), "unknown");
});

test("login urls", () => {
  assert.ok(isLoginUrl("https://lms/login/index.php"));
  assert.ok(isLoginUrl("https://login.microsoftonline.com/common/oauth2"));
  assert.ok(!isLoginUrl("https://lms/login/logout.php?sesskey=1"));
  assert.ok(!isLoginUrl("https://lms/course/view.php?id=1"));
});

test("login verdict needs evidence", () => {
  const base = { moodle: false, moodleGuest: false, passwordField: false, logoutLink: false, userMenu: false, href: "https://a/home" };
  assert.equal(judgeLogin({ ...base }, { sawLoginForm: false }).ok, false);
  assert.equal(judgeLogin({ ...base }, { sawLoginForm: true }).ok, true);
  assert.equal(judgeLogin({ ...base, passwordField: true, logoutLink: true }, { sawLoginForm: true }).ok, false);
  assert.equal(judgeLogin({ ...base, logoutLink: true }, { sawLoginForm: false }).strong, true);
  assert.equal(judgeLogin({ ...base, moodle: true, moodleGuest: true }, { sawLoginForm: true }).ok, false);
});

test("generic lesson link filter", () => {
  assert.ok(looksLikeLessonLink({ url: "https://a/x", name: "บทที่ 3 การเขียนโปรแกรม" }));
  assert.ok(looksLikeLessonLink({ url: "https://a/files/week1.pdf", name: "ดาวน์โหลด" }));
  assert.ok(!looksLikeLessonLink({ url: "https://a/about", name: "เกี่ยวกับเรา" }));
});

test("settings are normalized and never contain credentials", () => {
  const s = normalizeSettings({ courseUrl: " https://a/c ", playbackRate: 9, password: "x", username: "u" });
  assert.equal(s.courseUrl, "https://a/c");
  assert.equal(s.playbackRate, 2);
  assert.equal("password" in s, false);
  assert.equal("username" in s, false);
  assert.deepEqual(parseLessonUrls("https://a/1\n\n  https://a/2 \nnot-a-url"), ["https://a/1", "https://a/2"]);
  assert.equal(formatClock(3725), "1:02:05");
});
