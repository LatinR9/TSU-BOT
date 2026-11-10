// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\worker.js
const { chromium } = require('playwright');
const path = require('path');
const dbManager = require('./db_manager');

const USER_DATA_DIR = path.join(__dirname, 'user_profile');

// Runs inside the quiz frame (serialized by Playwright): must not reference anything outside itself.
// One entry per problem block; `slots` are its answer inputs in page order (radio group, checkbox
// group, <select>, text input). Block titles ("problem", "Dropdown", ...) are never question text.
function collectQuizResponses() {
  const clean = s => String(s || '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  const textOf = el => clean(el ? (el.innerText || el.textContent) : '');
  const BOILERPLATE = /^(?:question\s*\d+|ข้อ(?:ที่)?\s*\d+|problem|text input|multiple choice|dropdown|checkbox(?:es)?|numerical input|explanation|review|show answer|submit|save|reset|bookmark this page|select an option|ส่งคำตอบ|ส่ง|ตรวจคำตอบ|graded|ungraded|unanswered|correct|incorrect|\(?\d{1,2}\)?|\(?\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?\s*)?points?.*|.*\bpoints? possible\b.*|some problems have options.*|you have used .*|answer received.*|your answer has been receive.*)$/i;
  const outermost = list => list.filter(el => !list.some(o => o !== el && o.contains(el)));
  const labelFor = el => {
    let label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
    if (!label) label = el.closest('label');
    return label;
  };

  let problems = outermost(Array.from(document.querySelectorAll('.problems-wrapper, .xblock-student_view[data-block-type="problem"], div[data-block-type="problem"], .problem, .que')));
  if (problems.length === 0) {
    problems = outermost(Array.from(document.querySelectorAll('fieldset, .choicegroup'))
      .filter(g => g.querySelector('input[type="radio"], input[type="checkbox"], select, input[type="text"]')));
  }

  return problems.map((p, pi) => {
    p.setAttribute('data-tsubot-p', String(pi));
    const header = textOf(p.querySelector('.problem-header'));
    let responses = outermost(Array.from(p.querySelectorAll('.wrapper-problem-response')));
    if (responses.length === 0) responses = [p];

    const slots = [];
    const optionTexts = new Set();
    const respOut = responses.map((r, ri) => {
      const key = `${pi}-${ri}`;
      r.setAttribute('data-tsubot-r', key);
      const groups = new Map();
      const slotIdx = [];
      const labelTexts = [];
      r.querySelectorAll('input, select, textarea').forEach(el => {
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (el.tagName === 'SELECT') {
          if (el.disabled) return;
          const opts = Array.from(el.options).filter(o => o.value !== '' && !/^select an option|^เลือก/i.test(clean(o.textContent)));
          const si = slots.length;
          el.setAttribute('data-tsubot-slot', `${pi}-${si}`);
          slots.push({ si, id: `${pi}-${si}`, kind: 'select', rkey: key, choices: opts.map(o => clean(o.textContent)), values: opts.map(o => o.value) });
          opts.forEach(o => optionTexts.add(clean(o.textContent)));
          slotIdx.push(si);
          const l = labelFor(el);
          if (l) labelTexts.push(textOf(l));
        } else if (type === 'radio' || type === 'checkbox') {
          const gk = `${type}:${el.name || key}`;
          let slot = groups.get(gk);
          if (!slot) {
            slot = { si: slots.length, id: `${pi}-${slots.length}`, kind: type === 'radio' ? 'choice' : 'checkbox', rkey: key, choices: [] };
            groups.set(gk, slot);
            slots.push(slot);
            slotIdx.push(slot.si);
          }
          el.setAttribute('data-tsubot-slot', `${pi}-${slot.si}`);
          el.setAttribute('data-tsubot-c', String(slot.choices.length));
          let t = textOf(labelFor(el));
          if (!t) t = clean(el.getAttribute('aria-label'));
          if (!t && el.parentElement) t = textOf(el.parentElement);
          slot.choices.push(t);
          optionTexts.add(t);
        } else if (el.tagName === 'TEXTAREA' || type === 'text' || type === '') {
          if (el.disabled) return;
          const si = slots.length;
          el.setAttribute('data-tsubot-slot', `${pi}-${si}`);
          slots.push({ si, id: `${pi}-${si}`, kind: 'text', rkey: key });
          slotIdx.push(si);
          const l = labelFor(el);
          if (l) labelTexts.push(textOf(l));
          if (el.getAttribute('aria-label')) labelTexts.push(clean(el.getAttribute('aria-label')));
        }
      });
      return { key, slotIdx, labelTexts, el: r };
    });

    const usable = t => t.length > 1 && t !== header && !BOILERPLATE.test(t) && !optionTexts.has(t);
    const linesOf = el => String(el.innerText || el.textContent || '').split('\n').map(clean).filter(usable);
    const uniq = list => list.filter((t, i) => list.indexOf(t) === i);
    const body = p.querySelector('.problem') || p;

    const responsesOut = respOut.map(({ key, slotIdx, labelTexts, el: r }) => {
      const texts = [];
      r.querySelectorAll('legend, .response-fieldset-legend, .question-title, .qtext').forEach(el => texts.push(textOf(el)));
      texts.push(...labelTexts);
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
        texts.push(...found);
        if (found.length || blocked) break;
      }
      texts.push(...linesOf(r));
      return { key, slotIdx, lines: uniq(texts.filter(usable)) };
    });

    const lines = uniq(linesOf(body));
    return { pi, header, lines, slots, responses: responsesOut };
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

// Runs on the Course tab (course home outline). Every subsection link with its check icon:
// done true = filled check (fas / text-success / ", Completed"), false = hollow grey check-circle
// (far / text-gray / ", Incomplete"), null = icon state unreadable.
function parseCourseOutline() {
  const clean = s => String(s || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const strip = s => clean(s).replace(/,\s*(?:in)?complete(?:d)?(?:\s+(?:section|assignment))?\s*$/i, '').trim();
  const roots = Array.from(document.querySelectorAll('#courseHome-outline, .course-outline, ol.outline-sections, [class*="course-outline"]'))
    .filter((r, i, all) => !all.some(o => o !== r && o.contains(r)));
  const scope = roots.length ? roots : [document.querySelector('main, #main-content') || document.body];
  let links = scope.flatMap(r => Array.from(r.querySelectorAll('a[href*="type@sequential"], a[href*="jump_to"]')));
  if (!links.length) links = scope.flatMap(r => Array.from(r.querySelectorAll('a[href*="block-v1:"]')));

  const iconState = icon => {
    const prefix = icon.getAttribute('data-prefix') || '';
    const name = icon.getAttribute('data-icon') || '';
    const label = clean([icon.getAttribute('title'), icon.getAttribute('aria-label'), icon.querySelector('title') && icon.querySelector('title').textContent].join(' ')).toLowerCase();
    const cls = String((icon.getAttribute('class') || '') + ' ' + ((icon.parentElement && icon.parentElement.getAttribute('class')) || '')).toLowerCase();
    if (/incomplete|not completed/.test(label)) return { done: false, how: 'icon title' };
    if (/complete/.test(label)) return { done: true, how: 'icon title' };
    if (/check/.test(name) && prefix === 'far') return { done: false, how: 'far check-circle' };
    if (/check/.test(name) && prefix === 'fas') return { done: true, how: 'fas check-circle' };
    if (/outline|-o\b/.test(name + ' ' + cls)) return { done: false, how: 'outline icon' };
    if (/text-gray|text-muted|text-light|incomplete/.test(cls)) return { done: false, how: 'grey icon class' };
    if (/text-success|complete/.test(cls)) return { done: true, how: 'success icon class' };
    // Last resort: grey (r ≈ g ≈ b, light) = hollow, coloured = filled.
    const m = getComputedStyle(icon).color.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const [r, g, b] = m.slice(1).map(Number);
      return Math.max(r, g, b) - Math.min(r, g, b) < 24 && r > 120 ? { done: false, how: 'grey icon colour' } : { done: true, how: 'coloured icon' };
    }
    return null;
  };

  const seen = new Set();
  const items = [];
  for (const a of links) {
    const href = a.href;
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const row = a.closest('li') || a.parentElement;
    const sr = clean(Array.from(row.querySelectorAll('.sr-only, .sr, .visually-hidden')).map(e => e.textContent).join(' ')).toLowerCase();
    let st = null;
    if (/incomplete|not completed|ยังไม่/.test(sr)) st = { done: false, how: 'sr-only text' };
    else if (/complete|เสร็จ/.test(sr)) st = { done: true, how: 'sr-only text' };
    if (!st) {
      const icon = row.querySelector('svg, .fa, [class*="fa-"], [class*="pgn__icon"]');
      st = icon ? iconState(icon) : null;
    }
    const secLi = row.parentElement && row.parentElement.closest('li, section');
    const secTitleEl = secLi && secLi.querySelector('.collapsible-title, .section-title, h2, h3, [role="button"], button');
    items.push({
      name: strip(a.innerText || a.textContent),
      section: secTitleEl ? strip((secTitleEl.innerText || secTitleEl.textContent).split('\n').map(clean).filter(Boolean)[0]) : '',
      href,
      hrefAttr: a.getAttribute('href'),
      done: st ? st.done : null,
      how: st ? st.how : 'no icon'
    });
  }
  return { items, rendered: links.length > 0 || !!document.querySelector('#courseHome-outline, .course-outline') };
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
    this.leftovers = new Map();
    this.lastHandledType = null;
    this.lastUnitOutcome = null;
    this.outlineMaxPasses = options.outlineMaxPasses || 3;
    this.onOutline = options.onOutline || (() => {});

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
    this.lastUnitOutcome = null;
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
      this.lastUnitOutcome = 'complete';
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
        this.lastUnitOutcome = 'skip:video';
        this.log(`⏭️ [ข้ามตามที่เลือก] หน่วยนี้เป็นวิดีโอ แต่ไม่ได้เลือกให้ทำวิดีโอ — ไปหน่วยถัดไป`);
        return;
      }
      this.lastHandledType = this.lastUnitOutcome = 'video';
      await this.handleVideo(videoFrame);
      return;
    }

    if (quizFrame) {
      if (!this.modes.has('quiz')) {
        this.lastUnitOutcome = 'skip:quiz';
        this.log(`⏭️ [ข้ามตามที่เลือก] หน่วยนี้เป็นแบบฝึก แต่ไม่ได้เลือกให้ทำแบบฝึก — ไปหน่วยถัดไป`);
        return;
      }
      this.lastUnitOutcome = 'quiz';
      await this.handleQuiz(quizFrame);
      return;
    }

    // Otherwise handle as document / slide reading unit
    if (!this.modes.has('doc')) {
      this.lastUnitOutcome = 'skip:doc';
      this.log(`⏭️ [ข้ามตามที่เลือก] หน่วยนี้เป็นเอกสาร แต่ไม่ได้เลือกให้ทำเอกสาร — ไปหน่วยถัดไป`);
      return;
    }
    this.lastHandledType = this.lastUnitOutcome = 'doc';
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
    const totalSlots = problems.reduce((n, p) => n + p.slots.length, 0);
    this.log(`📝 พบ ${problems.length} problem blocks (${totalSlots} ช่องคำตอบ)`);
    if (totalSlots === 0) return;
    this.prepareQuestionTexts(problems);

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
      problems.forEach(p => this.leftovers.delete(this.leftoverKey(p)));
      return;
    }

    const anyMultiSlot = problems.some(p => p.slots.length > 1);
    const ctx = { section, isPretest, problemCount: problems.length, anyMultiSlot };
    let respIndex = 0;
    let anyAnswered = false;
    let unsubmitted = 0;
    const leftHere = [];

    for (const p of problems) {
      if (this.shouldStop) return;
      const qNo = p.pi + 1;
      const firstResp = respIndex;
      respIndex += p.responses.length;
      const chk = completedMap.get(p.pi);
      if (chk && chk.completed) {
        this.log(`⏭️ [ข้ามข้อนี้] ข้อ ${qNo}: ${chk.reason} ข้ามไปข้อถัดไป ไม่แตะต้องคำตอบเดิม`);
        this.leftovers.delete(this.leftoverKey(p));
        continue;
      }

      let res = { filled: false, reason: 'error' };
      try {
        res = await this.answerProblem(quizFrame, p, { ...ctx, qNo, firstResp });
      } catch (e) {
        this.log(`⚠️ ข้อ ${qNo} เกิดข้อผิดพลาดเล็กน้อย: ${e.message}`, 'warn');
      }
      if (!res.filled) {
        const item = { section: section || context.split('|')[0].trim(), qNo, text: p.texts[0] || p.header || '', reason: res.reason, url: this.page.url() };
        this.leftovers.set(this.leftoverKey(p), item);
        leftHere.push(item);
        continue;
      }
      this.leftovers.delete(this.leftoverKey(p));
      anyAnswered = true;

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
        this.log(`📤 [ข้อ ${qNo}] กดปุ่ม Submit เรียบร้อย`);
        await this.sleep(Math.max(800, this.delays.clickDelay));
      } else {
        this.log(`⚠️ [ข้อ ${qNo}] ปุ่ม Submit ยังกดไม่ได้หลังกรอกคำตอบครบ`, 'warn');
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
    if (leftHere.length) {
      this.log(`📋 หน้านี้ยังค้าง ${leftHere.length} ข้อที่ไม่ได้ตอบ/ไม่ได้ส่ง (ไม่มีเฉลยที่ใช้ได้): ${leftHere.map(l => `ข้อ ${l.qNo} (${l.reason})`).join(', ')}`, 'warn');
    }
  }

  leftoverKey(p) {
    return `${this.page.url().split('#')[0]}|${p.pi}`;
  }

  // Question text per block: drop the block title and lines repeated in several blocks on the page
  // ("Directions: ...", "Part 1 : Choose ..."), which identify no single question.
  prepareQuestionTexts(problems) {
    const seen = new Map();
    problems.forEach(p => new Set([...p.lines, ...p.responses.flatMap(r => r.lines)])
      .forEach(t => seen.set(t, (seen.get(t) || 0) + 1)));
    const shared = new Set([...seen].filter(([, n]) => problems.length > 1 && n > 1).map(([t]) => t));
    const build = lines => {
      const own = lines.filter(t => !shared.has(t));
      return own.length > 1 ? [...own, own.join(' ')] : own;
    };
    problems.forEach(p => {
      p.texts = build(p.lines);
      p.responses.forEach(r => { r.texts = build(r.lines); });
    });
  }

  // Fills every answer slot of one problem block. Returns { filled, reason }.
  async answerProblem(quizFrame, p, { section, isPretest, problemCount, anyMultiSlot, qNo, firstResp }) {
    const qText = (p.texts[0] || p.header || '').replace(/\s+/g, ' ').slice(0, 90);
    const slotInfo = s => ({ kind: s.kind, choices: s.choices });

    if (isPretest) {
      const fills = p.slots.map(s => (s.choices && s.choices.length
        ? (s.kind === 'checkbox' ? { kind: s.kind, indices: [Math.floor(Math.random() * s.choices.length)] } : { kind: s.kind, index: Math.floor(Math.random() * s.choices.length) })
        : null));
      if (fills.some(f => !f)) {
        this.log(`📢 [Pre-test] ข้อ ${qNo}: เป็นช่องพิมพ์คำตอบ ไม่มีตัวเลือกให้สุ่ม — ข้าม`, 'warn');
        return { filled: false, reason: 'pre-test text input' };
      }
      const ok = await this.applyFills(quizFrame, p.slots, fills, qNo);
      if (ok) this.log(`🎲 [Pre-test] ข้อ ${qNo}: สุ่มเลือก "${fills.map((f, i) => p.slots[i].choices[f.index != null ? f.index : f.indices[0]]).join(' ; ')}"`);
      return { filled: ok, reason: ok ? '' : 'click failed' };
    }

    const base = { courseCode: this.courseCode, section };
    let decision = dbManager.decideProblem({
      ...base, texts: p.texts, slots: p.slots.map(slotInfo),
      index: anyMultiSlot ? p.pi : firstResp, problemIndex: p.pi, problemCount
    });
    this.log(`🔎 ข้อ ${qNo}: โจทย์ "${qText}"${p.slots.length > 1 ? ` (${p.slots.length} ช่อง)` : ''}`);

    let plan = null;
    if (decision.action === 'fill') {
      plan = [{ slots: p.slots, decision }];
    } else if (p.responses.length > 1) {
      // Several independent questions inside one block: each response is its own bank item.
      const perResp = p.responses.map((r, ri) => ({
        slots: r.slotIdx.map(i => p.slots[i]),
        decision: dbManager.decideProblem({ ...base, texts: r.texts, slots: r.slotIdx.map(i => slotInfo(p.slots[i])), index: firstResp + ri })
      }));
      if (perResp.every(x => x.decision.action === 'fill')) plan = perResp;
    }

    if (!plan) {
      this.logNoMatch(qNo, qText, decision, p.slots);
      return { filled: false, reason: decision.reason };
    }

    for (const { slots, decision: d } of plan) {
      if (d.match) {
        const m = d.match;
        this.log(`   ↳ จับคู่ฐาน: "${String(m.question).slice(0, 90)}" [${m.section} #${m.index + 1}, ${m.method}, ${Math.round((m.score || 0) * 100)}%, ${m.status}]`);
      }
      if (!(await this.applyFills(quizFrame, slots, d.fills, qNo))) {
        return { filled: false, reason: 'could not fill the inputs' };
      }
      const shown = d.fills.map(f => (f.kind === 'text' ? `พิมพ์ "${f.value}"` : `เลือก "${f.choiceText}"`)).join(' + ');
      const tag = d.inferred ? ' [inferred — คำตอบที่อนุมาน ยังไม่ยืนยัน]' : d.hint ? ', จากคำแนะนำ tsu_missing.json' : '';
      this.log(`🎯 ข้อ ${qNo}: ${shown} (เฉลย "${d.answer}"${tag})`);
    }
    return { filled: true, reason: '' };
  }

  // Returns true when every slot holds the intended answer.
  async applyFills(quizFrame, slots, fills, qNo) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i], f = fills[i];
      const sel = `[data-tsubot-slot="${s.id}"]`;
      if (s.kind === 'choice' || s.kind === 'checkbox') {
        const want = s.kind === 'checkbox' ? f.indices : [f.index];
        for (let ci = 0; ci < s.choices.length; ci++) {
          const input = await quizFrame.$(`${sel}[data-tsubot-c="${ci}"]`);
          if (!input) continue;
          const on = want.includes(ci);
          const checked = await input.isChecked().catch(() => false);
          if (on && !checked) await input.check({ force: true, timeout: 3000 }).catch(async () => { await input.click({ force: true }).catch(() => {}); });
          if (!on && checked && s.kind === 'checkbox') await input.uncheck({ force: true, timeout: 3000 }).catch(() => {});
          if (on && !(await input.isChecked().catch(() => false))) {
            this.log(`⚠️ ข้อ ${qNo}: คลิกตัวเลือก "${s.choices[ci]}" ไม่สำเร็จ`, 'warn');
            return false;
          }
        }
      } else if (s.kind === 'select') {
        const el = await quizFrame.$(sel);
        const value = s.values[f.index];
        if (!el) return false;
        await el.selectOption(value).catch(() => {});
        if ((await el.inputValue().catch(() => '')) !== value) {
          this.log(`⚠️ ข้อ ${qNo}: เลือก "${s.choices[f.index]}" ในช่อง ${i + 1} ไม่สำเร็จ`, 'warn');
          return false;
        }
      } else {
        const el = await quizFrame.$(sel);
        if (!el || !(await this.typeText(el, f.value))) {
          this.log(`⚠️ ข้อ ${qNo}: พิมพ์ "${f.value}" ลงช่อง ${i + 1} ไม่สำเร็จ (ค่าในช่องไม่ตรง)`, 'warn');
          return false;
        }
      }
    }
    return true;
  }

  // The grader compares characters exactly (apostrophe style included), so check what the box holds.
  async typeText(el, value) {
    await el.click().catch(() => {});
    await el.fill('').catch(() => {});
    await el.fill(value).catch(() => {});
    if ((await el.inputValue().catch(() => null)) !== value) {
      await el.fill('').catch(() => {});
      await el.pressSequentially(value, { delay: 20 }).catch(() => {});
    }
    await el.dispatchEvent('input').catch(() => {});
    await el.dispatchEvent('change').catch(() => {});
    await el.press('Tab').catch(() => {});
    return (await el.inputValue().catch(() => null)) === value;
  }

  logNoMatch(qNo, qText, decision, slots) {
    this.log(`📢 [no match] ข้อ ${qNo}: ${decision.reason} — "${qText}"`, 'warn');
    slots.forEach((s, i) => {
      if (s.choices && s.choices.length) this.log(`   ตัวเลือกบนหน้า${slots.length > 1 ? ` (ช่อง ${i + 1})` : ''}: ${s.choices.join(' | ')}`, 'warn');
    });
    const m = decision.match;
    if (m && m.correct_answer && (m.status === 'confirmed' || m.status === 'inferred')) {
      this.log(`   เฉลยในฐาน: "${m.correct_answer}" [${m.status}] (ไม่ตรงกับตัวเลือก/ช่องในข้อนี้)`, 'warn');
    }
    if (decision.hint && decision.hint.hint) this.log(`   💡 คำแนะนำ: ${decision.hint.hint}`, 'warn');
    if (decision.hint && decision.hint.wrong_answers.length) {
      this.log(`   🚫 ตัวเลือกที่เคยผิด (ห้ามกา): ${decision.hint.wrong_answers.join(' | ')}`, 'warn');
    }
    this.log(`   🛑 ข้ามข้อนี้ ไม่สุ่มตอบและไม่ส่ง เพื่อป้องกันการตอบผิด/เสียคะแนน`, 'warn');
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
    await this.workSequence();
  }

  // Works the units of the subsection that is open, stopping after its last unit.
  // Returns the outcome of each unit (processCurrentUnit's lastUnitOutcome) and the unit URLs.
  async workSequence() {
    const outcomes = [];
    const urls = new Set();
    for (let n = 0; n < 40 && !this.shouldStop; n++) {
      await this.processCurrentUnit();
      outcomes.push(this.lastUnitOutcome);
      urls.add(this.page.url().split('#')[0]);
      if (this.shouldStop) break;
      const pos = await this.page.evaluate(sequencePosition).catch(() => ({ known: false }));
      if (!pos.known || pos.isLast) break;
      if (!(await this.advanceNextUnit())) break;
    }
    return { outcomes, urls };
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
  // pass: unfinished quizzes from Progress, then (still below 100%) the Course tab sweep over every
  // outline item without a filled check. Then read Progress again and log the final result.
  async finalProgressCheck() {
    this.log(`📊 เรียนจบรอบแล้ว ตรวจหน้า Progress อีกครั้ง...`);
    let data = await this.openProgressPage();
    let s = data ? this.summarizeProgress(data, ' - หลังเรียนจบรอบ') : null;
    const below100 = d => !d || d.completion === null || d.completion < 100;
    const needs = below100(data) || s.zero.length > 0;
    if (needs && !this.shouldStop) {
      this.log(`🔁 ยังไม่ครบ 100% หรือยังมีแบบฝึก 0 คะแนน — ทำรอบเก็บตกอีก 1 รอบ (ตามโหมดที่เลือก)`);
      if (data) await this.workOpenQuizzes(data);
      let sweep = null;
      if (below100(data) && !this.shouldStop) sweep = await this.courseOutlineSweep(data);
      if (sweep && !sweep.readable && !this.shouldStop) await this.legacyCatchUp(data);
      if (this.shouldStop) return;
      data = await this.openProgressPage();
      if (!data) return;
      s = this.summarizeProgress(data, ' - หลังรอบเก็บตก');
      if (sweep && sweep.readable && !sweep.open.length && below100(data)) {
        this.log(`ℹ️ Course tab ติ๊กครบทุกรายการแล้ว แต่ Progress ยังแสดง ${data.completion === null ? '?' : data.completion + '%'} (อาจมีเนื้อหาที่ยังไม่เปิดให้เรียน หรือ Progress ยังไม่อัปเดต)`, 'warn');
      }
    }
    if (!data) return;
    const done = data.completion !== null && data.completion >= 100;
    const skippedModes = ['quiz', 'video', 'doc'].filter(m => !this.modes.has(m));
    if (!done && skippedModes.length) {
      const names = { quiz: 'แบบฝึก', video: 'วิดีโอ', doc: 'เอกสาร' };
      this.log(`ℹ️ ไม่ได้เลือกทำ ${skippedModes.map(m => names[m]).join('/')} จึงอาจยังไม่ถึง 100%`);
    }
    if (this.leftovers.size) {
      this.log(`📋 ข้อที่ยังไม่ได้ส่งเพราะไม่มีเฉลยที่ใช้ได้ ${this.leftovers.size} ข้อ:`, 'warn');
      this.leftovers.forEach(l => this.log(`   • ${l.section} ข้อ ${l.qNo}: "${String(l.text).slice(0, 80)}" — ${l.reason}`, 'warn'));
    } else if (this.modes.has('quiz')) {
      this.log(`✅ ไม่มีข้อที่ค้างไม่ได้ส่งในแบบฝึกที่เปิดไป`);
    }
    this.log(`🏁 สรุป: ความคืบหน้า ${data.completion === null ? '?' : data.completion + '%'} | แบบฝึก 0 คะแนนเหลือ ${s.zero.length} รายการ${s.zero.length ? ` (${s.zero.map(r => r.name).join(', ')})` : ''} | ${done ? 'ครบ 100% แล้ว 🎉' : 'ยังไม่ครบ 100%'}`);
  }

  // Used only when the Course tab outline cannot be read: revisit units left without a check, and
  // walk the whole course once if the run started mid-course.
  async legacyCatchUp(data) {
    const incompleteUnits = [...this.leftIncomplete];
    this.leftIncomplete.clear();
    for (const url of incompleteUnits) {
      if (this.shouldStop) return;
      this.log(`🔁 กลับไปทำหน่วยที่ยังไม่ขึ้นติ๊กถูก: ${url}`);
      await this.page.goto(url, { timeout: 60000 }).catch(() => {});
      await this.sleep(1500);
      await this.processCurrentUnit();
    }
    const contentSelected = this.modes.has('video') || this.modes.has('doc');
    if (data && data.completion !== null && data.completion < 100 && contentSelected && this.mainPassAtCourseStart === false && !this.shouldStop) {
      this.log(`🔁 รอบแรกเริ่มกลางรายวิชา (Resume) — เดินทุกหน่วยตั้งแต่หน่วยแรกอีก 1 รอบ (หน่วยที่ทำแล้วจะข้ามทันที)`);
      await this.walkFromFirstUnit();
    }
  }

  // Opens the Course tab (course home), expands every section ("Expand all" + any collapsed card),
  // scrolls to the bottom so every subsection renders, and returns parseCourseOutline() or null.
  async openCourseOutline() {
    const courseId = this.courseId || this.courseIdFromUrl(this.page.url()) || this.courseIdFromUrl(this.targetUrl);
    if (!courseId) return null;
    this.courseId = courseId;
    const isHome = u => /\/course\/[^/]+\/home(?:[/?#]|$)/.test(String(u));
    if (!isHome(this.page.url())) {
      let clicked = false;
      for (const sel of ['nav a[href$="/home"]', '.course-tabs-navigation a:has-text("Course")', 'nav a:has-text("Course")',
        'nav a:has-text("หน้าหลัก")', 'nav a:has-text("รายวิชา")', 'a[role="tab"]:has-text("Course")']) {
        const tab = await this.page.$(sel).catch(() => null);
        if (tab && await tab.isVisible().catch(() => false)) {
          await tab.click().catch(() => {});
          clicked = await this.page.waitForURL(isHome, { timeout: 8000 }).then(() => true).catch(() => false);
          if (clicked) break;
        }
      }
      if (!clicked) {
        let origin = 'https://apps.course.tsu.ac.th';
        try { origin = new URL(/^https?:/.test(this.page.url()) ? this.page.url() : this.targetUrl).origin; } catch (e) {}
        await this.page.goto(`${origin}/learning/course/${courseId}/home`, { timeout: 60000 }).catch(e => this.log(`Nav warning: ${e.message}`, 'warn'));
      }
    }
    let data = null;
    for (let i = 0; i < 15 && !this.shouldStop; i++) {
      await this.sleep(1000);
      data = await this.page.evaluate(parseCourseOutline).catch(() => null);
      if (data && data.items.length) break;
    }
    if (!data || !data.items.length) return null;

    for (const sel of ['button:has-text("Expand all")', 'button:has-text("ขยายทั้งหมด")', 'button:has-text("แสดงทั้งหมด")']) {
      const b = await this.page.$(sel).catch(() => null);
      if (b && await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {});
        await this.sleep(1000);
        break;
      }
    }
    // Sections still collapsed (or nested ones that appeared after expanding).
    for (let round = 0; round < 3 && !this.shouldStop; round++) {
      const n = await this.page.evaluate(() => {
        const roots = document.querySelectorAll('#courseHome-outline, .course-outline, ol.outline-sections, [class*="course-outline"]');
        const closed = Array.from(roots).flatMap(r => Array.from(r.querySelectorAll('[aria-expanded="false"]')));
        const outer = closed.filter(el => !closed.some(o => o !== el && o.contains(el)));
        outer.forEach(el => el.click());
        return outer.length;
      }).catch(() => 0);
      if (!n) break;
      await this.sleep(800);
    }
    await this.page.evaluate(async () => {
      const el = document.scrollingElement || document.documentElement;
      for (let y = 0; y < el.scrollHeight; y += Math.max(300, innerHeight * 0.8)) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, el.scrollHeight);
    }).catch(() => {});
    await this.sleep(800);
    return await this.page.evaluate(parseCourseOutline).catch(() => data);
  }

  // Mode an outline item belongs to, when its type is clear before opening it: graded subsections on
  // the Progress page and TSU's "Quiz :" / "Pre Test" / "Sheet :" naming. '' = unknown (open it).
  outlineItemKind(item, progressData) {
    const seqId = h => (String(h || '').match(/type@sequential\+block@([^/?#&]+)/) || [])[1] || '';
    const rows = (progressData && progressData.rows) || [];
    if (rows.some(r => (seqId(r.href) && seqId(r.href) === seqId(item.href)) || r.name === item.name)) return 'quiz';
    if (/^(?:quiz|exercise|pre[\s-]?test|post[\s-]?test|แบบทดสอบ|แบบฝึก)/i.test(item.name)) return 'quiz';
    if (/^(?:sheet|document|เอกสาร|ชีท)/i.test(item.name)) return 'doc';
    return '';
  }

  // Course tab sweep: open every outline item that does not show the filled check, work it with the
  // normal unit logic (quiz: only unsubmitted problems; video; sheet/doc), go back to the Course tab
  // and re-check, up to outlineMaxPasses passes. Items that cannot be finished are logged with why.
  // Returns { readable, open } (open = items still unchecked at the end).
  async courseOutlineSweep(progressData) {
    const NAMES = { quiz: 'แบบฝึก', video: 'วิดีโอ', doc: 'เอกสาร' };
    const label = i => `${i.section ? i.section + ' › ' : ''}${i.name}`;
    const keyOf = i => i.href.split('#')[0];
    const givenUp = new Map();
    const tries = new Map();
    const notes = new Map();
    const maxPasses = this.outlineMaxPasses;
    let outline = null;
    let open = [];
    this.setStatus('running', 'Checking Course outline');
    this.log(`📚 เปิดแท็บ Course เพื่อตรวจทุกรายการในโครงสร้างรายวิชา (ติ๊กทึบ = เสร็จ, วงกลมเทาโปร่ง = ยังไม่เสร็จ)...`);

    for (let pass = 1; !this.shouldStop; pass++) {
      outline = await this.openCourseOutline();
      if (!outline) {
        this.log(`⚠️ อ่านโครงสร้างรายวิชาในแท็บ Course ไม่ได้ (ไม่พบรายการบทเรียน) — ใช้วิธีเดิมแทน`, 'warn');
        return { readable: false, open: [] };
      }
      open = outline.items.filter(i => i.done !== true);
      const unknown = open.filter(i => i.done === null);
      this.log(`📚 [Course tab ตรวจครั้งที่ ${pass}] ทั้งหมด ${outline.items.length} รายการ | ติ๊กแล้ว ${outline.items.length - open.length} | ยังไม่ติ๊ก ${open.length}${unknown.length ? ` (อ่านไอคอนไม่ได้ ${unknown.length})` : ''}`);
      this.onOutline({ pass, total: outline.items.length, open: open.map(i => ({ section: i.section, name: i.name, href: i.href, state: i.done === null ? 'unknown' : 'incomplete' })) });
      if (!open.length) {
        this.log(`✅ ทุกรายการในแท็บ Course ขึ้นติ๊กครบแล้ว`);
        return { readable: true, open };
      }
      const todo = open.filter(i => !givenUp.has(keyOf(i)));
      if (!todo.length || pass > maxPasses) break;
      todo.forEach(i => this.log(`   ○ ${label(i)}${i.done === null ? ' (อ่านไอคอนไม่ได้ — เปิดตรวจ)' : ''}`));

      for (const item of todo) {
        if (this.shouldStop) break;
        const key = keyOf(item);
        const kind = this.outlineItemKind(item, progressData);
        if (kind && !this.modes.has(kind)) {
          givenUp.set(key, `ไม่ได้เลือกให้ทำ${NAMES[kind]}`);
          this.log(`⏭️ [ข้ามตามที่เลือก] ${label(item)} — เป็น${NAMES[kind]} แต่ไม่ได้เลือกให้ทำ${NAMES[kind]}`);
          continue;
        }
        tries.set(key, (tries.get(key) || 0) + 1);
        this.log(`🎯 [Course tab] เปิดทำ: ${label(item)} (ครั้งที่ ${tries.get(key)})`);
        const res = await this.workOutlineItem(item);
        if (this.shouldStop) break;
        const worked = res.outcomes.filter(o => o && !o.startsWith('skip:') && o !== 'complete');
        const skipped = [...new Set(res.outcomes.filter(o => o && o.startsWith('skip:')).map(o => NAMES[o.slice(5)]))];
        const stuckQs = [...this.leftovers.values()].filter(l => res.urls.has(String(l.url).split('#')[0]));
        if (stuckQs.length) {
          givenUp.set(key, `แบบฝึกมี ${stuckQs.length} ข้อที่ไม่มีเฉลยที่ใช้ได้ (ไม่สุ่มตอบ/ไม่ส่ง)`);
        } else if (!worked.length && skipped.length) {
          givenUp.set(key, `ไม่ได้เลือกให้ทำ${skipped.join('/')}`);
        } else if (!worked.length && res.outcomes.length) {
          givenUp.set(key, `ทุกหน่วยในนี้ขึ้นติ๊กแล้ว แต่ Course tab ยังไม่ติ๊ก (อาจมีหน่วยที่ยังไม่เปิดให้เรียน/ซ่อนอยู่)`);
        } else if (!res.outcomes.length) {
          notes.set(key, 'เปิดแล้วไม่พบหน่วยเรียน');
        } else {
          notes.set(key, `ทำแล้ว (${[...new Set(worked)].map(o => NAMES[o]).join('/')}) แต่ยังไม่ขึ้นติ๊ก`);
        }
      }
    }

    if (open.length) {
      this.log(`⚠️ Course tab ยังมี ${open.length} รายการที่ไม่ขึ้นติ๊ก:`, 'warn');
      open.forEach(i => {
        const key = keyOf(i);
        const why = givenUp.get(key) || (tries.get(key)
          ? `${notes.get(key) || 'ยังไม่ขึ้นติ๊ก'} — เปิดทำแล้ว ${tries.get(key)} ครั้ง (ครบจำนวนรอบสูงสุด ${maxPasses} รอบ)`
          : 'ยังไม่ได้เปิดทำ');
        this.log(`   • ${label(i)} — ${why}${i.done === null ? ` [อ่านสถานะไอคอนไม่ได้: ${i.how}]` : ''}`, 'warn');
      });
    }
    return { readable: true, open };
  }

  // Opens one outline subsection (its link on the Course tab; direct URL as fallback) and works it.
  async workOutlineItem(item) {
    let link = item.hrefAttr ? await this.page.$(`a[href="${item.hrefAttr.replace(/["\\]/g, '\\$&')}"]`).catch(() => null) : null;
    if (link && await link.isVisible().catch(() => false)) {
      await link.scrollIntoViewIfNeeded().catch(() => {});
      await link.click().catch(() => {});
      await this.page.waitForURL(u => !/\/home(?:[/?#]|$)/.test(String(u)), { timeout: 15000 }).catch(() => {});
    } else {
      await this.page.goto(item.href, { timeout: 60000 }).catch(e => this.log(`Nav warning: ${e.message}`, 'warn'));
    }
    await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await this.sleep(1500);
    const res = await this.workSequence();
    // Let completion events (video 95%, viewed HTML) reach the server before re-reading the outline.
    await this.sleep(1500);
    return res;
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
module.exports.parseCourseOutline = parseCourseOutline;
