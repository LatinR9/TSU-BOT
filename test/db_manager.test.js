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

test('resolveSection understands Thai and English section names', () => {
  assert.strictEqual(db.resolveSection('TSUGE000271', 'แบบทดสอบ บทที่ 2 | Course'), 'แบบทดสอบ : บทที่ 2');
  assert.strictEqual(db.resolveSection('TSUGE00152', 'Unit 3: Chapter 1.1 Food'), 'Unit 3 Chapter 1.1');
  assert.strictEqual(db.resolveSection('TSUGE00152', 'Unit 5 Chapter 1 #2'), 'Unit 5 Chapter 1 #2');
  assert.strictEqual(db.resolveSection('TSUGE000111', 'แบบทดสอบหลังเรียน'), 'แบบทดสอบหลังเรียน (Post-Test)');
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
