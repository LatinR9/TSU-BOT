// Full-course runs of the real AutomationWorker.start() loop against a local Open edX/MFE-style
// fixture course (test/fixtures/course/server.js): quizzes, videos, documents, already-completed
// units, and every --modes combination. Not the live TSU site.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const playwright = require('playwright');
const AutomationWorker = require('../worker');
const { startCourseServer } = require('./fixtures/course/server');

// Same worker code path; only the browser launch is made headless with a throwaway profile.
const realLaunch = playwright.chromium.launchPersistentContext.bind(playwright.chromium);
playwright.chromium.launchPersistentContext = (dir, opts) => realLaunch(fs.mkdtempSync(path.join(os.tmpdir(), 'tsubot-profile-')), {
  ...opts,
  headless: true,
  viewport: { width: 1280, height: 800 },
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
});

const EN_COURSE = {
  courseCode: 'TSUGE00152',
  courseName: 'ภาษาอังกฤษเพื่อการสื่อสาร 2',
  outline: ['Unit 1 Chapter 1', 'Unit 1 Chapter 2', 'แบบทดสอบหลังเรียน (Post-Test)'],
  units: [
    { id: 'u1quiz', type: 'quiz', section: 'Unit 1 Chapter 1', title: 'Unit 1 Chapter 1: Exercise', problems: [
      { id: 'p1', stem: 'A second film made to continue the story started in the first', choices: ['animated', 'star', 'sequel', 'stuntman'], answer: 2 },
      { id: 'p2', stem: 'A performer hired to play a minor part, as in a crowd scene', choices: ['scene', 'star', 'extra'], answer: 2, stemAsParagraph: true },
      { id: 'p3', stem: 'Frozen is one of the most popular ________ of all time', choices: ['horror', 'animations', 'musical'], answer: 1 }
    ] },
    { id: 'u2video', type: 'video', section: 'Unit 1 Chapter 1', title: 'Unit 1 Chapter 1: Video lesson' },
    { id: 'u2bVideoLong', type: 'video', section: 'Unit 1 Chapter 1', title: 'Unit 1 Chapter 1: Lecture (3 min)', clip: 'clip180s.webm' },
    { id: 'u3doc', type: 'doc', section: 'Unit 1 Chapter 1', title: 'Unit 1 Chapter 1: Reading sheet', docText: 'Films and genres reading sheet' },
    { id: 'u4quizDone', type: 'quiz', section: 'Unit 1 Chapter 1', title: 'Unit 1 Chapter 1: Exercise 2', complete: true, problems: [
      { id: 'p4', stem: 'The most important/famous actor or actress in a film', choices: ['extra', 'star'], answer: 1, preGraded: true }
    ] },
    { id: 'u5videoDone', type: 'video', section: 'Unit 1 Chapter 1', title: 'Unit 1 Chapter 1: Video 2', complete: true },
    { id: 'u6docDone', type: 'doc', section: 'Unit 1 Chapter 1', title: 'Unit 1 Chapter 1: Sheet 2', complete: true },
    { id: 'u7quizPartial', type: 'quiz', section: 'Unit 1 Chapter 1', title: 'Unit 1 Chapter 1: Exercise 3', problems: [
      { id: 'p5', stem: 'A cartoon-like film using drawings and not real people', choices: ['animated', 'sequel'], answer: 0, preGraded: true },
      { id: 'p6', stem: 'A dangerous/risky piece of action in a film usually carried out by a professional', choices: ['scene', 'extra', 'stuntman'], answer: 2 }
    ] }
  ]
};

const TH_COURSE = {
  courseCode: 'TSUGE000111',
  courseName: 'อัตลักษณ์ทักษิณและความเป็นพลเมือง',
  submitLabel: 'ส่งคำตอบ',
  outline: ['บทที่ 1 อัตลักษณ์มหาวิทยาลัยทักษิณ', 'บทที่ 2 ความเป็นพลเมือง', 'แบบทดสอบหลังเรียน (Post-Test)'],
  units: [
    { id: 't1video', type: 'video', section: 'บทที่ 1 อัตลักษณ์มหาวิทยาลัยทักษิณ', title: 'วิดีโอ บทที่ 1' },
    { id: 't2doc', type: 'doc', section: 'บทที่ 1 อัตลักษณ์มหาวิทยาลัยทักษิณ', title: 'เอกสารประกอบ บทที่ 1', docText: 'ประวัติมหาวิทยาลัยทักษิณ' },
    { id: 't3quiz', type: 'quiz', section: 'บทที่ 1 อัตลักษณ์มหาวิทยาลัยทักษิณ', title: 'แบบทดสอบ บทที่ 1', problems: [
      { id: 'tp1', stem: 'สีประจำ\u200bมหาวิทยาลัยทักษิณ\u00a0คือสีอะไร', choices: ['ฟ้า-ขาว', 'แดง-เหลือง', 'เทา–ฟ้า'], answer: 2 },
      { id: 'tp2', stem: 'ต้นไม้และดอกไม้ประจำมหาวิทยาลัยทักษิณคือต้นอะไร', choices: ['ต้นราชพฤกษ์', 'ต้นทองหลาง', 'ต้นสัก'], answer: 1 },
      { id: 'tp3', stem: 'เดิมมหาวิทยาลัยทักษิณมีชื่อว่าอะไร', choices: ['วิทยาลัยวิชาการศึกษาสงขลา', 'มหาวิทยาลัยศรีนครินทรวิโรฒ วิทยาเขตภาคใต้', 'ถูกทุกข้อ'], answer: 2 }
    ] },
    { id: 't4quizDone', type: 'quiz', section: 'บทที่ 2 ความเป็นพลเมือง', title: 'แบบทดสอบ บทที่ 2', complete: true, problems: [
      { id: 'tp4', stem: 'ข้อใดคือความเคารพและดูแลรักษาสาธารณสมบัติ', choices: ['ไม่ทำความเสียหายต่อสถานที่ราชการ โบราณสถาน', 'อื่น ๆ'], answer: 0, preGraded: true }
    ] },
    { id: 't5videoDone', type: 'video', section: 'บทที่ 2 ความเป็นพลเมือง', title: 'วิดีโอ บทที่ 2', complete: true }
  ]
};

async function runCourse(spec, modes) {
  const srv = await startCourseServer(spec);
  const logs = [];
  const worker = new AutomationWorker('R', { courseCode: spec.courseCode, targetUrl: srv.homeUrl, speedMode: 'turbo', modes },
    (id, msg) => logs.push(`${new Date().toISOString().slice(14, 23)} ${msg}`));
  const t0 = Date.now();
  await Promise.race([worker.start(), new Promise((_, rej) => setTimeout(() => rej(new Error('worker timeout')), 240000).unref())]);
  const result = { spec, modes, srv, logs, status: worker.status, seconds: (Date.now() - t0) / 1000 };
  if (worker.browserContext) await worker.browserContext.close().catch(() => {});
  await srv.close();
  return result;
}

function unitTimeline(srv, unitId) {
  const evs = srv.state.events.filter(e => e.unit === unitId);
  const enter = evs.find(e => e.type === 'enter');
  const leave = evs.find(e => e.type === 'leave');
  return { evs, dwell: enter && leave ? (leave.t - enter.t) / 1000 : null, leaveT: leave ? leave.t : Infinity };
}

// Returns a list of failed expectations for one run.
function check(run) {
  const { spec, srv, logs } = run;
  const modes = new Set((run.modes || 'quiz,video,doc').split(','));
  const fails = [];
  const expect = (ok, msg) => { if (!ok) fails.push(msg); };
  expect(run.status === 'completed', `worker ended with status ${run.status}`);

  spec.units.forEach((u, i) => {
    const tl = unitTimeline(srv, u.id);
    const isLast = i === spec.units.length - 1;
    const has = type => tl.evs.some(e => e.type === type);
    const completeEv = tl.evs.find(e => e.type === 'complete');

    if (u.complete) {
      // Outline-first skips items that already show the filled check, so they may never be entered.
      expect(!has('video-play') && !has('submit') && !has('scroll'), `${u.id}: already-completed unit was interacted with`);
      if (has('enter') && !isLast) expect(tl.dwell < 4.5, `${u.id}: already-completed unit not skipped immediately (dwell ${tl.dwell}s)`);
      return;
    }
    expect(has('enter'), `${u.id}: unit never visited`);
    if (!isLast) expect(tl.dwell !== null, `${u.id}: worker never moved on (stuck)`);
    const on = modes.has(u.type);
    if (u.type === 'quiz') {
      const subs = tl.evs.filter(e => e.type === 'submit');
      const todo = u.problems.filter(p => !p.preGraded);
      if (on) {
        expect(subs.length === todo.length, `${u.id}: expected ${todo.length} submissions, got ${subs.length}`);
        expect(subs.every(s => s.correct), `${u.id}: wrong answer submitted ${JSON.stringify(subs.filter(s => !s.correct))}`);
        expect(!subs.some(s => u.problems.find(p => p.id === s.problem).preGraded), `${u.id}: re-submitted an already graded problem`);
        expect(srv.state.complete[u.id], `${u.id}: quiz unit not complete`);
      } else {
        expect(subs.length === 0, `${u.id}: quiz answered although quiz mode is off`);
      }
    }
    if (u.type === 'video') {
      if (on) {
        expect(has('video-play'), `${u.id}: video never started playing`);
        expect(completeEv && completeEv.t <= tl.leaveT, `${u.id}: video not marked complete before moving on`);
        expect(tl.dwell === null || tl.dwell < 35, `${u.id}: video took ${tl.dwell}s (should seek near the end, not watch it all)`);
      } else {
        expect(!has('video-play'), `${u.id}: video played although video mode is off`);
      }
    }
    if (u.type === 'doc') {
      const scrolls = tl.evs.filter(e => e.type === 'scroll');
      const bottom = scrolls.reduce((m, e) => Math.max(m, e.bottom || 0), 0);
      const height = scrolls.reduce((m, e) => Math.max(m, e.height || 0), 0);
      if (on) {
        expect(tl.dwell === null || tl.dwell >= 5, `${u.id}: document left after ${tl.dwell}s (< 5 s reading time)`);
        expect(completeEv && completeEv.t <= tl.leaveT, `${u.id}: document not marked complete before moving on`);
        expect(height > 0 && bottom >= height * 0.97, `${u.id}: document not scrolled to the bottom (${bottom}/${height})`);
        expect(logs.some(l => l.includes('เอกสาร/ชีทอ่านครบ')), `${u.id}: reading flow did not finish`);
      } else {
        expect(scrolls.length === 0, `${u.id}: document read although doc mode is off`);
      }
    }
  });
  return fails;
}

const COMBOS = ['quiz,video,doc', 'quiz', 'video', 'doc', 'quiz,video', 'quiz,doc', 'video,doc'];
let runs = [];

before(async () => {
  runs = await Promise.all([
    ...COMBOS.map(m => runCourse(EN_COURSE, m)),
    runCourse(TH_COURSE, 'quiz,video,doc')
  ]);
  if (process.env.READINESS_LOG_DIR) {
    fs.mkdirSync(process.env.READINESS_LOG_DIR, { recursive: true });
    runs.forEach(r => fs.writeFileSync(path.join(process.env.READINESS_LOG_DIR, `${r.spec.courseCode}-${r.modes.replace(/,/g, '+')}.log`),
      `${r.logs.join('\n')}\n\nEVENTS\n${r.srv.state.events.map(e => JSON.stringify(e)).join('\n')}\n`));
  }
});
after(() => { playwright.chromium.launchPersistentContext = realLaunch; });

for (const [i, label] of [...COMBOS.map(m => `EN course, --modes ${m}`), 'TH course, --modes quiz,video,doc'].entries()) {
  test(label, () => {
    const run = runs[i];
    const fails = check(run);
    assert.deepStrictEqual(fails, [], `${fails.join('\n')}\n--- worker log ---\n${run.logs.join('\n')}`);
  });
}
