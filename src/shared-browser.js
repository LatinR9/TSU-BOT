/**
 * One shared Playwright browser window for the whole app session.
 * Login / videos / documents all reuse the same window and profile.
 * Only closed via closeSharedBrowser() (UI button or app quit).
 */
import path from "node:path";
import { launchBrowser, configurePlaywrightBrowsersPath, CHANNEL_LABELS } from "./browser.js";

/** @type {{ context: import('playwright').BrowserContext, page: import('playwright').Page, profileDir: string, channel: string } | null} */
let shared = null;

function logFn(onLog) {
  return (level, message) => {
    if (onLog) onLog(level, message);
    else console.log(`[${level}] ${message}`);
  };
}

function isAlive() {
  if (!shared) return false;
  try {
    return shared.context.pages().some((p) => !p.isClosed());
  } catch {
    return false;
  }
}

/** Main working page; re-adopts another open tab if the user closed the first one. */
function currentPage() {
  if (!shared) return null;
  if (shared.page && !shared.page.isClosed()) return shared.page;
  const next = shared.context.pages().find((p) => !p.isClosed()) || null;
  shared.page = next;
  return next;
}

export async function getSharedBrowser({
  profileDir,
  resourcesPath,
  headless = false,
  channel = "auto",
  onLog,
} = {}) {
  const log = logFn(onLog);
  const root = path.resolve(profileDir || path.join(process.cwd(), ".auth", "browser-profile"));
  configurePlaywrightBrowsersPath(resourcesPath);

  if (isAlive()) {
    log("info", "ใช้หน้าต่างเบราว์เซอร์เดิมที่เปิดอยู่");
    return { ...shared, page: currentPage() };
  }
  shared = null;

  const launched = await launchBrowser({ userDataDir: root, headless, channel, log });
  log("info", `เปิดเบราว์เซอร์ ${CHANNEL_LABELS[launched.channel]} (โปรไฟล์: ${launched.profileDir})`);
  if (launched.channel === "chromium") {
    log("warn", "Chromium ในตัวเล่นวิดีโอ MP4 บางไฟล์ไม่ได้ — แนะนำให้มี Microsoft Edge ในเครื่อง");
  }

  const { context } = launched;
  context.on("close", () => {
    if (shared?.context === context) shared = null;
  });

  shared = { ...launched };
  return shared;
}

export function getWorkingPage() {
  return isAlive() ? currentPage() : null;
}

export async function closeSharedBrowser(onLog) {
  const log = logFn(onLog);
  if (!shared) {
    log("info", "ไม่มีเบราว์เซอร์ให้ปิด");
    return { ok: true, closed: false };
  }
  const ref = shared;
  shared = null;
  await ref.context.close().catch(() => {});
  log("info", "ปิดเบราว์เซอร์แล้ว (การล็อกอินถูกเก็บไว้ในโปรไฟล์)");
  return { ok: true, closed: true };
}

export function getSharedBrowserInfo() {
  return {
    open: isAlive(),
    channel: shared?.channel || null,
    profileDir: shared?.profileDir || null,
  };
}
