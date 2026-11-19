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

const action = getArg('action', 'run'); // login | run | progress | list_courses
const courseCode = getArg('course', '');
const speed = getArg('speed', 'normal');
const url = getArg('url', '');
const workerId = getArg('id', 'Worker-1');
const modes = getArg('modes', process.env.TSU_BOT_MODES || 'quiz,video,doc'); // any of quiz,video,doc
const profileName = getArg('profile', '');
const profileDirArg = getArg('profile-dir', '');

function resolveProfileDataDir(profName, explicitDir) {
  if (explicitDir) {
    return path.isAbsolute(explicitDir) ? explicitDir : path.join(__dirname, explicitDir);
  }
  const clean = String(profName || '').trim();
  if (!clean || clean === 'Profile 1' || clean === 'profile_1' || clean === 'default' || clean === 'user_profile') {
    return USER_DATA_DIR;
  }
  const safe = clean.replace(/[^a-zA-Z0-9_-]/g, '_') || 'profile';
  return path.join(__dirname, 'user_profiles', safe);
}

const targetUserDataDir = resolveProfileDataDir(profileName, profileDirArg);

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
    const label = profileName ? ` (${profileName})` : '';
    console.log(`[LOG] Opening Chrome${label} for manual login... [Dir: ${path.basename(targetUserDataDir)}]`);
    fs.mkdirSync(targetUserDataDir, { recursive: true });
    const context = await chromium.launchPersistentContext(targetUserDataDir, {
      headless: false,
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    console.log(`[LOG] Loading TSU Login page${label}...`);
    await page.goto('https://course.tsu.ac.th/login', { timeout: 60000 });
    console.log(`[LOG] Browser${label} is open. Please log in with your TSU account. You can close Chrome when finished.`);
    
    // Keep alive until browser closed by user
    while (context.pages().length > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }
    process.exit(0);
  }

  if (action === 'run' || action === 'progress') {
    fs.mkdirSync(targetUserDataDir, { recursive: true });
    activeWorker = new AutomationWorker(
      workerId,
      {
        courseCode, targetUrl: url, speedMode: speed, modes,
        profileName, userDataDir: targetUserDataDir,
        progressOnly: action === 'progress',
        // Machine-readable Progress page summary; the desktop app only displays [LOG] lines.
        onProgress: (summary) => console.log(`[PROGRESS] ${JSON.stringify(summary)}`),
        onOutline: (summary) => console.log(`[OUTLINE] ${JSON.stringify(summary)}`)
      },
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
