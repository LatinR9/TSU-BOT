/**
 * Read through a document page: scroll from top to bottom over a fixed time.
 * Handles normal HTML pages, embedded PDF/iframes, Chromium's PDF viewer,
 * Moodle books (chapter by chapter) and Moodle folders (file by file).
 */
import { sleep, throwIfAborted } from "../util.js";

const STEP_MS = 500;
const MAX_BOOK_CHAPTERS = 200;
const MAX_FOLDER_FILES = 100;

async function viewportCenter(page) {
  return page
    .evaluate(() => {
      const candidates = [...document.querySelectorAll("iframe, object, embed, #resourceobject")];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let best = null;
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        const area = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        if (area > vw * vh * 0.3 && (!best || area > best.area)) {
          best = { x: r.left + r.width / 2, y: r.top + r.height / 2, area };
        }
      }
      return best ? { x: best.x, y: best.y, embedded: true } : { x: vw / 2, y: vh / 2, embedded: false };
    })
    .catch(() => ({ x: 640, y: 400, embedded: true }));
}

function scrollState() {
  const el = document.scrollingElement || document.documentElement;
  return {
    top: el.scrollTop,
    max: Math.max(0, el.scrollHeight - el.clientHeight),
    pdf: document.contentType === "application/pdf" || Boolean(document.querySelector('embed[type="application/pdf"]')),
  };
}

/** Scroll gradually so the whole document passes through the viewport. */
export async function scrollThrough(page, { seconds, signal }) {
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  const steps = Math.max(4, Math.round((seconds * 1000) / STEP_MS));
  const point = await viewportCenter(page);
  const start = await page.evaluate(scrollState).catch(() => ({ top: 0, max: 0, pdf: true }));
  const pluginLike = start.pdf || point.embedded || start.max === 0;
  const perStep = pluginLike ? 350 : Math.max(60, Math.ceil(start.max / steps));

  await page.mouse.move(point.x, point.y).catch(() => {});
  for (let i = 0; i < steps; i++) {
    throwIfAborted(signal);
    await page.mouse.wheel(0, perStep).catch(() => {});
    if (!pluginLike) {
      await page.evaluate((dy) => window.scrollBy(0, dy), perStep).catch(() => {});
    }
    await sleep(STEP_MS, signal);
  }
  if (pluginLike) await page.keyboard.press("End").catch(() => {});
  await page.evaluate(() => window.scrollTo(0, document.body ? document.body.scrollHeight : 0)).catch(() => {});
  const end = await page.evaluate(scrollState).catch(() => null);
  return { pluginLike, reachedBottom: end ? end.top >= end.max - 4 : true };
}

async function nextBookChapter(page) {
  return page
    .evaluate(() => {
      const a = document.querySelector(
        'a.booknext, .navbottom a.next, .navtop a.next, .book_navigation a.next, a[title^="Next" i][href*="chapterid="], a[title^="ถัดไป"][href*="chapterid="]'
      );
      return a && a.href ? a.href : null;
    })
    .catch(() => null);
}

async function folderFiles(page) {
  return page
    .evaluate(() =>
      [...document.querySelectorAll('.foldertree a[href*="pluginfile.php"], .fp-filename-icon a[href*="pluginfile.php"], #folder_tree0 a[href*="pluginfile.php"]')]
        .map((a) => ({ url: a.href, name: a.textContent.replace(/\s+/g, " ").trim() }))
    )
    .catch(() => []);
}

/**
 * @param {object} ctx
 * @param {(url:string)=>Promise<{ok:boolean, download?:boolean}>} ctx.open  opens a URL in the shared page
 */
export async function readDocument(page, { logger, signal, seconds, modtype, open }) {
  if (modtype === "book" || /\/mod\/book\//.test(page.url())) {
    let chapter = 1;
    while (chapter <= MAX_BOOK_CHAPTERS) {
      logger.info(`  อ่านบทที่ ${chapter} ของหนังสือ…`);
      await scrollThrough(page, { seconds, signal });
      const next = await nextBookChapter(page);
      if (!next) break;
      const r = await open(next);
      if (!r.ok) break;
      chapter += 1;
    }
    return { ok: true, parts: chapter };
  }

  if (modtype === "folder" || /\/mod\/folder\//.test(page.url())) {
    const files = (await folderFiles(page)).slice(0, MAX_FOLDER_FILES);
    if (files.length === 0) {
      await scrollThrough(page, { seconds, signal });
      return { ok: true, parts: 1 };
    }
    logger.info(`  โฟลเดอร์มี ${files.length} ไฟล์ — เปิดทีละไฟล์`);
    let n = 0;
    for (const file of files) {
      n += 1;
      logger.info(`  ไฟล์ ${n}/${files.length}: ${file.name}`);
      const r = await open(file.url);
      if (r.ok && !r.download) await scrollThrough(page, { seconds, signal });
    }
    return { ok: true, parts: files.length };
  }

  const r = await scrollThrough(page, { seconds, signal });
  return { ok: true, parts: 1, ...r };
}
