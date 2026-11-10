// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\worker.js
const { chromium } = require('playwright');
const path = require('path');
const dbManager = require('./db_manager');

const USER_DATA_DIR = path.join(__dirname, 'user_profile');

// Runs inside the quiz frame (serialized by Playwright): must not reference anything outside itself.
function collectQuizResponses() {
  const clean = s => String(s || '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  const textOf = el => clean(el ? (el.innerText || el.textContent) : '');
  const BOILERPLATE = /^(?:question\s*\d+|ข้อ(?:ที่)?\s*\d+|text input|multiple choice|dropdown|checkbox(?:es)?|explanation|review|show answer|submit|save|reset|ส่งคำตอบ|ส่ง|ตรวจคำตอบ|graded|ungraded|unanswered|correct|incorrect|\(?\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?\s*)?points?.*|.*\bpoints? possible\b.*|some problems have options.*|you have used .*|answer received.*|your answer has been receive.*)$/i;
  const outermost = list => list.filter(el => !list.some(o => o !== el && o.contains(el)));

  let problems = outermost(Array.from(document.querySelectorAll('.problems-wrapper, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], .problem, .que')));
  if (problems.length === 0) {
    problems = outermost(Array.from(document.querySelectorAll('fieldset, .choicegroup'))
      .filter(g => g.querySelector('input[type="radio"], input[type="checkbox"]')));
  }

  return problems.map((p, pi) => {
    p.setAttribute('data-tsubot-p', String(pi));
    let responses = outermost(Array.from(p.querySelectorAll('.wrapper-problem-response')));
    if (responses.length === 0) responses = [p];

    return {
      pi,
      responses: responses.map((r, ri) => {
        const key = `${pi}-${ri}`;
        r.setAttribute('data-tsubot-r', key);

        const choiceInputs = Array.from(r.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
        const choices = choiceInputs.map((inp, ci) => {
          inp.setAttribute('data-tsubot-c', String(ci));
          let label = inp.id ? document.querySelector(`label[for="${CSS.escape(inp.id)}"]`) : null;
          if (!label) label = inp.closest('label');
          let t = textOf(label);
          if (!t) t = clean(inp.getAttribute('aria-label'));
          if (!t && inp.parentElement) t = textOf(inp.parentElement);
          return t;
        });

        let selectOptions = [];
        const selects = Array.from(r.querySelectorAll('select'));
        if (choiceInputs.length === 0 && selects.length === 1) {
          selects[0].setAttribute('data-tsubot-s', '0');
          selectOptions = Array.from(selects[0].options).map(o => ({ value: o.value, text: clean(o.textContent) }));
        }

        const textInputs = Array.from(r.querySelectorAll('input[type="text"], input:not([type]), textarea'))
          .filter(el => !el.disabled);
        textInputs.forEach((el, ti) => el.setAttribute('data-tsubot-t', String(ti)));

        const texts = [];
        const push = t => { t = clean(t); if (t.length > 1 && !BOILERPLATE.test(t) && !texts.includes(t)) texts.push(t); };

        r.querySelectorAll('legend, .response-fieldset-legend, .question-title, .qtext').forEach(el => push(textOf(el)));
        textInputs.forEach(el => {
          const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
          if (label) push(textOf(label));
          if (el.getAttribute('aria-label')) push(el.getAttribute('aria-label'));
        });

        // Stem written as plain <p> before the response inside the problem.
        for (let node = r; node && node !== p; node = node.parentElement) {
          const found = [];
          let blocked = false;
          for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
            if (sib.matches('.wrapper-problem-response') || sib.querySelector('.wrapper-problem-response')) { blocked = true; break; }
            if (sib.matches('.problem-header, .problem-progress, script, style, .sr, .sr-only')) continue;
            const t = textOf(sib);
            if (t) found.unshift(t);
          }
          found.forEach(push);
          if (found.length || blocked) break;
        }

        const choiceSet = new Set(choices.concat(selectOptions.map(o => o.text)));
        const lineSource = responses.length === 1 ? p : r;
        const lines = String(lineSource.innerText || lineSource.textContent || '').split('\n').map(clean)
          .filter(l => l && !choiceSet.has(l) && !BOILERPLATE.test(l));
        lines.forEach(push);
        if (lines.length > 1) push(lines.join(' '));

        return { key, texts, choices, selectOptions, textInputCount: textInputs.length };
      })
    };
  });
}

// Runs inside the page (passed to evaluate). Returns why a problem must not be answered again
// ('' = still open). A problem counts as done once it was submitted at all — graded correct,
// graded wrong/partial, or out of attempts — so the bot never resubmits an answered question.
function problemDoneReason(el) {
  const text = el.innerText || '';
  const score = text.match(/(\d+(?:\.\d+)?)\s*(?:\/|of|เต็ม|จาก)\s*(\d+(?:\.\d+)?)\s*(?:points?|คะแนน)/i);
  if (score && parseFloat(score[2]) > 0) {
    return parseFloat(score[1]) >= parseFloat(score[2])
      ? `ได้คะแนนเต็มแล้ว (${score[0]})`
      : `ส่งคำตอบไปแล้ว ได้ ${score[0]} — ไม่ส่งซ้ำ`;
  }
  if (el.querySelector('.status.correct, .message.correct, .correct, [data-icon="check-circle"], .fa-check, svg.text-success, svg[class*="success"]')) {
    return 'มีเครื่องหมายถูกต้อง (Correct / ติ๊กเขียว)';
  }
  if (el.querySelector('.status.incorrect, .status.partially-correct, .message.incorrect, .incorrect, .partially-correct')) {
    return 'ส่งคำตอบไปแล้ว (ตรวจแล้ว) — ไม่ส่งซ้ำ';
  }
  const used = text.match(/used\s*(\d+)\s*of\s*(\d+)\s*attempts?/i);
  if (used && parseInt(used[1], 10) >= 1) {
    return used[1] === used[2] ? `ใช้โควตาส่งคำตอบครบแล้ว (${used[0]})` : `ส่งคำตอบไปแล้ว (${used[0]}) — ไม่ส่งซ้ำ`;
  }
  if (/Your answer has been receive|คำตอบของคุณถูกบันทึกแล้ว/i.test(text)) return 'ส่งคำตอบเรียบร้อยแล้ว';
  return '';
}

// Runs inside the Progress page (learning MFE progress tab). Reads the "Course completion"
// donut and every graded subsection row ("Pre Test 0/30", "Quiz : Unit 1 : Chapter 3 17/19").
function parseProgressPage() {
  const clean = s => String(s || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const SCORE = /^(\d+(?:\.\d+)?)\s*(?:\/|of|จาก)\s*(\d+(?:\.\d+)?)$/i;
  const out = { completion: null, rows: [] };

  const donut = Array.from(document.querySelectorAll('.donut-chart-number, .donut-chart text, [class*="donut"] text, [class*="completion"] [class*="number"]'))
    .map(el => clean(el.textContent)).find(t => /\d+\s*%?$/.test(t) && /\d/.test(t));
  if (donut) out.completion = parseFloat(donut);
  if (out.completion === null) {
    const m = clean(document.body.innerText).match(/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:completed?|เสร็จสิ้น|สำเร็จ|เรียนแล้ว)/i);
    if (m) out.completion = parseFloat(m[1]);
  }

  const seen = new Set();
  const push = (section, name, link, scoreText) => {
    const m = clean(scoreText).match(SCORE);
    if (!m || !name) return;
    const href = link ? link.href : '';
    const key = href + '|' + name;
    if (seen.has(key)) return;
    seen.add(key);
    out.rows.push({ section, name, href, hrefAttr: link ? link.getAttribute('href') : '', earned: parseFloat(m[1]), possible: parseFloat(m[2]) });
  };

  for (const tr of document.querySelectorAll('tr')) {
    const cells = tr.querySelectorAll('td, th');
    if (cells.length < 2) continue;
    const link = tr.querySelector('a[href]');
    const name = clean(link ? link.textContent : cells[0].innerText.split('\n')[0]);
    const table = tr.closest('table');
    const th = table && table.querySelector('thead th');
    push(th ? clean(th.textContent) : '', name, link, cells[cells.length - 1].innerText);
  }
  if (!out.rows.length) {
    // Non-table layouts: a subsection link whose row ends with the score.
    for (const link of document.querySelectorAll('main a[href], #main-content a[href], a[href*="block-v1:"], a[href*="jump_to"]')) {
      const row = link.closest('li, [role="row"], .row, [class*="row"]');
      if (!row) continue;
      const lines = row.innerText.split('\n').map(clean).filter(Boolean);
      push('', clean(link.textContent), link, lines[lines.length - 1] || '');
    }
  }
  return out;
}

// Runs in the courseware page: where the active unit sits inside the current sequence nav.
function sequencePosition() {
  const active = document.querySelector('.sequence-navigation [aria-current="page"], .sequence-navigation button.active, .sequence-navigation-tabs button.active, nav[aria-label*="unit" i] [aria-current="page"]');
  if (!active) return { known: false };
  const list = active.closest('ol, ul, .sequence-navigation-tabs');
  const units = list ? Array.from(list.querySelectorAll('button, a')).filter(b => !/previous|next|ก่อนหน้า|ถัดไป/i.test(b.className + ' ' + (b.getAttribute('aria-label') || ''))) : [];
  const prev = document.querySelector('.sequence-navigation .previous-btn, .sequence-navigation button.previous-button, .sequence-nav-button.button-previous, button.previous-btn, button.previous-button');
  return {
    known: units.length > 0,
    isLast: units.length > 0 && units[units.length - 1] === active,
    atCourseStart: prev ? (prev.disabled || prev.getAttribute('aria-disabled') === 'true') : null
  };
}

// Runs inside each frame (serialized by Playwright): must not reference anything outside itself.
function unitCompletionProbe(problemDoneReason) {
  const out = { navDone: '', hasNav: false, problems: 0, problemsDone: 0 };
  const CHECK = '[data-icon*="check"], .fa-check, .fa-check-circle, svg.text-success, svg[class*="success"], .text-success, .complete-checkmark';
  const inBreadcrumb = el => !!el.closest('[aria-label*="breadcrumb" i], .breadcrumbs, .breadcrumb');
  const ACTIVE = [
    '.sequence-navigation button[aria-current]', '.sequence-navigation button.active',
    'nav button[aria-current="page"]', 'nav button[aria-current="step"]', 'nav button[aria-current="true"]',
    'nav [aria-current="page"]', 'nav [aria-current="step"]', 'nav li.active button', 'nav button.active',
    'button[aria-current="page"]', 'button[aria-current="step"]', 'button[aria-current="true"]'
  ];
  let active = null;
  for (const sel of ACTIVE) {
    active = Array.from(document.querySelectorAll(sel)).find(el => !inBreadcrumb(el)) || null;
    if (active) break;
  }
  if (active) {
    out.hasNav = true;
    const li = active.closest('li');
    const label = ((active.getAttribute('aria-label') || '') + ' ' + (active.getAttribute('title') || '') + ' ' +
                   (li ? li.getAttribute('aria-label') || '' : '')).toLowerCase();
    const txt = active.innerText || '';
    if (active.querySelector(CHECK) || (li && li.querySelector(CHECK))) out.navDone = 'ตรวจพบไอคอนติ๊กถูกสีเขียวบนปุ่มบทเรียนปัจจุบัน';
    else if (txt.includes('✓') || txt.includes('✔')) out.navDone = 'พบสัญลักษณ์ติ๊กถูก (✓) บนปุ่มบทเรียนปัจจุบัน';
    else if (/\bcompleted?\b|ผ่านแล้ว|เสร็จสิ้น/.test(label) && !/incomplete|not completed/.test(label)) out.navDone = `aria-label ระบุว่าเสร็จสิ้น (${label.trim()})`;
  }

  const all = Array.from(document.querySelectorAll('.problems-wrapper, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], .problem'));
  const problems = all.filter(p => !all.some(o => o !== p && o.contains(p)));
  for (const p of problems) {
    out.problems++;
    if (problemDoneReason(p)) out.problemsDone++;
  }
  return out;
}

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
    this.onProgress = options.onProgress || (() => {});
    this.progressOnly = !!options.progressOnly;
    this.courseId = '';
    this.progressFirstDone = false;
    this.mainPassAtCourseStart = null;
    this.leftIncomplete = new Set();
    this.workedProgressItems = new Set();
    this.lastHandledType = null;

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

      if (this.progressOnly) {
        const data = await this.openProgressPage();
        if (data) this.summarizeProgress(data, '');
        this.setStatus(data ? 'completed' : 'error', 'Progress checked');
        return;
      }
      if (this.courseIdFromUrl(this.page.url())) await this.progressFirst();

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

        if (!this.progressFirstDone && this.courseIdFromUrl(this.page.url())) {
          await this.progressFirst();
          continue;
        }
        if (this.mainPassAtCourseStart === null) {
          const pos = await this.page.evaluate(sequencePosition).catch(() => ({}));
          this.mainPassAtCourseStart = pos.atCourseStart === true;
        }

        await this.processCurrentUnit();
        if (this.shouldStop) break;
        await this.noteIfLeftIncomplete();

        const moved = await this.advanceNextUnit();
        if (!moved) {
          this.log(`🏁 ไม่พบปุ่ม 'Next' หรือเรียนจบทุกบทแล้ว (Course Finished).`, 'info');
          await this.finalProgressCheck();
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
    this.lastHandledType = null;
    if (!this.page || this.page.isClosed()) return;

    // Wait a brief moment for dynamic React / Open edX MFE DOM to settle
    await this.sleep(1500);
    // The MFE swaps units without a page load; wait for the unit iframe's document too.
    for (const f of this.page.frames()) {
      if (f !== this.page.mainFrame()) await f.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    }

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
            return !!document.querySelector('.problem, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], form.problem-form, .capa_inputtype, .wrapper-problem-response, .que, fieldset input[type="radio"], fieldset input[type="checkbox"]');
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
      this.lastHandledType = 'video';
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
    this.lastHandledType = 'doc';
    await this.handleDocument(this.page.mainFrame());
  }

  async isCurrentUnitCompleted() {
    try {
      const probes = [];
      for (const f of this.page.frames()) {
        const r = await f.evaluate(`(${unitCompletionProbe})(${problemDoneReason})`).catch(() => null);
        if (r) probes.push({ main: f === this.page.mainFrame(), ...r });
      }

      const nav = probes.find(p => p.main && p.navDone);
      if (nav) {
        this.log(`⏭️ [ข้ามทันที] ${nav.navDone} ข้ามไปบทเรียนถัดไปตามที่กำหนด!`);
        return true;
      }

      // A quiz unit is done only when every problem in it is done; partially graded units
      // go to handleQuiz, which skips the finished problems one by one.
      const problems = probes.reduce((n, p) => n + p.problems, 0);
      const problemsDone = probes.reduce((n, p) => n + p.problemsDone, 0);
      if (problems > 0 && problemsDone === problems) {
        this.log(`⏭️ [ข้ามทันที] ข้อสอบทั้ง ${problems} ข้อในหน่วยนี้ส่งคำตอบครบแล้ว -> ข้ามทันที!`);
        return true;
      }
      if (problemsDone > 0) {
        this.log(`ℹ️ หน่วยนี้ส่งคำตอบแล้ว ${problemsDone}/${problems} ข้อ — จะทำเฉพาะข้อที่ยังไม่ได้ส่ง (ไม่ส่งข้อเดิมซ้ำ)`);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async isProblemCompleted(qEl) {
    try {
      const reason = await qEl.evaluate(problemDoneReason);
      return reason ? { completed: true, reason } : { completed: false };
    } catch (e) {
      return { completed: false };
    }
  }

  async handleDocument(frame) {
    this.setStatus('running', 'Reading Document/Sheet');
    this.log(`📄 ตรวจพบเอกสาร/ชีทเรียน (Sheet/Document) รอเอกสารโหลดและรอครบ 5 วินาทีตามเกณฑ์...`);

    // Ensure document or iframe contents (sheet / PDF viewer) have fully loaded before timing
    await this.page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    for (const f of this.page.frames()) {
      if (f !== this.page.mainFrame()) await f.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
    }

    // Smooth scroll down to simulate real reading behavior (MFE page and any self-scrolling iframe)
    const scrollAll = async (ratio) => {
      for (const f of this.page.frames()) {
        await f.evaluate((r) => {
          const el = document.scrollingElement || document.documentElement;
          window.scrollTo({ top: el.scrollHeight * r, behavior: 'smooth' });
        }, ratio).catch(() => {});
      }
    };
    await scrollAll(0.5);
    await this.sleep(2500);

    await scrollAll(1);
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

    // Prefer the real player inside the frame that holds the video over the whole unit iframe.
    const playerSelectors = videoSelectors.filter(s => s !== 'iframe#unit-iframe');
    const searchFrames = [frame, ...allFrames.filter(f => f !== frame)].filter(Boolean);
    let playerBox = null;
    for (const f of searchFrames) {
      for (const sel of playerSelectors) {
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

    if (!playerBox) {
      for (const f of [this.page.mainFrame()]) {
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

    // D. Press Space key — only once focus is inside the player; otherwise Space would hit the
    // still-focused MFE "Next" button and leave the unit.
    if (playerBox) await this.page.keyboard.press('Space').catch(() => {});
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

    // 5. STEP 3: PLAY IN THE LAST 10 SECONDS UNTIL THE COMPLETION MARK IS PASSED
    this.log(`⏳ [ขั้นตอนที่ 3] กำลังเล่นช่วง 10 วินาทีสุดท้ายเพื่อบันทึกผลการเรียนลงระบบ TSU...`);
    const result = await this.waitForVideoCompletion(allFrames);
    if (!result) {
      // No readable <video> (e.g. cross-origin YouTube embed): keep it playing for a fixed time.
      await this.sleep(5000);
      this.log(`✅ เล่นช่วงท้ายคลิปครบ 5 วินาที (อ่านเวลาวิดีโอไม่ได้ เช่น YouTube) เตรียมกด Next.`);
    } else if (result.ended || result.cur >= result.dur * 0.97) {
      this.log(`✅ วิดีโอเล่นถึง ${Math.round((result.cur / result.dur) * 100)}%${result.ended ? ' (จบคลิป)' : ''} ผ่านเกณฑ์บันทึกผลแล้ว เตรียมกด Next ทันที.`);
    } else {
      this.log(`⚠️ วิดีโอเล่นได้ ${Math.round((result.cur / result.dur) * 100)}% ภายในเวลาที่กำหนด อาจยังไม่ขึ้นติ๊กถูก — ไปหน่วยถัดไปเพื่อไม่ให้ค้าง`, 'warn');
    }
  }

  // Keeps the clip playing until it passes ~97% (Open edX marks video complete at 95% by
  // default) or ends. Returns the last { cur, dur, ended } seen, or null if no <video> is readable.
  async waitForVideoCompletion(frames) {
    const started = Date.now();
    let last = null;
    while (!this.shouldStop && Date.now() - started < 25000) {
      let info = null;
      for (const f of frames) {
        info = await f.evaluate(() => {
          const v = document.querySelector('video');
          if (!v || !v.duration || !isFinite(v.duration)) return null;
          if (v.paused && !v.ended) {
            v.muted = true;
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          }
          return { cur: v.currentTime, dur: v.duration, ended: v.ended };
        }).catch(() => null);
        if (info) break;
      }
      if (!info) return last;
      last = info;
      if (info.ended || (Date.now() - started >= 3000 && info.cur >= info.dur * 0.97)) return info;
      await this.sleep(400);
    }
    return last;
  }

  async findQuizFrame() {
    let best = null;
    for (let attempt = 0; attempt < 8 && !this.shouldStop; attempt++) {
      best = null;
      for (const f of this.page.frames()) {
        const stats = await f.evaluate(() => ({
          problems: document.querySelectorAll('.problems-wrapper, [data-block-type="problem"], .problem, .wrapper-problem-response, .que').length,
          inputs: document.querySelectorAll('.problem input, .problem select, .problem textarea, .que input, fieldset input, .wrapper-problem-response input, .wrapper-problem-response select').length
        })).catch(() => null);
        if (stats && stats.problems > 0 && (!best || stats.problems > best.stats.problems)) {
          best = { frame: f, stats };
        }
      }
      if (best && best.stats.inputs > 0) return best.frame;
      await this.sleep(1000);
    }
    return best ? best.frame : null;
  }

  async getSectionContext(quizFrame) {
    const grab = () => {
      const parts = [document.title];
      document.querySelectorAll('nav[aria-label*="breadcrumb" i], .breadcrumbs, .unit-title, .sequence-title, h1, h2, .problem-header, [aria-current="page"], [aria-current="step"]')
        .forEach(el => parts.push((el.innerText || el.textContent || '').trim()));
      return parts.filter(Boolean).join(' | ').slice(0, 4000);
    };
    const mainCtx = await this.page.evaluate(grab).catch(() => '');
    const frameCtx = quizFrame && quizFrame !== this.page.mainFrame() ? await quizFrame.evaluate(grab).catch(() => '') : '';
    return `${mainCtx} | ${frameCtx}`;
  }

  async handleQuiz(frame) {
    this.setStatus('running', 'Solving Quiz');
    this.log(`📝 ตรวจพบแบบทดสอบ (Quiz) กำลังวิเคราะห์โจทย์...`);

    const quizFrame = (await this.findQuizFrame()) || frame;
    if (!quizFrame) return;

    const context = await this.getSectionContext(quizFrame);
    const pageUrl = this.page.url().toLowerCase();
    const section = dbManager.resolveSection(this.courseCode, context);
    const ctxTokens = dbManager.sectionTokens(context);
    // The bank has no pre-test sections; a resolved bank section means this is a graded quiz.
    const isPretest = !section && (pageUrl.includes('pre-test') || pageUrl.includes('pretest') ||
                      (ctxTokens.has('pre') && !ctxTokens.has('post')));
    this.log(`📚 บทที่ตรวจพบ: ${section || '(ไม่ทราบ — จับคู่ด้วยข้อความโจทย์อย่างเดียว)'}${isPretest ? ' [Pre-test]' : ''}`);

    const problems = await quizFrame.evaluate(collectQuizResponses).catch(e => {
      this.log(`⚠️ อ่านโครงสร้างข้อสอบไม่สำเร็จ: ${e.message}`, 'warn');
      return [];
    });
    const totalResponses = problems.reduce((n, p) => n + p.responses.length, 0);
    this.log(`📝 พบจำนวนข้อสอบทั้งหมด ${totalResponses} ข้อ (${problems.length} problem blocks)`);
    if (totalResponses === 0) return;

    let allCompleted = true;
    const completedMap = new Map();
    for (const p of problems) {
      const handle = await quizFrame.$(`[data-tsubot-p="${p.pi}"]`);
      const chk = handle ? await this.isProblemCompleted(handle) : { completed: false };
      completedMap.set(p.pi, chk);
      if (!chk.completed) allCompleted = false;
    }
    if (allCompleted) {
      this.log(`⏭️ [ข้ามทั้งแบบทดสอบ] แบบทดสอบทุกข้อในหน้านี้ได้คะแนนเต็ม/ทำเสร็จแล้ว (ติ๊กเขียว) ข้ามไปหน่วยถัดไปทันที...`);
      return;
    }

    let respIndex = 0;
    let anyAnswered = false;
    let unsubmitted = 0;

    for (const p of problems) {
      if (this.shouldStop) return;
      const chk = completedMap.get(p.pi);
      if (chk && chk.completed) {
        this.log(`⏭️ [ข้ามข้อนี้] ข้อ ${respIndex + 1}: ${chk.reason} ข้ามไปข้อถัดไป ไม่แตะต้องคำตอบเดิม`);
        respIndex += p.responses.length;
        continue;
      }

      let answeredInProblem = 0;
      for (const r of p.responses) {
        const qNo = respIndex + 1;
        try {
          if (await this.answerResponse(quizFrame, r, { section, isPretest, index: respIndex, qNo })) {
            answeredInProblem++;
            anyAnswered = true;
          }
        } catch (e) {
          this.log(`⚠️ ข้อ ${qNo} เกิดข้อผิดพลาดเล็กน้อย: ${e.message}`, 'warn');
        }
        respIndex++;
      }

      if (answeredInProblem === 0) continue;
      if (answeredInProblem < p.responses.length) {
        this.log(`   🛑 problem นี้ตอบได้ ${answeredInProblem}/${p.responses.length} ข้อ ไม่กด Submit เพื่อป้องกันการเสียคะแนนข้อที่ยังไม่มีเฉลย`, 'warn');
        continue;
      }

      const submitSel = 'button.submit, button[data-value="Submit"], button:has-text("Submit"), button:has-text("ส่งคำตอบ"), button:has-text("ตรวจคำตอบ")';
      const pHandle = await quizFrame.$(`[data-tsubot-p="${p.pi}"]`).catch(() => null);
      const qSubmitBtn = pHandle ? await pHandle.$(submitSel).catch(() => null) : null;
      if (!qSubmitBtn) { unsubmitted++; continue; }
      let isEn = false;
      for (let t = 0; t < 6; t++) {
        isEn = await qSubmitBtn.isEnabled().catch(() => false);
        if (isEn) break;
        await this.sleep(400);
      }
      if (isEn) {
        await qSubmitBtn.click({ force: true }).catch(() => {});
        this.log(`📤 [ข้อ ${respIndex}] กดปุ่ม Submit เรียบร้อย`);
        await this.sleep(Math.max(800, this.delays.clickDelay));
      }
    }

    // Some quiz layouts have a single submit for the whole page instead of one per problem.
    if (anyAnswered && unsubmitted > 0) {
      const globalSubmit = await quizFrame.$('button.submit, button[data-value="Submit"], button:has-text("Submit"), button:has-text("ส่งคำตอบ")').catch(() => null);
      if (globalSubmit && await globalSubmit.isEnabled().catch(() => false)) {
        this.log(`📤 กำลังกดส่งคำตอบรวม (Global Submit)...`);
        await globalSubmit.click().catch(() => {});
        await this.sleep(2500);
      }
    }
  }

  // Returns true when this response was filled in.
  async answerResponse(quizFrame, r, { section, isPretest, index, qNo }) {
    const scope = `[data-tsubot-r="${r.key}"]`;
    const isSelect = r.choices.length === 0 && r.selectOptions.length > 0;
    const selectChoices = r.selectOptions.filter(o => o.value !== '' && !/^select an option|^เลือก/i.test(o.text));
    const choices = isSelect ? selectChoices.map(o => o.text) : r.choices;
    const qText = (r.texts[0] || '').replace(/\s+/g, ' ').slice(0, 90);

    const choose = async (idx) => {
      if (isSelect) {
        const sel = await quizFrame.$(`${scope} [data-tsubot-s="0"]`);
        if (!sel) return false;
        await sel.selectOption(selectChoices[idx].value).catch(() => {});
        return true;
      }
      const input = await quizFrame.$(`${scope} [data-tsubot-c="${idx}"]`);
      if (!input) return false;
      await input.check({ force: true, timeout: 3000 }).catch(async () => { await input.click({ force: true }).catch(() => {}); });
      return await input.isChecked().catch(() => true);
    };

    if (isPretest) {
      if (choices.length === 0) return false;
      const randIdx = Math.floor(Math.random() * choices.length);
      const ok = await choose(randIdx);
      if (ok) this.log(`🎲 [Pre-test] ข้อ ${qNo}: สุ่มเลือก "${choices[randIdx]}"`);
      return ok;
    }

    const decision = dbManager.decideResponse({
      courseCode: this.courseCode,
      texts: r.texts,
      choices,
      textInputCount: r.textInputCount,
      section,
      index
    });

    this.log(`🔎 ข้อ ${qNo}: โจทย์ "${qText}"`);
    if (decision.match) {
      const m = decision.match;
      this.log(`   ↳ จับคู่ฐาน: "${String(m.question).slice(0, 90)}" [${m.section} #${m.index + 1}, ${m.method}, ${Math.round((m.score || 0) * 100)}%, ${m.status}]`);
    }

    if (decision.action === 'choice') {
      const ok = await choose(decision.index);
      if (ok) {
        this.log(`🎯 ข้อ ${qNo}: เลือกตัวเลือก ${decision.index + 1}/${choices.length} "${decision.choiceText}" (เฉลย "${decision.answer}", ${decision.choiceMethod}${decision.hint ? ', จากคำแนะนำ tsu_missing.json' : ''})`);
      } else {
        this.log(`⚠️ ข้อ ${qNo}: คลิกตัวเลือก "${decision.choiceText}" ไม่สำเร็จ`, 'warn');
      }
      return ok;
    }

    if (decision.action === 'text') {
      for (let ti = 0; ti < r.textInputCount; ti++) {
        const tInput = await quizFrame.$(`${scope} [data-tsubot-t="${ti}"]`);
        if (!tInput) continue;
        const value = decision.values[ti];
        await tInput.click().catch(() => {});
        await tInput.fill('').catch(() => {});
        await tInput.fill(value).catch(() => {});
        await tInput.dispatchEvent('input').catch(() => {});
        await tInput.dispatchEvent('change').catch(() => {});
        await tInput.press('Tab').catch(() => {});
      }
      this.log(`🎯 ข้อ ${qNo}: พิมพ์คำตอบ "${decision.values.join(' ; ')}"${decision.hint ? ' (จากคำแนะนำ tsu_missing.json)' : ''}`);
      return true;
    }

    this.log(`📢 [no match] ข้อ ${qNo}: ${decision.reason} — "${qText}"`, 'warn');
    if (choices.length) this.log(`   ตัวเลือกบนหน้า: ${choices.join(' | ')}`, 'warn');
    if (decision.match && decision.match.correct_answer && decision.match.status === 'confirmed') {
      this.log(`   เฉลยในฐาน: "${decision.match.correct_answer}" (ไม่ตรงกับตัวเลือกใด)`, 'warn');
    }
    if (decision.hint && decision.hint.hint) this.log(`   💡 คำแนะนำ: ${decision.hint.hint}`, 'warn');
    if (decision.hint && decision.hint.wrong_answers.length) {
      this.log(`   🚫 ตัวเลือกที่เคยผิด (ห้ามกา): ${decision.hint.wrong_answers.join(' | ')}`, 'warn');
    }
    this.log(`   🛑 ข้ามข้อนี้ ไม่สุ่มตอบและไม่ส่ง เพื่อป้องกันการตอบผิด/เสียคะแนน`, 'warn');
    return false;
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

  courseIdFromUrl(url) {
    const m = String(url || '').match(/(course-v1:[^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // Opens the Progress tab (click "Progress"/"ความคืบหน้า"; falls back to /learning/course/<id>/progress)
  // and returns { completion, rows } or null if the page could not be read.
  async openProgressPage() {
    const courseId = this.courseIdFromUrl(this.page.url()) || this.courseIdFromUrl(this.targetUrl) || this.courseId;
    if (!courseId) {
      this.log(`⚠️ ยังไม่ทราบรหัสรายวิชา (course-v1:...) จึงเปิดหน้า Progress ไม่ได้`, 'warn');
      return null;
    }
    this.courseId = courseId;
    if (!/\/progress(?:[/?#]|$)/.test(this.page.url())) {
      let clicked = false;
      for (const sel of ['nav a[href$="/progress"]', 'a.nav-link[href*="/progress"]', '.course-tabs-navigation a:has-text("Progress")',
        'nav a:has-text("Progress")', 'nav a:has-text("ความคืบหน้า")', 'a[role="tab"]:has-text("Progress")']) {
        const tab = await this.page.$(sel).catch(() => null);
        if (tab && await tab.isVisible().catch(() => false)) {
          await tab.click().catch(() => {});
          clicked = await this.page.waitForURL(/\/progress/, { timeout: 8000 }).then(() => true).catch(() => false);
          if (clicked) break;
        }
      }
      if (!clicked) {
        let origin = 'https://apps.course.tsu.ac.th';
        try { origin = new URL(/^https?:/.test(this.page.url()) ? this.page.url() : this.targetUrl).origin; } catch (e) {}
        const url = `${origin}/learning/course/${courseId}/progress`;
        this.log(`🌐 ไม่พบแท็บ Progress บนหน้านี้ เปิดตรงที่ ${url}`);
        await this.page.goto(url, { timeout: 60000 }).catch(e => this.log(`Nav warning: ${e.message}`, 'warn'));
      }
    }
    // The MFE renders the progress tab after its API call returns.
    let data = null;
    for (let i = 0; i < 15 && !this.shouldStop; i++) {
      await this.sleep(1000);
      data = await this.page.evaluate(parseProgressPage).catch(() => null);
      if (data && data.completion !== null && data.rows.length) break;
    }
    if (!data || (data.completion === null && !data.rows.length)) {
      this.log(`⚠️ อ่านหน้า Progress ไม่สำเร็จ (ไม่พบเปอร์เซ็นต์ความคืบหน้าหรือตารางคะแนน)`, 'warn');
      return null;
    }
    return data;
  }

  summarizeProgress(data, phase) {
    const rowName = r => `${r.section ? r.section + ' › ' : ''}${r.name} (${r.earned}/${r.possible})`;
    const zero = data.rows.filter(r => r.possible > 0 && r.earned === 0);
    const partial = data.rows.filter(r => r.earned > 0 && r.earned < r.possible);
    const full = data.rows.filter(r => r.possible > 0 && r.earned >= r.possible);
    const pct = data.completion === null ? 'อ่านไม่ได้' : `${data.completion}%`;
    this.log(`📊 [ความคืบหน้า${phase}] Course completion: ${pct} | แบบฝึกที่มีคะแนน ${data.rows.length} รายการ`);
    if (zero.length) {
      this.log(`❌ ยังไม่ได้ทำ / ได้ 0 คะแนน ${zero.length} รายการ:`);
      zero.forEach(r => this.log(`   • ${rowName(r)}${this.workedProgressItems.has(r.href) ? ' — เข้าไปทำแล้วในรอบนี้ (ส่งแล้วแต่ได้ 0 / แบบทดสอบก่อนเรียนที่สุ่มตอบ / ไม่มีเฉลยในฐานข้อมูล)' : ''}`));
    } else {
      this.log(`✅ ไม่มีแบบฝึกที่ได้ 0 คะแนน`);
    }
    if (partial.length) {
      this.log(`🟡 ทำแล้วบางส่วน ${partial.length} รายการ (ไม่ส่งข้อเดิมซ้ำ จะทำเฉพาะข้อที่ยังไม่ได้ส่ง):`);
      partial.forEach(r => this.log(`   • ${rowName(r)}`));
    }
    if (full.length) this.log(`🟢 ได้คะแนนเต็มแล้ว ${full.length} รายการ`);
    this.onProgress({ phase: phase.replace(/^\s*-\s*/, ''), completion: data.completion, zero, partial, full: full.length });
    return { zero, partial, full };
  }

  // Opens one graded subsection from the Progress page (its link; direct URL as fallback) and works
  // through the units of that subsection only.
  async workProgressItem(row) {
    if (!row.href) {
      this.log(`⚠️ "${row.name}" ไม่มีลิงก์ในหน้า Progress — ข้าม`, 'warn');
      return;
    }
    this.log(`🎯 เปิดแบบฝึกจากหน้า Progress: ${row.name} (${row.earned}/${row.possible})`);
    this.workedProgressItems.add(row.href);
    let link = null;
    if (/\/progress(?:[/?#]|$)/.test(this.page.url()) && row.hrefAttr) {
      link = await this.page.$(`a[href="${row.hrefAttr.replace(/["\\]/g, '\\$&')}"]`).catch(() => null);
    }
    if (link && await link.isVisible().catch(() => false)) {
      await link.click().catch(() => {});
      await this.page.waitForURL(u => !/\/progress(?:[/?#]|$)/.test(String(u)), { timeout: 15000 }).catch(() => {});
    } else {
      await this.page.goto(row.href, { timeout: 60000 }).catch(e => this.log(`Nav warning: ${e.message}`, 'warn'));
    }
    await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await this.sleep(1500);

    for (let n = 0; n < 40 && !this.shouldStop; n++) {
      await this.processCurrentUnit();
      if (this.shouldStop) return;
      const pos = await this.page.evaluate(sequencePosition).catch(() => ({ known: false }));
      if (!pos.known || pos.isLast) return;
      if (!(await this.advanceNextUnit())) return;
    }
  }

  // Quiz subsections not finished yet: 0/N, or partial scores that may still have unsubmitted problems.
  async workOpenQuizzes(data) {
    const targets = data.rows.filter(r => r.possible > 0 && r.earned < r.possible);
    if (!targets.length) return;
    if (!this.modes.has('quiz')) {
      this.log(`⏭️ [ข้ามตามที่เลือก] มีแบบฝึกที่ยังไม่ครบ ${targets.length} รายการ แต่ไม่ได้เลือกให้ทำแบบฝึก`);
      return;
    }
    for (const [i, row] of targets.entries()) {
      if (this.shouldStop) return;
      if (i > 0) await this.openProgressPage();
      await this.workProgressItem(row);
    }
  }

  // Before the unit-by-unit pass: read Progress, then go straight into every unfinished quiz.
  async progressFirst() {
    this.progressFirstDone = true;
    const returnUrl = this.page.url();
    this.setStatus('running', 'Checking Progress');
    this.log(`📊 เปิดหน้า Progress ก่อนเริ่ม เพื่อดูแบบฝึกที่ยังไม่ได้ทำ...`);
    const data = await this.openProgressPage();
    if (data) {
      this.summarizeProgress(data, ' - ก่อนเริ่ม');
      await this.workOpenQuizzes(data);
    }
    if (this.shouldStop) return;
    this.log(`↩️ กลับไปเรียนตามลำดับบทเรียนต่อ...`);
    await this.page.goto(returnUrl, { timeout: 60000 }).catch(e => this.log(`Nav warning: ${e.message}`, 'warn'));
    await this.sleep(2000);
  }

  // After the last unit: re-read Progress; if not 100% or quizzes are still 0 points, do one extra
  // pass (unfinished quizzes, units left incomplete, or the whole course if the run did not start at
  // its first unit), then read Progress again and log the final result. Never loops further.
  async finalProgressCheck() {
    this.log(`📊 เรียนจบรอบแล้ว ตรวจหน้า Progress อีกครั้ง...`);
    let data = await this.openProgressPage();
    if (!data) return;
    let s = this.summarizeProgress(data, ' - หลังเรียนจบรอบ');
    const needs = (data.completion !== null && data.completion < 100) || s.zero.length > 0;
    if (needs && !this.shouldStop) {
      this.log(`🔁 ยังไม่ครบ 100% หรือยังมีแบบฝึก 0 คะแนน — ทำรอบเก็บตกอีก 1 รอบ (ตามโหมดที่เลือก)`);
      await this.workOpenQuizzes(data);
      const incompleteUnits = [...this.leftIncomplete];
      this.leftIncomplete.clear();
      for (const url of incompleteUnits) {
        if (this.shouldStop) break;
        this.log(`🔁 กลับไปทำหน่วยที่ยังไม่ขึ้นติ๊กถูก: ${url}`);
        await this.page.goto(url, { timeout: 60000 }).catch(() => {});
        await this.sleep(1500);
        await this.processCurrentUnit();
      }
      const contentSelected = this.modes.has('video') || this.modes.has('doc');
      if (data.completion !== null && data.completion < 100 && contentSelected && this.mainPassAtCourseStart === false && !this.shouldStop) {
        this.log(`🔁 รอบแรกเริ่มกลางรายวิชา (Resume) — เดินทุกหน่วยตั้งแต่หน่วยแรกอีก 1 รอบ (หน่วยที่ทำแล้วจะข้ามทันที)`);
        await this.walkFromFirstUnit();
      }
      if (this.shouldStop) return;
      data = await this.openProgressPage();
      if (!data) return;
      s = this.summarizeProgress(data, ' - หลังรอบเก็บตก');
    }
    const done = data.completion !== null && data.completion >= 100;
    const skippedModes = ['quiz', 'video', 'doc'].filter(m => !this.modes.has(m));
    if (!done && skippedModes.length) {
      const names = { quiz: 'แบบฝึก', video: 'วิดีโอ', doc: 'เอกสาร' };
      this.log(`ℹ️ ไม่ได้เลือกทำ ${skippedModes.map(m => names[m]).join('/')} จึงอาจยังไม่ถึง 100%`);
    }
    this.log(`🏁 สรุป: ความคืบหน้า ${data.completion === null ? '?' : data.completion + '%'} | แบบฝึก 0 คะแนนเหลือ ${s.zero.length} รายการ${s.zero.length ? ` (${s.zero.map(r => r.name).join(', ')})` : ''} | ${done ? 'ครบ 100% แล้ว 🎉' : 'ยังไม่ครบ 100%'}`);
  }

  async walkFromFirstUnit() {
    const home = `${new URL(this.page.url()).origin}/learning/course/${this.courseId}/home`;
    await this.page.goto(home, { timeout: 60000 }).catch(() => {});
    await this.sleep(2500);
    for (const sel of ['button:has-text("Expand all")', 'button:has-text("ขยายทั้งหมด")']) {
      const b = await this.page.$(sel).catch(() => null);
      if (b && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await this.sleep(1000); }
    }
    const first = await this.page.$('ol.outline-sections a[href*="block-v1:"], .course-outline a[href*="block-v1:"], #courseHome-outline a[href*="block-v1:"], main a[href*="type@sequential"]').catch(() => null);
    if (first) {
      await first.click().catch(() => {});
      await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await this.sleep(2000);
    } else {
      await this.enterCourseFromOutline();
    }
    for (let n = 0; n < 500 && !this.shouldStop; n++) {
      await this.processCurrentUnit();
      if (this.shouldStop || !(await this.advanceNextUnit())) return;
    }
  }

  // Remembers a unit of a selected type that still has no green check after the bot worked on it.
  async noteIfLeftIncomplete() {
    for (let i = 0; i < 6 && !this.shouldStop; i++) {
      const r = await this.page.evaluate(`(${unitCompletionProbe})(${problemDoneReason})`).catch(() => null);
      if (!r || r.navDone || !r.hasNav) return;
      await new Promise(res => setTimeout(res, 500));
    }
    if (this.lastHandledType === 'video' || this.lastHandledType === 'doc') this.leftIncomplete.add(this.page.url());
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
