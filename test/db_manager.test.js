const { test } = require('node:test');
const assert = require('node:assert');
const db = require('../db_manager');

test('normalization: NBSP, zero-width, entities, curly quotes, decomposed SARA AM', () => {
  assert.strictEqual(db.looseKey('สีประจำ\u200bมหาวิทยาลัย&nbsp;ทักษิณ'), db.looseKey('สีประจำมหาวิทยาลัยทักษิณ'));
  assert.strictEqual(db.looseKey('ประจ\u0e4d\u0e32'), db.looseKey('ประจำ'));
  assert.strictEqual(db.normalizeText('I don’t  know…'), "i don't know...");
});

test('matchChoice never matches an empty label (root cause of "always first choice")', () => {
  assert.strictEqual(db.matchChoice(['', 'star', 'sequel'], 'sequel').index, 2);
  assert.strictEqual(db.matchChoice(['', ''], 'sequel'), null);
  assert.strictEqual(db.matchChoice(['animated', 'star'], 'sequel'), null);
});

test('matchChoice prefers exact over substring and skips known wrong answers', () => {
  assert.strictEqual(db.matchChoice(["can't", 'can', 'could'], 'can').index, 1);
  assert.strictEqual(db.matchChoice(['ฟ้า-ขาว', 'เทา–ฟ้า'], 'เทา-ฟ้า').index, 1);
  assert.strictEqual(db.matchChoice(['การรู้เท่าทันสื่อและสารสนเทศ', 'ถูกทุกข้อ'], 'การรู้เท่าทันสื่อและข้อมูลสารสนเทศ').index, 0);
});

test('courseUrl returns the stored TSUGE000111 learning MFE URL', () => {
  const url = db.courseUrl('TSUGE000111');
  assert.ok(url.includes('TSUGE000111'), url);
  assert.ok(url.includes('Life_skills_and_Personal_development'), url);
  assert.strictEqual(db.courseUrl('NO-SUCH-COURSE'), '');
});

test('resolveSection understands Thai and English section names', () => {
  assert.strictEqual(db.resolveSection('TSUGE000271', 'แบบทดสอบ บทที่ 2 | Course'), 'แบบทดสอบ : บทที่ 2');
  assert.strictEqual(db.resolveSection('TSUGE00152', 'Unit 3: Chapter 1.1 Food'), 'Unit 3 Chapter 1.1');
  assert.strictEqual(db.resolveSection('TSUGE00152', 'Unit 5 Chapter 1 #2'), 'Unit 5 Chapter 1 #2');
  assert.strictEqual(db.resolveSection('TSUGE000111', 'แบบทดสอบหลังเรียน'), 'แบบทดสอบหลังเรียน (Post-Test)');
  assert.ok(db.courseUrl('TSUGE000111').includes('Life_skills_and_Personal_development+TSUGE000111+2024_T2'));
});

test('near-identical Thai stems resolve to their own entry', () => {
  const d = db.decideResponse({
    courseCode: 'TSUGE000271',
    texts: ['ข้อใดถือเป็นการใช้ประโยชน์จากโอกาสที่เกิดขึ้นของผู้ประกอบการ'],
    choices: ['ถูกทุกข้อ', 'การนำเสนอสินค้าและบริการใหม่', 'การหาตลาดใหม่'],
    section: 'แบบทดสอบ : บทที่ 2'
  });
  assert.strictEqual(d.action, 'choice');
  assert.strictEqual(d.choiceText, 'การนำเสนอสินค้าและบริการใหม่');
});

test('unconfirmed chapter item never borrows a known-wrong answer from the Post-Test copy', () => {
  const d = db.decideResponse({
    courseCode: 'TSUGE000271',
    texts: ['เจนกำลังสร้าง Persona หรือตัวอย่างของคนที่อาจจะเป็นลูกค้ามีทั้งอายุ เพศ และอาชีพ เจนกำลังอยู่ในขั้นตอนใดของ Design Thinking'],
    choices: ['Empathize เพราะเจนกำลังทำความเข้าใจลูกค้า', 'Define เพราะเจนกำลังหาว่าลูกค้ามีปัญหาอะไร', 'Ideate เพราะเจนกำลังระดมความคิด'],
    section: 'แบบทดสอบ : บทที่ 5'
  });
  assert.notStrictEqual(d.choiceText, 'Empathize เพราะเจนกำลังทำความเข้าใจลูกค้า');
});

test('no match is reported instead of defaulting to a choice', () => {
  const d = db.decideResponse({ courseCode: 'TSUGE000111', texts: ['คำถามที่ไม่มีในฐาน'], choices: ['ก', 'ข'] });
  assert.strictEqual(d.action, 'skip');
});

test('TSUGE000111 chapter 1,2,4,5,6 have confirmed answers; Post-Test reuses those stems', () => {
  const pick = (section, question, choices, want) => {
    const d = db.decideResponse({ courseCode: 'TSUGE000111', section, texts: [question], choices });
    assert.strictEqual(d.action, 'choice', `${section}: ${question} → ${d.reason || d.action}`);
    assert.strictEqual(d.choiceText, want, `${section}: ${question}`);
    assert.strictEqual(d.match && d.match.status, 'confirmed', `${section}: ${question} status`);
  };
  pick('บทที่ 1 อัตลักษณ์มหาวิทยาลัยทักษิณ', 'เดิมมหาวิทยาลัยทักษิณมีชื่อว่าอะไร',
    ['วิทยาลัยวิชาการศึกษาสงขลา', 'มหาวิทยาลัยศรีนครินทรวิโรฒ วิทยาเขตภาคใต้', 'ถูกทุกข้อ'], 'ถูกทุกข้อ');
  pick('บทที่ 2 ความเป็นพลเมือง', 'ข้อใดคือความเคารพและดูแลรักษาสาธารณสมบัติ',
    ['ไม่ทำความเสียหายต่อสถานที่ราชการ โบราณสถาน', 'อื่น ๆ'], 'ไม่ทำความเสียหายต่อสถานที่ราชการ โบราณสถาน');
  pick('บทที่ 4 ทักษะการสื่อสาร', 'กระบวนการสื่อสารที่มีประสิทธิภาพ ใช้โมเดลฯ ในข้อใด',
    ['SMCR', 'SMCR+F'], 'SMCR+F');
  pick('บทที่ 5 บุคลิกภาพและความเป็นผู้นำ', 'ข้อใดกล่าวถูกต้องเกี่ยวกับผู้นำแบบมุ่งคน (Consideration Leadership)',
    ['มีลักษณะของการดูแลเอาใจใส่ดูแลทุกข์สุขและสร้างความสัมพันธ์อันดีกับผู้ปฏิบัติงาน', 'อื่น ๆ'],
    'มีลักษณะของการดูแลเอาใจใส่ดูแลทุกข์สุขและสร้างความสัมพันธ์อันดีกับผู้ปฏิบัติงาน');
  pick('บทที่ 6 Design Thinking และ Appreciative Inquiry', 'ข้อใดคือ Design Thinking สำหรับการสร้างอัตลักษณ์ให้กับองค์กร',
    ['ถูกทุกข้อ', 'อื่น ๆ'], 'ถูกทุกข้อ');
  const course = db.courses.find(c => c.course_code === 'TSUGE000111');
  const counts = Object.fromEntries(course.sections.map(s => [s.section, (s.questions || []).length]));
  assert.strictEqual(counts['บทที่ 1 อัตลักษณ์มหาวิทยาลัยทักษิณ'], 10);
  assert.strictEqual(counts['บทที่ 2 ความเป็นพลเมือง'], 10);
  assert.strictEqual(counts['บทที่ 3 ทักษะในศตวรรษที่ 21'], 10);
  assert.strictEqual(counts['บทที่ 4 ทักษะการสื่อสาร'], 10);
  assert.strictEqual(counts['บทที่ 5 บุคลิกภาพและความเป็นผู้นำ'], 10);
  assert.strictEqual(counts['บทที่ 6 Design Thinking และ Appreciative Inquiry'], 10);
  assert.strictEqual(counts['แบบทดสอบหลังเรียน (Post-Test)'], 0);
  const post = db.decideResponse({
    courseCode: 'TSUGE000111',
    section: db.resolveSection('TSUGE000111', 'Post Test | แบบทดสอบความรู้หลังเรียน (Post-Test)'),
    texts: ['สีประจำมหาวิทยาลัยทักษิณคือสีอะไร'],
    choices: ['ฟ้า-ขาว', 'แดง-เหลือง', 'เทา–ฟ้า']
  });
  assert.strictEqual(post.action, 'choice');
  assert.strictEqual(post.choiceText, 'เทา–ฟ้า');
});

test('inferred entries are answered and flagged; a known-wrong option is never picked', () => {
  const tsu = 'TSUGE00152';
  const meat = db.decideResponse({ courseCode: tsu, section: 'Unit 3 Chapter 1.1', choices: ['tuna', 'crab', 'oysters', 'beef'],
    texts: ['Ann rarely eats red meat these days; just some _____ from time to time.'] });
  assert.strictEqual(meat.choiceText, 'beef');
  assert.strictEqual(meat.inferred, true);
  const visit = db.decideResponse({ courseCode: tsu, section: 'Unit 2 Chapter 3', choices: ['can', "don't have to", 'should', 'must'], texts: ['You ______ visit them.'] });
  assert.strictEqual(visit.choiceText, 'should');
});

test('user-supplied and newly confirmed answers are picked from the live options', () => {
  const tsu = 'TSUGE00152';
  const produce = db.decideResponse({ courseCode: tsu, section: 'Unit 4 Chapter 2', choices: ['producter', 'producement', 'produceion', 'refused'],
    texts: ['6. Which noun formed from the verb produce, can be used to fill in the blank? “As a result, the cotton ____ went up.”'] });
  assert.strictEqual(produce.choiceText, 'refused');
  const p = db.decideProblem({ courseCode: tsu, section: 'Unit 4 Chapter 2', slots: [{ kind: 'choice', choices: ['producter', 'producement', 'produceion', 'refused'] }],
    texts: ['6. Which noun formed from the verb produce, can be used to fill in the blank? “As a result, the cotton ____ went up.”'] });
  assert.deepStrictEqual([p.action, p.userSupplied, p.inferred, p.match.status], ['fill', true, false, 'user_supplied']);
  for (const section of ['Unit 3 Chapter 3', '']) {
    const rather = db.decideResponse({ courseCode: tsu, section, choices: ['staying', 'to stay', 'stay'], texts: ["I'd rather _______ here if you don't mind."] });
    assert.strictEqual(rather.choiceText, 'to stay', section);
  }
  const r = db.decideProblem({ courseCode: tsu, section: 'Unit 3 Chapter 3', slots: [{ kind: 'choice', choices: ['staying', 'to stay', 'stay'] }], texts: ["9. I'd rather _______ here if you don't mind."] });
  assert.strictEqual(r.match.status, 'confirmed');
});

test('block titles and short generic text never fuzzy-match a bank entry', () => {
  for (const t of ['problem', 'Dropdown', 'Multiple Choice', 'Directions: 1. Complete this shopping list with a/an.']) {
    const d = db.decideProblem({ courseCode: 'TSUGE00152', section: 'Unit 5 Chapter 3', texts: [t], slots: [{ kind: 'text' }], problemIndex: 0, problemCount: 7 });
    assert.strictEqual(d.action, 'skip', t);
  }
  // Same texts with the page's block count equal to the bank section: block N is bank question N.
  const d = db.decideProblem({ courseCode: 'TSUGE00152', section: 'Unit 5 Chapter 3', texts: ['problem'], slots: [{ kind: 'text' }], problemIndex: 9, problemCount: 20 });
  assert.deepStrictEqual([d.action, d.answer, d.match.method], ['fill', 'an', 'block-position']);
});

test('multi-blank answers map to slots in order; dropdown options match across apostrophe styles', () => {
  const d = db.decideProblem({ courseCode: 'TSUGE00152', section: 'Unit 4 Chapter 4',
    texts: ['1. They __(1)__ (not/go) back home if you __(2)__ (pay) them.'],
    slots: [{ kind: 'select', choices: ['won’t go', 'wouldn’t go'] }, { kind: 'select', choices: ['pay', 'paid'] }] });
  assert.deepStrictEqual(d.fills.map(f => f.choiceText), ['wouldn’t go', 'paid']);
  const t = db.decideProblem({ courseCode: 'TSUGE00152', section: 'Unit 4 Chapter 4',
    texts: ['14. If the weather ________ better, we ________ to the park.'], slots: [{ kind: 'text' }, { kind: 'text' }] });
  assert.deepStrictEqual(t.fills.map(f => f.value), ['were', 'would go']);
  const one = db.decideProblem({ courseCode: 'TSUGE00152', section: 'Unit 4 Chapter 4',
    texts: ['1. They __(1)__ (not/go) back home if you __(2)__ (pay) them.'], slots: [{ kind: 'select', choices: ['wouldn’t go', 'paid'] }] });
  assert.strictEqual(one.action, 'skip', 'a two-part answer is never forced into one slot');
});
