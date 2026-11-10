/**
 * User settings. No credentials are ever stored — the user logs in by hand
 * inside the browser window and the session lives in the browser profile.
 */
export const DEFAULTS = {
  // Course page URL (the page that lists the lessons)
  courseUrl: "",
  // Optional login page; blank = open courseUrl and let the site redirect
  loginUrl: "",
  // Optional manual lesson list, one URL per line (overrides auto-detection)
  lessonUrls: "",
  browserChannel: "auto",
  skipCompleted: true,
  muteVideo: false,
  playbackRate: 1,
  // Safety cap per video, in minutes
  maxVideoMinutes: 180,
  // How long to scroll through each document, in seconds
  docReadSeconds: 20,
};

export const CHANNELS = ["auto", "msedge", "chrome", "chromium"];

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSettings(raw = {}) {
  const s = { ...DEFAULTS, ...raw };
  return {
    courseUrl: String(s.courseUrl || "").trim(),
    loginUrl: String(s.loginUrl || "").trim(),
    lessonUrls: String(s.lessonUrls || ""),
    browserChannel: CHANNELS.includes(s.browserChannel) ? s.browserChannel : "auto",
    skipCompleted: s.skipCompleted !== false,
    muteVideo: Boolean(s.muteVideo),
    playbackRate: clampNumber(s.playbackRate, 0.5, 2, 1),
    maxVideoMinutes: clampNumber(s.maxVideoMinutes, 1, 600, DEFAULTS.maxVideoMinutes),
    docReadSeconds: clampNumber(s.docReadSeconds, 3, 600, DEFAULTS.docReadSeconds),
  };
}

export function parseLessonUrls(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));
}

export function assertValidUrl(url, label) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("protocol");
    return u.href;
  } catch {
    throw new Error(`${label}ไม่ถูกต้อง: ${url || "(ว่าง)"}`);
  }
}
