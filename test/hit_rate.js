#!/usr/bin/env node
// Answer-bank hit rate: simulate every bank question as it would appear on a quiz page
// (question block text + shuffled choices, with and without HTML/Thai text noise) and
// check whether the bot would pick the bank's correct answer.
//
//   node test/hit_rate.js                 # current code
//   node test/hit_rate.js --legacy main   # also run the pre-fix logic from a git ref, for comparison
//   node test/hit_rate.js --min 0.98      # exit 1 if the confirmed-stem hit rate is below the threshold
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const db = require(path.join(ROOT, 'db_manager'));
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsu_answers.json'), 'utf-8').replace(/^\uFEFF/, ''));

// ---------- simulated page variants ----------
const ZW = '\u200b', NB = '\u00a0';
function noisy(s) {
  return String(s)
    .replace(/'/g, '’').replace(/"([^"]*)"/g, '“$1”')
    .replace(/\.{3,}/g, '_______').replace(/…/g, '_______')
    .replace(/ /g, (m, i) => (i % 3 === 0 ? NB : i % 3 === 1 ? '  ' : ' '))
    .replace(/ำ/g, '\u0e4d\u0e32')
    .replace(/(ข้อใด|ประจำ|การ)/g, `$1${ZW}`)
    .replace(/-/g, '–') + ' ';
}
function parseOptions(notes) {
  const out = [];
  const re = /(?:Untried options|Options seen|Remaining untried|Other options seen)\s*:\s*([^.]+)/gi;
  let m;
  while ((m = re.exec(notes || '')) !== null) out.push(...m[1].split(';').map(s => s.trim()).filter(Boolean));
  return out;
}

function buildCases() {
  const cases = [];
  for (const course of bank.courses) {
    for (const section of course.sections) {
      const sectionAnswers = section.questions.map(q => q.correct_answer).filter(Boolean);
      section.questions.forEach((q, qIdx) => {
        const positional = /not captured/i.test(q.question);
        const kind = q.status !== 'confirmed' || !q.correct_answer ? 'unconfirmed' : positional ? 'positional' : 'stem';
        let choices = [];
        if (q.answer_type !== 'text') {
          const set = [];
          const add = (c) => { if (c && !set.some(x => db.looseKey(x) === db.looseKey(c))) set.push(c); };
          if (q.correct_answer) add(q.correct_answer);
          (q.known_wrong_answers || []).forEach(add);
          parseOptions(q.notes).forEach(add);
          for (const a of sectionAnswers) { if (set.length >= 4) break; add(a); }
          ['None of the above', 'ไม่มีข้อใดถูก'].forEach(c => { if (set.length < 3) add(c); });
          // Never put the correct answer first, so a "first choice" bug is always visible.
          const correct = set.shift();
          choices = set.slice();
          if (correct) choices.splice(1 + (qIdx % choices.length), 0, correct);
        }
        // Stem we can show on the page: bank text, or an unrelated sentence for "not captured" items.
        const stem = positional ? `Item ${qIdx + 1}: Look at the picture and complete the sentence ______.` : q.question;
        cases.push({ course: course.course_code, section: section.section, qIdx, q, kind, stem, choices });
      });
    }
  }
  return cases;
}

// Course text edited slightly since the bank was built: one character dropped, numbering added.
function typo(s) {
  const chars = Array.from(s);
  if (chars.length > 12) chars.splice(Math.floor(chars.length * 0.6), 1);
  return `1) ${chars.join('')}`;
}

function pageView(c, variant) {
  const stem = variant === 'noisy' ? noisy(c.stem) : variant === 'typo' ? typo(c.stem) : c.stem;
  const choices = variant === 'noisy' ? c.choices.map(x => `${x.replace(/-/g, '–')}${NB}`) : c.choices.slice();
  const blockLines = [`Question ${c.qIdx + 1}`, '1 point possible (graded)', stem, ...choices, 'Submit'];
  return {
    stem, choices, blockLines,
    context: variant === 'nosection' ? '' : `${c.section} | ${c.course}`,
    textInputCount: c.q.answer_type === 'text' ? 1 : 0
  };
}

// ---------- current pipeline (same inputs worker.js feeds to db_manager) ----------
const BOILERPLATE = /^(?:question\s*\d+|ข้อ(?:ที่)?\s*\d+|submit|graded|\(?\d+(?:\.\d+)?\s*(?:\/\s*\d+(?:\.\d+)?\s*)?points?.*|.*\bpoints? possible\b.*)$/i;
function runCurrent(c, v) {
  const clean = s => s.replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  const texts = [];
  const push = t => { t = clean(t); if (t.length > 1 && !BOILERPLATE.test(t) && !texts.includes(t)) texts.push(t); };
  push(v.stem);
  const lines = v.blockLines.map(clean).filter(l => l && !v.choices.map(clean).includes(l) && !BOILERPLATE.test(l));
  lines.forEach(push);
  if (lines.length > 1) push(lines.join(' '));
  const section = db.resolveSection(c.course, v.context);
  const d = db.decideResponse({
    courseCode: c.course, texts, choices: v.choices.map(clean), textInputCount: v.textInputCount, section, index: c.qIdx
  });
  if (d.action === 'choice') return { kind: 'choice', value: c.choices[d.index] };
  if (d.action === 'text') return { kind: 'text', value: d.values[0] };
  return { kind: 'skip' };
}

// ---------- legacy pipeline (pre-fix worker.js handleQuiz logic, verbatim where it matters) ----------
function loadLegacy(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsubot-legacy-'));
  fs.writeFileSync(path.join(dir, 'db_manager.js'), execSync(`git show ${ref}:db_manager.js`, { cwd: ROOT }));
  for (const f of ['tsu_answers.json', 'tsu_missing.json']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  return require(path.join(dir, 'db_manager.js'));
}
function runLegacy(legacyDb, c, v) {
  const fullText = v.blockLines.join('\n');
  let sectionHint = '';
  const sec = (fullText.match(/(?:Unit\s*\d+[\s:]*Chapter\s*\d+|Chapter\s*\d+|Unit\s*\d+)/i) || v.context.match(/(?:Unit\s*\d+[\s:]*Chapter\s*\d+|Chapter\s*\d+|Unit\s*\d+)/i));
  if (sec) sectionHint = sec[0].replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const boiler = /^(?:text input|multiple choice|dropdown|checkbox|explanation|review|show answer|submit|\d+\s*point.*possible|graded|unit\s*\d+|chapter\s*\d+|passive voice|part\s*\d+.*complete)/i;
  const candidateLines = lines.filter(l => !boiler.test(l) && l.length > 3);
  const sentenceLine = lines.find(l => /\([a-zA-Z\s]+\)/.test(l) || /\.{3,}|_{3,}/.test(l)) || candidateLines[0] || fullText;
  const qi = c.qIdx;
  let ans = legacyDb.findAnswer(c.course, sentenceLine, sectionHint, qi);
  if (!ans || ans.status !== 'confirmed') {
    for (const l of candidateLines) {
      const a = legacyDb.findAnswer(c.course, l, sectionHint, qi);
      if (a && a.status === 'confirmed') { ans = a; break; }
    }
  }
  if (!ans || ans.status !== 'confirmed') ans = legacyDb.findAnswer(c.course, fullText, sectionHint, qi);
  if (ans && ans.status === 'confirmed' && ans.correct_answer) {
    const target = ans.correct_answer.trim();
    if (v.textInputCount > 0) return { kind: 'text', value: target };
    // Old selector 'label, .choice, input[type=radio], ..., fieldset div' in document order:
    // div.field (label text), input (empty innerText), label.
    const elements = [];
    v.choices.forEach((t, i) => { elements.push({ i, text: t }, { i, text: '' }, { i, text: t }); });
    for (const el of elements) {
      const lt = el.text.trim().toLowerCase();
      if (lt.includes(target.toLowerCase()) || target.toLowerCase().includes(lt)) return { kind: 'choice', value: c.choices[el.i] };
    }
  }
  return { kind: 'skip' };
}

// ---------- scoring ----------
function judge(c, out) {
  const lk = db.looseKey;
  if (c.kind === 'unconfirmed') {
    const wrong = (c.q.known_wrong_answers || []).map(lk);
    if (out.kind === 'skip') return 'skip';
    return wrong.includes(lk(out.value)) ? 'wrong' : 'answered';
  }
  if (out.kind === 'skip') return 'skip';
  return lk(out.value) === lk(c.q.correct_answer) ? 'correct' : 'wrong';
}

function evaluate(name, runner, cases) {
  const variants = ['clean', 'noisy', 'typo', 'nosection'];
  const table = {};
  const failures = [];
  for (const variant of variants) {
    for (const c of cases) {
      const res = judge(c, runner(c, pageView(c, variant)));
      const k = `${c.kind}|${variant}`;
      table[k] = table[k] || { total: 0, correct: 0, wrong: 0, skip: 0, answered: 0 };
      table[k].total++; table[k][res]++;
      if (name === 'current' && c.kind === 'stem' && res !== 'correct') {
        failures.push(`${variant} ${res} ${c.course} | ${c.section} #${c.qIdx + 1} | ${c.q.question.slice(0, 70)} => ${c.q.correct_answer}`);
      }
    }
  }
  return { table, failures };
}

function pct(n, d) { return d ? `${(100 * n / d).toFixed(1)}%` : '-'; }

function printTable(name, table) {
  console.log(`\n## ${name}`);
  console.log('| bank items | page variant | total | correct | wrong | skipped |');
  console.log('|---|---|---|---|---|---|');
  for (const kind of ['stem', 'positional', 'unconfirmed']) {
    for (const variant of ['clean', 'noisy', 'typo', 'nosection']) {
      const r = table[`${kind}|${variant}`];
      if (!r) continue;
      const correct = kind === 'unconfirmed' ? `${r.answered} answered (not known-wrong)` : `${r.correct} (${pct(r.correct, r.total)})`;
      console.log(`| ${kind} | ${variant} | ${r.total} | ${correct} | ${r.wrong} (${pct(r.wrong, r.total)}) | ${r.skip} (${pct(r.skip, r.total)}) |`);
    }
  }
}

const cases = buildCases();
const counts = cases.reduce((m, c) => (m[c.kind] = (m[c.kind] || 0) + 1, m), {});
console.log(`Bank: ${cases.length} questions (${counts.stem || 0} confirmed with question text, ${counts.positional || 0} confirmed "not captured"/listed-order, ${counts.unconfirmed || 0} unconfirmed)`);

const cur = evaluate('current', runCurrent, cases);
printTable('current', cur.table);
if (cur.failures.length) {
  console.log('\nConfirmed items with question text that were not answered correctly (current):');
  cur.failures.forEach(f => console.log('  ' + f));
}

const legacyRef = argVal('--legacy');
if (legacyRef) {
  const legacyDb = loadLegacy(legacyRef);
  const leg = evaluate('legacy', (c, v) => runLegacy(legacyDb, c, v), cases);
  printTable(`legacy (${legacyRef})`, leg.table);
}

const min = argVal('--min');
if (min) {
  const r = cur.table['stem|clean'];
  const rate = r.correct / r.total;
  if (rate < parseFloat(min)) { console.error(`\nFAIL: stem/clean hit rate ${pct(r.correct, r.total)} < ${min}`); process.exit(1); }
}
