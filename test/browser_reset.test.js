// "ล้างแคชเบราว์เซอร์": only the Playwright profile folder is wiped; everything next to it survives.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PROFILE_DIR_NAME, resolveProfileDir, resetBrowserProfile, stopWorkerBrowser } = require('../browser_reset');

function makeAppDir() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tsubot-reset-'));
  const profile = path.join(base, PROFILE_DIR_NAME);
  fs.mkdirSync(path.join(profile, 'Default', 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'Default', 'Cookies'), 'cookie-db');
  fs.writeFileSync(path.join(profile, 'Default', 'Cache', 'data_0'), 'cache');
  fs.mkdirSync(path.join(profile, 'Default', 'Local Storage', 'leveldb'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'Default', 'Local Storage', 'leveldb', '000003.log'), 'session');
  const keep = ['tsu_answers.json', 'tsu_missing.json', 'custom_courses.json', 'desktop_settings.json', 'crash.log', 'version.json'];
  keep.forEach(f => fs.writeFileSync(path.join(base, f), f));
  fs.mkdirSync(path.join(base, 'node_modules', 'playwright'), { recursive: true });
  fs.mkdirSync(path.join(base, 'ms-playwright', 'chromium-1'), { recursive: true });
  return { base, profile, keep };
}

test('profile dir matches the one worker.js / cli_worker.js / server.js launch with', () => {
  const root = path.join(__dirname, '..');
  assert.strictEqual(resolveProfileDir(root), path.join(root, 'user_profile'));
  for (const f of ['worker.js', 'cli_worker.js', 'server.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(src, /USER_DATA_DIR = path\.join\(__dirname, 'user_profile'\)/, f);
  }
});

test('wipes the whole profile (cache, cookies, storage) and keeps answer bank, settings, logs, browsers', async () => {
  const { base, profile, keep } = makeAppDir();
  const result = await resetBrowserProfile(base);
  assert.deepStrictEqual(result, { removed: true, path: profile });
  assert.ok(!fs.existsSync(profile));
  keep.forEach(f => assert.ok(fs.existsSync(path.join(base, f)), `${f} must survive`));
  assert.ok(fs.existsSync(path.join(base, 'node_modules', 'playwright')));
  assert.ok(fs.existsSync(path.join(base, 'ms-playwright', 'chromium-1')));
  fs.rmSync(base, { recursive: true, force: true });
});

test('no profile yet is a no-op success', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tsubot-reset-'));
  const result = await resetBrowserProfile(base);
  assert.strictEqual(result.removed, false);
  fs.rmSync(base, { recursive: true, force: true });
});

test('retries while Chrome still holds files, then succeeds', async () => {
  const { base, profile } = makeAppDir();
  let calls = 0;
  const rm = async (p, opts) => {
    calls++;
    if (calls < 3) { const e = new Error('EBUSY: resource busy or locked'); e.code = 'EBUSY'; throw e; }
    return fs.promises.rm(p, opts);
  };
  const result = await resetBrowserProfile(base, { rm, delayMs: 1 });
  assert.strictEqual(result.removed, true);
  assert.strictEqual(calls, 3);
  assert.ok(!fs.existsSync(profile));
  fs.rmSync(base, { recursive: true, force: true });
});

test('reports failure when the profile stays locked', async () => {
  const { base, profile } = makeAppDir();
  const rm = async () => { const e = new Error('EPERM: operation not permitted'); e.code = 'EPERM'; throw e; };
  await assert.rejects(resetBrowserProfile(base, { rm, retries: 2, delayMs: 1 }), /Could not delete .*EPERM/);
  assert.ok(fs.existsSync(profile));
  fs.rmSync(base, { recursive: true, force: true });
});

test('stopWorkerBrowser flags the worker and closes its browser without exiting the process', async () => {
  let closed = 0;
  const statuses = [];
  const worker = {
    shouldStop: false,
    browserContext: { close: async () => { closed++; } },
    setStatus: (s, step) => statuses.push([s, step])
  };
  await stopWorkerBrowser(worker);
  await stopWorkerBrowser(worker);
  assert.strictEqual(worker.shouldStop, true);
  assert.strictEqual(closed, 1);
  assert.strictEqual(worker.browserContext, null);
  assert.strictEqual(statuses[0][0], 'stopped');
});
