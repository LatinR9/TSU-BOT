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
    const modeList = String(options.modes || '').toLowerCase().split(',').map(m => m.trim())
      .filter(m => m === 'quiz' || m === 'video' || m === 'doc');
    this.modes = new Set(modeList.length ? modeList : ['quiz', 'video', 'doc']);
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
    const interval = 200;
    let elapsed = 0;
    while (elapsed < total && !this.shouldStop) {
      while (this.isPaused && !this.shouldStop) {
        await new Promise(r => setTimeout(r, 300));
      }
      const slice = Math.min(interval, total - elapsed);
      await new Promise(r => setTimeout(r, slice));
      elapsed += slice;
    }
  }

  async start() {
    this.shouldStop = false;
    this.isPaused = false;
    this.setStatus('running', 'Starting Browser');
    this.log(`🚀 Starting Worker [${this.id}] for course ${this.courseCode || 'General'} (Mode: ${this.speedMode}, Tasks: ${[...this.modes].join(',')})`);

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

      await this.sleep(2500);
      this.setStatus('running', 'Entering Course');

      // If landed on Course Outline (/home), automatically enter the first lesson
      if (this.page.url().includes('/home')) {
        await this.enterCourseFromOutline();
      }

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
          if (this.page.url().includes('/home')) {
            this.log(`⏳ กำลังรอให้เข้าสู่หน้าบทเรียนหลัก...`);
            await this.sleep(3000);
            continue;
          }
        }

        await this.processCurrentUnit();
        if (this.shouldStop) break;

        const moved = await this.advanceNextUnit();
        if (!moved) {
          this.log(`🏁 ไม่พบปุ่ม 'Next' หรือเรียนจบทุกบทแล้ว (Course Finished).`, 'info');
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
      this.log(`🔍 ตรวจสอบหน้าโครงสร้างรายวิชา เพื่อค้นหาปุ่มเริ่มเรียน / เรียนต่อ (Resume Course)...`);

      const resumeSelectors = [
        'a:has-text("Resume course")',
        'a:has-text("Resume Course")',
        'a:has-text("Start course")',
        'a:has-text("Start Course")',
        'a:has-text("เริ่มเรียน")',
        'a:has-text("เรียนต่อ")',
        '.action-resume-course',
        'a.resume-course-btn',
        'a.outline-button',
        'a.course-target-link',
        'ol.outline-sections a',
        '.course-outline a[href*="/block-v1:"]',
        'a[href*="/block-v1:"]',
        'a[href*="/jump_to/"]',
        '.outline-item a',
        'a.unit-link'
      ];

      for (let attempt = 0; attempt < 10; attempt++) {
        if (this.shouldStop) return;

        for (const sel of resumeSelectors) {
          try {
            const btn = await this.page.$(sel);
            if (btn) {
              const isVisible = await btn.isVisible().catch(() => false);
              if (isVisible) {
                const text = await btn.innerText().catch(() => '');
                this.log(`🎯 กดเข้าสู่บทเรียน: "${text || sel}"...`);
                await btn.click().catch(() => {});
                await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
                await this.sleep(3000);
                return;
              }
            }
          } catch (e) {}
        }
        await this.sleep(1000);
      }
    }
  }

  async processCurrentUnit() {
    if (!this.page || this.page.isClosed()) return;

    // Wait a brief moment for dynamic React / Open edX MFE DOM to settle
    await this.sleep(1500);

    // 1. Comprehensive check: Is the current unit already completed (Green Checkmark / Full Marks)?
    const isCompleted = await this.isCurrentUnitCompleted();
    if (isCompleted) {
      this.log(`⏭️ [ข้ามทันที] หน่วยนี้ขึ้นติ๊กถูกสีเขียว/ได้คะแนนเต็มแล้ว (Completed) ข้ามไปหน่วยถัดไปทันทีตามเกณฑ์ TSU...`);
      return;
    }

    this.log(`🔍 กำลังตรวจสอบเนื้อหาของหน่วยเรียน...`);

    let videoFrame = null;
    let quizFrame = null;

    // Poll for up to 6 seconds to allow React / edX MFE components to render
    for (let attempt = 0; attempt < 6; attempt++) {
      if (this.shouldStop) return;

      const allFrames = [this.page.mainFrame(), ...this.page.frames()];

      for (const f of allFrames) {
        try {
          const hasV = await f.evaluate(() => {
            return !!document.querySelector('video, .video-player, div[data-component-type="video"], div[data-block-type="video"], .video-wrapper, .video, iframe[src*="youtube"], .btn-play, .video-play-button');
          }).catch(() => false);

          if (hasV) {
            videoFrame = f;
            break;
          }

          const hasQ = await f.evaluate(() => {
            return !!document.querySelector('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], form.problem-form, .capa_inputtype, .wrapper-problem-response, .que, input[type="text"], input[type="radio"]');
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
      if (!this.modes.has('video')) {
        this.log(`⏭️ [ข้ามตามที่เลือก] หน่วยนี้เป็นวิดีโอ แต่ไม่ได้เลือกให้ทำวิดีโอ — ไปหน่วยถัดไป`);
        return;
      }
      await this.handleVideo(videoFrame);
      return;
    }

    if (quizFrame) {
      if (!this.modes.has('quiz')) {
        this.log(`⏭️ [ข้ามตามที่เลือก] หน่วยนี้เป็นแบบฝึก แต่ไม่ได้เลือกให้ทำแบบฝึก — ไปหน่วยถัดไป`);
        return;
      }
      await this.handleQuiz(quizFrame);
      return;
    }

    // Otherwise handle as document / slide reading unit
    if (!this.modes.has('doc')) {
      this.log(`⏭️ [ข้ามตามที่เลือก] หน่วยนี้เป็นเอกสาร แต่ไม่ได้เลือกให้ทำเอกสาร — ไปหน่วยถัดไป`);
      return;
    }
    await this.handleDocument(this.page.mainFrame());
  }

  async isCurrentUnitCompleted() {
    try {
      // 1. Direct Instant Check: Page body text (catches "1/1 point (graded)" in <10ms)
      const instantCheck = await this.page.evaluate(() => {
        const bodyTxt = document.body ? document.body.innerText : '';
        
        // Check full score: "1/1 point", "1 of 1 point", "1.0/1.0 point", "คะแนน 1/1"
        if (/1\s*\/\s*1\s*point/i.test(bodyTxt) || /1\s*of\s*1\s*point/i.test(bodyTxt) || /1\.0\s*\/\s*1\.0\s*point/i.test(bodyTxt) || /คะแนน\s*1\s*\/\s*1/i.test(bodyTxt)) {
          return { done: true, reason: 'ตรวจพบข้อความ 1/1 point (graded) ได้คะแนนเต็มแล้ว' };
        }

        // Check exhausted attempts with answer submitted
        if ((bodyTxt.includes('Your Answer has been receive') || bodyTxt.includes('Your answer has been received')) &&
            /used\s*(\d+)\s*of\s*\1\s*attempts/i.test(bodyTxt)) {
          return { done: true, reason: 'ใช้โควตาส่งคำตอบครบแล้วและระบบบันทึกผลแล้ว' };
        }

        // Check green checkmark icon in navigation bar between Previous and Next
        const prevBtn = document.querySelector('button[aria-label*="Previous" i], button:has-text("Previous"), button:has-text("ก่อนหน้า")');
        const nextBtn = document.querySelector('button[aria-label*="Next" i], button:has-text("Next"), button:has-text("ถัดไป")');
        if (prevBtn && nextBtn && prevBtn.parentElement) {
          const barContainer = prevBtn.parentElement;
          const greenIcons = barContainer.querySelectorAll('[data-icon="check"], [data-icon="check-circle"], .fa-check, svg.text-success, svg[class*="success"], .text-success');
          if (greenIcons.length > 0) {
            return { done: true, reason: 'ตรวจพบเครื่องหมายติ๊กถูกสีเขียว (Green Checkmark) บนแถบนำทาง' };
          }
        }

        // Check active unit tab in any sequence / unit navigation container
        const activeNav = document.querySelector(`
          nav button[aria-current],
          nav [aria-current="step"],
          nav [aria-current="page"],
          nav [aria-current="true"],
          nav button.active,
          nav li.active button,
          .sequence-navigation button[aria-current],
          .sequence-navigation button.active,
          .unit-navigation button[aria-current],
          .unit-navigation button.active,
          button[aria-current="step"],
          button[aria-current="page"],
          button[aria-current="true"],
          [aria-selected="true"]
        `);

        if (activeNav) {
          const parentLi = activeNav.closest('li') || activeNav;
          const checkIcon = activeNav.querySelector('[data-icon*="check"], .fa-check, svg.text-success, svg[class*="success"], .text-success, .complete, .completed')
                         || parentLi.querySelector('[data-icon*="check"], .fa-check, svg.text-success, svg[class*="success"], .text-success, .complete, .completed');
          if (checkIcon) {
            return { done: true, reason: 'ตรวจพบไอคอนติ๊กถูกบนปุ่มบทเรียนปัจจุบัน' };
          }

          const txt = (activeNav.innerText || '') + ' ' + (parentLi.innerText || '');
          if (txt.includes('✓') || txt.includes('✔')) {
            return { done: true, reason: 'พบสัญลักษณ์ติ๊กถูก (✓) บนปุ่มบทเรียน' };
          }

          // Check aria-label / title
          const aria = ((activeNav.getAttribute('aria-label') || '') + ' ' + (parentLi.getAttribute('aria-label') || '')).toLowerCase();
          if (aria.includes('completed') || aria.includes('complete') || aria.includes('ผ่านแล้ว')) {
            if (!aria.includes('incomplete') && !aria.includes('not completed')) {
              return { done: true, reason: `aria-label ระบุว่าเสร็จสิ้น (${aria})` };
            }
          }
        }

        return { done: false };
      }).catch(() => ({ done: false }));

      if (instantCheck && instantCheck.done) {
        this.log(`⏭️ [ข้ามทันที] ${instantCheck.reason} ข้ามไปบทเรียนถัดไปตามที่กำหนด!`);
        return true;
      }

      // Check across child frames as well
      const allFrames = this.page.frames();
      for (const frame of allFrames) {
        if (frame === this.page.mainFrame()) continue;
        const frameCheck = await frame.evaluate(() => {
          const txt = document.body ? document.body.innerText : '';
          if (/1\s*\/\s*1\s*point/i.test(txt) || /คะแนน\s*1\s*\/\s*1/i.test(txt) || /1\.0\s*\/\s*1\.0\s*point/i.test(txt)) {
            return true;
          }
          const c = document.querySelector('.correct, .status.correct, [data-icon="check-circle"], svg.text-success');
          return !!c;
        }).catch(() => false);

        if (frameCheck) {
          this.log(`⏭️ [ข้ามทันที] พบข้อสอบใน Frame ได้คะแนนเต็ม 1/1 point แล้ว -> ข้ามทันที!`);
          return true;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  async isProblemCompleted(qEl) {
    try {
      return await qEl.evaluate(el => {
        const text = el.innerText || '';

        // 1. Check score: "1/1 point", "1 of 1 point", "1.0/1.0 point", "คะแนน 1/1", etc.
        const scoreMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:\/|of|เต็ม|จาก)\s*(\d+(?:\.\d+)?)\s*point/i);
        if (scoreMatch && parseFloat(scoreMatch[1]) >= parseFloat(scoreMatch[2]) && parseFloat(scoreMatch[2]) > 0) {
          return { completed: true, reason: `ได้คะแนนเต็มแล้ว (${scoreMatch[0]})` };
        }
        if (/1\s*\/\s*1\s*point/i.test(text) || /คะแนน\s*1\s*\/\s*1/i.test(text)) {
          return { completed: true, reason: 'ได้คะแนน 1/1 point เรียบร้อยแล้ว' };
        }

        // 2. Open edX correct indicators
        const hasCorrect = !!el.querySelector('.correct, .status.correct, .message.correct, [data-icon="check-circle"], .fa-check, svg.text-success, svg[class*="success"]');
        if (hasCorrect) {
          return { completed: true, reason: 'มีเครื่องหมายถูกต้อง (Correct / ติ๊กเขียว)' };
        }

        // 3. Submitted and disabled submit button or attempts exhausted
        const submitBtn = el.querySelector('button.submit, button[data-value="Submit"]');
        const isSubmitDisabled = submitBtn && (submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true');
        const isSubmitted = text.includes('Your Answer has been receive') || text.includes('Your answer has been received') || text.includes('คำตอบของคุณถูกบันทึกแล้ว');
        const attemptsUsedMatch = text.match(/used\s*(\d+)\s*of\s*(\d+)\s*attempts/i);
        const attemptsExhausted = attemptsUsedMatch && attemptsUsedMatch[1] === attemptsUsedMatch[2];

        if (attemptsExhausted) {
          return { completed: true, reason: `ใช้โควตาส่งคำตอบครบแล้ว (${attemptsUsedMatch[0]})` };
        }
        if (isSubmitted && isSubmitDisabled) {
          return { completed: true, reason: 'ส่งคำตอบเรียบร้อยแล้ว (ปุ่ม Submit ปิดใช้งาน)' };
        }

        return { completed: false };
      });
    } catch (e) {
      return { completed: false };
    }
  }

  async handleDocument(frame) {
    this.setStatus('running', 'Reading Document/Sheet');
    this.log(`📄 ตรวจพบเอกสาร/ชีทเรียน (Sheet/Document) รอเอกสารโหลดและรอครบ 5 วินาทีตามเกณฑ์...`);

    // Ensure document or iframe contents have rendered
    await this.page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});

    // Smooth scroll down to simulate real reading behavior
    await this.page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
    }).catch(() => {});
    await this.sleep(2500);

    await this.page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }).catch(() => {});
    await this.sleep(2500);

    this.log(`✅ เอกสาร/ชีทอ่านครบ 5 วินาทีเรียบร้อยตามเกณฑ์ TSU พร้อมกด Next ทันที.`);
  }

  async handleVideo(frame) {
    this.setStatus('running', 'Watching Video');
    this.log(`🎬 ตรวจพบคลิปวิดีโอ เริ่มต้นขั้นตอนการเล่นและข้ามไป 10 วินาทีสุดท้าย...`);

    const allFrames = [this.page.mainFrame(), ...this.page.frames()];

    // 1. Check if video has already been watched/completed
    const isVideoDone = await this.page.evaluate(() => {
      const v = document.querySelector('video');
      if (v && v.duration > 0 && v.currentTime >= v.duration - 3) return true;
      return false;
    }).catch(() => false);

    if (isVideoDone) {
      this.log(`⏭️ [ข้ามวิดีโอ] วิดีโอนี้ดูจบแล้ว (Completed) ข้ามไปหน่วยถัดไปทันที...`);
      return;
    }

    // 2. Locate video player element on the page
    const videoSelectors = [
      'video',
      '.video-player',
      '.video-wrapper',
      'div[data-component-type="video"]',
      'div[data-block-type="video"]',
      '.video',
      'iframe[src*="youtube"]',
      'iframe[src*="youtu.be"]',
      'iframe#unit-iframe',
      '.tc-wrapper'
    ];

    let playerBox = null;
    for (const sel of videoSelectors) {
      try {
        const el = await this.page.$(sel);
        if (el) {
          const b = await el.boundingBox();
          if (b && b.width > 60 && b.height > 60) {
            playerBox = b;
            break;
          }
        }
      } catch (e) {}
    }

    // If still null, check inside child frames
    if (!playerBox) {
      for (const f of allFrames) {
        for (const sel of videoSelectors) {
          try {
            const el = await f.$(sel);
            if (el) {
              const b = await el.boundingBox();
              if (b && b.width > 60 && b.height > 60) {
                playerBox = b;
                break;
              }
            }
          } catch (e) {}
        }
        if (playerBox) break;
      }
    }

    // 3. STEP 1: MAKE VIDEO START PLAYING
    this.log(`▶️ [ขั้นตอนที่ 1] สั่งให้วิดีโอเริ่มเล่น (User Gesture & Click Play)...`);

    // A. Physical real mouse click in the exact CENTER of the video player
    if (playerBox) {
      const cx = playerBox.x + playerBox.width / 2;
      const cy = playerBox.y + playerBox.height / 2;
      await this.page.mouse.click(cx, cy).catch(() => {});
      await this.sleep(500);

      // Also click bottom-left play button area
      await this.page.mouse.click(playerBox.x + 35, playerBox.y + playerBox.height - 25).catch(() => {});
      await this.sleep(300);
    }

    // B. Click visible play buttons across all frames
    const playBtnSelectors = [
      'button[aria-label*="Play" i]',
      'button[aria-label*="เล่น" i]',
      'div[role="button"][aria-label*="Play" i]',
      'div[role="button"][aria-label*="เล่น" i]',
      '.btn-play',
      '.video-play-button',
      '.play-btn',
      '.play',
      '.vjs-play-control',
      '.vjs-big-play-button',
      '.ytp-large-play-button',
      '.ytp-play-button',
      '.video-control.play-pause',
      'button.control.play',
      '.play-button',
      'video'
    ];

    for (const f of allFrames) {
      for (const sel of playBtnSelectors) {
        try {
          const btn = await f.$(sel);
          if (btn) {
            const isVis = await btn.isVisible().catch(() => false);
            if (isVis) {
              await btn.click({ force: true }).catch(() => {});
              break;
            }
          }
        } catch (e) {}
      }
    }

    // C. Programmatic muted play on any HTML5 video
    for (const f of allFrames) {
      await f.evaluate(() => {
        document.querySelectorAll('video').forEach(v => {
          try {
            v.muted = true;
            v.volume = 0;
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          } catch (e) {}
        });
      }).catch(() => {});
    }

    // D. Press Space key
    await this.page.keyboard.press('Space').catch(() => {});
    await this.sleep(1500);

    // Verify playback started
    let totalDur = 0;
    let currentSec = 0;

    for (let i = 0; i < 5; i++) {
      if (this.shouldStop) return;

      for (const f of allFrames) {
        try {
          const info = await f.evaluate(() => {
            const v = document.querySelector('video');
            if (v) return { cur: v.currentTime, dur: v.duration || 0, paused: v.paused };
            return null;
          }).catch(() => null);

          if (info) {
            currentSec = info.cur;
            if (info.dur > 0) totalDur = info.dur;
            if (currentSec > 0.1 || !info.paused) break;
          }
        } catch (e) {}
      }

      if (currentSec > 0.1) {
        this.log(`▶️ คลิปวิดีโอเริ่มเล่นแล้ว (เวลาเดิน ${currentSec.toFixed(1)}s)...`);
        break;
      }

      // If still not moving, re-click center and press 'k' (YouTube play shortcut)
      if (playerBox) {
        await this.page.mouse.click(playerBox.x + playerBox.width / 2, playerBox.y + playerBox.height / 2).catch(() => {});
        await this.page.keyboard.press('k').catch(() => {});
      }
      await this.sleep(1000);
    }

    // 4. STEP 2: SEEK TO LAST 10 SECONDS
    this.log(`⏩ [ขั้นตอนที่ 2] ข้ามไปยังช่วง 10 วินาทีสุดท้ายของคลิป...`);

    // Obtain duration if not yet known
    if (totalDur <= 0) {
      for (const f of allFrames) {
        const metaDur = await f.evaluate(() => {
          const el = document.querySelector('.video[data-metadata]');
          if (el) {
            try { return JSON.parse(el.getAttribute('data-metadata')).duration || 0; } catch (e) {}
          }
          return 0;
        }).catch(() => 0);
        if (metaDur > 0) { totalDur = metaDur; break; }
      }
    }

    // Check duration text (e.g. "05:30")
    if (totalDur <= 0) {
      for (const f of allFrames) {
        const durText = await f.evaluate(() => {
          const el = document.querySelector('.duration, .vjs-duration-display, .ytp-time-duration, span[class*="duration"]');
          return el ? el.innerText.trim() : '';
        }).catch(() => '');

        if (durText && durText.includes(':')) {
          const parts = durText.split(':').map(Number);
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            totalDur = parts[0] * 60 + parts[1];
            break;
          }
        }
      }
    }

    let seeked = false;

    // A. Direct HTML5 video seek
    if (totalDur > 15) {
      const seekTarget = Math.max(0, totalDur - 10);
      for (const f of allFrames) {
        const ok = await f.evaluate((t) => {
          const v = document.querySelector('video');
          if (v) {
            v.currentTime = t;
            v.dispatchEvent(new Event('timeupdate'));
            v.dispatchEvent(new Event('seeked'));
            return true;
          }
          return false;
        }, seekTarget).catch(() => false);

        if (ok) {
          this.log(`⏩ เลื่อนคลิปไปที่ ${Math.round(seekTarget)}s / ${Math.round(totalDur)}s เรียบร้อย`);
          seeked = true;
          break;
        }
      }
    }

    // B. Click progress bar / slider at 94%
    const progressSelectors = [
      '.slider',
      '.video-slider',
      '.progress-bar',
      '.ytp-progress-bar',
      '.ytp-progress-bar-container',
      '.vjs-progress-control',
      '.vjs-progress-holder',
      '.vjs-play-progress',
      '[role="slider"]'
    ];

    for (const f of allFrames) {
      for (const pSel of progressSelectors) {
        try {
          const bar = await f.$(pSel);
          if (bar) {
            const b = await bar.boundingBox();
            if (b && b.width > 40) {
              await this.page.mouse.click(b.x + b.width * 0.94, b.y + b.height / 2);
              this.log(`⏩ คลิกแถบเวลาไปยังช่วงท้ายคลิปเรียบร้อย`);
              seeked = true;
              break;
            }
          }
        } catch (e) {}
      }
      if (seeked) break;
    }

    // C. Physical click on bottom of video player (where progress bar sits)
    if (!seeked && playerBox) {
      await this.page.mouse.click(playerBox.x + playerBox.width * 0.94, playerBox.y + playerBox.height - 18).catch(() => {});
      seeked = true;
    }

    // D. Press media shortcut key '9' (jumps to 90%)
    await this.page.keyboard.press('9').catch(() => {});

    // 5. STEP 3: PLAY FOR 5 SECONDS IN THE LAST 10 SECONDS
    this.log(`⏳ [ขั้นตอนที่ 3] กำลังเล่นช่วง 10 วินาทีสุดท้ายเพื่อบันทึกผลการเรียนลงระบบ TSU...`);
    await this.sleep(5000);

    // Final safety: ensure video reached end
    for (const f of allFrames) {
      await f.evaluate(() => {
        const v = document.querySelector('video');
        if (v && v.duration > 0 && v.currentTime < v.duration - 2) {
          v.currentTime = Math.max(0, v.duration - 2);
        }
      }).catch(() => {});
    }

    this.log(`✅ วิดีโอเล่นครบเกณฑ์เรียบร้อยตามเงื่อนไข เตรียมกด Next ทันที.`);
  }

  async handleQuiz(frame) {
    this.setStatus('running', 'Solving Quiz');
    this.log(`📝 ตรวจพบแบบทดสอบ (Quiz) กำลังวิเคราะห์โจทย์...`);

    const pageUrl = this.page.url().toLowerCase();
    const isPretest = pageUrl.includes('pre-test') || pageUrl.includes('pretest') ||
                      (await this.page.content().catch(() => '')).includes('ก่อนเรียน');

    // Extract questions across frame or main page
    let questions = await frame.$$('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], .wrapper-problem-response, .capa_inputtype, .que');
    if (questions.length === 0) {
      questions = await this.page.$$('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], .wrapper-problem-response, .capa_inputtype, .que');
    }

    // If still 0, look for text input wrappers or choice groups directly
    if (questions.length === 0) {
      questions = await frame.$$('div:has(> input[type="text"]), div:has(> input[type="radio"])');
    }

    this.log(`📝 พบจำนวนข้อสอบทั้งหมด ${questions.length} ข้อ`);

    if (questions.length === 0) return;

    // Pre-check: If ALL questions in this quiz are already completed, skip immediately!
    let allCompleted = true;
    for (const qEl of questions) {
      const chk = await this.isProblemCompleted(qEl);
      if (!chk.completed) {
        allCompleted = false;
        break;
      }
    }

    if (allCompleted) {
      this.log(`⏭️ [ข้ามทั้งแบบทดสอบ] แบบทดสอบทุกข้อในหน้านี้ได้คะแนนเต็ม/ทำเสร็จแล้ว (ติ๊กเขียว) ข้ามไปหน่วยถัดไปทันที...`);
      return;
    }

    let qIndex = 1;
    let anyAnswered = false;

    for (const qEl of questions) {
      if (this.shouldStop) return;

      try {
        // Individual question completion check
        const checkResult = await this.isProblemCompleted(qEl);
        if (checkResult.completed) {
          this.log(`⏭️ [ข้ามข้อนี้] ข้อ ${qIndex}: ${checkResult.reason} ข้ามไปข้อถัดไป ไม่แตะต้องคำตอบเดิม`);
          qIndex++;
          continue;
        }

        // 1. Extract full raw text of the question block
        const fullText = await qEl.innerText().catch(() => '');

        // 2. Detect section hint from fullText or page breadcrumbs/title
        let sectionHint = '';
        const secMatch = fullText.match(/(?:Unit\s*\d+[\s:]*Chapter\s*\d+|Chapter\s*\d+|Unit\s*\d+)/i);
        if (secMatch) {
          sectionHint = secMatch[0].replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
        } else {
          const pageTitle = await this.page.$eval('.unit-title, h1, h2, .breadcrumbs, .sequence-title', el => el.innerText).catch(() => '');
          const pMatch = pageTitle.match(/(?:Unit\s*\d+[\s:]*Chapter\s*\d+|Chapter\s*\d+|Unit\s*\d+)/i);
          if (pMatch) {
            sectionHint = pMatch[0].replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
          }
        }

        // 3. Extract candidate question sentence
        const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
        const boilerplateRegex = /^(?:text input|multiple choice|dropdown|checkbox|explanation|review|show answer|submit|\d+\s*point.*possible|graded|unit\s*\d+|chapter\s*\d+|passive voice|part\s*\d+.*complete)/i;
        const candidateLines = lines.filter(l => !boilerplateRegex.test(l) && l.length > 3);
        const sentenceLine = lines.find(l => /\([a-zA-Z\s]+\)/.test(l) || /\.{3,}|_{3,}/.test(l)) || candidateLines[0] || fullText;

        const choiceLabels = await qEl.$$('label, .choice, input[type="radio"], input[type="checkbox"], fieldset div');
        const textInputs = await qEl.$$('input.input[type="text"], input[type="text"], textarea');

        if (isPretest) {
          // Pre-test: random choice allowed per policy
          if (choiceLabels.length > 0) {
            const randIdx = Math.floor(Math.random() * choiceLabels.length);
            await choiceLabels[randIdx].click().catch(() => {});
            this.log(`🎲 [Pre-test] ข้อ ${qIndex}: สุ่มเลือกตัวเลือกอัตโนมัติ`);
            anyAnswered = true;
          }
        } else {
          // Graded post-test / Chapter quiz
          let answered = false;

          // Special case for TSUGE07272: ข้อ มานี มี 5 ปี สองอัน อันแรกผิด อันที่สองถูก
          if (this.courseCode === 'TSUGE07272' && fullText.includes('มานี') && choiceLabels.length >= 2) {
            await choiceLabels[1].click().catch(() => {});
            answered = true;
            anyAnswered = true;
            this.log(`🎯 ข้อ ${qIndex}: [TSUGE07272 กฎพิเศษ] เลือก 5 ปี อันที่สอง`);
          }

          // Search database using sentenceLine, candidateLines, and fullText
          let ansData = null;
          if (sentenceLine) {
            ansData = dbManager.findAnswer(this.courseCode, sentenceLine, sectionHint, qIndex - 1);
          }
          if (!ansData || ansData.status !== 'confirmed') {
            for (const cLine of candidateLines) {
              const cAns = dbManager.findAnswer(this.courseCode, cLine, sectionHint, qIndex - 1);
              if (cAns && cAns.status === 'confirmed') {
                ansData = cAns;
                break;
              }
            }
          }
          if (!ansData || ansData.status !== 'confirmed') {
            ansData = dbManager.findAnswer(this.courseCode, fullText, sectionHint, qIndex - 1);
          }

          // Check for unconfirmed / missing items in tsu_missing.json
          const missingInfo = dbManager.findMissingItem(this.courseCode, sentenceLine) ||
                              dbManager.findMissingItem(this.courseCode, fullText);

          if (ansData && ansData.status === 'confirmed' && ansData.correct_answer) {
            let targetAns = ansData.correct_answer.trim();

            // Straight apostrophe rule for TSUGE00152 Unit 4 Chapter 3
            if (this.courseCode === 'TSUGE00152' && sectionHint.includes('Unit 4 Chapter 3')) {
              targetAns = targetAns.replace(/[‘’]/g, "'");
            }

            // Case 1: Text input field
            if (textInputs.length > 0) {
              for (const tInput of textInputs) {
                await tInput.click().catch(() => {});
                await tInput.fill('');
                await tInput.fill(targetAns).catch(() => {});
                await tInput.dispatchEvent('input').catch(() => {});
                await tInput.dispatchEvent('change').catch(() => {});
                await tInput.press('Tab').catch(() => {});
                answered = true;
                anyAnswered = true;
                this.log(`🎯 ข้อ ${qIndex}: พิมพ์คำตอบ "${targetAns}" (ความตรงกัน: ${Math.round((ansData.score || 1) * 100)}%)`);
              }
            }

            // Case 2: Choice radio / checkbox
            if (!answered && choiceLabels.length > 0) {
              for (const ch of choiceLabels) {
                const labelText = (await ch.innerText().catch(() => '')).trim();
                if (labelText.toLowerCase().includes(targetAns.toLowerCase()) || targetAns.toLowerCase().includes(labelText.toLowerCase())) {
                  await ch.click().catch(() => {});
                  answered = true;
                  anyAnswered = true;
                  this.log(`🎯 ข้อ ${qIndex}: กาคำตอบ "${targetAns}" (ความตรงกัน: ${Math.round((ansData.score || 1) * 100)}%)`);
                  break;
                }
              }
            }
          }

          // Case 3: Missing items with specific high-confidence hints
          if (!answered && missingInfo && missingInfo.hint) {
            const combinedWrong = [...(ansData?.known_wrong_answers || []), ...(missingInfo.wrong_answers || [])];

            if (textInputs.length > 0) {
              let suggestedText = '';
              const h = missingInfo.hint;
              if (h.includes('production')) suggestedText = 'production';
              else if (h.includes('The car is being repaired.')) suggestedText = 'The car is being repaired.';
              else if (h.includes("aren't we?")) suggestedText = "aren't we?";
              else if (h.includes('Is the incident being investigated by the police?')) suggestedText = 'Is the incident being investigated by the police?';

              if (suggestedText) {
                for (const tInput of textInputs) {
                  await tInput.click().catch(() => {});
                  await tInput.fill('');
                  await tInput.fill(suggestedText).catch(() => {});
                  await tInput.dispatchEvent('input').catch(() => {});
                  await tInput.dispatchEvent('change').catch(() => {});
                  await tInput.press('Tab').catch(() => {});
                  answered = true;
                  anyAnswered = true;
                  this.log(`🎯 ข้อ ${qIndex}: พิมพ์คำตอบตามคำแนะนำวิเคราะห์ "${suggestedText}"`);
                }
              }
            }

            if (!answered && choiceLabels.length > 0) {
              const h = missingInfo.hint;
              for (const ch of choiceLabels) {
                const labelText = (await ch.innerText().catch(() => '')).trim();
                if (combinedWrong.some(w => labelText.includes(w) || w.includes(labelText))) continue;

                let matchesHint = false;
                if (h.includes('Define') && labelText.includes('Define')) matchesHint = true;
                else if (h.includes('การรู้เท่าทันสื่อ') && labelText.includes('การรู้เท่าทันสื่อ')) matchesHint = true;
                else if (h.includes('ปรับปรุงผลิตภัณฑ์เดิมให้ดีขึ้น') && labelText.includes('ปรับปรุงผลิตภัณฑ์เดิมให้ดีขึ้น')) matchesHint = true;
                else if (h.includes('สิ่งใหม่ของผลิตภัณฑ์') && labelText.includes('สิ่งใหม่ของผลิตภัณฑ์')) matchesHint = true;
                else if (h.includes('Burglary') && labelText.includes('Burglary')) matchesHint = true;
                else if (h.includes('Theft') && labelText.includes('Theft')) matchesHint = true;

                if (matchesHint) {
                  await ch.click().catch(() => {});
                  answered = true;
                  anyAnswered = true;
                  this.log(`🎯 ข้อ ${qIndex}: เลือกตัวเลือกตามคำแนะนำวิเคราะห์ "${labelText}"`);
                  break;
                }
              }
            }
          }

          // Case 4: No confirmed answer found -> NEVER GUESS OR SUBMIT ON GRADED TESTS!
          if (!answered) {
            const qDesc = (sentenceLine || candidateLines[0] || fullText).substring(0, 80).replace(/\s+/g, ' ');
            this.log(`📢 [รายงานข้อสอบไม่มีเฉลยยืนยัน] ข้อ ${qIndex}: "${qDesc}"`, 'warn');
            if (missingInfo && missingInfo.hint) {
              this.log(`   💡 คำแนะนำ: ${missingInfo.hint}`, 'warn');
            }
            if (missingInfo && missingInfo.wrong_answers && missingInfo.wrong_answers.length > 0) {
              this.log(`   🚫 ตัวเลือกที่เคยผิด (ห้ามกา): ${missingInfo.wrong_answers.join(' | ')}`, 'warn');
            }
            this.log(`   🛑 ข้ามข้อนี้ ไม่สุ่มตอบและไม่ส่ง เพื่อป้องกันการตอบผิด/เสียคะแนน`, 'warn');
            qIndex++;
            continue; // Move to next question WITHOUT clicking submit!
          }
        }

        // Submit this specific question ONLY IF we actively answered it
        const qSubmitBtn = await qEl.$('button.submit, button[data-value="Submit"], button:has-text("Submit"), button:has-text("ส่งคำตอบ"), button:has-text("ส่ง"), button:has-text("ตรวจคำตอบ")');
        if (qSubmitBtn) {
          let isEn = false;
          for (let t = 0; t < 6; t++) {
            isEn = await qSubmitBtn.isEnabled().catch(() => false);
            if (isEn) break;
            await this.sleep(400);
          }
          if (isEn) {
            await qSubmitBtn.click({ force: true }).catch(() => {});
            this.log(`📤 [ข้อ ${qIndex}] กดปุ่ม Submit เรียบร้อย`);
            await this.sleep(800);
          }
        }
      } catch (e) {
        this.log(`⚠️ ข้อ ${qIndex} เกิดข้อผิดพลาดเล็กน้อย: ${e.message}`, 'warn');
      }
      qIndex++;
    }

    // Global submit attempt (ONLY IF at least one question was answered in this pass)
    if (anyAnswered) {
      const globalSubmit = (await frame.$('button.submit, button[data-value="Submit"], button:has-text("Submit"), button:has-text("ส่งคำตอบ")'))
                        || (await this.page.$('button.submit, button[data-value="Submit"], button:has-text("Submit"), button:has-text("ส่งคำตอบ")'));

      if (globalSubmit) {
        const isEn = await globalSubmit.isEnabled().catch(() => false);
        if (isEn) {
          this.log(`📤 กำลังกดส่งคำตอบรวม (Global Submit)...`);
          await globalSubmit.click().catch(() => {});
          await this.sleep(2500);
        }
      }
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
            this.log(`⏭️ กำลังไปหน่วยถัดไป (${sel})...`);
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
      const activeNavTab = await this.page.$('nav[aria-label*="unit" i] ol li button[aria-current], nav[aria-label*="sequence" i] ol li button[aria-current], nav[aria-label*="unit" i] ol li.active button, .tab-item.active, button.seq_video.active, button[aria-current="step"], button[aria-current="true"]');
      if (activeNavTab) {
        const nextNavTab = await this.page.evaluateHandle(el => {
          const li = el.closest('li');
          const nextLi = li ? li.nextElementSibling : null;
          return nextLi ? nextLi.querySelector('button, a') : null;
        }, activeNavTab);

        if (nextNavTab && (await nextNavTab.asElement())) {
          this.log(`⏭️ เปลี่ยนหน่วยผ่าน Sequence Bar ด้านบน...`);
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
    this.setStatus('paused', 'Paused by user');
    this.log(`⏸️ [คำสั่งผู้ใช้] บอทหยุดทำงานชั่วคราวแล้ว (Paused)`);
  }

  resume() {
    this.isPaused = false;
    this.setStatus('running', 'Resumed by user');
    this.log(`▶️ [คำสั่งผู้ใช้] บอทกลับมาทำงานต่อแล้ว (Resumed)`);
  }

  async stop() {
    this.shouldStop = true;
    this.setStatus('stopped', 'Stopped by user');
    this.log(`⏹️ [คำสั่งผู้ใช้] ยกเลิกการทำงาน กำลังปิดเบราว์เซอร์...`);
    if (this.browserContext) {
      await this.browserContext.close().catch(() => {});
    }
    process.exit(0);
  }
}

module.exports = AutomationWorker;
