import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/**
 * Point Playwright at bundled Chromium when running inside Electron / packaged app.
 */
export function configurePlaywrightBrowsersPath(resourcesPath) {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;

  const candidates = [];
  if (resourcesPath) candidates.push(path.join(resourcesPath, "ms-playwright"));
  candidates.push(path.join(process.cwd(), "ms-playwright"));

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = dir;
      return dir;
    }
  }
  return null;
}

/**
 * Playwright's own Chromium has no H.264/AAC codecs, so MP4 lesson videos
 * would never play. Edge ships with every Windows 10/11 install and has them.
 */
export function channelCandidates(preference = "auto") {
  switch (preference) {
    case "msedge":
      return ["msedge", "chromium"];
    case "chrome":
      return ["chrome", "chromium"];
    case "chromium":
      return ["chromium"];
    default:
      return ["msedge", "chrome", "chromium"];
  }
}

export const CHANNEL_LABELS = {
  msedge: "Microsoft Edge",
  chrome: "Google Chrome",
  chromium: "Chromium (ในตัวโปรแกรม)",
};

/**
 * Launch a persistent profile so the user's login survives restarts.
 * Each channel gets its own sub-folder: Edge and Chromium profiles are not compatible.
 */
export async function launchBrowser({
  userDataDir,
  headless = false,
  channel = "auto",
  log = () => {},
}) {
  const root = path.resolve(userDataDir);
  let lastErr = null;

  for (const candidate of channelCandidates(channel)) {
    const dir = path.join(root, candidate);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const context = await chromium.launchPersistentContext(dir, {
        channel: candidate === "chromium" ? undefined : candidate,
        headless: Boolean(headless),
        viewport: null,
        locale: "th-TH",
        timezoneId: "Asia/Bangkok",
        acceptDownloads: true,
        ignoreDefaultArgs: ["--enable-automation", "--mute-audio"],
        args: [
          "--disable-blink-features=AutomationControlled",
          "--autoplay-policy=no-user-gesture-required",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--start-maximized",
        ],
      });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });
      const page = context.pages()[0] || (await context.newPage());
      page.setDefaultTimeout(30_000);
      return { context, page, channel: candidate, profileDir: dir };
    } catch (err) {
      lastErr = err;
      log("warn", `เปิด ${CHANNEL_LABELS[candidate]} ไม่ได้ — ลองตัวถัดไป`);
    }
  }
  throw new Error(`เปิดเบราว์เซอร์ไม่ได้: ${lastErr?.message || lastErr}`);
}

export async function screenshot(page, name) {
  const dir = path.resolve(
    process.env.STUDY_BOT_SCREENSHOT_DIR || path.join(process.cwd(), "screenshots")
  );
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file }).catch(() => {});
  return file;
}
