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

test('fireAllPlayActions + isVideoActuallyAdvancing starts playback without clicking Autoplay/toggle', async () => {
  const browser = await playwright.chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  await page.setContent(`
    <div id="player" class="html5-video-player paused-mode" style="width:640px;height:360px;position:relative;background:#111;">
      <video width="640" height="360"></video>
      <button class="ytp-large-play-button" style="position:absolute;left:280px;top:150px;width:60px;height:40px;">Play</button>
      <button class="ytp-autonext-toggle-button" aria-label="Autoplay is on" style="position:absolute;left:500px;bottom:8px;width:40px;height:30px;">Auto</button>
      <button class="ytp-play-button" style="position:absolute;left:10px;bottom:8px;width:40px;height:30px;">Toggle</button>
    </div>
    <script>
      window.__autoplayClicks = 0;
      window.__toggleClicks = 0;
      const player = document.getElementById('player');
      const bigBtn = document.querySelector('.ytp-large-play-button');
      const v = document.querySelector('video');
      let _paused = true;
      let _cur = 0;
      Object.defineProperty(v, 'paused', { get: () => _paused });
      Object.defineProperty(v, 'ended', { get: () => false });
      Object.defineProperty(v, 'duration', { get: () => 300 });
      Object.defineProperty(v, 'currentTime', { get: () => _cur, set: (t) => { _cur = t; } });
      v.play = () => {
        _paused = false;
        bigBtn.style.display = 'none';
        return Promise.resolve();
      };

      player.addEventListener('click', (e) => {
        if (e.target === player || e.target === v || e.target === bigBtn) {
          window.__toggleClicks++;
          _paused = !_paused;
          bigBtn.style.display = _paused ? 'block' : 'none';
        }
      });
      document.querySelector('.ytp-autonext-toggle-button').addEventListener('click', () => {
        window.__autoplayClicks++;
      });
      document.querySelector('.ytp-play-button').addEventListener('click', (e) => {
        e.stopPropagation();
        window.__toggleClicks++;
        _paused = !_paused;
      });
      setInterval(() => {
        if (!_paused) _cur += 0.25;
      }, 200);
    </script>
  `);

  const w = new AutomationWorker('test-v1', { speedMode: 'turbo' }, () => {}, () => {});
  w.page = page;
  const box = await page.locator('#player').boundingBox();
  await w.fireAllPlayActions([page.mainFrame()], box);
  const advancing = await w.isVideoActuallyAdvancing([page.mainFrame()]);
  const timeInfo = await w.readVideoTime([page.mainFrame()]);
  const counts = await page.evaluate(() => ({
    autoplay: window.__autoplayClicks,
    toggles: window.__toggleClicks
  }));

  await browser.close();
  assert.strictEqual(counts.autoplay, 0, `must not click Autoplay button, got ${counts.autoplay}`);
  assert.strictEqual(counts.toggles, 1, `expected single play click, got ${counts.toggles}`);
  assert.strictEqual(advancing, true, 'expected video currentTime to advance >= 0.3s');
  assert.strictEqual(timeInfo.paused, false);
  assert.ok(timeInfo.cur >= 0.8, `expected cur >= 0.8s, got ${timeInfo.cur}`);
});

test('handleVideo retries when paused initially, confirms play, seeks to last 10s, and completes', async () => {
  const browser = await playwright.chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

  await page.setContent(`
    <div id="player" class="video-player" style="width:640px;height:360px;position:relative;background:#111;">
      <video width="640" height="360"></video>
    </div>
    <script>
      window.__centerClicks = 0;
      const player = document.getElementById('player');
      const v = document.querySelector('video');
      let _paused = true;
      let _cur = 0;
      Object.defineProperty(v, 'paused', { get: () => _paused });
      Object.defineProperty(v, 'ended', { get: () => _cur >= 120 });
      Object.defineProperty(v, 'duration', { get: () => 120 });
      Object.defineProperty(v, 'currentTime', { get: () => _cur, set: (t) => { _cur = t; } });
      // Simulate first attempt failing to start (poster intercept), second attempt succeeding
      v.play = () => {
        if (window.__centerClicks >= 2) _paused = false;
        return Promise.resolve();
      };
      player.addEventListener('click', () => {
        window.__centerClicks++;
        if (window.__centerClicks >= 2) _paused = !_paused;
      });
      setInterval(() => {
        if (!_paused && _cur < 120) _cur += 0.5;
      }, 200);
    </script>
  `);

  const logs = [];
  const w = new AutomationWorker('test-v3', { speedMode: 'turbo' }, (_id, m) => logs.push(m), () => {});
  w.page = page;
  await w.handleVideo(page.mainFrame());
  const finalCur = await page.evaluate(() => document.querySelector('video').currentTime);

  await browser.close();
  assert.ok(logs.some(m => m.includes('เริ่มเล่นแล้ว')), `expected play confirmation log, got: ${logs.join(' | ')}`);
  assert.ok(finalCur >= 120 * 0.97, `expected >= 97% (116.4s), got ${finalCur}`);
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
