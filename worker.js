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
      this.setStatus('running', 'Entering Course');

      // If landed on Course Outline (/home), automatically enter the first lesson
      await this.enterCourseFromOutline();

      this.setStatus('running', 'Executing Loop');

      while (!this.shouldStop) {
        while (this.isPaused && !this.shouldStop) {
          this.setStatus('paused', 'Paused by user');
          await this.sleep(1000);
        }
        if (this.shouldStop) break;

        // Ensure we are inside courseware, not stuck on syllabus outline
        if (this.page.url().includes('/home')) {
          await this.enterCourseFromOutline();
        }

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

  async enterCourseFromOutline() {
    const curUrl = this.page.url();
    if (curUrl.includes('/home') || curUrl.includes('/courseware') || !curUrl.includes('/block-v1:')) {
      this.log(`🔍 Checking course outline to enter first lesson...`);
      await this.sleep(2000);

      // Selectors for Start/Resume button in modern Open edX MFE
      const resumeSelectors = [
        'a:has-text("Resume Course")',
        'a:has-text("Start Course")',
        'a:has-text("เริ่มเรียน")',
        'a:has-text("เรียนต่อ")',
        '.action-resume-course',
        'a.resume-course-btn',
        'a.outline-button',
        'a.course-target-link',
        'a[href*="/block-v1:"]',
        'a[href*="/jump_to/"]'
      ];

      for (const sel of resumeSelectors) {
        try {
          const btn = await this.page.$(sel);
          if (btn) {
            const isVisible = await btn.isVisible().catch(() => false);
            if (isVisible) {
              const text = await btn.innerText().catch(() => '');
              this.log(`🎯 Clicking course entry: "${text || sel}"...`);
              await btn.click().catch(() => {});
              await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
              await this.sleep(3000);
              return;
            }
          }
        } catch (e) {}
      }

      // If no resume button, try clicking the first lesson link in the course outline
      try {
        const outlineLink = await this.page.$('ol.outline-sections a, .course-outline a[href*="/block-v1:"], a[href*="/jump_to/"], .outline-item a, a.unit-link');
        if (outlineLink) {
          this.log(`🎯 Clicking first available lesson link in outline...`);
          await outlineLink.click().catch(() => {});
          await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          await this.sleep(3000);
        }
      } catch (e) {}
    }
  }

  async processCurrentUnit() {
    if (!this.page || this.page.isClosed()) return;

    // Check if the current unit is already completed with a green checkmark
    const isCompleted = await this.isCurrentUnitCompleted();
    if (isCompleted) {
      this.log(`⏭️ [ข้าม] หน่วยนี้ขึ้นติ๊กเขียวแล้ว (Completed) ข้ามไปหน่วยถัดไปทันทีตามเกณฑ์ TSU...`);
      return;
    }

    this.log(`🔍 กำลังตรวจสอบเนื้อหาของหน่วยเรียน...`);

    let videoFrame = null;
    let quizFrame = null;

    // Poll for up to 6 seconds to allow React / edX MFE to render components
    for (let attempt = 0; attempt < 6; attempt++) {
      if (this.shouldStop) return;

      const allFrames = [this.page.mainFrame(), ...this.page.frames()];

      for (const f of allFrames) {
        try {
          const hasV = await f.evaluate(() => {
            return !!document.querySelector('video, .video-player, div[data-component-type="video"], iframe[src*="youtube"], .video, .btn-play');
          }).catch(() => false);

          if (hasV) {
            videoFrame = f;
            break;
          }

          const hasQ = await f.evaluate(() => {
            return !!document.querySelector('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], form.problem-form, .capa_inputtype, .que, button.submit');
          }).catch(() => false);

          if (hasQ) {
            quizFrame = f;
            break;
          }
        } catch (e) {}
      }

      if (videoFrame || quizFrame) break;
      await this.sleep(1000);
    }

    if (videoFrame) {
      await this.handleVideo(videoFrame);
      return;
    }

    if (quizFrame) {
      await this.handleQuiz(quizFrame);
      return;
    }

    // 3. Otherwise handle as document / slide reading unit
    await this.handleDocument(this.page.mainFrame());
  }

  async isCurrentUnitCompleted() {
    try {
      return await this.page.evaluate(() => {
        const activeNav = document.querySelector('nav[aria-label="Unit"] button[aria-current="true"], .tab-item.active, button.seq_video.active, button.active');
        if (!activeNav) return false;
        const hasCheckIcon = !!activeNav.querySelector('.fa-check, [data-icon="check-circle"], .check-circle, .complete');
        const hasAriaComplete = (activeNav.getAttribute('aria-label') || '').toLowerCase().includes('complete');
        const hasCompletedClass = activeNav.classList.contains('complete') || activeNav.classList.contains('success');
        return hasCheckIcon || hasAriaComplete || hasCompletedClass;
      });
    } catch (e) {
      return false;
    }
  }

  async handleVideo(frame) {
    this.setStatus('running', 'Watching Video');
    this.log(`🎬 ตรวจพบคลิปวิดีโอ กำลังเริ่มเล่น...`);

    // 1. Unmute & click play
    await frame.evaluate(() => {
      const v = document.querySelector('video');
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
      const playBtn = document.querySelector('.btn-play, .play-btn, button[aria-label="Play"], .video-control.play-pause, .play');
      if (playBtn) playBtn.click();
    }).catch(() => {});

    // 2. Wait 1-2s until playback starts (currentTime > 0) per README_TH.md
    let started = false;
    for (let i = 0; i < 15; i++) {
      if (this.shouldStop) return;
      const cur = await frame.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : 0;
      }).catch(() => 0);

      if (cur > 0.5) {
        started = true;
        this.log(`▶️ คลิปวิดีโอเริ่มเล่นแล้ว (เวลาเดิน ${cur.toFixed(1)}s)...`);
        break;
      }
      await this.sleep(1000);
    }

    // 3. Seek to last ~10 seconds per README_TH.md
    const margin = this.delays.videoSeekMargin || 10;
    const durInfo = await frame.evaluate((m) => {
      const v = document.querySelector('video');
      if (!v) return null;
      const dur = v.duration || 0;
      if (dur > m + 5) {
        v.currentTime = Math.max(0, dur - m);
      }
      return { duration: dur, current: v.currentTime };
    }, margin).catch(() => null);

    this.log(`⏩ เลื่อนคลิปไปช่วง 10 วินาทีสุดท้าย (${Math.round(durInfo?.current || 0)}s / ${Math.round(durInfo?.duration || 0)}s) เพื่อรับติ๊กเขียว...`);
    // 4. Let it play for a few seconds so Open edX server registers completion
    await this.sleep(4000);
  }

  async handleDocument(frame) {
    this.setStatus('running', 'Reading Document');
    this.log(`📄 ตรวจพบเอกสาร/สไลด์ กำลังเลื่อนอ่านและรอตามเกณฑ์ TSU (5 วินาที)...`);

    // Smooth scroll down
    await this.page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
    }).catch(() => {});
    await this.sleep(2500);

    await this.page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }).catch(() => {});
    await this.sleep(2500);

    this.log(`✅ อ่านเอกสารครบ 5 วินาทีเรียบร้อยตามเกณฑ์.`);
  }

  async handleQuiz(frame) {
    this.setStatus('running', 'Solving Quiz');
    this.log(`📝 ตรวจพบแบบทดสอบ (Quiz) กำลังวิเคราะห์โจทย์...`);

    const pageUrl = this.page.url().toLowerCase();
    const isPretest = pageUrl.includes('pre-test') || pageUrl.includes('pretest') ||
                      (await this.page.content().catch(() => '')).includes('ก่อนเรียน');

    // Extract questions across frame or main page
    let questions = await frame.$$('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], .capa_inputtype, .que');
    if (questions.length === 0) {
      questions = await this.page.$$('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], .capa_inputtype, .que');
    }

    this.log(`📝 พบจำนวนข้อสอบทั้งหมด ${questions.length} ข้อ`);

    let qIndex = 1;
    for (const qEl of questions) {
      if (this.shouldStop) return;
      try {
        const qText = await qEl.$eval('legend, .question-title, .problem-header, p, h3, .qtext', el => el.innerText.trim()).catch(() => '');
        const choiceLabels = await qEl.$$('label, .choice, input[type="radio"], input[type="checkbox"], fieldset div');
        const textInput = await qEl.$('input.input[type="text"], input[type="text"]');

        if (isPretest) {
          // README_TH.md policy: Pre-test must be random
          if (choiceLabels.length > 0) {
            const randIdx = Math.floor(Math.random() * choiceLabels.length);
            await choiceLabels[randIdx].click().catch(() => {});
            this.log(`🎲 [Pre-test] ข้อ ${qIndex}: สุ่มเลือกตัวเลือกอัตโนมัติ`);
          }
        } else {
          // Post-test / Chapter quiz: lookup answer from database
          const ansData = dbManager.findAnswer(this.courseCode, qText);
          let answered = false;

          // Special case for TSUGE07272: ข้อ มานี มี 5 ปี สองอัน อันแรกผิด อันที่สองถูก
          if (this.courseCode === 'TSUGE07272' && qText.includes('มานี') && choiceLabels.length >= 2) {
            await choiceLabels[1].click().catch(() => {});
            answered = true;
            this.log(`🎯 ข้อ ${qIndex}: [TSUGE07272 กฎพิเศษ] เลือก 5 ปี อันที่สอง`);
          }

          if (!answered && ansData && ansData.status === 'confirmed' && ansData.correct_answer) {
            const targetAns = ansData.correct_answer.trim();

            // Case 1: Choice radio / checkbox
            if (choiceLabels.length > 0) {
              for (const ch of choiceLabels) {
                const labelText = await ch.innerText().catch(() => '');
                if (labelText.includes(targetAns) || targetAns.includes(labelText)) {
                  await ch.click().catch(() => {});
                  answered = true;
                  this.log(`🎯 ข้อ ${qIndex}: กาคำตอบ "${targetAns}" (ความตรงกัน: ${Math.round(ansData.score * 100)}%)`);
                  break;
                }
              }
            }

            // Case 2: Text input field (e.g. TSUGE00152 reported speech)
            if (!answered && textInput) {
              await textInput.fill(targetAns).catch(() => {});
              answered = true;
              this.log(`🎯 ข้อ ${qIndex}: พิมพ์คำตอบ "${targetAns}"`);
            }
          }

          if (!answered && choiceLabels.length > 0) {
            // Unconfirmed or unknown: Pick choice not in known_wrong_answers
            const wrongList = ansData?.known_wrong_answers || [];
            let picked = false;
            for (const ch of choiceLabels) {
              const t = await ch.innerText().catch(() => '');
              if (!wrongList.some(w => t.includes(w))) {
                await ch.click().catch(() => {});
                picked = true;
                this.log(`💡 ข้อ ${qIndex}: เลือกตัวเลือกที่ไม่อยู่ในรายการที่เคยผิด`);
                break;
              }
            }
            if (!picked) {
              await choiceLabels[0].click().catch(() => {});
              this.log(`💡 ข้อ ${qIndex}: สุ่มเลือกตัวเลือกแรก`);
            }
          }
        }
      } catch (e) {
        // Continue to next question
      }
      qIndex++;
    }

    // Submit attempt: search both frame and page
    const submitBtn = (await frame.$('button.submit, button[data-value="Submit"], button:has-text("Submit"), button:has-text("ส่งคำตอบ"), button:has-text("ส่ง"), button:has-text("ตรวจคำตอบ")'))
                   || (await this.page.$('button.submit, button[data-value="Submit"], button:has-text("Submit"), button:has-text("ส่งคำตอบ"), button:has-text("ส่ง"), button:has-text("ตรวจคำตอบ")'));

    if (submitBtn) {
      this.log(`📤 กำลังกดส่งคำตอบ (Submit)...`);
      await submitBtn.click().catch(() => {});
      await this.sleep(3000);
    }
  }

  async advanceNextUnit() {
    const nextSelectors = [
      'button[aria-label="Next"]',
      'button[aria-label="ถัดไป"]',
      'button.sequence-nav-button.button-next',
      'nav[aria-label="Unit"] button:has-text("Next")',
      'nav[aria-label="Unit"] button:has-text("ถัดไป")',
      'button:has-text("Next")',
      'button:has-text("ถัดไป")',
      'button:has-text("Next Unit")',
      'button:has-text("Next Section")',
      'button:has-text("บทถัดไป")',
      'a:has-text("Next")',
      'a:has-text("ถัดไป")',
      'a.next-btn',
      'a.btn-next',
      '.next-btn'
    ];

    for (const sel of nextSelectors) {
      try {
        const btn = await this.page.$(sel);
        if (btn) {
          const isVisible = await btn.isVisible().catch(() => false);
          const isEnabled = await btn.isEnabled().catch(() => false);
          if (isVisible && isEnabled) {
            this.log(`⏭️ Moving to next unit (${sel})...`);
            await btn.click().catch(() => {});
            await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            await this.sleep(2000);
            return true;
          }
        }
      } catch (e) {}
    }

    // Secondary approach: Click the next unit bubble in the top sequence nav
    try {
      const activeNavTab = await this.page.$('nav[aria-label="Unit"] ol li button[aria-current="true"], .tab-item.active, button.seq_video.active');
      if (activeNavTab) {
        const nextNavTab = await this.page.evaluateHandle(el => {
          const li = el.closest('li');
          const nextLi = li ? li.nextElementSibling : null;
          return nextLi ? nextLi.querySelector('button, a') : null;
        }, activeNavTab);

        if (nextNavTab && nextNavTab.asElement()) {
          this.log(`⏭️ Moving to next sequence tab at top...`);
          await nextNavTab.asElement().click().catch(() => {});
          await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          await this.sleep(2000);
          return true;
        }
      }
    } catch (e) {}

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
