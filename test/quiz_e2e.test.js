// End-to-end: run the real AutomationWorker.handleQuiz against Open edX-style quiz HTML in Chromium.
// Run: node --test test/   (uses CHROME_PATH or Playwright's bundled Chromium)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const AutomationWorker = require('../worker');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
let browser;

before(async () => {
  const opts = { headless: true };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  browser = await chromium.launch(opts);
});
after(async () => { if (browser) await browser.close(); });

async function runQuiz(courseCode, html, { inIframe = false } = {}) {
  const page = await browser.newPage();
  if (inIframe) {
    // Learning MFE shell: course outline sidebar (mentions the pre-test) + unit iframe.
    const shell = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Course | TSU</title></head><body>
      <nav class="course-outline"><ul><li>แบบทดสอบก่อนเรียน (Pre-Test)</li><li>Unit 1 Chapter 1</li></ul></nav>
      <iframe id="unit-iframe" style="width:900px;height:1200px"></iframe></body></html>`;
    await page.setContent(shell);
    await page.$eval('#unit-iframe', (f, srcdoc) => new Promise(res => { f.onload = res; f.srcdoc = srcdoc; }), html);
  } else {
    await page.setContent(html);
  }
  const logs = [];
  const worker = new AutomationWorker('T', { courseCode, speedMode: 'turbo' }, (id, msg) => logs.push(msg));
  worker.page = page;
  worker.delays = { ...worker.delays, clickDelay: 0, randomJitter: 0 };
  await worker.handleQuiz(page.mainFrame());
  const frame = inIframe ? page.frames().find(f => f !== page.mainFrame()) : page.mainFrame();
  const checked = await frame.$$eval('input[type="radio"]:checked', els => els.map(e => e.id));
  const submitted = await frame.evaluate(() => window.__submitted || 0);
  await page.close();
  return { checked, submitted, logs };
}

test('English capa quiz: picks the bank answer, not the first choice', async () => {
  const { checked, submitted, logs } = await runQuiz('TSUGE00152', fixture('edx_quiz_en.html'));
  assert.deepStrictEqual(checked, ['input_q1_2_1_choice_2', 'input_q2_2_1_choice_2'], logs.join('\n'));
  assert.strictEqual(submitted, 2);
  assert.ok(logs.some(l => l.includes('"sequel"')), 'logs the chosen answer');
});

test('Thai quiz with NBSP / zero-width / dash variants inside the unit iframe', async () => {
  const { checked, submitted, logs } = await runQuiz('TSUGE000111', fixture('edx_quiz_th.html'), { inIframe: true });
  assert.deepStrictEqual(checked, ['input_t1_choice_2', 'input_t2_choice_1'], logs.join('\n'));
  assert.strictEqual(submitted, 2, 'question without a bank match is not submitted');
  assert.ok(!logs.some(l => l.includes('[Pre-test]')), 'sidebar mention of the pre-test does not switch to random mode');
  assert.ok(logs.some(l => l.includes('[no match]')), 'unknown question is reported as no match');
});
