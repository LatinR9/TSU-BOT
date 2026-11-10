// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\cli_worker.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const dbManager = require('./db_manager');
const AutomationWorker = require('./worker');

const USER_DATA_DIR = path.join(__dirname, 'user_profile');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name, defaultVal = '') {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return defaultVal;
}

const action = getArg('action', 'run'); // login | run | list_courses
const courseCode = getArg('course', '');
const speed = getArg('speed', 'normal');
const url = getArg('url', '');
const workerId = getArg('id', 'Worker-1');

async function main() {
  if (action === 'login') {
    console.log('[LOG] Opening Chrome for manual login...');
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    });
    const page = await context.newPage();
    await page.goto('https://apps.course.tsu.ac.th/login');
    console.log('[LOG] Browser is open. Log in now. You can close the browser when finished.');
    
    // Keep alive until browser closed by user
    while (context.pages().length > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
    process.exit(0);
  }

  if (action === 'run') {
    const worker = new AutomationWorker(
      workerId,
      { courseCode, targetUrl: url, speedMode: speed },
      (id, text, level) => {
        console.log(`[LOG] ${text}`);
      },
      (id, statusData) => {
        console.log(`[STATUS] ${JSON.stringify(statusData)}`);
      }
    );

    await worker.start();
  }
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
