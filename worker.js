// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\worker.js
const { chromium } = require('playwright');
const path = require('path');
const dbManager = require('./db_manager');

const USER_DATA_DIR = path.join(__dirname, 'user_profile');

class AutomationWorker {
  constructor(id, options = {}, onLog = () => {}, onStatus = () => {}) {
    this.id = id;
    this.courseCode = options.courseCode || '';
    this.targetUrl = options.targetUrl || '';
    this.speedMode = options.speedMode || 'normal'; // turbo, normal, safe
    this.onLog = onLog;
    this.onStatus = onStatus;

    this.status = 'idle';
    this.currentStep = 'Ready';
    this.itemsCompleted = 0;
    this.shouldStop = false;
    this.isPaused = false;

    this.browserContext = null;
    this.page = null;

    this.delays = this.resolveDelays(this.speedMode);
  }

  resolveDelays(mode) {
    if (mode === 'turbo') {
      return { videoSeekMargin: 10, docDelay: 2000, clickDelay: 300, randomJitter: 0 };
    } else if (mode === 'safe') {
      return { videoSeekMargin: 15, docDelay: 8000, clickDelay: 1500, randomJitter: 800 };
    }
    // Normal / balanced
    return { videoSeekMargin: 10, docDelay: 5000, clickDelay: 800, randomJitter: 400 };
  }

  log(msg, level = 'info') {
    this.onLog(this.id, msg, level);
  }

  setStatus(status, step = '') {
    this.status = status;
    if (step) this.currentStep = step;
    this.onStatus(this.id, { status: this.status, step: this.currentStep, itemsCompleted: this.itemsCompleted });
  }

  async sleep(ms) {
    const jitter = this.delays.randomJitter > 0 ? Math.floor(Math.random() * this.delays.randomJitter) : 0;
    const total = ms + jitter;
    return new Promise(res => setTimeout(res, total));
  }

  async start() {
    this.shouldStop = false;
    this.isPaused = false;
    this.setStatus('running', 'Starting Browser');
    this.log(`🚀 Starting Worker [${this.id}] for course ${this.courseCode || 'General'} (Mode: ${this.speedMode})`);

    try {
      this.browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        viewport: null,
        args: ['--disable-blink-features=AutomationControlled', '--mute-audio', '--start-maximized']
      });

      this.page = this.browserContext.pages().length > 0 ? this.browserContext.pages()[0] : await this.browserContext.newPage();
      const startUrl = this.targetUrl || 'https://apps.course.tsu.ac.th/learning/courses';
      this.log(`🌐 Navigating to ${startUrl}...`);
      await this.page.goto(startUrl, { timeout: 60000 }).catch(e => this.log(`Nav warning: ${e.message}`, 'warn'));

      await this.sleep(2000);
      this.setStatus('running', 'Executing Loop');

      while (!this.shouldStop) {
        while (this.isPaused && !this.shouldStop) {
          this.setStatus('paused', 'Paused by user');
          await this.sleep(1000);
        }
        if (this.shouldStop) break;

        await this.processCurrentUnit();
        if (this.shouldStop) break;

        const moved = await this.advanceNextUnit();
        if (!moved) {
          this.log(`🏁 No 'Next' unit detected or course finished.`, 'info');
          this.setStatus('completed', 'Course Finished / Reached End');
          break;
        }

        this.itemsCompleted++;
        this.setStatus('running', `Completed ${this.itemsCompleted} units`);
        await this.sleep(this.delays.clickDelay);
      }
    } catch (err) {
      this.log(`❌ Error in worker: ${err.message}`, 'error');
      this.setStatus('error', err.message);
    }
  }

  async processCurrentUnit() {
    if (!this.page || this.page.isClosed()) return;

    // Check if video element is present
    const hasVideo = await this.page.evaluate(() => {
      const v = document.querySelector('video');
      return !!v;
    }).catch(() => false);

    if (hasVideo) {
      await this.handleVideo();
      return;
    }

    // Check if quiz/problem block is present
    const hasQuiz = await this.page.evaluate(() => {
      return !!document.querySelector('.problem, .xblock-student_view[data-block-type="problem"], .que, button.submit');
    }).catch(() => false);

    if (hasQuiz) {
      await this.handleQuiz();
      return;
    }

    // Otherwise handle as document / slide reading unit
    await this.handleDocument();
  }

  async handleVideo() {
    this.setStatus('running', 'Watching Video');
    this.log(`🎬 Video detected. Starting playback...`);

    // Unmute & play
    await this.page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
    }).catch(() => {});

    // Wait until play begins (currentTime > 0)
    let started = false;
    for (let i = 0; i < 15; i++) {
      if (this.shouldStop) return;
      const cur = await this.page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : 0;
      }).catch(() => 0);

      if (cur > 0.5) {
        started = true;
        break;
      }
      await this.sleep(1000);
    }

    // Fast-forward to last N seconds per specification
    const margin = this.delays.videoSeekMargin;
    const durInfo = await this.page.evaluate((m) => {
      const v = document.querySelector('video');
      if (!v) return null;
      const dur = v.duration || 0;
      if (dur > m + 5) {
        v.currentTime = Math.max(0, dur - m);
      }
      return { duration: dur, current: v.currentTime };
    }, margin).catch(() => null);

    this.log(`⏩ Video seeked to ${Math.round(durInfo?.current || 0)}s / ${Math.round(durInfo?.duration || 0)}s`);
    await this.sleep(2500);
  }

  async handleDocument() {
    this.setStatus('running', 'Reading Document');
    this.log(`📄 Document/Reading material detected. Simulating read...`);

    // Smooth scroll down
    await this.page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
    }).catch(() => {});
    await this.sleep(this.delays.docDelay / 2);

    await this.page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }).catch(() => {});
    await this.sleep(this.delays.docDelay / 2);

    this.log(`✅ Document reading requirement fulfilled.`);
  }

  async handleQuiz() {
    this.setStatus('running', 'Solving Quiz');
    this.log(`📝 Quiz detected. Analyzing questions...`);

    const pageUrl = this.page.url().toLowerCase();
    const isPretest = pageUrl.includes('pre-test') || pageUrl.includes('pretest') ||
                      (await this.page.content().catch(() => '')).includes('ก่อนเรียน');

    // Extract questions and choices
    const questions = await this.page.$$('.problem, .xblock-student_view[data-block-type="problem"], .que');

    for (const qEl of questions) {
      if (this.shouldStop) return;
      try {
        const qText = await qEl.$eval('legend, .question-title, p, h3', el => el.innerText.trim()).catch(() => '');
        const choiceLabels = await qEl.$$('label, .choice, input[type="radio"], input[type="checkbox"]');

        if (isPretest) {
          // Pretest policy: Random answer
          if (choiceLabels.length > 0) {
            const randIdx = Math.floor(Math.random() * choiceLabels.length);
            await choiceLabels[randIdx].click().catch(() => {});
            this.log(`🎲 Pre-test: selected random option for "${qText.substring(0, 30)}..."`);
          }
        } else {
          // Post-test or Chapter Quiz: Lookup in database
          const ansData = dbManager.findAnswer(this.courseCode, qText);
          let matched = false;

          if (ansData && ansData.status === 'confirmed' && ansData.correct_answer) {
            const targetAns = ansData.correct_answer.trim();
            for (const ch of choiceLabels) {
              const labelText = await ch.innerText().catch(() => '');
              if (labelText.includes(targetAns) || targetAns.includes(labelText)) {
                await ch.click().catch(() => {});
                matched = true;
                this.log(`🎯 Match found: "${targetAns}" (Score: ${Math.round(ansData.score * 100)}%)`);
                break;
              }
            }
          }

          if (!matched && choiceLabels.length > 0) {
            // Unconfirmed or unknown: Pick choice not in known_wrong_answers
            const wrongList = ansData?.known_wrong_answers || [];
            let picked = false;
            for (const ch of choiceLabels) {
              const t = await ch.innerText().catch(() => '');
              if (!wrongList.some(w => t.includes(w))) {
                await ch.click().catch(() => {});
                picked = true;
                break;
              }
            }
            if (!picked) await choiceLabels[0].click().catch(() => {});
          }
        }
      } catch (e) {
        // Continue to next question
      }
    }

    // Submit attempt if button exists
    const submitBtn = await this.page.$('button.submit, button:has-text("Submit"), button:has-text("ส่ง")');
    if (submitBtn) {
      await submitBtn.click().catch(() => {});
      this.log(`📤 Quiz answers submitted.`);
      await this.sleep(2000);
    }
  }

  async advanceNextUnit() {
    const nextSelectors = [
      'button.sequence-nav-button.button-next',
      'button:has-text("Next")',
      'a:has-text("ถัดไป")',
      '.next-btn'
    ];

    for (const sel of nextSelectors) {
      try {
        const btn = await this.page.$(sel);
        if (btn) {
          const isVisible = await btn.isVisible().catch(() => false);
          const isEnabled = await btn.isEnabled().catch(() => false);
          if (isVisible && isEnabled) {
            this.log(`⏭️ Moving to next unit...`);
            await btn.click().catch(() => {});
            await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            return true;
          }
        }
      } catch (e) {}
    }
    return false;
  }

  pause() {
    this.isPaused = true;
    this.setStatus('paused');
    this.log(`⏸️ Worker paused.`);
  }

  resume() {
    this.isPaused = false;
    this.setStatus('running');
    this.log(`▶️ Worker resumed.`);
  }

  async stop() {
    this.shouldStop = true;
    this.setStatus('stopped', 'Stopped by user');
    this.log(`⏹️ Worker stopping...`);
    if (this.browserContext) {
      await this.browserContext.close().catch(() => {});
    }
  }
}

module.exports = AutomationWorker;
