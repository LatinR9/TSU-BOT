// Wipes the Playwright persistent profile (cache, cookies, storage, saved TSU login) so the next run
// starts with a fresh browser. Only the profile folder is touched: the answer bank, settings, logs and
// the downloaded Playwright browsers (ms-playwright) live elsewhere and are never deleted here.
const fs = require('fs');
const path = require('path');

const PROFILE_DIR_NAME = 'user_profile';

function resolveProfileDir(baseDir = __dirname) {
  return path.join(path.resolve(baseDir), PROFILE_DIR_NAME);
}

function assertSafeProfileDir(dir, baseDir) {
  const resolved = path.resolve(dir);
  const base = path.resolve(baseDir);
  if (path.basename(resolved) !== PROFILE_DIR_NAME || path.dirname(resolved) !== base) {
    throw new Error(`Refusing to delete unexpected path: ${resolved}`);
  }
  return resolved;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Chrome can hold profile files open for a moment after the context closes, so retry on lock errors.
async function resetBrowserProfile(baseDir = __dirname, { retries = 6, delayMs = 500, rm = fs.promises.rm } = {}) {
  const dir = assertSafeProfileDir(resolveProfileDir(baseDir), baseDir);
  if (!fs.existsSync(dir)) return { removed: false, path: dir };

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true });
      if (!fs.existsSync(dir)) return { removed: true, path: dir };
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) await sleep(delayMs);
  }
  const err = new Error(`Could not delete ${dir}: ${lastErr ? lastErr.message : 'still in use'}`);
  err.path = dir;
  throw err;
}

// AutomationWorker.stop() ends the process (it is built for cli_worker.js), so a long-lived server
// stops a worker by flagging it and closing its browser instead.
async function stopWorkerBrowser(worker) {
  if (!worker) return;
  worker.shouldStop = true;
  if (typeof worker.setStatus === 'function') {
    try { worker.setStatus('stopped', 'Stopped for browser reset'); } catch (_) {}
  }
  if (worker.browserContext) {
    await worker.browserContext.close().catch(() => {});
    worker.browserContext = null;
  }
}

module.exports = { PROFILE_DIR_NAME, resolveProfileDir, resetBrowserProfile, stopWorkerBrowser };
