/**
 * Pure URL / text heuristics shared by login detection and lesson collection.
 * Kept free of Playwright so they can be unit-tested directly.
 */

const LOGIN_URL_RE =
  /(\/login\b|\/signin\b|\/sign-in\b|\/auth\b|\/sso\b|\/cas\/|login\.php|\/oauth|\/saml|accounts\.google\.com|login\.microsoftonline\.com|\/adfs\/)/i;

export function isLoginUrl(url) {
  const u = String(url || "");
  if (/login\/logout\.php/i.test(u)) return false;
  return LOGIN_URL_RE.test(u);
}

/** Moodle activity types that are graded tests/submissions — never opened. */
export const QUIZ_MODTYPES = new Set([
  "quiz",
  "assign",
  "assignment",
  "lesson",
  "workshop",
  "feedback",
  "questionnaire",
  "survey",
  "choice",
  "hotpot",
  "realtimequiz",
  "studentquiz",
  "offlinequiz",
  "adaptivequiz",
  "game",
]);

/** Activity types with no lesson content to watch or read. */
export const NON_CONTENT_MODTYPES = new Set([
  "label",
  "forum",
  "chat",
  "glossary",
  "wiki",
  "data",
  "attendance",
  "zoom",
  "bigbluebuttonbn",
  "lti",
  "scorm",
  "certificate",
  "customcert",
  "checklist",
  "choicegroup",
  "groupselect",
  "scheduler",
  "journal",
  "board",
]);

export const VIDEO_MODTYPES = new Set([
  "hvp",
  "h5pactivity",
  "videofile",
  "videotime",
  "kalvidres",
  "vimeo",
  "youtube",
  "video",
  "mediagallery",
]);

const QUIZ_URL_RE =
  /\/mod\/(quiz|assign|lesson|workshop|feedback|questionnaire|survey|choice|hotpot|studentquiz)\/|\/(quiz|quizzes|exam|exams|assessment|assessments|assignment|assignments|test|tests|homework)(\/|\?|$)/i;

const QUIZ_TEXT_RE =
  /(แบบทดสอบ|ข้อสอบ|ทดสอบ|(?<!ตรวจ)สอบ(ย่อย|กลางภาค|ปลายภาค|ก่อนเรียน|หลังเรียน)?|แบบฝึกหัด|การบ้าน|ส่งงาน|ภาระงาน|แบบประเมิน|แบบสอบถาม|\bquiz(zes)?\b|\bexam\b|\btest\b|\bpre-?test\b|\bpost-?test\b|\bassignment\b|\bhomework\b|\bsurvey\b)/i;

const DOC_EXT_RE = /\.(pdf|docx?|pptx?|xlsx?|odt|odp|ods|txt|rtf|epub)(\?|#|$)/i;
const VIDEO_EXT_RE = /\.(mp4|webm|m4v|mov|ogv|m3u8)(\?|#|$)/i;
const VIDEO_HOST_RE =
  /(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|dailymotion\.com|kaltura|panopto|wistia|vidyard|jwplayer|streamable\.com|drive\.google\.com\/file)/i;

const DOC_TEXT_RE = /(เอกสาร|ไฟล์|สไลด์|ชีท|ใบความรู้|เนื้อหา|บทอ่าน|document|slides?|handout|reading|\bpdf\b|\bppt\b|lecture notes?)/i;
const VIDEO_TEXT_RE = /(วิดีโอ|วีดีโอ|วีดิโอ|คลิป|video|clip|youtube|lecture video|vdo)/i;
const LESSON_TEXT_RE = /(บทที่|บทเรียน|หน่วยที่|หน่วยการเรียน|ตอนที่|สัปดาห์ที่|lesson|chapter|unit|module|week|topic)/i;

export function moodleModtypeFromUrl(url) {
  const m = String(url || "").match(/\/mod\/([a-z0-9_]+)\//i);
  return m ? m[1].toLowerCase() : null;
}

export function isQuizLike({ modtype, url, name } = {}) {
  if (modtype && QUIZ_MODTYPES.has(modtype)) return true;
  if (url && QUIZ_URL_RE.test(String(url))) return true;
  if (name && QUIZ_TEXT_RE.test(String(name))) return true;
  return false;
}

/**
 * Best-guess kind before opening the item: "quiz" | "skip" | "video" | "document" | "unknown".
 * "unknown" items are opened and classified by what the page actually contains.
 */
export function classifyItem({ modtype, url, name } = {}) {
  const type = modtype || moodleModtypeFromUrl(url);
  if (isQuizLike({ modtype: type, url, name })) return "quiz";
  if (type && NON_CONTENT_MODTYPES.has(type)) return "skip";
  if (type && VIDEO_MODTYPES.has(type)) return "video";
  const href = String(url || "");
  const text = String(name || "");
  if (VIDEO_EXT_RE.test(href) || VIDEO_HOST_RE.test(href) || VIDEO_TEXT_RE.test(text)) return "video";
  if (DOC_EXT_RE.test(href) || type === "resource" || type === "book" || type === "folder") return "document";
  if (DOC_TEXT_RE.test(text)) return "document";
  return "unknown";
}

/** Keyword filter for the generic (non-Moodle) fallback, so random nav links are not visited. */
export function looksLikeLessonLink({ url, name } = {}) {
  const href = String(url || "");
  const text = String(name || "");
  return (
    DOC_EXT_RE.test(href) ||
    VIDEO_EXT_RE.test(href) ||
    VIDEO_HOST_RE.test(href) ||
    DOC_TEXT_RE.test(text) ||
    VIDEO_TEXT_RE.test(text) ||
    LESSON_TEXT_RE.test(text) ||
    /\/(lesson|lessons|lecture|lectures|content|contents|material|materials|video|videos|chapter|unit|module)s?\b/i.test(href)
  );
}

const IGNORED_LINK_RE =
  /(logout|log-out|signout|sign-out|\/login|\/signin|\/register|\/signup|\/profile|\/user\/|\/message|\/notifications?|\/calendar|\/grade|\/badges|\/help|\/privacy|\/policy|\/contact|mailto:|tel:|javascript:)/i;

export function isIgnoredLink(url) {
  return IGNORED_LINK_RE.test(String(url || ""));
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
