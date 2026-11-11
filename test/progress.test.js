// Fallback path of AutomationWorker.start() when the Course tab outline cannot be read (spec.noCourseOutline):
// read Progress first, go straight into every quiz that is 0/N or still has unsubmitted problems (never
// resubmitting answered ones), then re-check Progress at the end with one bounded extra pass.
// Fixture: test/fixtures/course (not the live TSU site), laid out like the TSU progress tab.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const playwright = require('playwright');
const AutomationWorker = require('../worker');
const { startCourseServer } = require('./fixtures/course/server');

const CH1 = 'บทที่ 1 อัตลักษณ์มหาวิทยาลัยทักษิณ';
const CH2 = 'บทที่ 2 ความเป็นพลเมือง พลเมืองโลก และพลเมืองดิจิทัล';
const CH3 = 'บทที่ 3 ทักษะการเรียนรู้ในศตวรรษที่ 21';
const QUIZ = 'แบบทดสอบหลังบทเรียน';

// Live TSUGE000111: every chapter quiz is titled the same. บทที่ 3 is already 10/10;
// บทที่ 1 starts on an intro sheet; Post-Test begins with instructional text.
const atlakDup = {
  courseCode: 'TSUGE000111',
  courseName: 'อัตลักษณ์ทักษิณและความเป็นพลเมือง',
  submitLabel: 'ส่งคำตอบ',
  noCourseOutline: true,
  outline: ['บทนำ', CH1, CH2, CH3, 'Post Test'],
  sequences: [
    { id: 'pre', title: 'แบบทดสอบความรู้เบื้องต้นก่อนเริ่มเรียน (Pre-Test)', chapter: 'บทนำ แนะนำรายวิชา' },
    { id: 'q1', title: QUIZ, chapter: CH1 },
    { id: 'q2', title: QUIZ, chapter: CH2 },
    { id: 'q3', title: QUIZ, chapter: CH3 },
    { id: 'post', title: 'แบบทดสอบความรู้หลังเรียน (Post-Test)', chapter: 'Post Test' }
  ],
  units: [
    { id: 'preQuiz', seq: 'pre', type: 'quiz', section: 'บทนำ แนะนำรายวิชา', title: 'แบบทดสอบความรู้เบื้องต้นก่อนเริ่มเรียน (Pre-Test)', pretest: true, problems: [
      { id: 'pt1', stem: 'สีประจำมหาวิทยาลัยทักษิณคือสีอะไร', choices: ['ฟ้า-ขาว', 'แดง-เหลือง', 'เทา–ฟ้า'], answer: 2 }
    ] },
    { id: 'q1intro', seq: 'q1', type: 'doc', section: CH1, title: 'คำชี้แจง' },
    { id: 'q1quiz', seq: 'q1', type: 'quiz', section: CH1, title: QUIZ, problems: [
      { id: 'q1a', stem: 'เดิมมหาวิทยาลัยทักษิณมีชื่อว่าอะไร', choices: ['วิทยาลัยวิชาการศึกษาสงขลา', 'มหาวิทยาลัยศรีนครินทรวิโรฒ วิทยาเขตภาคใต้', 'ถูกทุกข้อ'], answer: 2 }
    ] },
    { id: 'q2quiz', seq: 'q2', type: 'quiz', section: CH2, title: QUIZ, problems: [
      { id: 'q2a', stem: 'ข้อใดคือความเคารพและดูแลรักษาสาธารณสมบัติ', choices: ['ไม่ทำความเสียหายต่อสถานที่ราชการ โบราณสถาน', 'อื่น ๆ'], answer: 0 }
    ] },
    { id: 'q3quiz', seq: 'q3', type: 'quiz', section: CH3, title: QUIZ, complete: true, problems: [
      { id: 'q3a', stem: 'ข้อใดคือ Design Thinking สำหรับการสร้างอัตลักษณ์ให้กับองค์กร', choices: ['ถูกทุกข้อ', 'อื่น ๆ'], answer: 0, preGraded: true }
    ] },
    { id: 'postQuiz', seq: 'post', type: 'quiz', section: 'Post Test', title: 'แบบทดสอบความรู้หลังเรียน (Post-Test)', problems: [
      { id: 'poIntro', instructional: true, title: 'คำชี้แจง', stem: 'แบบทดสอบหลังเรียนเป็นแบบปรนัย มีจำนวน 40 ข้อ' },
      { id: 'po1', stem: 'ข้อใดคือความเคารพและดูแลรักษาสาธารณสมบัติ', choices: ['ไม่ทำความเสียหายต่อสถานที่ราชการ โบราณสถาน', 'อื่น ๆ'], answer: 0, preGraded: 'incorrect', maxAttempts: 1 },
      { id: 'po2', stem: 'เดิมมหาวิทยาลัยทักษิณมีชื่อว่าอะไร', choices: ['วิทยาลัยวิชาการศึกษาสงขลา', 'มหาวิทยาลัยศรีนครินทรวิโรฒ วิทยาเขตภาคใต้', 'ถูกทุกข้อ'], answer: 2 }
    ] }
  ]
};

const CH4 = 'บทที่ 4 ทักษะการสื่อสาร';
const part3Fallback = {
  courseCode: 'TSUGE000111',
  courseName: 'อัตลักษณ์ทักษิณและความเป็นพลเมือง',
  submitLabel: 'ส่งคำตอบ',
  noCourseOutline: true,
  outline: [CH4],
  sequences: [
    { id: 'part3', title: 'part 3', chapter: CH4, graded: false }
  ],
  units: [
    { id: 'v3done', seq: 'part3', type: 'video', section: CH4, title: 'video (3/10)', complete: true },
    { id: 'v4open', seq: 'part3', type: 'video', section: CH4, title: 'video (4/10)' },
    { id: 'qpart', seq: 'part3', type: 'quiz', section: CH4, title: 'แบบทดสอบหลังบทเรียน', problems: [
      { id: 'qp1', stem: 'ต้นไม้และดอกไม้ประจำมหาวิทยาลัยทักษิณคือต้นอะไร', choices: ['ต้นราชพฤกษ์', 'ต้นทองหลาง', 'ต้นสัก'], answer: 1 }
    ] }
  ]
};

const realLaunch = playwright.chromium.launchPersistentContext.bind(playwright.chromium);
playwright.chromium.launchPersistentContext = (dir, opts) => realLaunch(fs.mkdtempSync(path.join(os.tmpdir(), 'tsubot-profile-')), {
  ...opts,
  headless: true,
  viewport: { width: 1280, height: 800 },
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
});

const course = ({ withUnanswerable }) => ({
  courseCode: 'TSUGE00152',
  courseName: 'ภาษาอังกฤษเพื่อการสื่อสาร 2',
  noCourseOutline: true,
  outline: ['Introduction', 'Unit 1 : Entertainment', 'Unit 2 : Sport and health', 'Unit 5 : Food'],
  sequences: [
    { id: 'pre', title: 'Pre Test', chapter: 'Introduction' },
    { id: 'q11', title: 'Quiz : Unit 1 : Chapter 1', chapter: 'Unit 1 : Entertainment' },
    { id: 'l12', title: 'Lesson : Unit 1 : Chapter 2', chapter: 'Unit 1 : Entertainment' },
    { id: 'q13', title: 'Quiz : Unit 1 : Chapter 3', chapter: 'Unit 1 : Entertainment' },
    { id: 'q14', title: 'Quiz : Unit 1 : Chapter 4', chapter: 'Unit 1 : Entertainment' },
    { id: 'q15', title: 'Quiz : Unit 1 : Chapter 5', chapter: 'Unit 1 : Entertainment' },
    { id: 'q21', title: 'Quiz : Unit 2 : Chapter 1', chapter: 'Unit 2 : Sport and health' },
    { id: 'q55', title: 'Quiz : Unit 5 : Chapter 5', chapter: 'Unit 5 : Food' }
  ],
  units: [
    { id: 'preQuiz', seq: 'pre', type: 'quiz', section: 'Introduction', title: 'Pre Test', pretest: true, problems: [
      { id: 'pt1', stem: 'Which word means a film that continues an earlier story?', choices: ['sequel', 'prequel', 'trailer'], answer: 0 },
      { id: 'pt2', stem: 'Choose the best word: The actor did his own ____.', choices: ['stunts', 'scripts'], answer: 0 }
    ] },
    { id: 'q11quiz', seq: 'q11', type: 'quiz', section: 'Unit 1 : Entertainment', title: 'Quiz : Unit 1 : Chapter 1', problems: [
      { id: 'a1', stem: 'A second film made to continue the story started in the first', choices: ['animated', 'star', 'sequel', 'stuntman'], answer: 2 },
      { id: 'a2', stem: 'A performer hired to play a minor part, as in a crowd scene', choices: ['scene', 'star', 'extra'], answer: 2 },
      { id: 'a3', stem: 'Frozen is one of the most popular ________ of all time', choices: ['horror', 'animations', 'musical'], answer: 1 }
    ] },
    { id: 'l12video', seq: 'l12', type: 'video', section: 'Unit 1 : Entertainment', title: 'Unit 1 Chapter 2: Video' },
    { id: 'l12doc', seq: 'l12', type: 'doc', section: 'Unit 1 : Entertainment', title: 'Unit 1 Chapter 2: Reading sheet' },
    // Every problem already submitted (one wrong, out of attempts): partial score, nothing to redo.
    { id: 'q13quiz', seq: 'q13', type: 'quiz', section: 'Unit 1 : Entertainment', title: 'Quiz : Unit 1 : Chapter 3', complete: true, problems: [
      { id: 'c1', stem: 'A cartoon-like film using drawings and not real people', choices: ['animated', 'sequel'], answer: 0, preGraded: true },
      { id: 'c2', stem: 'The most important/famous actor or actress in a film', choices: ['extra', 'star'], answer: 1, preGraded: 'incorrect' }
    ] },
    { id: 'q14quiz', seq: 'q14', type: 'quiz', section: 'Unit 1 : Entertainment', title: 'Quiz : Unit 1 : Chapter 4', complete: true, problems: [
      { id: 'd1', stem: 'A dangerous/risky piece of action in a film usually carried out by a professional', choices: ['scene', 'extra', 'stuntman'], answer: 2, preGraded: true }
    ] },
    // Partial score, no green check: one wrong answer with attempts left (must NOT be resubmitted),
    // one correct, one never submitted (must be answered).
    { id: 'q15quiz', seq: 'q15', type: 'quiz', section: 'Unit 1 : Entertainment', title: 'Quiz : Unit 1 : Chapter 5', problems: [
      { id: 'e1', stem: 'I _______ give you a lift to the station. My car broke down yesterday.', choices: ['can', "can't", 'could'], answer: 1, preGraded: 'incorrect', maxAttempts: 3 },
      { id: 'e2', stem: 'My dog _______ jump very high when he was younger.', choices: ['can', 'could', "couldn't"], answer: 1, preGraded: true },
      { id: 'e3', stem: 'Anyone _______ make a mistake.', choices: ['can', 'could not', "can't"], answer: 0 }
    ] },
    // Live layout (block titles "Dropdown"/"problem", two selects per block), partly submitted, no
    // green check: m1 wrong with an attempt left and m3 correct must stay untouched; m2 and m4 are open.
    { id: 'q55quiz', seq: 'q55', type: 'quiz', section: 'Unit 5 : Food', title: 'Quiz : Unit 5 : Chapter 5', problems: [
      { id: 'm1', kind: 'select', title: 'Dropdown', stem: '1. If Milada ___1___ (not / be) late, we ___2___ (not / miss) the train.', maxAttempts: 2, preGraded: 'incorrect',
        blanks: [{ options: ['wasn’t', 'hadn’t been'], answer: 'hadn’t been' }, { options: ['wouldn’t miss', 'wouldn’t have missed'], answer: 'wouldn’t have missed' }] },
      { id: 'm2', kind: 'select', title: 'problem', stem: '2. If Amada ___1___ (study) harder, she ___2___ (pass) the final exam.', maxAttempts: 2,
        blanks: [{ options: ['studied', 'had studied'], answer: 'had studied' }, { options: ['would pass', 'would have passed'], answer: 'would have passed' }] },
      { id: 'm3', kind: 'text', title: 'problem', stem: '6. If she had gone to medical school, she ______ (become) a doctor.', answers: ['would have become'], preGraded: true, maxAttempts: 2 },
      { id: 'm4', kind: 'text', title: 'problem', stem: "10. They wouldn't have been late if they _______ (not / go) shopping.", answers: ['hadn’t gone'], maxAttempts: 2 }
    ] },
    ...(withUnanswerable ? [
      { id: 'q21quiz', seq: 'q21', type: 'quiz', section: 'Unit 2 : Sport and health', title: 'Quiz : Unit 2 : Chapter 1', problems: [
        { id: 'f1', stem: 'Which of these colours does the fixture bank not know about at all?', choices: ['mauve', 'teal', 'ochre'], answer: 1 }
      ] }
    ] : [])
  ]
});

async function run(spec, modes) {
  const srv = await startCourseServer(spec);
  const logs = [];
  const progress = [];
  const worker = new AutomationWorker('P', {
    courseCode: spec.courseCode, targetUrl: srv.homeUrl, speedMode: 'turbo', modes, onProgress: s => progress.push(s)
  }, (id, msg) => logs.push(msg));
  await Promise.race([worker.start(), new Promise((_, rej) => setTimeout(() => rej(new Error('worker timeout')), 300000).unref())]);
  const out = { spec, modes, srv, logs, progress, status: worker.status, final: srv.progressData() };
  if (worker.browserContext) await worker.browserContext.close().catch(() => {});
  await srv.close();
  if (process.env.READINESS_LOG_DIR) {
    fs.mkdirSync(process.env.READINESS_LOG_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.READINESS_LOG_DIR, `progress-${spec.units.length}-${modes.replace(/,/g, '+')}.log`),
      `${logs.join('\n')}\n\nEVENTS\n${srv.state.events.map(e => JSON.stringify(e)).join('\n')}\n`);
  }
  return out;
}

const submits = (r, unit) => r.srv.state.events.filter(e => e.type === 'submit' && e.unit === unit);
const firstIdx = (r, pred) => r.srv.state.events.findIndex(pred);
const failMsg = r => `\n--- worker log ---\n${r.logs.join('\n')}`;

let full, stuck, noQuiz, atlakDupRun, part3Fb;
before(async () => {
  [full, stuck, noQuiz, atlakDupRun, part3Fb] = await Promise.all([
    run(course({ withUnanswerable: false }), 'quiz,video,doc'),
    run(course({ withUnanswerable: true }), 'quiz,video,doc'),
    run(course({ withUnanswerable: false }), 'video,doc'),
    run(atlakDup, 'quiz,video,doc'),
    run(part3Fallback, 'quiz,video,doc')
  ]);
});
after(() => { playwright.chromium.launchPersistentContext = realLaunch; });

test('outline unreadable: falls back to Progress first and lists 0-point / partial quizzes', () => {
  const r = full;
  const ev = r.srv.state.events;
  const firstProgress = firstIdx(r, e => e.type === 'progress-view');
  const firstEnter = firstIdx(r, e => e.type === 'enter');
  assert.ok(r.logs.some(l => l.includes('อ่านแท็บ Course ไม่ได้')), failMsg(r));
  assert.ok(firstProgress >= 0 && firstProgress < firstEnter, `Progress page was not opened before the first unit${failMsg(r)}`);
  const start = r.progress[0];
  assert.strictEqual(start.completion, Math.round((100 * 2) / 8), failMsg(r));
  assert.deepStrictEqual(start.zero.map(z => z.name), ['Pre Test', 'Quiz : Unit 1 : Chapter 1'], failMsg(r));
  assert.deepStrictEqual(start.partial.map(z => `${z.name} ${z.earned}/${z.possible}`),
    ['Quiz : Unit 1 : Chapter 3 1/2', 'Quiz : Unit 1 : Chapter 5 1/3', 'Quiz : Unit 5 : Chapter 5 1/4'], failMsg(r));
  assert.deepStrictEqual(start.zero.map(z => z.section), ['Introduction', 'Unit 1 : Entertainment'], failMsg(r));
  assert.ok(r.logs.some(l => l.includes('• Introduction › Pre Test (0/2)')), failMsg(r));

  // Quizzes were opened from the Progress page links, before the unit-by-unit pass reached them.
  const linkClicks = ev.filter(e => e.type === 'progress-link').map(e => e.title);
  assert.deepStrictEqual(linkClicks.slice(0, 3), ['Pre Test', 'Quiz : Unit 1 : Chapter 1', 'Quiz : Unit 1 : Chapter 3'], failMsg(r));
  const q11Submit = firstIdx(r, e => e.type === 'submit' && e.unit === 'q11quiz');
  const videoEnter = firstIdx(r, e => e.type === 'enter' && e.unit === 'l12video');
  assert.ok(q11Submit >= 0 && q11Submit < videoEnter, `Chapter 1 quiz was not done straight from Progress${failMsg(r)}`);
});

test('answers only unsubmitted problems, never resubmits answered ones', () => {
  const r = full;
  assert.strictEqual(submits(r, 'preQuiz').length, 2, failMsg(r));
  assert.deepStrictEqual(submits(r, 'q11quiz').map(s => [s.problem, s.correct]), [['a1', true], ['a2', true], ['a3', true]], failMsg(r));
  assert.strictEqual(submits(r, 'q13quiz').length, 0, `Chapter 3 (all submitted) must not be touched${failMsg(r)}`);
  assert.strictEqual(submits(r, 'q14quiz').length, 0, failMsg(r));
  assert.deepStrictEqual(submits(r, 'q15quiz').map(s => [s.problem, s.correct]), [['e3', true]],
    `Chapter 5: only the unsubmitted problem e3 may be submitted${failMsg(r)}`);
});

test('revisit of a partly-submitted unit fills every open block (both dropdowns, exact text) and skips submitted ones', () => {
  const r = full;
  assert.deepStrictEqual(submits(r, 'q55quiz').map(s => [s.problem, s.values, s.correct]), [
    ['m2', ['had studied', 'would have passed'], true],
    ['m4', ['hadn’t gone'], true]
  ], `only m2 and m4 may be submitted, each once${failMsg(r)}`);
  assert.ok(r.srv.state.complete.q55quiz, failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ข้อ 1:') && l.includes('ไม่แตะต้องคำตอบเดิม')), failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ไม่มีข้อที่ค้างไม่ได้ส่ง')), failMsg(r));
});

test('final Progress re-check reaches 100% and logs the summary', () => {
  const r = full;
  assert.strictEqual(r.status, 'completed');
  assert.strictEqual(r.final.completion, 100, failMsg(r));
  const last = r.progress[r.progress.length - 1];
  assert.strictEqual(last.completion, 100, failMsg(r));
  // The pre-test is answered at random (no bank answers), so it may legitimately stay at 0 points;
  // that alone triggers the single extra pass.
  const preZero = r.final.graded.find(g => g.title === 'Pre Test').earned === 0;
  assert.deepStrictEqual(last.zero.map(z => z.name), preZero ? ['Pre Test'] : [], failMsg(r));
  assert.strictEqual(r.logs.filter(l => l.includes('ทำรอบเก็บตกอีก 1 รอบ')).length, preZero ? 1 : 0, failMsg(r));
  assert.ok(r.logs[r.logs.length - 1].includes('ครบ 100% แล้ว'), failMsg(r));
});

test('unanswerable quiz: one extra pass, then stops and reports it', () => {
  const r = stuck;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  assert.strictEqual(submits(r, 'q21quiz').length, 0, `must not guess on a question not in the bank${failMsg(r)}`);
  assert.strictEqual(r.logs.filter(l => l.includes('ทำรอบเก็บตกอีก 1 รอบ')).length, 1, failMsg(r));
  const phases = r.progress.map(p => p.phase);
  assert.deepStrictEqual(phases, ['ก่อนเริ่ม', 'หลังเรียนจบรอบ', 'หลังรอบเก็บตก'], failMsg(r));
  const last = r.progress[r.progress.length - 1];
  assert.deepStrictEqual(last.zero.map(z => z.name).filter(n => n !== 'Pre Test'), ['Quiz : Unit 2 : Chapter 1'], failMsg(r));
  assert.ok(last.completion < 100, failMsg(r));
  const summary = r.logs[r.logs.length - 1];
  assert.ok(summary.includes('Quiz : Unit 2 : Chapter 1') && summary.includes('ยังไม่ครบ 100%'), failMsg(r));
  const leftover = r.logs.findIndex(l => l.includes('ข้อที่ยังไม่ได้ส่งเพราะไม่มีเฉลยที่ใช้ได้ 1 ข้อ'));
  assert.ok(leftover > 0 && r.logs[leftover + 1].includes('Unit 2') && r.logs[leftover + 1].includes('fixture bank'), `leftover listed explicitly${failMsg(r)}`);
});

test('duplicate แบบทดสอบหลังบทเรียน: each chapter is its own row; 0/10 siblings are not skipped', () => {
  const r = atlakDupRun;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  const start = r.progress[0];
  const dup = start.zero.filter(z => z.name === QUIZ);
  assert.strictEqual(dup.length, 2, `expected บทที่ 1 and 2 at 0, got ${JSON.stringify(dup)}${failMsg(r)}`);
  assert.deepStrictEqual(dup.map(z => z.section).sort(), [CH1, CH2].sort(), failMsg(r));
  assert.ok(!dup.some(z => z.section === CH3), failMsg(r));
  assert.ok(r.logs.some(l => l.includes(CH1) && l.includes(QUIZ)), failMsg(r));
  assert.ok(r.logs.some(l => l.includes(CH2) && l.includes(QUIZ)), failMsg(r));
  assert.ok(r.logs.some(l => l.includes('คำชี้แจง') || l.includes('ยังไม่ใช่แบบทดสอบ')), failMsg(r));
  assert.strictEqual(submits(r, 'q1quiz').length, 1, failMsg(r));
  assert.strictEqual(submits(r, 'q2quiz').length, 1, failMsg(r));
  assert.strictEqual(submits(r, 'q3quiz').length, 0, `บทที่ 3 is 10/10 — must not resubmit${failMsg(r)}`);
  assert.ok(r.srv.state.complete.q1quiz && r.srv.state.complete.q2quiz, failMsg(r));
  const quizLinks = r.srv.state.events.filter(e => e.type === 'progress-link' && e.title === QUIZ);
  assert.ok(quizLinks.length >= 2, `each 0/10 แบบทดสอบหลังบทเรียน must be clicked, got ${quizLinks.length}${failMsg(r)}`);
});

test('Post-Test instructional first block is not a leftover; submitted 0-score items are not retried', () => {
  const r = atlakDupRun;
  assert.strictEqual(submits(r, 'postQuiz').map(s => s.problem).sort().join(','), 'po2', failMsg(r));
  assert.ok(!r.logs.some(l => l.includes('poIntro') || (l.includes('ยังค้าง') && l.includes('คำชี้แจง'))), failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ข้อความอธิบาย') || l.includes('ไม่มีช่องตอบ')), failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ไม่แตะต้องคำตอบเดิม')), failMsg(r));
});

test('progress parser keeps one row per section when titles repeat', async () => {
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage();
  await page.setContent(`<main><div class="donut-chart-number">12%</div>
    <div class="detailed-grades">
      <table><thead><tr><th>${CH1}</th><th>Score</th></tr></thead>
        <tbody><tr><td><a href="/learning/course/course-v1:X+TSUGE000111+Y/block-v1:X+TSUGE000111+Y+type@sequential+block@q1">${QUIZ}</a></td><td>0/10</td></tr></tbody></table>
      <table><thead><tr><th>${CH2}</th><th>Score</th></tr></thead>
        <tbody><tr><td><a href="/learning/course/course-v1:X+TSUGE000111+Y/block-v1:X+TSUGE000111+Y+type@sequential+block@q2">${QUIZ}</a></td><td>0/10</td></tr></tbody></table>
      <table><thead><tr><th>${CH3}</th><th>Score</th></tr></thead>
        <tbody><tr><td><a href="/learning/course/course-v1:X+TSUGE000111+Y/block-v1:X+TSUGE000111+Y+type@sequential+block@q3">${QUIZ}</a></td><td>10/10</td></tr></tbody></table>
    </div></main>`);
  const out = await page.evaluate(AutomationWorker.parseProgressPage);
  await browser.close();
  assert.strictEqual(out.rows.length, 3);
  assert.deepStrictEqual(out.rows.map(r => [r.section, r.name, r.earned, r.possible]), [
    [CH1, QUIZ, 0, 10], [CH2, QUIZ, 0, 10], [CH3, QUIZ, 10, 10]
  ]);
});

test('Progress fallback Next-walk: filled-check video (3/10) is not replayed', () => {
  const r = part3Fb;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  const plays = r.srv.state.events.filter(e => e.type === 'video-play').map(e => e.unit);
  assert.ok(plays.includes('v4open') && plays.every(u => u === 'v4open'), `checked video was replayed: ${plays}${failMsg(r)}`);
  const v3 = r.srv.state.events.filter(e => e.unit === 'v3done');
  assert.ok(v3.some(e => e.type === 'enter'), `walker never reached video (3/10)${failMsg(r)}`);
  assert.ok(!v3.some(e => e.type === 'video-play'), failMsg(r));
  assert.strictEqual(r.srv.state.events.filter(e => e.type === 'submit' && e.unit === 'qpart').length, 1, failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ติ๊กถูกสีเขียว') || l.includes('ขึ้นติ๊กถูก')), failMsg(r));
});

test('quiz mode off: Progress is read and logged but quizzes are not opened', () => {
  const r = noQuiz;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  assert.strictEqual(r.srv.state.events.filter(e => e.type === 'submit').length, 0, failMsg(r));
  assert.strictEqual(r.srv.state.events.filter(e => e.type === 'progress-link').length, 0, failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ไม่ได้เลือกให้ทำแบบฝึก')), failMsg(r));
  assert.ok(r.logs.some(l => l.includes('ไม่ได้เลือกทำ แบบฝึก')), failMsg(r));
  assert.ok(r.srv.state.complete.l12video && r.srv.state.complete.l12doc, failMsg(r));
});
