const { test } = require('node:test');
const assert = require('node:assert');
const playwright = require('playwright');
const AutomationWorker = require('../worker');

const launchOpts = { headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) };

test('parseDurationText handles mm:ss, hh:mm:ss, and invalid text', () => {
  assert.strictEqual(AutomationWorker.parseDurationText('05:30'), 330);
  assert.strictEqual(AutomationWorker.parseDurationText('1:02:03'), 3723);
  assert.strictEqual(AutomationWorker.parseDurationText('invalid'), 0);
  assert.strictEqual(AutomationWorker.parseDurationText(''), 0);
});

test('ensureVideoPlaying starts playback once without toggling pause on visible play button', async () => {
  const browser = await playwright.chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  await page.setContent(`
    <div id="player" class="html5-video-player paused-mode" style="width:640px;height:360px;position:relative;background:#111;">
      <video width="640" height="360"></video>
      <button class="ytp-play-button" style="position:absolute;left:10px;bottom:8px;width:40px;height:30px;">Toggle</button>
    </div>
    <script>
      window.__toggleCalls = 0;
      const player = document.getElementById('player');
      const v = document.querySelector('video');
      let _paused = true;
      let _cur = 0;
      Object.defineProperty(v, 'paused', { get: () => _paused });
      Object.defineProperty(v, 'ended', { get: () => false });
      Object.defineProperty(v, 'duration', { get: () => 300 });
      Object.defineProperty(v, 'readyState', { get: () => 4 });
      Object.defineProperty(v, 'currentTime', { get: () => _cur, set: (t) => { _cur = t; } });
      v.play = () => { _paused = false; return Promise.resolve(); };

      function toggle() {
        window.__toggleCalls++;
        _paused = !_paused;
        player.classList.toggle('playing-mode', !_paused);
        player.classList.toggle('paused-mode', _paused);
      }
      player.addEventListener('click', (e) => {
        if (e.target === player || e.target === v) toggle();
      });
      document.querySelector('.ytp-play-button').addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key.toLowerCase() === 'k') toggle();
      });
      setInterval(() => {
        if (!_paused) _cur += 0.25;
      }, 200);
    </script>
  `);

  const w = new AutomationWorker('test-v1', { speedMode: 'turbo' }, () => {}, () => {});
  w.page = page;
  const box = await page.locator('#player').boundingBox();
  const snap = await w.ensureVideoPlaying([page.mainFrame()], box);
  const toggles = await page.evaluate(() => window.__toggleCalls);

  await browser.close();
  assert.strictEqual(toggles, 1, `expected single play toggle, got ${toggles}`);
  assert.strictEqual(snap.video.paused, false);
  assert.ok(snap.video.cur >= 0.8, `expected cur >= 0.8s, got ${snap.video.cur}`);
});

test('waitForVideoCompletion recovers from snap-back via progress bar and reaches >= 97%', async () => {
  const browser = await playwright.chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  await page.setContent(`
    <div id="player" class="html5-video-player playing-mode" style="width:640px;height:360px;position:relative;background:#111;">
      <video width="640" height="360"></video>
      <div class="ytp-progress-bar" style="position:absolute;left:12px;right:12px;bottom:14px;height:10px;background:#555;"></div>
    </div>
    <script>
      const v = document.querySelector('video');
      const bar = document.querySelector('.ytp-progress-bar');
      let _cur = 2; // Simulates player snapping back to 2s after initial HTML5 seek
      window.__barClicks = 0;
      Object.defineProperty(v, 'paused', { get: () => false });
      Object.defineProperty(v, 'ended', { get: () => _cur >= 300 });
      Object.defineProperty(v, 'duration', { get: () => 300 });
      Object.defineProperty(v, 'currentTime', {
        get: () => _cur,
        set: (t) => {
          // Only allow direct seek to stick once progress bar click also ran
          if (window.__barClicks > 0 || t < 50) _cur = t;
          else _cur = 2;
        }
      });
      v.play = () => Promise.resolve();
      bar.addEventListener('click', (e) => {
        window.__barClicks++;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        _cur = 300 * ratio;
      });
      setInterval(() => {
        if (_cur < 300) _cur += 1.5;
      }, 250);
    </script>
  `);

  const w = new AutomationWorker('test-v2', { speedMode: 'turbo' }, () => {}, () => {});
  w.page = page;
  const box = await page.locator('#player').boundingBox();
  const res = await w.waitForVideoCompletion([page.mainFrame()], { playerBox: box, seekMargin: 10 });
  const barClicks = await page.evaluate(() => window.__barClicks);

  await browser.close();
  assert.ok(barClicks >= 1, `expected recovery click on progress bar, got ${barClicks}`);
  assert.ok(res && res.cur >= 300 * 0.97, `expected >= 97% completion, got ${JSON.stringify(res)}`);
});
