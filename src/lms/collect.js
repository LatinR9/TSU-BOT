/**
 * Build the ordered lesson list for a course page.
 * 1) Manual URL list from settings (if given)
 * 2) Moodle: course page activities (+ section pages, + course index)
 * 3) Generic: lesson-looking links inside the main content area
 */
import { classifyItem, isIgnoredLink, looksLikeLessonLink, moodleModtypeFromUrl } from "./signals.js";

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return String(url || "");
  }
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalizeUrl(item.url);
    if (!item.url || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function finalizeItems(rawItems, source) {
  return dedupe(rawItems).map((item, index) => {
    const modtype = item.modtype || moodleModtypeFromUrl(item.url);
    return {
      index,
      url: item.url,
      name: (item.name || "").replace(/\s+/g, " ").trim() || item.url,
      modtype,
      completed: Boolean(item.completed),
      kind: classifyItem({ modtype, url: item.url, name: item.name }),
      source,
    };
  });
}

export async function isMoodlePage(page) {
  return page
    .evaluate(() => {
      const body = document.body;
      return Boolean(
        (window.M && window.M.cfg && window.M.cfg.wwwroot) ||
          (body && /^page-course-view|^page-mod-|^page-site-index/.test(body.id || "")) ||
          document.querySelector('meta[name="keywords"][content*="moodle" i]')
      );
    })
    .catch(() => false);
}

/** Runs in the page: Moodle 3.x / 4.x activity list with completion state. */
function extractMoodleActivities() {
  const textOf = (el) => {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".accesshide, .sr-only, .visually-hidden").forEach((n) => n.remove());
    return clone.textContent.replace(/\s+/g, " ").trim();
  };
  const isCompleted = (li) => {
    const reqs = li.querySelectorAll(
      '[data-region="completionrequirements"] .badge, .completion-info .badge, .activity-completion .badge'
    );
    if (reqs.length) {
      return [...reqs].every((b) => /alert-success|bg-success|badge-success/.test(b.className));
    }
    if (li.querySelector('button[data-toggletype="manual:undo"], .activity-completion .btn-success')) return true;
    const img = li.querySelector(".autocompletion img, .togglecompletion img, .completionicon img, img.icon[src*='completion-']");
    if (img && /completion-(auto|manual)-(y|pass)/.test(img.getAttribute("src") || "")) return true;
    return false;
  };

  const items = [];
  document.querySelectorAll("li.activity").forEach((li) => {
    const m = li.className.match(/modtype_([a-z0-9_]+)/i);
    const modtype = m ? m[1].toLowerCase() : null;
    const a = li.querySelector('a.aalink, .activityname a, .activityinstance a, a[href*="/mod/"]');
    if (!a || !a.href) return;
    const nameEl = li.querySelector(".instancename") || li.querySelector(".activityname") || a;
    const dataName = li.querySelector("[data-activityname]")?.getAttribute("data-activityname");
    items.push({
      url: a.href,
      name: dataName || textOf(nameEl),
      modtype,
      completed: isCompleted(li),
    });
  });
  return items;
}

function extractMoodleCourseIndex() {
  return [...document.querySelectorAll('#courseindex li[data-for="cm"] a.courseindex-link, #courseindex li[data-for="cm"] a[href*="/mod/"]')]
    .filter((a) => a.href)
    .map((a) => ({ url: a.href, name: a.textContent.replace(/\s+/g, " ").trim() }));
}

function extractMoodleSectionLinks() {
  const links = document.querySelectorAll(
    '.course-content a[href*="course/view.php"][href*="section="], .course-content a[href*="course/section.php"], .section .sectionname a, .section-title a'
  );
  return [...new Set([...links].map((a) => a.href).filter(Boolean))];
}

async function collectMoodle(page, logger) {
  let items = await page.evaluate(extractMoodleActivities).catch(() => []);

  const sectionLinks = await page.evaluate(extractMoodleSectionLinks).catch(() => []);
  if (items.length === 0 && sectionLinks.length) {
    logger.info(`รายวิชาแยกหัวข้อเป็นหน้า ๆ — เปิดดูทีละหัวข้อ (${sectionLinks.length} หัวข้อ)`);
    const courseUrl = page.url();
    for (const link of sectionLinks) {
      await page.goto(link, { waitUntil: "domcontentloaded" }).catch(() => {});
      const found = await page.evaluate(extractMoodleActivities).catch(() => []);
      items.push(...found);
    }
    await page.goto(courseUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  }

  if (items.length === 0) {
    items = await page.evaluate(extractMoodleCourseIndex).catch(() => []);
  }
  return items;
}

/** Runs in the page: links inside the main content area, in document order. */
function extractGenericLinks() {
  const root =
    document.querySelector('[role="main"], main, #region-main, #content, .course-content, .content, article') ||
    document.body;
  const banned = 'header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], .navbar, .breadcrumb, .pagination, .dropdown-menu';
  return [...root.querySelectorAll("a[href]")]
    .filter((a) => !a.closest(banned))
    .map((a) => ({
      url: a.href,
      name: (a.textContent || a.getAttribute("title") || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((l) => /^https?:/i.test(l.url));
}

async function collectGeneric(page) {
  const links = await page.evaluate(extractGenericLinks).catch(() => []);
  const here = normalizeUrl(page.url());
  const origin = new URL(page.url()).origin;
  const candidates = links.filter((l) => {
    if (normalizeUrl(l.url) === here || isIgnoredLink(l.url)) return false;
    const sameOrigin = l.url.startsWith(origin);
    const kind = classifyItem(l);
    return sameOrigin || kind === "video" || kind === "document";
  });
  return candidates.filter((l) => looksLikeLessonLink(l));
}

export async function pageHasMedia(page) {
  for (const frame of page.frames()) {
    const has = await frame
      .evaluate(() =>
        Boolean(
          document.querySelector(
            'video, iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"], iframe[src*="kaltura"], iframe[src*="h5p"], lite-youtube'
          )
        )
      )
      .catch(() => false);
    if (has) return true;
  }
  return false;
}

/**
 * @returns {Promise<{ items: object[], platform: "manual"|"moodle"|"generic" }>}
 */
export async function collectLessons(page, { lessonUrls = [], logger }) {
  if (lessonUrls.length) {
    logger.info(`ใช้รายการลิงก์บทเรียนที่กรอกเอง (${lessonUrls.length} รายการ)`);
    return { items: finalizeItems(lessonUrls.map((url) => ({ url, name: "" })), "manual"), platform: "manual" };
  }

  if (await isMoodlePage(page)) {
    logger.info("ตรวจพบระบบ Moodle — อ่านรายการบทเรียนจากหน้ารายวิชา");
    const raw = await collectMoodle(page, logger);
    if (raw.length) return { items: finalizeItems(raw, "moodle"), platform: "moodle" };
    logger.warn("ไม่พบกิจกรรม Moodle ในหน้านี้ — ลองค้นหาแบบทั่วไป");
  } else {
    logger.info("ไม่ใช่ Moodle — ค้นหาลิงก์บทเรียน/วิดีโอ/เอกสารแบบทั่วไป");
  }

  const raw = await collectGeneric(page);
  if (await pageHasMedia(page)) {
    raw.unshift({ url: page.url(), name: "หน้ารายวิชา (มีวิดีโอในหน้า)" });
  }
  return { items: finalizeItems(raw, "generic"), platform: "generic" };
}
