// Primary flow of AutomationWorker.start(): the Course tab outline (Expand all, filled vs hollow check)
// decides what to work on. Unchecked items are opened (respecting the mode picker, never resubmitting),
// the Course tab is re-checked in bounded passes, and Progress is opened only at the end to confirm 100%.
// Fixture: test/fixtures/course (outline modeled on frontend-app-learning, not the live TSU site).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const playwright = require('playwright');
const AutomationWorker = require('../worker');
const { startCourseServer } = require('./fixtures/course/server');

const realLaunch = playwright.chromium.launchPersistentContext.bind(playwright.chromium);
const launchOpts = { headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) };
playwright.chromium.launchPersistentContext = (dir, opts) => realLaunch(fs.mkdtempSync(path.join(os.tmpdir(), 'tsubot-profile-')), {
  ...opts, ...launchOpts, viewport: { width: 1280, height: 800 }
});

const U1 = 'Unit 1 : Entertainment';
const U2 = 'Unit 2 : Sport and health';

// The run is started on the last unit; the bot must still go to the Course tab first. Every unfinished
// item sits in a section that starts collapsed (only the first is open).
const resumed = {
  courseCode: 'TSUGE00152',
  courseName: 'ภาษาอังกฤษเพื่อการสื่อสาร 2',
  outline: ['Introduction', U1, U2],
  sequences: [
    { id: 'intro', title: 'Course introduction', chapter: 'Introduction' },
    { id: 'vocab', title: 'Movies Vocabulary', chapter: U1 },
    { id: 'sheet', title: 'Sheet : Movies Vocabulary', chapter: U1 },
    { id: 'q11', title: 'Quiz : Unit 1 : Chapter 1', chapter: U1 },
    { id: 'prac', title: 'Practice : Unit 1 : Chapter 1', chapter: U1, graded: false },
    { id: 'pv1', title: 'Passive Voice (Present Simple and Past Simple) # 1', chapter: U1 },
    { id: 'sheet2', title: 'Sheet : Sport', chapter: U2 },
    { id: 'q21', title: 'Quiz : Unit 2 : Chapter 1', chapter: U2 }
  ],
  units: [
    { id: 'introDoc', seq: 'intro', type: 'doc', section: 'Introduction', title: 'Course introduction', complete: true },
    { id: 'vocabVideo', seq: 'vocab', type: 'video', section: U1, title: 'Movies Vocabulary' },
    { id: 'sheetDoc', seq: 'sheet', type: 'doc', section: U1, title: 'Sheet : Movies Vocabulary' },
    { id: 'q11quiz', seq: 'q11', type: 'quiz', section: U1, title: 'Quiz : Unit 1 : Chapter 1', problems: [
      { id: 'a1', stem: 'A second film made to continue the story started in the first', choices: ['animated', 'star', 'sequel', 'stuntman'], answer: 2 },
      { id: 'a2', stem: 'A performer hired to play a minor part, as in a crowd scene', choices: ['scene', 'star', 'extra'], answer: 2, preGraded: true }
    ] },
    // Ungraded: not listed on Progress, only the Course tab shows it unchecked. a2b was answered wrong
    // with attempts left and must not be resubmitted; a3 is open.
    { id: 'pracQuiz', seq: 'prac', type: 'quiz', section: U1, title: 'Practice : Unit 1 : Chapter 1', problems: [
      { id: 'a2b', stem: 'A performer hired to play a minor part, as in a crowd scene', choices: ['scene', 'star', 'extra'], answer: 2, preGraded: 'incorrect', maxAttempts: 3 },
      { id: 'a3', stem: 'Frozen is one of the most popular ________ of all time', choices: ['horror', 'animations', 'musical'], answer: 1 }
    ] },
    // Two units; the second video only records completion on its second viewing.
    { id: 'pv1doc', seq: 'pv1', type: 'doc', section: U1, title: 'Passive Voice notes' },
    { id: 'pv1video', seq: 'pv1', type: 'video', section: U1, title: 'Passive Voice video', completeAfter: 2 },
    { id: 'sheet2Doc', seq: 'sheet2', type: 'doc', section: U2, title: 'Sheet : Sport', complete: true },
    { id: 'q21quiz', seq: 'q21', type: 'quiz', section: U2, title: 'Quiz : Unit 2 : Chapter 1', complete: true, problems: [
      { id: 'b1', stem: 'The most important/famous actor or actress in a film', choices: ['extra', 'star'], answer: 1, preGraded: true }
    ] }
  ]
};

// Video mode off, and a sheet that never records completion: both must be reported, not looped on.
const blocked = {
  courseCode: 'TSUGE00152',
  courseName: 'ภาษาอังกฤษเพื่อการสื่อสาร 2',
  outline: ['Introduction', U1],
  sequences: [
    { id: 'intro', title: 'Course introduction', chapter: 'Introduction' },
    { id: 'vocab', title: 'Movies Vocabulary', chapter: U1 },
    { id: 'sheet', title: 'Sheet : Movies Vocabulary', chapter: U1 },
    { id: 'broken', title: 'Sheet : Broken viewer', chapter: U1 },
    { id: 'last', title: 'Quiz : Unit 1 : Chapter 1', chapter: U1 }
  ],
  units: [
    { id: 'introDoc', seq: 'intro', type: 'doc', section: 'Introduction', title: 'Course introduction', complete: true },
    { id: 'vocabVideo', seq: 'vocab', type: 'video', section: U1, title: 'Movies Vocabulary' },
    { id: 'sheetDoc', seq: 'sheet', type: 'doc', section: U1, title: 'Sheet : Movies Vocabulary' },
    { id: 'brokenDoc', seq: 'broken', type: 'doc', section: U1, title: 'Sheet : Broken viewer', neverComplete: true },
    { id: 'lastQuiz', seq: 'last', type: 'quiz', section: U1, title: 'Quiz : Unit 1 : Chapter 1', complete: true, problems: [
      { id: 'c1', stem: 'A second film made to continue the story started in the first', choices: ['animated', 'star', 'sequel', 'stuntman'], answer: 2, preGraded: true }
    ] }
  ]
};

async function run(spec, modes, startUnit) {
  const srv = await startCourseServer(spec);
  const logs = [];
  const progress = [];
  const outline = [];
  const worker = new AutomationWorker('O', {
    courseCode: spec.courseCode, targetUrl: srv.unitUrl(startUnit), speedMode: 'turbo', modes,
    onProgress: s => progress.push(s), onOutline: s => outline.push(s)
  }, (id, msg) => logs.push(msg));
  await Promise.race([worker.start(), new Promise((_, rej) => setTimeout(() => rej(new Error('worker timeout')), 300000).unref())]);
  const out = { srv, logs, progress, outline, status: worker.status, final: srv.progressData() };
  if (worker.browserContext) await worker.browserContext.close().catch(() => {});
  await srv.close();
  if (process.env.READINESS_LOG_DIR) {
    fs.mkdirSync(process.env.READINESS_LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.READINESS_LOG_DIR, `outline-${modes.replace(/,/g, '+')}.log`),
      `${logs.join('\n')}\n\nEVENTS\n${srv.state.events.map(e => JSON.stringify(e)).join('\n')}\n`);
  }
  return out;
}

const failMsg = r => `\n--- worker log ---\n${r.logs.join('\n')}`;
const firstIdx = (r, pred) => r.srv.state.events.findIndex(pred);
const afterFirstOutline = r => {
  const i = r.srv.state.events.findIndex(e => e.type === 'outline-view');
  return i < 0 ? [] : r.srv.state.events.slice(i);
};
const seqOpens = (r, seq) => afterFirstOutline(r).filter(e => e.type === 'sequence-open' && e.seq === seq).length;

let ok, stuck;
before(async () => {
  [ok, stuck] = await Promise.all([
    run(resumed, 'quiz,video,doc', 'q21quiz'),
    run(blocked, 'quiz,doc', 'lastQuiz')
  ]);
});
after(() => { playwright.chromium.launchPersistentContext = realLaunch; });

test('Course tab first: opens every unchecked item, Progress only at the end, reaches 100%', () => {
  const r = ok;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  assert.deepStrictEqual(Object.entries(r.srv.state.complete).filter(([, v]) => !v).map(([k]) => k), [], failMsg(r));
  assert.strictEqual(r.final.completion, 100, failMsg(r));
  assert.deepStrictEqual(r.progress.map(p => p.phase), ['ตรวจยืนยันตอนจบ'], failMsg(r));
  assert.strictEqual(r.progress[0].completion, 100, failMsg(r));
  assert.ok(r.logs[r.logs.length - 1].includes('ครบ 100% แล้ว'), failMsg(r));
  assert.ok(r.logs[r.logs.length - 1].includes('Course tab ยังไม่ติ๊ก 0 รายการ'), failMsg(r));

  const firstOutline = firstIdx(r, e => e.type === 'outline-view');
  const firstProgress = firstIdx(r, e => e.type === 'progress-view');
  const lastOutlineLink = r.srv.state.events.map((e, i) => e.type === 'outline-link' ? i : -1).filter(i => i >= 0).pop();
  assert.ok(firstOutline >= 0 && firstOutline < firstProgress, `Course tab was not opened before Progress${failMsg(r)}`);
  assert.ok(lastOutlineLink < firstProgress, `Progress opened before the outline sweep finished${failMsg(r)}`);
  assert.strictEqual(r.srv.state.events.filter(e => e.type === 'progress-link').length, 0, failMsg(r));

  // First pass: every hollow item, including the graded quiz Progress used to pick up first.
  const first = r.outline[0];
  assert.deepStrictEqual(first.open.map(o => o.name), ['Movies Vocabulary', 'Sheet : Movies Vocabulary',
    'Quiz : Unit 1 : Chapter 1', 'Practice : Unit 1 : Chapter 1',
    'Passive Voice (Present Simple and Past Simple) # 1'], failMsg(r));
  assert.ok(first.open.every(o => o.section === U1 && o.state === 'incomplete'), failMsg(r));
  assert.strictEqual(first.total, 8, `all 8 subsections read after Expand all${failMsg(r)}`);
  ['intro', 'sheet2', 'q21'].forEach(s => assert.strictEqual(seqOpens(r, s), 0, `${s} is checked and must not be reopened${failMsg(r)}`));
  assert.strictEqual(seqOpens(r, 'q11'), 1, failMsg(r));
  assert.ok(r.logs.some(l => l.includes('[ข้ามทันที]') && l.includes('ขึ้นติ๊กถูกแล้ว') && l.includes('Course introduction')
    && l.includes('Sheet : Sport') && l.includes('Quiz : Unit 2 : Chapter 1')), failMsg(r));
  assert.ok(r.outline[0].checked && r.outline[0].checked.map(c => c.name).includes('Quiz : Unit 2 : Chapter 1'), failMsg(r));

  // The video that needs a second viewing is retried on pass 2, then pass 3 finds everything checked.
  assert.deepStrictEqual(r.outline.map(o => o.open.length), [5, 1, 0], failMsg(r));
  assert.strictEqual(seqOpens(r, 'pv1'), 2, failMsg(r));
  assert.strictEqual(seqOpens(r, 'vocab'), 1, failMsg(r));
  assert.ok(r.srv.state.events.some(e => e.type === 'complete-ignored' && e.unit === 'pv1video'), failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ทุกรายการในแท็บ Course ขึ้นติ๊กครบแล้ว')), failMsg(r));
});

test('quiz items from the outline: only unsubmitted problems, never resubmits', () => {
  const r = ok;
  const subs = r.srv.state.events.filter(e => e.type === 'submit').map(e => [e.problem, e.correct]);
  assert.deepStrictEqual(subs, [['a1', true], ['a3', true]], failMsg(r));
});

test('mode off and unfinishable items: bounded passes, each left item logged with its reason', () => {
  const r = stuck;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  assert.ok(r.srv.state.complete.sheetDoc, failMsg(r));
  assert.ok(!r.srv.state.events.some(e => e.type === 'video-play'), `video mode is off${failMsg(r)}`);
  assert.strictEqual(seqOpens(r, 'vocab'), 1, `skipped-by-mode item is not reopened${failMsg(r)}`);
  assert.strictEqual(seqOpens(r, 'broken'), 3, `unfinishable sheet retried once per pass (3)${failMsg(r)}`);
  assert.strictEqual(r.outline.length, 4, `3 work passes + 1 final check${failMsg(r)}`);
  assert.deepStrictEqual(r.outline[3].open.map(o => o.name), ['Movies Vocabulary', 'Sheet : Broken viewer'], failMsg(r));

  const head = r.logs.findIndex(l => l.includes('Course tab ยังมี 2 รายการที่ไม่ขึ้นติ๊ก'));
  assert.ok(head > 0, failMsg(r));
  assert.ok(r.logs[head + 1].includes('Movies Vocabulary') && r.logs[head + 1].includes('ไม่ได้เลือกให้ทำวิดีโอ'), failMsg(r));
  assert.ok(r.logs[head + 2].includes('Sheet : Broken viewer') && r.logs[head + 2].includes('เปิดทำแล้ว 3 ครั้ง'), failMsg(r));
  assert.ok(r.logs[r.logs.length - 1].includes('ยังไม่ครบ 100%'), failMsg(r));
  assert.ok(r.logs[r.logs.length - 1].includes('Course tab ยังไม่ติ๊ก 2 รายการ'), failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ไม่ได้เลือกทำ วิดีโอ')), failMsg(r));
  assert.deepStrictEqual(r.progress.map(p => p.phase), ['ตรวจยืนยันตอนจบ'], failMsg(r));
  const firstOutline = firstIdx(r, e => e.type === 'outline-view');
  const firstProgress = firstIdx(r, e => e.type === 'progress-view');
  assert.ok(firstOutline >= 0 && firstOutline < firstProgress, failMsg(r));
});

test('outline parser: filled vs hollow check across icon markups', async () => {
  const browser = await playwright.chromium.launch(launchOpts);
  const page = await browser.newPage();
  const seq = n => `/learning/course/course-v1:X+Y+Z/block-v1:X+Y+Z+type@sequential+block@${n}`;
  await page.setContent(`<ol id="courseHome-outline">
    <li><div class="collapsible-title">Unit 1 : Entertainment<span class="sr-only">, Incomplete section</span></div><ol>
      <li><svg data-prefix="far" data-icon="check-circle"></svg><a href="${seq('far')}">FontAwesome hollow</a></li>
      <li><svg data-prefix="fas" data-icon="check-circle"></svg><a href="${seq('fas')}">FontAwesome filled</a></li>
      <li><span class="pgn__icon" style="color:#adadad"><svg></svg></span><a href="${seq('grey')}">Paragon grey</a></li>
      <li><span class="pgn__icon" style="color:#15376d"><svg></svg></span><a href="${seq('navy')}">Paragon navy</a></li>
      <li><svg><title>Incomplete</title></svg><a href="${seq('t')}">Titled</a><span class="sr-only">, Incomplete</span></li>
      <li><a href="${seq('none')}">No icon</a></li>
    </ol></li></ol>`);
  const out = await page.evaluate(AutomationWorker.parseCourseOutline);
  await browser.close();
  assert.deepStrictEqual(out.items.map(i => [i.name, i.section, i.done]), [
    ['FontAwesome hollow', U1, false], ['FontAwesome filled', U1, true],
    ['Paragon grey', U1, false], ['Paragon navy', U1, true], ['Titled', U1, false], ['No icon', U1, null]
  ]);
});
