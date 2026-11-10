// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\cli_worker.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
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
const modes = getArg('modes', process.env.TSU_BOT_MODES || 'quiz,video,doc'); // any of quiz,video,doc

let activeWorker = null;

// Listen on standard input for commands: pause | resume | stop | cancel
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  const cmd = line.trim().toLowerCase();
  if (!activeWorker) return;

  if (cmd === 'pause') {
    activeWorker.pause();
  } else if (cmd === 'resume') {
    activeWorker.resume();
  } else if (cmd === 'stop' || cmd === 'cancel') {
    activeWorker.stop();
  }
});

async function main() {
  if (action === 'login') {
    console.log('[LOG] Opening Chrome for manual login...');
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    console.log('[LOG] Loading TSU Login page...');
    await page.goto('https://course.tsu.ac.th/login', { timeout: 60000 });
    console.log('[LOG] Browser is open. Please log in with your TSU account. You can close Chrome when finished.');
    
    // Keep alive until browser closed by user
    while (context.pages().length > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
    process.exit(0);
  }

  if (action === 'run') {
    activeWorker = new AutomationWorker(
      workerId,
      { courseCode, targetUrl: url, speedMode: speed, modes },
      (id, text, level) => {
        console.log(`[LOG] ${text}`);
      },
      (id, statusData) => {
        console.log(`[STATUS] ${JSON.stringify(statusData)}`);
      }
    );

    await activeWorker.start();
  }
}

main().catch(err => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
