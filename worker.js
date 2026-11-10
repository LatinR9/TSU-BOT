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
      // Check multiple quick polls (total ~2 seconds) to account for React / MFE render latency
      for (let attempt = 0; attempt < 4; attempt++) {
        const completed = await this.page.evaluate(() => {
          // --- A. Check Sequence Navigation Bar (Unit tabs between Previous and Next) ---
          const seqNavSelectors = [
            'nav[aria-label*="unit" i]',
            'nav[aria-label*="sequence" i]',
            'nav[aria-label*="navigation" i]',
            '.sequence-navigation',
            '.unit-navigation',
            '.sequence-nav',
            'ol.sequence-nav-list'
          ];

          let activeNav = null;

          const activeSelectors = [
            'button[aria-current="true"]',
            'button[aria-current="step"]',
            'button[aria-current="page"]',
            'button[aria-current="location"]',
            '[aria-current="true"]',
            '[aria-current="step"]',
            '[aria-current="page"]',
            'button[aria-selected="true"]',
            '[aria-selected="true"]',
            'button.active',
            'li.active button',
            'a.active',
            '.tab-item.active',
            'button.seq_video.active',
            'button.seq_problem.active',
            'button.seq_other.active'
          ];

          for (const navSel of seqNavSelectors) {
            const navEl = document.querySelector(navSel);
            if (navEl) {
              for (const actSel of activeSelectors) {
                const found = navEl.querySelector(actSel);
                if (found) {
                  activeNav = found;
                  break;
                }
              }
              if (activeNav) break;
            }
          }

          // Fallback: look globally for active unit button/tab outside main site header
          if (!activeNav) {
            for (const actSel of activeSelectors) {
              const found = document.querySelector(actSel);
              if (found && !found.closest('header') && !found.closest('.nav-tabs')) {
                activeNav = found;
                break;
              }
            }
          }

          // Fallback 2: Check buttons sitting between Previous and Next buttons
          if (!activeNav) {
            const prevBtn = document.querySelector('button[aria-label*="Previous" i], button:has-text("Previous"), button:has-text("ก่อนหน้า")');
            const nextBtn = document.querySelector('button[aria-label*="Next" i], button:has-text("Next"), button:has-text("ถัดไป")');
            if (prevBtn && nextBtn && prevBtn.parentElement) {
              const siblings = Array.from(prevBtn.parentElement.querySelectorAll('button, a')).filter(
                b => b !== prevBtn && b !== nextBtn && !b.innerText.includes('Previous') && !b.innerText.includes('Next') && !b.innerText.includes('ก่อนหน้า') && !b.innerText.includes('ถัดไป')
              );
              if (siblings.length === 1) {
                activeNav = siblings[0];
              } else if (siblings.length > 1) {
                activeNav = siblings.find(b => b.classList.contains('active') || b.getAttribute('aria-current') || b.getAttribute('aria-selected') === 'true') || siblings[0];
              }
            }
          }

          if (activeNav) {
            const parentLi = activeNav.closest('li') || activeNav;

            // 1. Icon check inside active button or parent li
            const checkIcons = [
              '.fa-check',
              '.fa-check-circle',
              '[data-icon="check-circle"]',
              '[data-icon="check"]',
              '[data-icon*="check"]',
              '.check-circle',
              '[data-testid*="check" i]',
              '[data-testid*="complete" i]',
              'svg.text-success',
              'svg[class*="success"]',
              'svg[class*="check"]',
              '.text-success',
              '.success',
              '.complete',
              '.completed',
              '.is-complete'
            ];

            for (const sel of checkIcons) {
              if (activeNav.querySelector(sel) || parentLi.querySelector(sel)) {
                return true;
              }
            }

            // 2. Computed green color check on child SVGs/icons
            const iconElements = [...activeNav.querySelectorAll('svg, i, span'), ...parentLi.querySelectorAll('svg, i, span')];
            for (const el of iconElements) {
              try {
                const style = window.getComputedStyle(el);
                const color = (style.color || '').toLowerCase();
                const fill = (style.fill || '').toLowerCase();
                const stroke = (style.stroke || '').toLowerCase();
                const isGreen = (c) => c.includes('rgb(40, 167, 69)') || c.includes('rgb(0, 129, 68)') || c.includes('rgb(25, 135, 84)') || c.includes('#28a745') || c.includes('#008144') || c.includes('#22c55e') || c.includes('rgb(34, 197, 94)');
                if (isGreen(color) || isGreen(fill) || isGreen(stroke)) {
                  return true;
                }
              } catch (e) {}
            }

            // 3. Text content check for checkmark symbols ✓ ✔
            const combinedText = (activeNav.innerText || '') + ' ' + (parentLi.innerText || '');
            if (combinedText.includes('✓') || combinedText.includes('✔')) {
              return true;
            }

            // 4. aria-label / title check
            const ariaLabel = ((activeNav.getAttribute('aria-label') || '') + ' ' + (parentLi.getAttribute('aria-label') || '') + ' ' + (activeNav.getAttribute('title') || '')).toLowerCase();
            if (!ariaLabel.includes('incomplete') && !ariaLabel.includes('not completed') && !ariaLabel.includes('uncompleted')) {
              if (ariaLabel.includes('completed') || ariaLabel.includes('complete') || ariaLabel.includes('ผ่าน') || ariaLabel.includes('เสร็จสิ้น') || ariaLabel.includes('สมบูรณ์')) {
                return true;
              }
            }

            // 5. CSS class strings check
            const classStr = ((activeNav.className || '') + ' ' + (parentLi.className || '')).toLowerCase();
            if (!classStr.includes('incomplete')) {
              if (classStr.includes('is-complete') || classStr.includes('completed') || (classStr.includes('complete') && !classStr.includes('incomplete')) || classStr.includes('success')) {
                return true;
              }
            }
          }

          // --- B. Check Unit Problem Contents on Main Page (Scores & Full Marks) ---
          const problems = document.querySelectorAll('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], form.problem-form, .wrapper-problem-response, .que');
          if (problems.length > 0) {
            let allProblemsDone = true;
            for (const prob of problems) {
              const pText = prob.innerText || '';

              // Check full points e.g. "1/1 point", "1 of 1 point", "1.0/1.0 point", "คะแนน 1/1"
              const scoreMatch = pText.match(/(\d+(?:\.\d+)?)\s*(?:\/|of|เต็ม|จาก)\s*(\d+(?:\.\d+)?)\s*point/i);
              const hasFullPoints = scoreMatch && parseFloat(scoreMatch[1]) >= parseFloat(scoreMatch[2]) && parseFloat(scoreMatch[2]) > 0;
              const has1of1 = /1\s*\/\s*1\s*point/i.test(pText) || /คะแนน\s*1\s*\/\s*1/i.test(pText);

              // Check checkmark or correct icon inside problem
              const hasCorrect = !!prob.querySelector('.correct, .status.correct, .message.correct, [data-icon="check-circle"], .fa-check, svg.text-success, svg[class*="success"]');

              // Check if submitted and submit button is disabled
              const submitBtn = prob.querySelector('button.submit, button[data-value="Submit"]');
              const isSubmitDisabled = submitBtn && (submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true');
              const isSubmitted = pText.includes('Your Answer has been receive') || pText.includes('Your answer has been received') || pText.includes('คำตอบของคุณถูกบันทึกแล้ว');
              const attemptsUsedMatch = pText.match(/used\s*(\d+)\s*of\s*(\d+)\s*attempts/i);
              const attemptsExhausted = attemptsUsedMatch && attemptsUsedMatch[1] === attemptsUsedMatch[2];

              if (hasFullPoints || has1of1 || hasCorrect || (isSubmitted && isSubmitDisabled) || attemptsExhausted) {
                // Done
              } else {
                allProblemsDone = false;
                break;
              }
            }

            if (allProblemsDone) {
              return true;
            }
          }

          return false;
        }).catch(() => false);

        if (completed) return true;

        // Check inside child iframes as well
        const allFrames = this.page.frames();
        for (const frame of allFrames) {
          if (frame === this.page.mainFrame()) continue;
          const frameCompleted = await frame.evaluate(() => {
            const problems = document.querySelectorAll('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], form.problem-form, .wrapper-problem-response, .que');
            if (problems.length > 0) {
              let allProblemsDone = true;
              for (const prob of problems) {
                const pText = prob.innerText || '';
                const scoreMatch = pText.match(/(\d+(?:\.\d+)?)\s*(?:\/|of|เต็ม|จาก)\s*(\d+(?:\.\d+)?)\s*point/i);
                const hasFullPoints = scoreMatch && parseFloat(scoreMatch[1]) >= parseFloat(scoreMatch[2]) && parseFloat(scoreMatch[2]) > 0;
                const has1of1 = /1\s*\/\s*1\s*point/i.test(pText) || /คะแนน\s*1\s*\/\s*1/i.test(pText);
                const hasCorrect = !!prob.querySelector('.correct, .status.correct, .message.correct, [data-icon="check-circle"], .fa-check, svg.text-success, svg[class*="success"]');
                const submitBtn = prob.querySelector('button.submit, button[data-value="Submit"]');
                const isSubmitDisabled = submitBtn && (submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true');
                const isSubmitted = pText.includes('Your Answer has been receive') || pText.includes('Your answer has been received');
                const attemptsUsedMatch = pText.match(/used\s*(\d+)\s*of\s*(\d+)\s*attempts/i);
                const attemptsExhausted = attemptsUsedMatch && attemptsUsedMatch[1] === attemptsUsedMatch[2];

                if (hasFullPoints || has1of1 || hasCorrect || (isSubmitted && isSubmitDisabled) || attemptsExhausted) {
                  // Done
                } else {
                  allProblemsDone = false;
                  break;
                }
              }
              if (allProblemsDone) return true;
            }
            return false;
          }).catch(() => false);

          if (frameCompleted) return true;
        }

        if (attempt < 3) {
          await this.sleep(500);
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
    this.log(`🎬 ตรวจพบคลิปวิดีโอ กำลังตรวจสอบสถานะการเล่น...`);

    // Check if video is already finished
    const isVideoDone = await frame.evaluate(() => {
      const v = document.querySelector('video');
      const vContainer = document.querySelector('.video, .video-player, div[data-component-type="video"], .xblock-student_view[data-block-type="video"]');
      if (vContainer && (vContainer.classList.contains('is-complete') || vContainer.classList.contains('completed') || vContainer.getAttribute('data-status') === 'complete')) {
        return true;
      }
      if (v && v.duration > 0 && v.currentTime >= v.duration - 2) {
        return true;
      }
      return false;
    }).catch(() => false);

    if (isVideoDone) {
      this.log(`⏭️ [ข้ามวิดีโอ] วิดีโอนี้ดูจบแล้ว (Completed) ข้ามไปหน่วยถัดไปทันที...`);
      return;
    }

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
