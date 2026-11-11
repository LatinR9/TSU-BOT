// problemDoneReason must not treat Open edX problem-progress WEIGHT ("0/1" / "1/1 point")
// as a prior submit. That was skipping TSUGE000111 chapter quizzes that the Course tab
// still showed as unchecked.
const { test } = require('node:test');
const assert = require('node:assert');
const playwright = require('playwright');
const AutomationWorker = require('../worker');

const launchOpts = { headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) };

function block(id, { progress, status, disabled } = {}) {
  const st = status || 'unanswered';
  const prog = progress || '1/1 point (graded)';
  const dis = disabled ? 'disabled' : '';
  return `<div class="problems-wrapper" id="problem_${id}">
    <h3 class="problem-header">ข้อที่ ${id}</h3>
    <div class="problem-progress">${prog}</div>
    <div class="problem">
      <fieldset><legend>โจทย์ ${id}</legend>
        <input type="radio" name="q${id}" id="q${id}a" ${dis}>
        <label for="q${id}a">ก</label>
        <input type="radio" name="q${id}" id="q${id}b" ${dis}>
        <label for="q${id}b">ข</label>
      </fieldset>
      <div class="indicator-container"><span class="status ${st}"></span></div>
      <div class="submission-feedback">You have used 0 of 1 attempt</div>
    </div>
  </div>`;
}

async function reasons(html) {
  const browser = await playwright.chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent(`<html><body>${html}</body></html>`);
  const out = await page.evaluate(`(() => {
    const fn = ${AutomationWorker.problemDoneReason};
    return Array.from(document.querySelectorAll('.problems-wrapper')).map(el => fn(el));
  })()`);
  await browser.close();
  return out;
}

test('unanswered 1/1 and 0/1 point (graded) are still open', async () => {
  const out = await reasons(Array.from({ length: 10 }, (_, i) =>
    block(i + 1, { progress: i % 2 ? '0/1 point (graded)' : '1/1 point (graded)' })).join(''));
  assert.strictEqual(out.length, 10);
  assert.ok(out.every(r => r === ''), JSON.stringify(out));
});

test('grader status / used attempts count as submitted; do not resubmit', async () => {
  const html = block(1, { status: 'correct', progress: '1/1 point (graded)' })
    + block(2, { status: 'incorrect', progress: '0/1 point (graded)' })
    + `<div class="problems-wrapper" id="problem_3">
        <div class="problem-progress">0/1 point (graded)</div>
        <div class="problem"><input type="radio" name="q3">
          <div class="submission-feedback">You have used 1 of 1 attempt</div>
        </div></div>`;
  const out = await reasons(html);
  assert.ok(out[0], out[0]);
  assert.ok(out[1], out[1]);
  assert.ok(out[2], out[2]);
});
