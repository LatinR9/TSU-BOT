const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { setupAutoUpdater, RELEASES_URL } = require("./updater.cjs");

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {AbortController | null} */
let activeAbort = null;
let jobRunning = false;
/** @type {{ enabled: boolean, check?: Function, download?: Function, install?: Function, reason?: string, portable?: boolean, releasesUrl?: string }} */
let updaterApi = { enabled: false };

const SETTINGS_KEYS = [
  "courseUrl",
  "loginUrl",
  "lessonUrls",
  "browserChannel",
  "skipCompleted",
  "muteVideo",
  "playbackRate",
  "maxVideoMinutes",
  "docReadSeconds",
];

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const profileDir = () => path.join(app.getPath("userData"), "browser-profile");
const downloadDir = () => path.join(app.getPath("documents"), "TSU Study Bot");

function resourcesPath() {
  if (app.isPackaged) return process.resourcesPath;
  return path.join(__dirname, "..");
}

function srcModule(name) {
  return import(pathToFileURL(path.join(__dirname, "..", "src", name)).href);
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function sendLog(level, message) {
  send("job:log", { level, message: String(message), at: Date.now() });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 900,
    minWidth: 760,
    minHeight: 640,
    title: "TSU Study Bot",
    backgroundColor: "#eef3ff",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

/** Only whitelisted keys are persisted, so nothing sensitive can end up on disk via the UI. */
function pickSettings(raw) {
  const out = {};
  for (const key of SETTINGS_KEYS) if (raw && key in raw) out[key] = raw[key];
  return out;
}

async function readSettings() {
  const { normalizeSettings } = await srcModule("settings.js");
  try {
    if (!fs.existsSync(settingsPath())) return normalizeSettings({});
    return normalizeSettings(pickSettings(JSON.parse(fs.readFileSync(settingsPath(), "utf8"))));
  } catch {
    return normalizeSettings({});
  }
}

async function writeSettings(incoming) {
  const { normalizeSettings } = await srcModule("settings.js");
  const next = normalizeSettings({ ...(await readSettings()), ...pickSettings(incoming) });
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

ipcMain.handle("settings:get", () => readSettings());
ipcMain.handle("settings:save", (_event, settings) => writeSettings(settings));

ipcMain.handle("job:stop", () => {
  if (activeAbort) {
    activeAbort.abort();
    sendLog("warn", "กำลังหยุด… (หน้าต่างเบราว์เซอร์ยังเปิดอยู่)");
    return { ok: true };
  }
  return { ok: false, reason: "idle" };
});

ipcMain.handle("job:start", async (_event, payload) => {
  if (jobRunning) return { ok: false, reason: "busy" };
  const mode = payload?.mode || "videos";

  jobRunning = true;
  activeAbort = new AbortController();
  send("job:status", { running: true, mode });
  try {
    const settings = payload?.settings ? await writeSettings(payload.settings) : await readSettings();
    const { runJob } = await srcModule("runtime.js");
    const result = await runJob({
      settings,
      mode,
      signal: activeAbort.signal,
      profileDir: profileDir(),
      resourcesPath: resourcesPath(),
      downloadDir: downloadDir(),
      headless: false,
      onLog: sendLog,
    });
    if (!result.ok) sendLog("warn", `จบแบบไม่สำเร็จ (${result.reason || "ไม่ทราบสาเหตุ"})`);
    return { ok: Boolean(result.ok), result };
  } catch (err) {
    if (err?.name === "AbortError") {
      sendLog("warn", "หยุดแล้ว");
      return { ok: false, reason: "stopped" };
    }
    sendLog("error", err?.message || String(err));
    return { ok: false, reason: "error", message: err?.message || String(err) };
  } finally {
    jobRunning = false;
    activeAbort = null;
    send("job:status", { running: false, mode: null });
  }
});

ipcMain.handle("browser:close", async () => {
  if (jobRunning) return { ok: false, reason: "busy" };
  const { closeSharedBrowser } = await srcModule("shared-browser.js");
  return closeSharedBrowser(sendLog);
});

ipcMain.handle("browser:info", async () => {
  try {
    const { getSharedBrowserInfo } = await srcModule("shared-browser.js");
    return getSharedBrowserInfo();
  } catch {
    return { open: false };
  }
});

ipcMain.handle("downloads:open", async () => {
  fs.mkdirSync(downloadDir(), { recursive: true });
  await shell.openPath(downloadDir());
  return { ok: true, path: downloadDir() };
});

ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  updaterEnabled: Boolean(updaterApi.enabled),
  reason: updaterApi.reason || null,
  portable: Boolean(updaterApi.portable),
  releasesUrl: updaterApi.releasesUrl || RELEASES_URL,
}));

ipcMain.handle("update:open-releases", async () => {
  const url = updaterApi.releasesUrl || RELEASES_URL;
  await shell.openExternal(url);
  return { ok: true, url };
});

ipcMain.handle("update:check", async () => {
  if (updaterApi.enabled && updaterApi.check) return updaterApi.check();
  const releasesUrl = updaterApi.releasesUrl || RELEASES_URL;
  if (updaterApi.reason === "portable") {
    const message = "เวอร์ชันพกพาอัปเดตในเครื่องไม่ได้ — ดาวน์โหลด Setup จากหน้า Releases";
    send("update:status", { state: "portable", message, releasesUrl });
    return { ok: false, reason: "portable", message, releasesUrl };
  }
  if (updaterApi.reason === "dev") {
    const message = "โหมดพัฒนา — ตรวจอัปเดตได้เฉพาะตัวติดตั้ง Setup ที่แพ็กแล้ว";
    send("update:status", { state: "skipped", message });
    return { ok: false, reason: "dev", message };
  }
  return { ok: false, reason: updaterApi.reason || "disabled" };
});

ipcMain.handle("update:download", async () => {
  if (updaterApi.enabled && updaterApi.download) return updaterApi.download();
  if (updaterApi.reason === "portable") {
    const releasesUrl = updaterApi.releasesUrl || RELEASES_URL;
    await shell.openExternal(releasesUrl);
    return { ok: false, reason: "portable", message: "เปิดหน้าดาวน์โหลดแล้ว — เลือกไฟล์ Setup", releasesUrl };
  }
  return { ok: false, reason: updaterApi.reason || "disabled" };
});

ipcMain.handle("update:install", () => {
  if (!updaterApi.enabled || !updaterApi.install) return { ok: false, reason: updaterApi.reason || "disabled" };
  updaterApi.install();
  return { ok: true };
});

app.whenReady().then(() => {
  const bundled = path.join(resourcesPath(), "ms-playwright");
  if (fs.existsSync(bundled)) process.env.PLAYWRIGHT_BROWSERS_PATH = bundled;

  createWindow();
  updaterApi = setupAutoUpdater(() => mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async () => {
  try {
    const { closeSharedBrowser } = await srcModule("shared-browser.js");
    await closeSharedBrowser(() => {});
  } catch {
    // ignore
  }
});

app.on("window-all-closed", () => {
  if (activeAbort) activeAbort.abort();
  if (process.platform !== "darwin") app.quit();
});
