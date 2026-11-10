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
      await this.handleVideo(videoFrame);
      return;
    }

    if (quizFrame) {
      await this.handleQuiz(quizFrame);
      return;
    }

    // Otherwise handle as document / slide reading unit
    await this.handleDocument(this.page.mainFrame());
  }

  async isCurrentUnitCompleted() {
    try {
      return await this.page.evaluate(() => {
        // Find active unit tab/button in Open edX sequence navigation
        const activeNav = document.querySelector('nav[aria-label="Unit"] button[aria-current="true"], nav[aria-label="Unit"] ol li.active button, .tab-item.active, button.seq_video.active, nav[aria-label="Unit"] button.active, [aria-current="page"]');
        if (!activeNav) return false;

        const parentLi = activeNav.closest('li') || activeNav;

        // 1. Explicit green checkmark icon inside active button or parent li
        const hasCheckIcon = !!(
          activeNav.querySelector('.fa-check, [data-icon="check-circle"], [data-icon="check"], .check-circle, svg.text-success, svg[class*="success"]') ||
          parentLi.querySelector('.fa-check, [data-icon="check-circle"], [data-icon="check"], .check-circle, svg.text-success, svg[class*="success"]')
        );
        if (hasCheckIcon) return true;

        // 2. Check aria-label carefully (must NOT match incomplete)
        const ariaLabel = ((activeNav.getAttribute('aria-label') || '') + ' ' + (parentLi.getAttribute('aria-label') || '')).toLowerCase();
        if (ariaLabel.includes('incomplete') || ariaLabel.includes('not completed') || ariaLabel.includes('uncompleted')) {
          return false;
        }
        if (ariaLabel.includes('completed') || (ariaLabel.includes('complete') && !ariaLabel.includes('incomplete'))) {
          return true;
        }

        // 3. Check classes (must NOT match incomplete)
        const classStr = ((activeNav.className || '') + ' ' + (parentLi.className || '')).toLowerCase();
        if (classStr.includes('incomplete')) {
          return false;
        }
        if (classStr.includes('is-complete') || (classStr.includes('complete') && !classStr.includes('incomplete')) || classStr.includes('success')) {
          return true;
        }

        return false;
      });
    } catch (e) {
      return false;
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
    this.log(`🎬 ตรวจพบคลิปวิดีโอ กำลังเริ่มเล่น...`);

    const allFrames = [this.page.mainFrame(), ...this.page.frames()];
    const playSelectors = [
      '.btn-play',
      '.video-play-button',
      '.play-btn',
      'button[aria-label*="Play" i]',
      'button[aria-label*="เล่น" i]',
      'button[title*="Play" i]',
      '.video-control.play-pause',
      '.control.play',
      '.ytp-large-play-button',
      '.ytp-play-button',
      '.play',
      'video'
    ];

    // Helper to attempt starting playback across all frames
    const triggerPlay = async () => {
      for (const f of allFrames) {
        try {
          // 1. Programmatic HTML5 video play (muted to satisfy autoplay policy)
          await f.evaluate(() => {
            const vList = document.querySelectorAll('video');
            vList.forEach(v => {
              v.muted = true;
              v.volume = 0;
              const p = v.play();
              if (p && p.catch) p.catch(() => {});
            });
            const b = document.querySelector('.btn-play, .video-play-button, button[aria-label*="Play" i], .play-btn, .play');
            if (b) b.click();
          }).catch(() => {});

          // 2. Playwright real click on play button if visible
          for (const sel of playSelectors) {
            const btn = await f.$(sel);
            if (btn) {
              const isVis = await btn.isVisible().catch(() => false);
              if (isVis) {
                await btn.click({ force: true }).catch(() => {});
                break;
              }
            }
          }
        } catch (e) {}
      }
    };

    // Initial play trigger
    await triggerPlay();

    // 2. Wait and verify playback starts (currentTime > 0.2s)
    let videoTargetFrame = null;
    let currentSec = 0;
    let totalDur = 0;

    for (let attempt = 0; attempt < 12; attempt++) {
      if (this.shouldStop) return;

      for (const f of allFrames) {
        try {
          const info = await f.evaluate(() => {
            const v = document.querySelector('video');
            if (v) {
              return { current: v.currentTime, duration: v.duration || 0 };
            }
            return null;
          }).catch(() => null);

          if (info) {
            videoTargetFrame = f;
            currentSec = info.current;
            if (info.duration > 0) totalDur = info.duration;
            if (currentSec > 0.2) break;
          }
        } catch (e) {}
      }

      if (currentSec > 0.2) {
        this.log(`▶️ คลิปวิดีโอเริ่มเล่นแล้ว (เวลาเดิน ${currentSec.toFixed(1)}s)...`);
        break;
      }

      // Re-trigger play every second until playback starts
      await triggerPlay();
      await this.sleep(1000);
    }

    // 3. Obtain total duration
    if (totalDur <= 0 && videoTargetFrame) {
      for (let i = 0; i < 5; i++) {
        totalDur = await videoTargetFrame.evaluate(() => {
          const v = document.querySelector('video');
          return v ? (v.duration || 0) : 0;
        }).catch(() => 0);
        if (totalDur > 0) break;
        await this.sleep(500);
      }
    }

    // Check Open edX metadata for duration if v.duration is not ready
    if (totalDur <= 0) {
      for (const f of allFrames) {
        const metaDur = await f.evaluate(() => {
          const el = document.querySelector('.video[data-metadata]');
          if (el) {
            try {
              const meta = JSON.parse(el.getAttribute('data-metadata'));
              return meta.duration || 0;
            } catch (e) {}
          }
          return 0;
        }).catch(() => 0);
        if (metaDur > 0) {
          totalDur = metaDur;
          break;
        }
      }
    }

    // 4. Seek to last ~10 seconds per README_TH.md
    const margin = this.delays.videoSeekMargin || 10;
    let seeked = false;

    if (totalDur > margin + 5 && videoTargetFrame) {
      const seekTarget = Math.max(0, totalDur - margin);
      await videoTargetFrame.evaluate((t) => {
        const v = document.querySelector('video');
        if (v) {
          v.currentTime = t;
          v.dispatchEvent(new Event('timeupdate'));
          v.dispatchEvent(new Event('seeked'));
        }
      }, seekTarget).catch(() => {});
      this.log(`⏩ เลื่อนคลิปไปช่วง 10 วินาทีสุดท้าย (${Math.round(seekTarget)}s / ${Math.round(totalDur)}s) เพื่อรับติ๊กเขียว...`);
      seeked = true;
    }

    // Fallback: visual click on the seek / progress bar if direct seek was not possible
    if (!seeked) {
      for (const f of allFrames) {
        try {
          const seekBar = await f.$('.slider, .video-slider, .progress-bar, .ytp-progress-bar, .progress-slider, .slider-handle');
          if (seekBar) {
            const box = await seekBar.boundingBox();
            if (box && box.width > 30) {
              await this.page.mouse.click(box.x + box.width * 0.92, box.y + box.height / 2);
              this.log(`⏩ คลิกเลื่อนแถบเวลา (Progress Bar) ไปยังช่วง 10 วินาทีสุดท้าย...`);
              seeked = true;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // 5. Let it play for a few seconds in the last 10s so the server records completion
    await this.sleep(4000);
    this.log(`✅ วิดีโอเล่นครบเกณฑ์เรียบร้อย เตรียมไปหน่วยถัดไป.`);
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

    let qIndex = 1;
    for (const qEl of questions) {
      if (this.shouldStop) return;
      try {
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
          // README_TH.md policy: Pre-test must be random
          if (choiceLabels.length > 0) {
            const randIdx = Math.floor(Math.random() * choiceLabels.length);
            await choiceLabels[randIdx].click().catch(() => {});
            this.log(`🎲 [Pre-test] ข้อ ${qIndex}: สุ่มเลือกตัวเลือกอัตโนมัติ`);
          }
        } else {
          // Post-test / Chapter quiz: lookup answer from database
          let answered = false;

          // Special case for TSUGE07272: ข้อ มานี มี 5 ปี สองอัน อันแรกผิด อันที่สองถูก
          if (this.courseCode === 'TSUGE07272' && fullText.includes('มานี') && choiceLabels.length >= 2) {
            await choiceLabels[1].click().catch(() => {});
            answered = true;
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

          if (ansData && ansData.status === 'confirmed' && ansData.correct_answer) {
            let targetAns = ansData.correct_answer.trim();

            // Special rule for TSUGE00152 Unit 4 Chapter 3 (reported speech):
            // Straight apostrophe ' must be used per README_TH.md
            if (this.courseCode === 'TSUGE00152' && sectionHint.includes('Unit 4 Chapter 3')) {
              targetAns = targetAns.replace(/[‘’]/g, "'");
            }

            // Case 1: Text input field (e.g. TSUGE00152 passive / reported speech)
            if (textInputs.length > 0) {
              for (const tInput of textInputs) {
                await tInput.click().catch(() => {});
                await tInput.fill('');
                await tInput.fill(targetAns).catch(() => {});
                await tInput.dispatchEvent('input').catch(() => {});
                await tInput.dispatchEvent('change').catch(() => {});
                await tInput.press('Tab').catch(() => {});
                answered = true;
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
                  this.log(`🎯 ข้อ ${qIndex}: กาคำตอบ "${targetAns}" (ความตรงกัน: ${Math.round((ansData.score || 1) * 100)}%)`);
                  break;
                }
              }
            }
          }

          // Case 3: Unconfirmed or unknown choice — avoid known_wrong_answers per README_TH.md
          if (!answered && choiceLabels.length > 0) {
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
            answered = true;
          }
        }

        // Submit this specific question if it has its own Submit button
        const qSubmitBtn = await qEl.$('button.submit, button[data-value="Submit"], button:has-text("Submit"), button:has-text("ส่งคำตอบ"), button:has-text("ส่ง"), button:has-text("ตรวจคำตอบ")');
        if (qSubmitBtn) {
          let isEn = false;
          for (let t = 0; t < 6; t++) {
            isEn = await qSubmitBtn.isEnabled().catch(() => false);
            if (isEn) break;
            await this.sleep(400);
          }
          await qSubmitBtn.click({ force: true }).catch(() => {});
          this.log(`📤 [ข้อ ${qIndex}] กดปุ่ม Submit เรียบร้อย`);
          await this.sleep(800);
        }
      } catch (e) {
        this.log(`⚠️ ข้อ ${qIndex} เกิดข้อผิดพลาดเล็กน้อย: ${e.message}`, 'warn');
      }
      qIndex++;
    }

    // Global submit attempt (if the quiz has an overall submit at page or frame bottom)
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
      const activeNavTab = await this.page.$('nav[aria-label="Unit"] ol li button[aria-current="true"], nav[aria-label="Unit"] ol li.active button, .tab-item.active, button.seq_video.active');
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
