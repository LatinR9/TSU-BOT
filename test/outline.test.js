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
const CH1 = 'บทที่ 1 อัตลักษณ์มหาวิทยาลัยทักษิณ';
const CH2 = 'บทที่ 2 ความเป็นพลเมือง';
const CH4 = 'บทที่ 4 ทักษะการสื่อสาร';
const CH5 = 'บทที่ 5 บุคลิกภาพและความเป็นผู้นำ';
const CH6 = 'บทที่ 6 Design Thinking และ Appreciative Inquiry';

// TSUGE000111 (วิชาอัตลักษณ์): Thai item titles without the Language-course "Quiz :" / "Sheet :"
// prefix, mixed Open edX hrefs, a Thai <a> Expand-all control, collapsed later sections with no
// aria-expanded, and content-type icons on unfinished rows (the combination that used to leave
// only Pre Test visible / clickable).
const atlak = {
  courseCode: 'TSUGE000111',
  courseName: 'อัตลักษณ์ทักษิณและความเป็นพลเมือง',
  submitLabel: 'ส่งคำตอบ',
  outlineHome: {
    expandText: 'ขยายทุกส่วน', collapseText: 'ยุบทั้งหมด', expandTag: 'a',
    ariaExpanded: false, typeIcons: true, outlineId: 'course-outline-block-tree',
    startCollapsed: true
  },
  outline: ['บทนำ', CH1, CH2],
  sequences: [
    { id: 'pre', title: 'Pre Test', chapter: 'บทนำ' },
    { id: 'vid1', title: 'วิดีโอ บทที่ 1', chapter: CH1, linkStyle: 'vertical' },
    { id: 'doc1', title: 'เอกสารประกอบ บทที่ 1', chapter: CH1, linkStyle: 'jump_to_id' },
    { id: 'ex1', title: 'แบบฝึก บทที่ 1', chapter: CH1, linkStyle: 'courseware', graded: false },
    { id: 'q1', title: 'แบบทดสอบหลังบทเรียน', chapter: CH1 },
    { id: 'ex2', title: 'แบบฝึกหัดท้ายบท บทที่ 2', chapter: CH2, linkStyle: 'courseware', graded: false },
    { id: 'post', title: 'แบบทดสอบหลังเรียน (Post-Test)', chapter: CH2 }
  ],
  units: [
    { id: 'preQuiz', seq: 'pre', type: 'quiz', section: 'บทนำ', title: 'Pre Test', pretest: true, problems: [
      { id: 'pt1', stem: 'สีประจำมหาวิทยาลัยทักษิณคือสีอะไร', choices: ['ฟ้า-ขาว', 'แดง-เหลือง', 'เทา–ฟ้า'], answer: 2 }
    ] },
    { id: 'vid1u', seq: 'vid1', type: 'video', section: CH1, title: 'วิดีโอ บทที่ 1' },
    { id: 'doc1u', seq: 'doc1', type: 'doc', section: CH1, title: 'เอกสารประกอบ บทที่ 1', docText: 'ประวัติมหาวิทยาลัยทักษิณ' },
    { id: 'ex1u', seq: 'ex1', type: 'quiz', section: CH1, title: 'แบบฝึก บทที่ 1', problems: [
      { id: 'ex1a', stem: 'ต้นไม้และดอกไม้ประจำมหาวิทยาลัยทักษิณคือต้นอะไร', choices: ['ต้นราชพฤกษ์', 'ต้นทองหลาง', 'ต้นสัก'], answer: 1 }
    ] },
    { id: 'q1intro', seq: 'q1', type: 'doc', section: CH1, title: 'คำชี้แจง แบบทดสอบหลังบทเรียน' },
    { id: 'q1u', seq: 'q1', type: 'quiz', section: CH1, title: 'แบบทดสอบหลังบทเรียน', problems: [
      { id: 'q1a', stem: 'เดิมมหาวิทยาลัยทักษิณมีชื่อว่าอะไร', choices: ['วิทยาลัยวิชาการศึกษาสงขลา', 'มหาวิทยาลัยศรีนครินทรวิโรฒ วิทยาเขตภาคใต้', 'ถูกทุกข้อ'], answer: 2 },
      { id: 'q1b', stem: 'สีประจำมหาวิทยาลัยทักษิณคือสีอะไร', choices: ['ฟ้า-ขาว', 'แดง-เหลือง', 'เทา–ฟ้า'], answer: 2, preGraded: true }
    ] },
    { id: 'ex2u', seq: 'ex2', type: 'quiz', section: CH2, title: 'แบบฝึกหัดท้ายบท บทที่ 2', problems: [
      { id: 'ex2a', stem: 'ข้อใดคือความเคารพและดูแลรักษาสาธารณสมบัติ', choices: ['ไม่ทำความเสียหายต่อสถานที่ราชการ โบราณสถาน', 'อื่น ๆ'], answer: 0 }
    ] },
    { id: 'postU', seq: 'post', type: 'quiz', section: CH2, title: 'แบบทดสอบหลังเรียน (Post-Test)', complete: true, problems: [
      { id: 'po1', stem: 'ข้อใดคือความเคารพและดูแลรักษาสาธารณสมบัติ', choices: ['ไม่ทำความเสียหายต่อสถานที่ราชการ โบราณสถาน', 'อื่น ๆ'], answer: 0, preGraded: true }
    ] }
  ]
};

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

// Live TSUGE000111: Course tab lists duplicate แบบทดสอบหลังบทเรียน under each chapter.
// Chapter 1 starts with an intro sheet + an already-checked video; siblings must still be opened.
const part3 = {
  courseCode: 'TSUGE000111',
  courseName: 'อัตลักษณ์ทักษิณและความเป็นพลเมือง',
  submitLabel: 'ส่งคำตอบ',
  outlineHome: { typeIcons: true, outlineId: 'course-outline-block-tree' },
  outline: [CH1, CH2, CH4, CH5, CH6, 'Post Test'],
  sequences: [
    { id: 'doneSolo', title: 'video (already watched)', chapter: CH4 },
    { id: 'q1', title: 'แบบทดสอบหลังบทเรียน', chapter: CH1 },
    { id: 'q2', title: 'แบบทดสอบหลังบทเรียน', chapter: CH2 },
    { id: 'part3', title: 'part 3', chapter: CH4 },
    { id: 'q4', title: 'แบบทดสอบหลังบทเรียน', chapter: CH4 },
    { id: 'q5', title: 'แบบทดสอบหลังบทเรียน', chapter: CH5 },
    { id: 'q6', title: 'แบบทดสอบหลังบทเรียน', chapter: CH6 },
    { id: 'post', title: 'แบบทดสอบความรู้หลังเรียน (Post-Test)', chapter: 'Post Test' }
  ],
  units: [
    { id: 'doneSoloU', seq: 'doneSolo', type: 'video', section: CH4, title: 'video (already watched)', complete: true },
    { id: 'q1intro', seq: 'q1', type: 'doc', section: CH1, title: 'คำชี้แจง', docText: 'อ่านก่อนสอบ' },
    { id: 'q1vid', seq: 'q1', type: 'video', section: CH1, title: 'video (3/10)', complete: true },
    { id: 'q1quiz', seq: 'q1', type: 'quiz', section: CH1, title: 'แบบทดสอบหลังบทเรียน', problems: [
      { id: 'q1a', stem: 'เดิมมหาวิทยาลัยทักษิณมีชื่อว่าอะไร', choices: ['วิทยาลัยวิชาการศึกษาสงขลา', 'มหาวิทยาลัยศรีนครินทรวิโรฒ วิทยาเขตภาคใต้', 'ถูกทุกข้อ'], answer: 2 },
      { id: 'q1b', stem: 'สีประจำมหาวิทยาลัยทักษิณคือสีอะไร', choices: ['ฟ้า-ขาว', 'แดง-เหลือง', 'เทา–ฟ้า'], answer: 2 },
      { id: 'q1c', stem: 'ต้นไม้และดอกไม้ประจำมหาวิทยาลัยทักษิณคือต้นอะไร', choices: ['ต้นราชพฤกษ์', 'ต้นทองหลาง', 'ต้นสัก'], answer: 1 },
      { id: 'q1d', stem: 'มหาวิทยาลัยศรีนครินทรวิโรฒ ภาคใต้ ได้รับการยกวิทยฐานะเป็นมหาวิทยาลัยทักษิณเมื่อใด', choices: ['1 พฤศจิกายน พ.ศ. 2539', 'อื่น ๆ'], answer: 0 },
      { id: 'q1e', stem: 'มหาวิทยาลัยทักษิณได้รับการยกฐานะเป็นอะไร', choices: ['กรม', 'อื่น ๆ'], answer: 0 },
      { id: 'q1f', stem: 'ข้อใดคือปรัชญาของมหาวิทยาลัยทักษิณ', choices: ['ปัญญา จริยธรรม และการพัฒนา', 'อื่น ๆ'], answer: 0 },
      { id: 'q1g', stem: 'ข้อใดคือปรัชญาการศึกษาของมหาวิทยาลัยทักษิณ', choices: ['มุ่งเน้นผลลัพธ์การเรียนรู้ของผู้เรียนสู่สมรรถนะนวัตกรรมสังคมและการเป็นผู้ประกอบการที่มีปัญญา จริยธรรม นำการพัฒนา โดยการจัดการเรียนรู้เชิงรุก', 'อื่น ๆ'], answer: 0 },
      { id: 'q1h', stem: 'ข้อใดไม่ใช่ค่านิยมหลักมหาวิทยาลัยทักษิณ (TSU Core Values)', choices: ['สร้างสรรค์สังคม', 'การบริการวิชาการร่วมกับชุมชนและสังคม'], answer: 1 },
      { id: 'q1i', stem: 'ข้อใดคืออัตลักษณ์ของนิสิตมหาวิทยาลัยทักษิณ', choices: ['เป็นคนดี มีทักษะชีวิต มีจิตสาธารณะ', 'รับผิดชอบ รอบรู้ สู้งาน มีประสบการณ์เชิงปฏิบัติ'], answer: 1 },
      { id: 'q1j', stem: '“การสร้างนวัตกรรมสังคมเพื่อการพัฒนาและแก้ปัญหาในชุมชน” คือเป้าประสงค์ใดของอัตลักษณ์นิสิตมหาวิทยาลัยทักษิณ', choices: ['มีประสบการณ์เชิงปฏิบัติ', 'อื่น ๆ'], answer: 0 }
    ] },
    { id: 'q2quiz', seq: 'q2', type: 'quiz', section: CH2, title: 'แบบทดสอบหลังบทเรียน', problems: [
      { id: 'q2a', stem: 'ข้อใดคือความเคารพและดูแลรักษาสาธารณสมบัติ', choices: ['ไม่ทำความเสียหายต่อสถานที่ราชการ โบราณสถาน', 'อื่น ๆ'], answer: 0 }
    ] },
    { id: 'v1done', seq: 'part3', type: 'video', section: CH4, title: 'video (1/10)', complete: true },
    { id: 'v2done', seq: 'part3', type: 'video', section: CH4, title: 'video (2/10)', complete: true },
    { id: 'v3done', seq: 'part3', type: 'video', section: CH4, title: 'video (3/10)', complete: true },
    { id: 'v4open', seq: 'part3', type: 'video', section: CH4, title: 'video (4/10)' },
    { id: 'qpart', seq: 'q4', type: 'quiz', section: CH4, title: 'แบบทดสอบหลังบทเรียน', problems: [
      { id: 'qp1', stem: 'เดิมมหาวิทยาลัยทักษิณมีชื่อว่าอะไร', choices: ['วิทยาลัยวิชาการศึกษาสงขลา', 'มหาวิทยาลัยศรีนครินทรวิโรฒ วิทยาเขตภาคใต้', 'ถูกทุกข้อ'], answer: 2 }
    ] },
    { id: 'q5quiz', seq: 'q5', type: 'quiz', section: CH5, title: 'แบบทดสอบหลังบทเรียน', problems: [
      { id: 'q5a', stem: 'ข้อใดกล่าวถูกต้องเกี่ยวกับผู้นำแบบมุ่งคน (Consideration Leadership)', choices: ['มีลักษณะของการดูแลเอาใจใส่ดูแลทุกข์สุขและสร้างความสัมพันธ์อันดีกับผู้ปฏิบัติงาน', 'อื่น ๆ'], answer: 0 }
    ] },
    { id: 'q6quiz', seq: 'q6', type: 'quiz', section: CH6, title: 'แบบทดสอบหลังบทเรียน', problems: [
      { id: 'q6a', stem: 'ข้อใดคือ Design Thinking สำหรับการสร้างอัตลักษณ์ให้กับองค์กร', choices: ['ถูกทุกข้อ', 'อื่น ๆ'], answer: 0 }
    ] },
    { id: 'postQuiz', seq: 'post', type: 'quiz', section: 'Post Test', title: 'แบบทดสอบความรู้หลังเรียน (Post-Test)', problems: [
      { id: 'poIntro', instructional: true, title: 'คำชี้แจง', stem: 'แบบทดสอบหลังเรียนเป็นแบบปรนัย' },
      { id: 'po1', stem: 'สีประจำมหาวิทยาลัยทักษิณคือสีอะไร', choices: ['ฟ้า-ขาว', 'แดง-เหลือง', 'เทา–ฟ้า'], answer: 2 }
    ] }
  ]
};

let ok, stuck, atlakAll, atlakQuizOnly, part3Run, part3QuizOnly;
before(async () => {
  [ok, stuck, atlakAll, atlakQuizOnly, part3Run, part3QuizOnly] = await Promise.all([
    run(resumed, 'quiz,video,doc', 'q21quiz'),
    run(blocked, 'quiz,doc', 'lastQuiz'),
    run(atlak, 'quiz,video,doc', 'postU'),
    run(atlak, 'quiz', 'postU'),
    run(part3, 'quiz,video,doc', 'doneSoloU'),
    run(part3, 'quiz', 'doneSoloU')
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

test('identity course: opens every unchecked แบบฝึก / แบบทดสอบ / video / sheet, Progress only at the end', () => {
  const r = atlakAll;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  assert.deepStrictEqual(Object.entries(r.srv.state.complete).filter(([, v]) => !v).map(([k]) => k), [], failMsg(r));
  assert.strictEqual(r.final.completion, 100, failMsg(r));
  assert.deepStrictEqual(r.progress.map(p => p.phase), ['ตรวจยืนยันตอนจบ'], failMsg(r));
  assert.ok(r.logs[r.logs.length - 1].includes('ครบ 100% แล้ว'), failMsg(r));

  const first = r.outline[0];
  assert.ok(first.total >= 7, `Expand all must reveal later units, got ${first.total}${failMsg(r)}`);
  assert.deepStrictEqual(first.open.map(o => o.name).sort(), [
    'Pre Test', 'วิดีโอ บทที่ 1', 'เอกสารประกอบ บทที่ 1', 'แบบฝึก บทที่ 1',
    'แบบทดสอบหลังบทเรียน', 'แบบฝึกหัดท้ายบท บทที่ 2'
  ].sort(), failMsg(r));
  assert.ok(first.checked.map(c => c.name).includes('แบบทดสอบหลังเรียน (Post-Test)'), failMsg(r));
  assert.strictEqual(seqOpens(r, 'post'), 0, failMsg(r));
  ['pre', 'vid1', 'doc1', 'ex1', 'q1', 'ex2'].forEach(s =>
    assert.ok(seqOpens(r, s) >= 1, `${s} was never opened${failMsg(r)}`));

  const firstOutline = firstIdx(r, e => e.type === 'outline-view');
  const firstProgress = firstIdx(r, e => e.type === 'progress-view');
  assert.ok(firstOutline >= 0 && firstOutline < firstProgress, failMsg(r));
  assert.deepStrictEqual(r.srv.state.events.filter(e => e.type === 'submit').map(e => e.problem).sort(),
    ['ex1a', 'ex2a', 'pt1', 'q1a'].sort(), failMsg(r));
  assert.ok(!r.srv.state.events.some(e => e.type === 'submit' && e.problem === 'q1b'), failMsg(r));
});

test('identity course: mode picker skips video/doc by Thai title; quizzes still open', () => {
  const r = atlakQuizOnly;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  assert.ok(!r.srv.state.events.some(e => e.type === 'video-play'), failMsg(r));
  assert.ok(r.srv.state.complete.ex1u && r.srv.state.complete.q1u && r.srv.state.complete.ex2u, failMsg(r));
  assert.ok(r.logs.some(l => l.includes('วิดีโอ บทที่ 1') && l.includes('ไม่ได้เลือกให้ทำวิดีโอ')), failMsg(r));
  assert.ok(r.logs.some(l => l.includes('เอกสารประกอบ บทที่ 1') && l.includes('ไม่ได้เลือกให้ทำเอกสาร')), failMsg(r));
  assert.ok(r.logs[r.logs.length - 1].includes('ยังไม่ครบ 100%'), failMsg(r));

  // part3QuizOnly: part 3 (video subsection without "วิดีโอ" in title) must NEVER be opened when only quiz is selected.
  const pq = part3QuizOnly;
  assert.strictEqual(pq.status, 'completed', failMsg(pq));
  assert.strictEqual(seqOpens(pq, 'part3'), 0, `part 3 must never be opened when only quiz is selected${failMsg(pq)}`);
  assert.ok(!pq.srv.state.events.some(e => e.type === 'video-play'), failMsg(pq));
  ['q1', 'q2', 'q4', 'q5', 'q6', 'post'].forEach(s =>
    assert.strictEqual(seqOpens(pq, s), 1, `quiz ${s} should be opened exactly once${failMsg(pq)}`));
});

test('outlineItemKind: Thai แบบฝึก / แบบทดสอบ / Pre Test and mixed hrefs', () => {
  const w = new AutomationWorker('K', { courseCode: 'TSUGE000111' });
  const kind = name => w.outlineItemKind({ name, href: '' });
  assert.strictEqual(kind('Pre Test'), 'quiz');
  assert.strictEqual(kind('แบบฝึก บทที่ 1'), 'quiz');
  assert.strictEqual(kind('แบบฝึกหัดท้ายบท บทที่ 2'), 'quiz');
  assert.strictEqual(kind('แบบทดสอบ บทที่ 1'), 'quiz');
  assert.strictEqual(kind('แบบทดสอบหลังบทเรียน'), 'quiz');
  assert.strictEqual(kind('แบบทดสอบหลังเรียน (Post-Test)'), 'quiz');
  assert.strictEqual(kind('Quiz : Unit 1 : Chapter 1'), 'quiz');
  assert.strictEqual(kind('Practice : Unit 1 : Chapter 1'), 'quiz');
  assert.strictEqual(kind('วิดีโอ บทที่ 1'), 'video');
  assert.strictEqual(kind('part 1'), 'video');
  assert.strictEqual(kind('part 10'), 'video');
  assert.strictEqual(kind('แนะนำรายวิชา'), 'video');
  assert.strictEqual(kind('เอกสารประกอบ บทที่ 1'), 'doc');
  assert.strictEqual(kind('Sheet : Movies Vocabulary'), 'doc');
  assert.strictEqual(kind('Movies Vocabulary'), '');
  assert.strictEqual(w.outlineItemKind({ name: 'Movies Vocabulary', href: '', iconKind: 'video' }), 'video');
  assert.strictEqual(w.seqIdFromHref('/courses/course-v1:TSU+X+Y/jump_to/block-v1%3ATSU%2BX%2BY%2Btype%40sequential%2Bblock%40q99'), 'q99');
  assert.strictEqual(w.courseCodeFromId('course-v1:Language_and_Communication+TSUGE00152+2026_T2'), 'TSUGE00152');
  assert.strictEqual(w.courseCodeFromId('course-v1:Life_skills_and_Personal_development+TSUGE000111+2024_T2'), 'TSUGE000111');
  const redirected = w.resolveTargetUrl(
    'https://apps.course.tsu.ac.th/learning/course/course-v1:Language_and_Communication+TSUGE00152+2026_T2/home',
    'TSUGE000111');
  assert.ok(redirected.includes('TSUGE000111'), redirected);
  assert.ok(redirected.includes('Life_skills_and_Personal_development'), redirected);
  assert.strictEqual(w.outlineItemKind({
    name: 'x', href: '/courses/course-v1:TSU+X+Y/jump_to_id/ex1'
  }, { rows: [{ name: 'แบบฝึก บทที่ 1', href: '/courses/course-v1:TSU+X+Y/jump_to_id/ex1' }] }), 'quiz');
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

test('outline parser: LMS block-tree + Thai names + mixed hrefs + type icons are not skipped', async () => {
  const browser = await playwright.chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent(`<ol id="course-outline-block-tree" class="block-tree accordion">
    <li class="outline-item section">
      <button class="section-name accordion-trigger">บทนำ<span class="sr-only">, Incomplete section</span></button>
      <ol>
        <li><svg data-prefix="far" data-icon="check-circle"></svg>
          <a href="/learning/course/course-v1:TSU+TSUGE000111+2026_T1/block-v1:TSU+TSUGE000111+2026_T1+type@sequential+block@pre">Pre Test</a>
          <span class="sr-only">, Incomplete</span></li>
      </ol>
    </li>
    <li class="outline-item section">
      <button class="section-name accordion-trigger">${CH1}</button>
      <ol>
        <li><svg data-icon="play" class="fa-play" style="color:#15376d"></svg>
          <a href="/learning/course/course-v1:TSU+TSUGE000111+2026_T1/block-v1:TSU+TSUGE000111+2026_T1+type@vertical+block@vid1">วิดีโอ บทที่ 1</a></li>
        <li><svg data-icon="file" class="fa-file" style="color:#15376d"></svg>
          <a href="/courses/course-v1:TSU+TSUGE000111+2026_T1/jump_to_id/doc1">เอกสารประกอบ บทที่ 1</a></li>
        <li><svg data-icon="pencil" class="fa-pencil" style="color:#15376d"></svg>
          <a href="/courses/course-v1:TSU+TSUGE000111+2026_T1/courseware/ch1/ex1/">แบบฝึก บทที่ 1</a></li>
        <li><svg data-prefix="far" data-icon="check-circle"></svg>
          <a href="/learning/course/course-v1:TSU+TSUGE000111+2026_T1/block-v1:TSU+TSUGE000111+2026_T1+type@sequential+block@q1">แบบทดสอบ บทที่ 1</a>
          <span class="sr-only">, ยังไม่เสร็จ</span></li>
        <li><svg data-prefix="fas" data-icon="check-circle" class="text-success"></svg>
          <a href="/courses/course-v1:TSU+TSUGE000111+2026_T1/jump_to/block-v1:TSU+TSUGE000111+2026_T1+type@sequential+block@post">แบบทดสอบหลังเรียน (Post-Test)</a>
          <span class="sr-only">, Completed</span></li>
        <li><svg data-icon="play" class="fa-play" style="color:#15376d"></svg>
          <svg data-prefix="fas" data-icon="check-circle"></svg>
          <a href="/learning/course/course-v1:TSU+TSUGE000111+2026_T1/block-v1:TSU+TSUGE000111+2026_T1+type@sequential+block@v3">video (3/10)</a></li>
      </ol>
    </li>
  </ol>`);
  const out = await page.evaluate(AutomationWorker.parseCourseOutline);
  await browser.close();
  assert.ok(out.rendered && out.items.length === 7, JSON.stringify(out.items.map(i => i.name)));
  assert.deepStrictEqual(out.items.map(i => [i.name, i.done]), [
    ['Pre Test', false],
    ['วิดีโอ บทที่ 1', false],
    ['เอกสารประกอบ บทที่ 1', false],
    ['แบบฝึก บทที่ 1', false],
    ['แบบทดสอบ บทที่ 1', false],
    ['แบบทดสอบหลังเรียน (Post-Test)', true],
    ['video (3/10)', true]
  ]);
});

test('already-checked video (3/10) is not replayed; sequential Next skips filled checks', () => {
  const r = part3Run;
  assert.strictEqual(r.status, 'completed', failMsg(r));
  const plays = r.srv.state.events.filter(e => e.type === 'video-play').map(e => e.unit);
  assert.ok(plays.includes('v4open'), `open video never played${failMsg(r)}`);
  assert.ok(plays.every(u => u === 'v4open'), `checked videos were replayed: ${plays}${failMsg(r)}`);
  assert.strictEqual(seqOpens(r, 'doneSolo'), 0, `Course tab reopened a filled-check video${failMsg(r)}`);
  assert.ok(seqOpens(r, 'part3') >= 1, failMsg(r));
  assert.ok(r.logs.some(l => l.includes('video (already watched)') && l.includes('ขึ้นติ๊กถูกแล้ว')), failMsg(r));
});

test('Course tab opens every unchecked แบบทดสอบหลังบทเรียน sibling; one visit is not max 3 passes', () => {
  const r = part3Run;
  const submits = r.srv.state.events.filter(e => e.type === 'submit');
  assert.deepStrictEqual([...new Set(submits.map(e => e.unit))].sort(),
    ['postQuiz', 'q1quiz', 'q2quiz', 'q5quiz', 'q6quiz', 'qpart'].sort(), failMsg(r));
  const q1subs = submits.filter(e => e.unit === 'q1quiz');
  assert.strictEqual(q1subs.length, 10, `chapter 1 must click+submit all 10, got ${q1subs.map(e => e.problem)}${failMsg(r)}`);
  assert.ok(q1subs.every(e => e.correct !== false), failMsg(r));
  ['q1', 'q2', 'q4', 'q5', 'q6', 'post'].forEach(s =>
    assert.ok(seqOpens(r, s) >= 1, `sibling ${s} was never opened${failMsg(r)}`));
  assert.ok(!r.srv.state.events.some(e => e.type === 'video-play' && e.unit === 'q1vid'), failMsg(r));
  assert.ok(!r.logs.some(l => l.includes('ข้ามทั้งแบบทดสอบ')), failMsg(r));
  assert.ok(!r.logs.some(l => l.includes('ข้อสอบทั้ง') && l.includes('ส่งครบแล้ว')), failMsg(r));
  const leftover = r.logs.filter(l => l.includes('ยังมี') && l.includes('ไม่ขึ้นติ๊ก'));
  leftover.forEach(l => assert.ok(!l.includes('ยังไม่ได้เปิดทำ'), l));
  const ch1 = r.logs.find(l => l.includes(CH1) && l.includes('แบบทดสอบหลังบทเรียน') && l.includes('เปิดทำแล้ว 1 ครั้ง'));
  if (ch1) assert.ok(!ch1.includes('ครบจำนวนรอบสูงสุด'), ch1);
  assert.ok(!r.logs.some(l => l.includes('poIntro') && l.includes('ค้าง')), failMsg(r));
});

test('in-unit sequence tab: video icon + fas check-circle (no text-success) counts as complete', async () => {
  const browser = await playwright.chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent(`<nav class="sequence-navigation" aria-label="Unit navigation">
    <ol><li><button class="btn nav-link sequence-navigation-tabs-nav-item active" aria-current="page" aria-label="video (3/10)">
      <span class="pgn__icon unit-icon"><svg data-prefix="fas" data-icon="video"></svg></span>
      <span class="pgn__icon"><svg data-prefix="fas" data-icon="check-circle"></svg></span>
    </button></li></ol>
  </nav>
  <h1 class="unit-title">video (3/10)</h1>`);
  const out = await page.evaluate(`(${AutomationWorker.unitCompletionProbe})(${AutomationWorker.problemDoneReason})`);
  await browser.close();
  assert.ok(out.hasNav && out.navDone, JSON.stringify(out));
});
