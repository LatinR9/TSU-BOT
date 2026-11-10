// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\server.js
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { chromium } = require('playwright');
const dbManager = require('./db_manager');
const AutomationWorker = require('./worker');
const updater = require('./updater');
const browserReset = require('./browser_reset');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const USER_DATA_DIR = path.join(__dirname, 'user_profile');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Multi-Worker Store
const workers = new Map();
let workerCounter = 1;
let resetInProgress = false;

// Broadcast to WebSocket clients
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// REST API Endpoints

// 1. Check update from GitHub
app.get('/api/check-update', async (req, res) => {
  const updateInfo = await updater.checkUpdate();
  res.json(updateInfo);
});

// 2. Open Manual Login Browser
let loginContext = null;
app.post('/api/login-browser', async (req, res) => {
  if (resetInProgress) return res.status(409).json({ success: false, error: 'กำลังล้างแคชเบราว์เซอร์ กรุณารอสักครู่' });
  try {
    if (loginContext) {
      await loginContext.close().catch(() => {});
      loginContext = null;
    }
    loginContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    });

    const page = await loginContext.newPage();
    await page.goto('https://apps.course.tsu.ac.th/login', { timeout: 60000 });
    res.json({ success: true, message: 'Login browser opened. Please log in.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Courses list & Add Course
app.get('/api/courses', (req, res) => {
  const summary = dbManager.getCoursesSummary();
  res.json({ courses: summary });
});

app.post('/api/courses', (req, res) => {
  try {
    const { course_code, course_name, org, url, questions } = req.body;
    if (!course_code) {
      return res.status(400).json({ error: 'course_code is required' });
    }
    const created = dbManager.addCourse({ course_code, course_name, org, url, questions });
    res.json({ success: true, course: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Multi-Worker Management
app.get('/api/workers', (req, res) => {
  const list = [];
  workers.forEach(w => {
    list.push({
      id: w.id,
      courseCode: w.courseCode,
      targetUrl: w.targetUrl,
      speedMode: w.speedMode,
      status: w.status,
      currentStep: w.currentStep,
      itemsCompleted: w.itemsCompleted
    });
  });
  res.json({ workers: list });
});

app.post('/api/workers/create', (req, res) => {
  if (resetInProgress) return res.status(409).json({ success: false, error: 'กำลังล้างแคชเบราว์เซอร์ กรุณารอสักครู่' });
  const { courseCode, targetUrl, speedMode } = req.body;
  const id = `Worker-${workerCounter++}`;

  const worker = new AutomationWorker(
    id,
    { courseCode, targetUrl, speedMode },
    (wId, text, level) => {
      broadcast('log', { workerId: wId, text, level, time: new Date().toLocaleTimeString() });
    },
    (wId, statusData) => {
      broadcast('status', { workerId: wId, ...statusData });
    }
  );

  workers.set(id, worker);
  worker.runPromise = worker.start(); // Run async in background

  res.json({
    success: true,
    worker: { id, courseCode, speedMode, status: 'starting' }
  });
});

app.post('/api/workers/:id/pause', (req, res) => {
  const w = workers.get(req.params.id);
  if (w) {
    w.pause();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Worker not found' });
  }
});

app.post('/api/workers/:id/resume', (req, res) => {
  const w = workers.get(req.params.id);
  if (w) {
    w.resume();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Worker not found' });
  }
});

app.post('/api/workers/:id/stop', async (req, res) => {
  const w = workers.get(req.params.id);
  if (w) {
    await w.stop();
    workers.delete(req.params.id);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Worker not found' });
  }
});

// 5. Reset browser: stop everything using the profile, then wipe it (cache, cookies, storage, login)
app.post('/api/reset-browser', async (req, res) => {
  if (resetInProgress) {
    return res.status(409).json({ success: false, error: 'กำลังล้างแคชเบราว์เซอร์อยู่แล้ว' });
  }
  const active = workers.size + (loginContext ? 1 : 0);
  if (active > 0 && !(req.body && req.body.stopRunning)) {
    return res.status(409).json({ success: false, running: active, error: 'มีบอทหรือหน้าต่างล็อกอินกำลังทำงานอยู่' });
  }

  resetInProgress = true;
  try {
    const list = [...workers.values()];
    await Promise.all(list.map(w => browserReset.stopWorkerBrowser(w)));
    await Promise.all(list.map(w => Promise.race([
      Promise.resolve(w.runPromise).catch(() => {}),
      new Promise(r => setTimeout(r, 10000))
    ])));
    // A worker that was still launching may have opened its browser after the first close.
    await Promise.all(list.map(w => browserReset.stopWorkerBrowser(w)));
    workers.clear();
    if (loginContext) {
      await loginContext.close().catch(() => {});
      loginContext = null;
    }
    list.forEach(w => broadcast('status', { workerId: w.id, status: 'stopped', currentStep: 'Stopped for browser reset' }));

    const result = await browserReset.resetBrowserProfile(__dirname);
    res.json({ success: true, stopped: list.length, removed: result.removed, path: result.path });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    resetInProgress = false;
  }
});

// Start Server
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` TSU-BOT Pro Server running on http://localhost:${PORT}`);
  console.log(` Version: ${updater.CURRENT_VERSION}`);
  console.log(`====================================================`);

  // Open default browser on launch
  const openCmd = process.platform === 'win32' ? `start http://localhost:${PORT}` : `open http://localhost:${PORT}`;
  require('child_process').exec(openCmd, () => {});
});
