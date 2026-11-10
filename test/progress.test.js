// Progress tab flow of the real AutomationWorker.start(): read Progress first, go straight into every
// quiz that is 0/N or still has unsubmitted problems (never resubmitting answered ones), then re-check
// Progress at the end with one bounded extra pass. Fixture: test/fixtures/course (not the live TSU site),
// laid out like the TSU progress tab ("Introduction › Pre Test 0/30", "Quiz : Unit 1 : Chapter 3 17/19").
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const playwright = require('playwright');
const AutomationWorker = require('../worker');
const { startCourseServer } = require('./fixtures/course/server');

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
  outline: ['Introduction', 'Unit 1 : Entertainment', 'Unit 2 : Sport and health'],
  sequences: [
    { id: 'pre', title: 'Pre Test', chapter: 'Introduction' },
    { id: 'q11', title: 'Quiz : Unit 1 : Chapter 1', chapter: 'Unit 1 : Entertainment' },
    { id: 'l12', title: 'Lesson : Unit 1 : Chapter 2', chapter: 'Unit 1 : Entertainment' },
    { id: 'q13', title: 'Quiz : Unit 1 : Chapter 3', chapter: 'Unit 1 : Entertainment' },
    { id: 'q14', title: 'Quiz : Unit 1 : Chapter 4', chapter: 'Unit 1 : Entertainment' },
    { id: 'q15', title: 'Quiz : Unit 1 : Chapter 5', chapter: 'Unit 1 : Entertainment' },
    { id: 'q21', title: 'Quiz : Unit 2 : Chapter 1', chapter: 'Unit 2 : Sport and health' }
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

let full, stuck, noQuiz;
before(async () => {
  [full, stuck, noQuiz] = await Promise.all([
    run(course({ withUnanswerable: false }), 'quiz,video,doc'),
    run(course({ withUnanswerable: true }), 'quiz,video,doc'),
    run(course({ withUnanswerable: false }), 'video,doc')
  ]);
});
after(() => { playwright.chromium.launchPersistentContext = realLaunch; });

test('reads Progress first and lists 0-point / partial quizzes', () => {
  const r = full;
  const ev = r.srv.state.events;
  const firstProgress = firstIdx(r, e => e.type === 'progress-view');
  const firstEnter = firstIdx(r, e => e.type === 'enter');
  assert.ok(firstProgress >= 0 && firstProgress < firstEnter, `Progress page was not opened before the first unit${failMsg(r)}`);
  const start = r.progress[0];
  assert.strictEqual(start.completion, Math.round((100 * 2) / 7), failMsg(r));
  assert.deepStrictEqual(start.zero.map(z => z.name), ['Pre Test', 'Quiz : Unit 1 : Chapter 1'], failMsg(r));
  assert.deepStrictEqual(start.partial.map(z => `${z.name} ${z.earned}/${z.possible}`),
    ['Quiz : Unit 1 : Chapter 3 1/2', 'Quiz : Unit 1 : Chapter 5 1/3'], failMsg(r));
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
