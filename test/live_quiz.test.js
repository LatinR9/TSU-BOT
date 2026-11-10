// Real AutomationWorker.handleQuiz on the live-layout fixtures (test/fixtures/live_*.html, built by
// build_live_fixtures.js from the 2026-11-10 TSUGE00152 screenshots). Expected values are the
// user-supplied answers, typed exactly (contractions with ’ in this course, see text_apostrophe).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const AutomationWorker = require('../worker');
const db = require('../db_manager');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
let browser;

before(async () => {
  const opts = { headless: true };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(opts);
});
after(async () => { if (browser) await browser.close(); });

async function runQuiz(html, { prepare } = {}) {
  const page = await browser.newPage();
  await page.setContent(html);
  if (prepare) await page.evaluate(prepare);
  const logs = [];
  const worker = new AutomationWorker('T', { courseCode: 'TSUGE00152', speedMode: 'turbo' }, (id, msg) => logs.push(msg));
  worker.page = page;
  worker.delays = { ...worker.delays, clickDelay: 0, randomJitter: 0 };
  await worker.handleQuiz(page.mainFrame());
  const submits = await page.evaluate(() => window.__submits);
  const values = await page.$$eval('.problems-wrapper', ws => ws.map(w => Array.from(w.querySelectorAll('select, input[type="text"]')).map(el => el.value)));
  await page.close();
  return { submits, values, logs, worker, msg: `\n--- worker log ---\n${logs.join('\n')}` };
}

const byBlock = submits => Object.fromEntries(submits.map(s => [s.block, s.values]));
const curly = s => s.replace(/'/g, '’');

test('U5C5 two-dropdown blocks: both blanks filled in order, then Submit', async () => {
  const r = await runQuiz(fixture('live_u5c5_third_conditional.html'));
  const got = byBlock(r.submits);
  assert.deepStrictEqual(Object.keys(got).length, 10, r.msg);
  assert.deepStrictEqual(got.b1, ['hadn’t been', 'wouldn’t have missed'], r.msg);
  assert.deepStrictEqual(got.b2, ['had studied', 'would have passed'], r.msg);
  assert.deepStrictEqual(got.b3, ['had arrived', 'would have seen'], r.msg);
  assert.deepStrictEqual(got.b4, ['had gone', 'wouldn’t have woken'], r.msg);
  assert.deepStrictEqual(got.b5, ['had become', 'would have recorded'], r.msg);
  assert.deepStrictEqual([6, 7, 8, 9, 10].map(n => got[`b${n}`][0]),
    ['would have become', 'had been', 'would have studied', 'hadn’t gone', 'hadn’t gone'], r.msg);
  assert.ok(!r.logs.some(l => /โจทย์ "(problem|Dropdown)"/.test(l)), `block title used as question${r.msg}`);
  assert.ok(r.logs.some(l => l.includes('[Unit 5 Chapter 5 #9, block-position')), `block 9 is bank #9${r.msg}`);
});

test('U4C4 Part 1 (1)/(2) dropdowns and Part 2 text blanks, repeated prompt by block position', async () => {
  const r = await runQuiz(fixture('live_u4c4_second_conditional.html'));
  const got = byBlock(r.submits);
  const want = [
    ["wouldn't go", 'paid'], ['had', 'would carry'], ["wouldn't break", 'packed'], ['sold', 'would buy'], ['would come', 'started'],
    ['changed', 'would save'], ["didn't click", "wouldn't cancel"], ['kept', "wouldn't forget"], ['were', 'would travel'], ['were', 'would travel'],
    ["weren't", 'would be'], ['were'], ['might get'], ['were', 'would go'], ['would look'], ['would have'], ['opened'], ["wouldn't get"],
    ['would feel', 'lost'], ["didn't watch"], ['went']
  ];
  want.forEach((w, i) => assert.deepStrictEqual(got[`b${i + 1}`], w.map(curly), `block ${i + 1}${r.msg}`));
});

test('U4C2 Multiple Choice: real prompt matched; Q6 answered with the user-supplied "refused", tagged unconfirmed', async () => {
  const r = await runQuiz(fixture('live_u4c2_nouns_from_verbs.html'));
  const got = byBlock(r.submits);
  assert.strictEqual(Object.keys(got).length, 15, r.msg);
  assert.deepStrictEqual(got.b6, ['choice_3'], `Q6 submits "refused"${r.msg}`);
  assert.ok(r.logs.some(l => l.includes('ข้อ 6:') && l.includes('เลือก "refused"') && l.includes('[user-supplied')), r.msg);
  assert.ok(!r.logs.some(l => l.includes('[no match]')), r.msg);
  assert.strictEqual(r.worker.leftovers.size, 0, r.msg);
});

test('U3C3 radio: Q9 "I\'d rather ___ here" picks the confirmed "to stay"', async () => {
  const page = await browser.newPage();
  await page.setContent(fixture('live_u3c3_gerund_infinitive.html'));
  const logs = [];
  const worker = new AutomationWorker('T', { courseCode: 'TSUGE00152', speedMode: 'turbo' }, (id, msg) => logs.push(msg));
  worker.page = page;
  worker.delays = { ...worker.delays, clickDelay: 0, randomJitter: 0 };
  await worker.handleQuiz(page.mainFrame());
  const picked = await page.$$eval('.problems-wrapper', ws => ws.map(w => {
    const c = w.querySelector('input[type="radio"]:checked');
    return c ? w.querySelector(`label[for="${c.id}"]`).textContent.trim() : null;
  }));
  const submits = await page.evaluate(() => window.__submits);
  await page.close();
  const msg = `\n--- worker log ---\n${logs.join('\n')}`;
  assert.deepStrictEqual(picked, ['seeing', 'to stay', 'to be'], msg);
  assert.strictEqual(submits.length, 3, msg);
  assert.ok(!logs.some(l => l.includes('[no match]')), msg);
});

test('U4C2 picks the user answers per block (radio)', async () => {
  const page = await browser.newPage();
  await page.setContent(fixture('live_u4c2_nouns_from_verbs.html'));
  const worker = new AutomationWorker('T', { courseCode: 'TSUGE00152', speedMode: 'turbo' }, () => {});
  worker.page = page;
  worker.delays = { ...worker.delays, clickDelay: 0, randomJitter: 0 };
  await worker.handleQuiz(page.mainFrame());
  const picked = await page.$$eval('.problems-wrapper', ws => ws.map(w => {
    const c = w.querySelector('input[type="radio"]:checked');
    return c ? w.querySelector(`label[for="${c.id}"]`).textContent.trim() : null;
  }));
  await page.close();
  assert.deepStrictEqual(picked.slice(0, 10),
    ['intention', 'delivery', 'omission', 'liar', 'refusal', 'refused', 'appointment', 'decision', 'choice', 'dismissal']);
  assert.deepStrictEqual(picked.slice(10), ['Monkeys peel bananas very easily.',
    'The maid had to vacuum the house twice to clean the house thoroughly.', 'I will present her with a board game on her birthday.',
    'The biological park was close to the venue.', 'The thief wanted to steal the plant.']);
});

test('U5C3 / U5C4 blocks titled "problem": answered by block position, not one fuzzy entry', async () => {
  const a = await runQuiz(fixture('live_u5c3_a_an.html'));
  assert.deepStrictEqual(a.submits.map(s => s.values[0]),
    ['an', 'a', 'a', 'an', 'a', 'a', 'a', 'a', 'a', 'an', 'a', 'an', 'an', 'a', 'an', 'a', 'a', 'a', 'an', 'an'], a.msg);
  const b = await runQuiz(fixture('live_u5c4_articles.html'));
  assert.deepStrictEqual(b.submits.map(s => s.values[0]), ['the', 'the', '-', 'the', '-', '-', 'the', 'the', '-', 'the'], b.msg);
});

test('U2C2 question tags: the box holds exactly the intended string (’ contractions), inferred Q2 logged', async () => {
  const r = await runQuiz(fixture('live_u2c2_question_tags.html'));
  const want = ["isn't she?", "aren't we", 'is he', "wasn't I", "wasn't he", "haven't you", "wouldn't you", "Don't you", 'will she', 'can she',
    "won't he", 'does she', 'am I', 'have you', 'could he', 'shall we', "aren't they", "isn't it", 'does she', "aren't you", "don't I",
    "haven't you", 'do you', "aren't they", "don't we"].map(curly);
  assert.deepStrictEqual(r.values.map(v => v[0]), want, r.msg);
  assert.deepStrictEqual(r.submits.map(s => s.values[0]), want, r.msg);
  assert.ok(r.values.flat().every(v => !v.includes("'")), 'no straight apostrophe typed');
  assert.ok(r.logs.some(l => l.includes('ข้อ 2:') && l.includes('[inferred')), `inferred answer is tagged in the log${r.msg}`);
});

test('typing keeps the exact characters (straight apostrophe where the section asks for it)', async () => {
  const page = await browser.newPage();
  await page.setContent('<input type="text" id="t">');
  const worker = new AutomationWorker('T', { courseCode: 'TSUGE00152' }, () => {});
  const el = await page.$('#t');
  for (const v of ["she didn't speak Italian.", 'isn’t she?', 'ทดสอบ “ข้อความ”']) {
    assert.strictEqual(await worker.typeText(el, v), true);
    assert.strictEqual(await el.inputValue(), v);
  }
  await page.close();
  const d = db.decideResponse({ courseCode: 'TSUGE00152', section: 'Unit 4 Chapter 3', texts: ['"I don\'t speak Italian," she said.'], textInputCount: 1 });
  assert.deepStrictEqual(d.values, ["she didn't speak Italian."]);
  const d2 = db.decideResponse({ courseCode: 'TSUGE00152', section: 'Unit 1 Chapter 5', texts: ['I _______ give you a lift to the station. My car broke down yesterday.'], textInputCount: 1 });
  assert.deepStrictEqual(d2.values, ['can’t']);
});

test('a block is submitted only after every one of its dropdowns is set', async () => {
  // Second select of block 1 lacks the bank answer: the block must stay unsubmitted and be listed.
  const r = await runQuiz(fixture('live_u5c5_third_conditional.html'), {
    prepare: () => { const s = document.querySelectorAll('#problem_b1 select')[1]; s.querySelector('option[value="wouldn’t have missed"]').remove(); }
  });
  const got = byBlock(r.submits);
  assert.strictEqual(got.b1, undefined, r.msg);
  assert.strictEqual(Object.keys(got).length, 9, r.msg);
  assert.ok(r.logs.some(l => l.includes('blank 2') && l.includes('wouldn')), r.msg);
});
