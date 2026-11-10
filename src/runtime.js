/**
 * Job runner used by the Electron GUI.
 * Modes: "login" | "videos" | "documents" | "all". Every mode reuses the shared window.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "./logger.js";
import { getSharedBrowser } from "./shared-browser.js";
import { runLogin } from "./login.js";
import { normalizeSettings, parseLessonUrls, assertValidUrl } from "./settings.js";
import { collectLessons } from "./lms/collect.js";
import { isLoginUrl, isQuizLike } from "./lms/signals.js";
import { waitForVideos, playAllVideos } from "./lms/video.js";
import { readDocument } from "./lms/document.js";
import { sleep, throwIfAborted } from "./util.js";

const MODE_LABELS = {
  videos: "เล่นวิดีโอบทเรียน",
  documents: "เปิดเอกสารบทเรียน",
  all: "ทำทั้งหมดตามลำดับ (วิดีโอ + เอกสาร)",
};

function safeFileName(name) {
  return String(name || "file").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 150);
}

/** Navigate the shared page; a URL that turns out to be a file download is saved instead. */
export function createOpener(page, { logger, downloadDir }) {
  let downloads = 0;
  const onDownload = async (download) => {
    downloads += 1;
    const name = safeFileName(download.suggestedFilename());
    try {
      if (downloadDir) {
        fs.mkdirSync(downloadDir, { recursive: true });
        const file = path.join(downloadDir, name);
        await download.saveAs(file);
        logger.info(`  ไฟล์นี้เปิดในเบราว์เซอร์ไม่ได้ — ดาวน์โหลดเก็บไว้ที่ ${file}`);
      } else {
        logger.info(`  ไฟล์นี้เป็นไฟล์ดาวน์โหลด (${name})`);
      }
    } catch (err) {
      logger.warn(`  บันทึกไฟล์ดาวน์โหลดไม่สำเร็จ: ${err.message}`);
    }
  };
  page.on("download", onDownload);

  async function open(url) {
    const before = downloads;
    let error = null;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    } catch (err) {
      error = err;
    }
    if (error && /download/i.test(error.message)) {
      await page.waitForEvent("download", { timeout: 3000 }).catch(() => {});
    }
    if (downloads > before) return { ok: true, download: true };
    if (error) return { ok: false, error: error.message.split("\n")[0] };
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    return { ok: true };
  }
  open.dispose = () => page.off("download", onDownload);
  return open;
}

async function followMoodleWorkaround(page, open) {
  const href = await page
    .evaluate(() => {
      const a = document.querySelector(".urlworkaround a[href], .resourceworkaround a[href]");
      return a ? a.href : null;
    })
    .catch(() => null);
  if (!href || isQuizLike({ url: href })) return false;
  await open(href);
  return true;
}

async function ensureLoggedIn(page, { logger, signal }) {
  if (!isLoginUrl(page.url())) return true;
  logger.warn("เว็บพาไปหน้าเข้าสู่ระบบ — กรุณาเข้าสู่ระบบในหน้าต่างเบราว์เซอร์ (รอสูงสุด 15 นาที)");
  const r = await runLogin({ page, startUrl: null, logger, signal });
  return r.ok;
}

/**
 * Process one lesson item in the shared page.
 * @returns {Promise<"video"|"document"|"skipped"|"failed">}
 */
async function processItem(page, item, ctx) {
  const { logger, signal, mode, settings, open } = ctx;
  const wantVideos = mode === "videos" || mode === "all";
  const wantDocs = mode === "documents" || mode === "all";

  if (item.kind === "quiz") {
    logger.info("  ข้าม — เป็นแบบทดสอบ/งานที่ต้องส่ง (โปรแกรมไม่ทำข้อสอบ)");
    return "skipped";
  }
  if (item.kind === "skip") {
    logger.info(`  ข้าม — ไม่ใช่วิดีโอหรือเอกสาร (${item.modtype || "อื่น ๆ"})`);
    return "skipped";
  }
  if (item.completed && settings.skipCompleted) {
    logger.info("  ข้าม — ระบบขึ้นว่าเรียนจบแล้ว");
    return "skipped";
  }
  if (item.kind === "document" && !wantDocs) {
    logger.info("  ข้าม — เป็นเอกสาร (โหมดนี้เล่นเฉพาะวิดีโอ)");
    return "skipped";
  }
  if (item.kind === "video" && !wantVideos) {
    logger.info("  ข้าม — เป็นวิดีโอ (โหมดนี้เปิดเฉพาะเอกสาร)");
    return "skipped";
  }

  let opened = await open(item.url);
  if (opened.ok && !opened.download && isLoginUrl(page.url())) {
    if (!(await ensureLoggedIn(page, ctx))) return "failed";
    opened = await open(item.url);
  }
  if (!opened.ok) {
    logger.warn(`  เปิดไม่สำเร็จ: ${opened.error}`);
    return "failed";
  }
  if (opened.download) return wantDocs ? "document" : "skipped";

  if (isQuizLike({ url: page.url() })) {
    logger.info("  ข้าม — หน้านี้เป็นแบบทดสอบ (โปรแกรมไม่ทำข้อสอบ)");
    return "skipped";
  }

  const videoWait = item.kind === "video" ? 12_000 : 4_000;
  let videos = await waitForVideos(page, { timeoutMs: videoWait, signal });
  if (videos.length === 0 && (await followMoodleWorkaround(page, open))) {
    videos = await waitForVideos(page, { timeoutMs: videoWait, signal });
  }

  if (videos.length) {
    if (!wantVideos) {
      logger.info("  ข้าม — หน้านี้เป็นวิดีโอ (โหมดนี้เปิดเฉพาะเอกสาร)");
      return "skipped";
    }
    logger.info(`  พบวิดีโอ ${videos.length} ตัว — เล่นจนจบทีละตัว`);
    const results = await playAllVideos(page, {
      logger,
      signal,
      muted: settings.muteVideo,
      rate: settings.playbackRate,
      maxMinutes: settings.maxVideoMinutes,
      initial: videos,
    });
    if (results.length === 0) {
      if (!wantDocs) return "skipped";
    } else {
      return results.includes("ended") ? "video" : "failed";
    }
  }

  if (!wantDocs) {
    logger.info("  ไม่พบวิดีโอในหน้านี้ — ข้าม");
    return "skipped";
  }
  logger.info(`  เลื่อนอ่านเอกสาร (~${settings.docReadSeconds} วินาที)…`);
  await readDocument(page, {
    logger,
    signal,
    seconds: settings.docReadSeconds,
    modtype: item.modtype,
    open,
  });
  logger.ok("  เปิดเอกสารครบแล้ว ✓");
  return "document";
}

async function runCourseWith(page, open, { settings, mode, logger, signal }) {
  const courseUrl = assertValidUrl(settings.courseUrl, "ลิงก์หน้ารายวิชา");

  logger.info(`เริ่ม: ${MODE_LABELS[mode]}`);
  logger.info(`เปิดหน้ารายวิชา: ${courseUrl}`);
  let r = await open(courseUrl);
  if (r.ok && isLoginUrl(page.url())) {
    if (!(await ensureLoggedIn(page, { logger, signal }))) {
      return { ok: false, reason: "not_logged_in" };
    }
    r = await open(courseUrl);
  }
  if (!r.ok) throw new Error(`เปิดหน้ารายวิชาไม่สำเร็จ: ${r.error}`);

  const { items, platform } = await collectLessons(page, {
    lessonUrls: parseLessonUrls(settings.lessonUrls),
    logger,
  });
  if (items.length === 0) {
    logger.warn(
      "ไม่พบรายการบทเรียน — ตรวจว่าลิงก์เป็นหน้ารายวิชาจริง หรือกรอก \"ลิงก์บทเรียน\" เองในตั้งค่าเพิ่มเติม"
    );
    return { ok: false, reason: "no_items", platform };
  }

  const quizCount = items.filter((i) => i.kind === "quiz").length;
  logger.info(`พบ ${items.length} รายการ${quizCount ? ` (แบบทดสอบ ${quizCount} รายการจะถูกข้าม)` : ""}`);

  const summary = { video: 0, document: 0, skipped: 0, failed: 0 };
  for (const item of items) {
    throwIfAborted(signal);
    logger.info(`[${item.index + 1}/${items.length}] ${item.name}`);
    let outcome;
    try {
      outcome = await processItem(page, item, { logger, signal, mode, settings, open });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      if (page.isClosed()) {
        logger.error("หน้าต่างเบราว์เซอร์ถูกปิดระหว่างทำงาน — หยุด");
        return { ok: false, reason: "browser_closed", summary };
      }
      logger.warn(`  เกิดข้อผิดพลาด: ${String(err?.message || err).split("\n")[0]} — ไปรายการถัดไป`);
      outcome = "failed";
    }
    summary[outcome] += 1;
    await sleep(1000, signal);
  }

  logger.ok(
    `เสร็จแล้ว ✓ ดูวิดีโอ ${summary.video} · เปิดเอกสาร ${summary.document} · ข้าม ${summary.skipped} · ไม่สำเร็จ ${summary.failed}`
  );
  await open(courseUrl).catch(() => {});
  return { ok: true, summary, platform };
}

/**
 * @param {object} options
 * @param {object} options.settings
 * @param {'login'|'videos'|'documents'|'all'} options.mode
 * @param {(level:string, message:string)=>void} [options.onLog]
 * @param {AbortSignal} [options.signal]
 * @param {string} [options.profileDir]
 * @param {string} [options.resourcesPath]
 * @param {string} [options.downloadDir]
 * @param {boolean} [options.headless]
 */
export async function runJob(options) {
  const { mode, onLog, signal, profileDir, resourcesPath, downloadDir, headless = false } = options;
  const settings = normalizeSettings(options.settings);
  const logger = createLogger((level, message) => {
    if (onLog) onLog(level, message);
    else console.log(`[${level}] ${message}`);
  });

  if (mode === "login") {
    const startUrl = assertValidUrl(settings.loginUrl || settings.courseUrl, "ลิงก์เว็บไซต์");
    const { page } = await getSharedBrowser({
      profileDir,
      resourcesPath,
      headless,
      channel: settings.browserChannel,
      onLog,
    });
    await page.bringToFront().catch(() => {});
    return runLogin({ page, startUrl, logger, signal });
  }

  if (!MODE_LABELS[mode]) throw new Error(`โหมดไม่ถูกต้อง: ${mode}`);
  assertValidUrl(settings.courseUrl, "ลิงก์หน้ารายวิชา");
  const { page } = await getSharedBrowser({
    profileDir,
    resourcesPath,
    headless,
    channel: settings.browserChannel,
    onLog,
  });
  await page.bringToFront().catch(() => {});
  return runCourse(page, { settings, mode, logger, signal, downloadDir });
}

async function runCourse(page, opts) {
  const open = createOpener(page, { logger: opts.logger, downloadDir: opts.downloadDir });
  try {
    return await runCourseWith(page, open, opts);
  } finally {
    open.dispose();
  }
}
