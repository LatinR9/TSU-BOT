/**
 * Play every video on the current page to the end, one after another.
 * Works across frames, so YouTube / Vimeo / H5P / Kaltura iframes are handled
 * through the <video> element inside their player frame. Never seeks forward.
 */
import { formatClock } from "./signals.js";
import { sleep, throwIfAborted } from "../util.js";

const POLL_MS = 2000;
const PROGRESS_EVERY_MS = 30_000;
const STALL_WARN_MS = 60_000;
const STALL_GIVE_UP_MS = 180_000;
const MAX_VIDEOS_PER_PAGE = 30;

const PLAY_BUTTONS = [
  ".ytp-large-play-button",
  "lite-youtube",
  ".vjs-big-play-button",
  ".plyr__control--overlaid",
  ".jw-display-icon-container",
  ".vp-big-play-button",
  ".h5p-splash-wrapper",
  ".h5p-interactive-video-start",
  'button[aria-label="Play" i]',
  'button[title="Play" i]',
].join(", ");

function tagVideosInFrame() {
  return [...document.querySelectorAll("video")].map((v) => {
    if (!v.dataset.studybotId) v.dataset.studybotId = Math.random().toString(36).slice(2, 10);
    const r = v.getBoundingClientRect();
    return {
      id: v.dataset.studybotId,
      duration: Number.isFinite(v.duration) ? v.duration : null,
      area: Math.round(r.width * r.height),
      src: v.currentSrc || v.src || "",
      ended: v.ended,
    };
  });
}

/** List all <video> elements in all frames (document order, main frame first). */
export async function findVideos(page) {
  const out = [];
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    const found = await frame.evaluate(tagVideosInFrame).catch(() => []);
    for (const v of found) out.push({ ...v, frame });
  }
  return out;
}

async function nudgeLazyPlayers(page) {
  await page
    .evaluate(() => {
      document.querySelectorAll("iframe, lite-youtube, video").forEach((el) => {
        if (el.loading === "lazy") el.loading = "eager";
      });
      const first = document.querySelector("iframe, lite-youtube, video");
      if (first) first.scrollIntoView({ block: "center" });
    })
    .catch(() => {});
}

async function clickPlayOverlay(page) {
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    const btn = frame.locator(PLAY_BUTTONS).first();
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

/** Wait until at least one video exists, clicking click-to-load players if needed. */
export async function waitForVideos(page, { timeoutMs = 10_000, signal } = {}) {
  const deadline = Date.now() + timeoutMs;
  let clicked = false;
  await nudgeLazyPlayers(page);
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const vids = await findVideos(page);
    if (vids.length) return vids;
    if (!clicked && Date.now() > deadline - timeoutMs / 2) {
      clicked = await clickPlayOverlay(page);
    }
    await sleep(700, signal);
  }
  return findVideos(page);
}

async function pauseOthers(page, keepId) {
  for (const frame of page.frames()) {
    if (frame.isDetached()) continue;
    await frame
      .evaluate((id) => {
        document.querySelectorAll("video").forEach((v) => {
          if (v.dataset.studybotId !== id && !v.paused) v.pause();
        });
      }, keepId)
      .catch(() => {});
  }
}

function tickInFrame({ id, muted, rate }) {
  const v = document.querySelector(`video[data-studybot-id="${id}"]`);
  if (!v) return { gone: true };
  const player = v.closest(".html5-video-player");
  const ad = Boolean(player && player.classList.contains("ad-showing"));
  if (ad) {
    const skip = document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button");
    if (skip) skip.click();
  }
  if (muted && !v.muted) v.muted = true;
  if (!ad && rate && Math.abs(v.playbackRate - rate) > 0.01) v.playbackRate = rate;
  let blocked = false;
  if (v.paused && !v.ended) {
    const p = v.play();
    if (p && p.catch) {
      p.catch(() => {
        blocked = true;
      });
    }
  }
  return {
    t: v.currentTime,
    d: Number.isFinite(v.duration) ? v.duration : null,
    ended: v.ended,
    paused: v.paused,
    ad,
    blocked,
    error: v.error ? v.error.code : 0,
    hasSrc: Boolean(v.currentSrc || v.src || v.srcObject || v.querySelector("source")),
  };
}

/**
 * Play one video to the end.
 * @returns {Promise<"ended"|"gone"|"error"|"stalled"|"timeout">}
 */
export async function playVideoToEnd(video, { logger, signal, muted, rate = 1, maxMinutes = 180, label }) {
  const { frame, id } = video;
  const started = Date.now();
  let hardDeadline = started + maxMinutes * 60_000;
  let lastT = -1;
  let maxT = 0;
  let lastAdvance = Date.now();
  let stallWarned = false;
  let nextProgress = Date.now() + PROGRESS_EVERY_MS;
  let announcedDuration = false;
  let clickedVideo = false;

  while (true) {
    throwIfAborted(signal);
    if (frame.isDetached()) return "gone";

    const s = await frame.evaluate(tickInFrame, { id, muted, rate }).catch(() => ({ gone: true }));
    if (s.gone) return "gone";
    if (!s.hasSrc && maxT === 0 && Date.now() - started > 20_000) return "empty";
    if (s.error) {
      logger.warn(
        `${label}: เล่นไม่ได้ (รหัสข้อผิดพลาด ${s.error}${s.error === 4 ? " — ไฟล์/ฟอร์แมตไม่รองรับ ลองตั้งเบราว์เซอร์เป็น Microsoft Edge" : ""})`
      );
      return "error";
    }

    if (s.d && !announcedDuration && !s.ad) {
      announcedDuration = true;
      logger.info(`${label}: ความยาว ${formatClock(s.d)}${rate !== 1 ? ` · ความเร็ว ${rate}x` : ""}`);
      const expected = started + ((s.d / rate) * 1.5 + 300) * 1000;
      hardDeadline = Math.min(started + maxMinutes * 60_000, Math.max(expected, started + 10 * 60_000));
    }

    const nearEnd = s.d && s.t >= s.d - 0.75;
    if (!s.ad && (s.ended || (nearEnd && s.paused))) return "ended";
    // Players that loop or reset to 0 on finish
    if (!s.ad && s.d && maxT >= s.d - 1.5 && s.t < 2) return "ended";

    if (s.t > lastT + 0.05) {
      lastAdvance = Date.now();
      stallWarned = false;
    }
    lastT = s.t;
    if (!s.ad) maxT = Math.max(maxT, s.t);

    const stalledFor = Date.now() - lastAdvance;
    if ((s.blocked || stalledFor > 10_000) && s.paused && !clickedVideo) {
      clickedVideo = true;
      await frame.locator(`video[data-studybot-id="${id}"]`).click({ timeout: 2000, force: true }).catch(() => {});
    }
    if (stalledFor > STALL_WARN_MS && !stallWarned) {
      stallWarned = true;
      logger.warn(`${label}: วิดีโอไม่ขยับมา 1 นาที (กำลังโหลดหรือมีคำถามคั่น) — พยายามเล่นต่อ… กดเล่นในหน้าต่างเองได้`);
    }
    if (stalledFor > STALL_GIVE_UP_MS) {
      logger.warn(`${label}: วิดีโอค้างเกิน 3 นาที — ข้ามไปรายการถัดไป`);
      return "stalled";
    }
    if (Date.now() > hardDeadline) {
      logger.warn(`${label}: เกินเวลาที่กำหนด — ข้ามไปรายการถัดไป`);
      return "timeout";
    }

    if (Date.now() >= nextProgress) {
      nextProgress = Date.now() + PROGRESS_EVERY_MS;
      if (s.ad) logger.info(`${label}: กำลังเล่นโฆษณา — รอ/กดข้ามให้อัตโนมัติ`);
      else if (s.d) logger.info(`${label}: ▶ ${formatClock(s.t)} / ${formatClock(s.d)} (${Math.floor((s.t / s.d) * 100)}%)`);
      else logger.info(`${label}: ▶ ${formatClock(s.t)}`);
    }
    await sleep(POLL_MS, signal);
  }
}

/**
 * Play all videos on the page in order. Videos that appear later (playlists,
 * next-part embeds) are picked up by re-scanning after each one finishes.
 */
export async function playAllVideos(page, { logger, signal, muted, rate, maxMinutes, initial }) {
  const done = new Set();
  const results = [];
  let queue = initial && initial.length ? initial : await findVideos(page);

  while (queue.length && results.length < MAX_VIDEOS_PER_PAGE) {
    const next = queue.filter((v) => !done.has(v.id)).sort((a, b) => (b.area > 0) - (a.area > 0))[0];
    if (!next) break;
    done.add(next.id);

    const label = `  วิดีโอ ${results.length + 1}`;
    logger.info(`${label}: เริ่มเล่น${next.frame === page.mainFrame() ? "" : " (ในกรอบ embed)"}`);
    await pauseOthers(page, next.id);
    const outcome = await playVideoToEnd(next, { logger, signal, muted, rate, maxMinutes, label });
    if (outcome === "ended") logger.ok(`${label}: ดูจบแล้ว ✓`);
    else if (outcome === "gone") logger.warn(`${label}: วิดีโอหายไปจากหน้า (หน้าเปลี่ยน/ปิดไป)`);
    else if (outcome === "empty") logger.info(`${label}: ไม่มีไฟล์วิดีโอ (ตัวเล่นว่าง) — ข้าม`);
    if (outcome !== "empty") results.push(outcome);

    await sleep(1500, signal);
    queue = (await findVideos(page)).filter((v) => !done.has(v.id));
  }
  return results;
}
