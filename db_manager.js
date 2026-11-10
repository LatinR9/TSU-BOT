// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\db_manager.js
const fs = require('fs');
const path = require('path');

const MAIN_DB_PATH = path.join(__dirname, 'tsu_answers.json');
const CUSTOM_DB_PATH = path.join(__dirname, 'custom_courses.json');
const MISSING_DB_PATH = path.join(__dirname, 'tsu_missing.json');

// ---------------------------------------------------------------------------
// Text normalization (Thai + English, HTML entities, invisible characters)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', shy: ''
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    const v = NAMED_ENTITIES[e.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

function normalizeText(s) {
  if (s === null || s === undefined) return '';
  let t = decodeEntities(String(s)).normalize('NFC');
  t = t.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '');
  // Thai SARA AM is often typed as NIKHAHIT + SARA AA, which NFC does not compose.
  t = t.replace(/\u0E4D\u0E32/g, '\u0E33');
  t = t.replace(/[‘’‚‛′`´]/g, "'").replace(/[“”„‟″]/g, '"');
  t = t.replace(/[\u2010-\u2015\u2212]/g, '-');
  t = t.replace(/…/g, '...');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Letters/digits/combining marks only: robust to Thai spacing and punctuation differences.
function looseKey(s) {
  return normalizeText(s).replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
}

// Ratcliff/Obershelp ratio, same metric as Python difflib.SequenceMatcher.ratio()
// (used by lookup_example.py shipped with the answer bank).
function seqRatio(a, b) {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  return (2 * matchingChars(a, 0, a.length, b, 0, b.length)) / (a.length + b.length);
}

function matchingChars(a, alo, ahi, b, blo, bhi) {
  if (alo >= ahi || blo >= bhi) return 0;
  let best = 0, bi = alo, bj = blo;
  let prev = new Uint16Array(bhi - blo + 1);
  for (let i = alo; i < ahi; i++) {
    const cur = new Uint16Array(bhi - blo + 1);
    for (let j = blo; j < bhi; j++) {
      if (a[i] === b[j]) {
        const v = prev[j - blo] + 1;
        cur[j - blo + 1] = v;
        if (v > best) { best = v; bi = i - v + 1; bj = j - v + 1; }
      }
    }
    prev = cur;
  }
  if (!best) return 0;
  return best + matchingChars(a, alo, bi, b, blo, bj) + matchingChars(a, bi + best, ahi, b, bj + best, bhi);
}

function bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.substr(i, 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

function diceCoefficient(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const ba = bigrams(a), bb = bigrams(b);
  let inter = 0;
  for (const [g, n] of ba) inter += Math.min(n, bb.get(g) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

// Extract structural section markers: "Unit 3 Chapter 1.1", "#2", "บทที่ 4", Post-Test, ...
function sectionTokens(s) {
  const n = normalizeText(s);
  const tokens = new Set();
  const re = /unit\s*(\d+)|chapter\s*(\d+(?:\.\d+)?)|#\s*(\d+)|บทที่\s*(\d+)|(post-?\s*test|หลังเรียน)|(pre-?\s*test|ก่อนเรียน)|(practice|แบบฝึกหัด)/g;
  let m;
  while ((m = re.exec(n)) !== null) {
    if (m[1]) tokens.add('u' + m[1]);
    else if (m[2]) tokens.add('c' + m[2]);
    else if (m[3]) tokens.add('#' + m[3]);
    else if (m[4]) tokens.add('b' + m[4]);
    else if (m[5]) tokens.add('post');
    else if (m[6]) tokens.add('pre');
    else if (m[7]) tokens.add('practice');
  }
  return tokens;
}

// Bank entries whose "question" is a description, not the real stem.
const NOT_CAPTURED_RE = /not captured/i;
const BANK_NOTE_PAREN_RE = /\([^()]*(?:truncated|not captured)[^()]*\)/gi;
const BLANK_SPLIT_RE = /\.{3,}|…|_{2,}/;

const VERB_MAP = {
  'buy': 'are bought', 'use': 'is used', 'send': 'are sent', 'book': 'are booked',
  'search': 'is searched', 'read': 'are read', 'see': 'are seen', 'carry out': 'are carried out',
  'receive': 'are received', 'make': 'are made', 'solve': 'was solved', 'write': 'was written',
  'build': 'was built', 'promote': 'was promoted', 'eat': 'were eaten'
};

const HINT_TEXT_ANSWERS = [
  ['production', 'production'],
  ['The car is being repaired.', 'The car is being repaired.'],
  ["aren't we?", "aren't we?"],
  ['Is the incident being investigated by the police?', 'Is the incident being investigated by the police?']
];

class DBManager {
  constructor() {
    this.courses = [];
    this.missingItems = [];
    this.loadDatabase();
  }

  loadDatabase() {
    this.courses = [];
    this.missingItems = [];

    if (fs.existsSync(MAIN_DB_PATH)) {
      try {
        const raw = fs.readFileSync(MAIN_DB_PATH, 'utf-8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(raw);
        if (parsed.courses && Array.isArray(parsed.courses)) {
          this.courses.push(...parsed.courses);
        }
      } catch (err) {
        console.error('Error reading tsu_answers.json:', err.message);
      }
    }

    if (fs.existsSync(CUSTOM_DB_PATH)) {
      try {
        const raw = fs.readFileSync(CUSTOM_DB_PATH, 'utf-8').replace(/^\uFEFF/, '');
        const custom = JSON.parse(raw);
        if (Array.isArray(custom)) {
          this.courses.push(...custom);
        }
      } catch (err) {
        console.error('Error reading custom_courses.json:', err.message);
      }
    }

    if (fs.existsSync(MISSING_DB_PATH)) {
      try {
        const raw = fs.readFileSync(MISSING_DB_PATH, 'utf-8').replace(/^\uFEFF/, '');
        const missing = JSON.parse(raw);
        if (Array.isArray(missing)) {
          this.missingItems.push(...missing);
        }
      } catch (err) {
        console.error('Error reading tsu_missing.json:', err.message);
      }
    }

    this.buildIndex();
  }

  buildIndex() {
    this.entries = [];
    for (const course of this.courses) {
      for (const section of (course.sections || [])) {
        const qs = section.questions || [];
        for (let qIdx = 0; qIdx < qs.length; qIdx++) {
          this.entries.push(this.makeEntry(course.course_code, section.section || '', qIdx, qs[qIdx]));
        }
      }
    }
    this.missingEntries = this.missingItems.map(item => ({
      item,
      ...this.makeKeys(item.question || '')
    }));
  }

  makeKeys(questionText) {
    const cleaned = String(questionText || '').replace(BANK_NOTE_PAREN_RE, ' ');
    const norm = normalizeText(cleaned);
    const loose = looseKey(cleaned);
    const segments = cleaned.split(BLANK_SPLIT_RE).map(looseKey).filter(s => s.length >= 2);
    const segLen = segments.reduce((a, s) => a + s.length, 0);
    return { norm, loose, segments, segLen, positional: NOT_CAPTURED_RE.test(questionText || '') };
  }

  makeEntry(courseCode, sectionName, qIdx, q) {
    return {
      course: courseCode,
      section: sectionName,
      qIdx,
      q,
      listedOrder: /listed order/i.test(q.notes || '') || NOT_CAPTURED_RE.test(q.question || ''),
      ...this.makeKeys(q.question || '')
    };
  }

  // Score one page text against one bank entry. Returns { score, method } or null.
  scoreEntry(entry, cand) {
    if (entry.positional || !entry.loose || !cand.loose) return null;
    if (cand.norm === entry.norm) return { score: 1.0, method: 'exact' };
    if (cand.loose === entry.loose) return { score: 0.99, method: 'exact-loose' };

    // Bank stems use "..." / "____" for blanks and truncation: every captured piece must appear in order.
    if (entry.segLen >= 8) {
      let pos = 0, ok = true;
      for (const seg of entry.segments) {
        const at = cand.loose.indexOf(seg, pos);
        if (at < 0) { ok = false; break; }
        pos = at + seg.length;
      }
      if (ok) {
        const coverage = entry.segLen / cand.loose.length;
        return { score: 0.9 + 0.09 * Math.min(1, coverage), method: entry.segments.length > 1 ? 'segments' : 'contains' };
      }
    }

    // Page shows a truncated / shorter variant of the stem.
    if (cand.loose.length >= 12 && entry.loose.includes(cand.loose)) {
      const ratio = cand.loose.length / entry.loose.length;
      if (ratio >= 0.6) return { score: 0.8 + 0.1 * ratio, method: 'contained-in-bank' };
    }

    // difflib-style fuzzy match (cutoff 0.6 as in lookup_example.py), prefiltered for speed.
    const lenRatio = Math.min(cand.loose.length, entry.loose.length) / Math.max(cand.loose.length, entry.loose.length);
    if (lenRatio < 0.5) return null;
    if (diceCoefficient(cand.loose, entry.loose) < 0.4) return null;
    const r = seqRatio(cand.loose, entry.loose);
    if (r >= 0.6) return { score: 0.6 * r + 0.15, method: 'fuzzy' };
    return null;
  }

  coursesFor(courseCode) {
    const has = courseCode && this.courses.some(c => c.course_code === courseCode);
    return has ? new Set([courseCode]) : null;
  }

  // Pick the most specific bank section whose markers all appear in the page context.
  resolveSection(courseCode, contextText) {
    if (!contextText) return '';
    const ctx = sectionTokens(contextText);
    if (ctx.size === 0) return '';
    const allowed = this.coursesFor(courseCode);
    let best = '', bestLen = 0, tie = false;
    for (const course of this.courses) {
      if (allowed && !allowed.has(course.course_code)) continue;
      for (const section of (course.sections || [])) {
        const st = sectionTokens(section.section || '');
        if (st.size === 0 || ![...st].every(t => ctx.has(t))) continue;
        if (st.size > bestLen) { best = section.section; bestLen = st.size; tie = false; }
        else if (st.size === bestLen && section.section !== best) tie = true;
      }
    }
    return tie ? '' : best;
  }

  /**
   * All plausible bank entries for the page question, best first.
   * texts: candidate question strings from the page (legend/label first, whole block last).
   */
  findAnswerCandidates(courseCode, texts, opts = {}) {
    const list = (Array.isArray(texts) ? texts : [texts]).filter(Boolean);
    const cands = list.map(t => ({ norm: normalizeText(t), loose: looseKey(t) })).filter(c => c.loose);
    if (cands.length === 0) return [];
    const allowed = this.coursesFor(courseCode);
    const section = opts.section || '';
    const out = [];

    for (const entry of this.entries) {
      if (allowed && !allowed.has(entry.course)) continue;
      let best = null;
      for (const cand of cands) {
        const s = this.scoreEntry(entry, cand);
        if (s && (!best || s.score > best.score)) best = s;
      }
      if (!best) continue;
      let rank = best.score;
      // Longer captured stems are more specific (one stem may be a substring of another).
      rank += Math.min(entry.loose.length, 400) / 1e5;
      if (section && entry.section === section) rank += 0.05;
      if (entry.q.status === 'confirmed') rank += 0.001;
      out.push(this.toResult(entry, best.score, best.method, rank));
    }
    out.sort((a, b) => b.rank - a.rank);
    return out;
  }

  toResult(entry, score, method, rank = score) {
    const q = entry.q;
    return {
      question: q.question,
      correct_answer: q.correct_answer,
      status: q.status,
      answer_type: q.answer_type,
      known_wrong_answers: q.known_wrong_answers || [],
      notes: q.notes || '',
      course: entry.course,
      section: entry.section,
      index: entry.qIdx,
      score,
      method,
      rank
    };
  }

  // Bank items with no captured stem ("picture not captured", "answers are in listed order").
  findPositional(courseCode, section, questionIndex) {
    if (!section || questionIndex < 0) return null;
    const allowed = this.coursesFor(courseCode);
    const entry = this.entries.find(e =>
      (!allowed || allowed.has(e.course)) && e.section === section && e.qIdx === questionIndex);
    if (!entry || !entry.listedOrder) return null;
    return this.toResult(entry, 0.9, 'listed-order');
  }

  findAnswer(courseCode, questionText, sectionHint = '', questionIndex = -1) {
    const section = this.resolveSection(courseCode, sectionHint) || sectionHint;
    const cands = this.findAnswerCandidates(courseCode, questionText, { section });
    if (cands.length > 0) return cands[0];
    return this.findPositional(courseCode, section, questionIndex);
  }

  findMissingItem(courseCode, questionText, section = '') {
    const list = (Array.isArray(questionText) ? questionText : [questionText]).filter(Boolean);
    const cands = list.map(t => ({ norm: normalizeText(t), loose: looseKey(t) })).filter(c => c.loose);
    if (cands.length === 0 || this.missingEntries.length === 0) return null;

    let best = null;
    for (const me of this.missingEntries) {
      const item = me.item;
      if (item.course && courseCode && item.course !== courseCode) continue;
      let s = null;
      for (const cand of cands) {
        const r = this.scoreEntry(me, cand);
        if (r && (!s || r.score > s.score)) s = r;
      }
      if (!s) continue;
      const rank = s.score + (section && item.section === section ? 0.05 : 0);
      if (!best || rank > best.rank) best = { rank, item, method: s.method };
    }
    if (!best) return null;
    const item = best.item;
    return {
      isMissing: true,
      course: item.course,
      section: item.section,
      question: item.question,
      type: item.type,
      wrong_answers: (item.wrong_answers || '').split('|').map(s => s.trim()).filter(Boolean),
      hint: item.hint || '',
      method: best.method
    };
  }

  /**
   * Index of the choice whose text matches `answer`, or null. Never matches empty labels.
   * Returns { index, method, score }.
   */
  matchChoice(choiceTexts, answer, knownWrong = []) {
    if (!answer || !Array.isArray(choiceTexts) || choiceTexts.length === 0) return null;
    const stripMarker = s => normalizeText(s).replace(/^(?:[a-hก-ฌ]|\d{1,2})[.)]\s+/i, '');
    const target = stripMarker(answer);
    const targetLoose = looseKey(target);
    if (!targetLoose) return null;
    const wrongLoose = new Set((knownWrong || []).map(looseKey).filter(Boolean));
    wrongLoose.delete(targetLoose);

    const labels = choiceTexts.map(t => {
      const norm = stripMarker(t || '');
      return { norm, loose: looseKey(norm) };
    });
    const usable = (l) => l.loose && !wrongLoose.has(l.loose);

    const exact = labels.map((l, i) => (usable(l) && l.norm === target ? i : -1)).filter(i => i >= 0);
    if (exact.length) return { index: exact[0], method: 'exact', score: 1, duplicates: exact };

    const loose = labels.map((l, i) => (usable(l) && l.loose === targetLoose ? i : -1)).filter(i => i >= 0);
    if (loose.length) return { index: loose[0], method: 'exact-loose', score: 0.99, duplicates: loose };

    const pickUnique = (scored, minScore, margin) => {
      scored.sort((a, b) => b.score - a.score);
      if (!scored.length || scored[0].score < minScore) return null;
      if (scored.length > 1 && scored[0].score - scored[1].score < margin) return null;
      return scored[0];
    };

    const contained = [];
    labels.forEach((l, i) => {
      if (!usable(l) || l.loose.length < 2) return;
      if (l.loose.includes(targetLoose) || targetLoose.includes(l.loose)) {
        const r = Math.min(l.loose.length, targetLoose.length) / Math.max(l.loose.length, targetLoose.length);
        contained.push({ index: i, score: r, method: 'contains' });
      }
    });
    const c = pickUnique(contained, 0.75, 0.05);
    if (c) return c;

    const fuzzy = [];
    labels.forEach((l, i) => {
      if (!usable(l)) return;
      fuzzy.push({ index: i, score: seqRatio(l.loose, targetLoose), method: 'fuzzy' });
    });
    return pickUnique(fuzzy, 0.85, 0.05);
  }

  /**
   * Decide how to answer one response (one question) on the page.
   * info: { courseCode, texts[], choices[], textInputCount, section, index, isPretest }
   * Returns { action: 'choice'|'text'|'skip', ... , log fields }.
   */
  decideResponse(info) {
    const { courseCode, texts = [], choices = [], textInputCount = 0, index = -1 } = info;
    const section = info.section || '';
    const hasChoices = choices.length > 0;
    const base = { section, questionText: texts[0] || '' };

    const cands = this.findAnswerCandidates(courseCode, texts, { section });
    // Same stem, but this section's copy is still unconfirmed: the bank warns that answers can
    // differ per section (chapter quiz vs Post-Test), so never borrow another section's answer.
    const topScore = cands.reduce((m, c) => Math.max(m, c.score), 0);
    const sameStemUnconfirmed = cands.filter(c => c.score >= topScore - 0.02 && c.status !== 'confirmed' && (!section || c.section === section));
    const blockOtherSections = !!section && sameStemUnconfirmed.length > 0;
    const extraWrong = sameStemUnconfirmed.flatMap(c => c.known_wrong_answers || []);
    const extraWrongLoose = new Set(extraWrong.map(looseKey));

    const fromEntry = (cand) => {
      if (!cand || cand.status !== 'confirmed' || !cand.correct_answer) return null;
      let ans = String(cand.correct_answer).trim();
      if (courseCode === 'TSUGE00152' && /unit 4 chapter 3/i.test(cand.section)) {
        ans = ans.replace(/[‘’]/g, "'");
      }
      if (extraWrongLoose.has(looseKey(ans))) return null;
      if (hasChoices) {
        const m = this.matchChoice(choices, ans, [...(cand.known_wrong_answers || []), ...extraWrong]);
        if (!m) return null;
        let idx = m.index;
        // TSUGE07272: "นาง มานี" item lists "5 ปี" twice; the second one is graded correct.
        if (m.duplicates && m.duplicates.length > 1 && courseCode === 'TSUGE07272' &&
            texts.some(t => normalizeText(t).includes('มานี'))) {
          idx = m.duplicates[1];
        }
        return { ...base, action: 'choice', index: idx, answer: ans, choiceText: choices[idx], match: cand, choiceMethod: m.method };
      }
      if (textInputCount > 0) {
        const parts = ans.split(/\s+;\s+/);
        const values = parts.length === textInputCount ? parts : Array(textInputCount).fill(ans);
        return { ...base, action: 'text', values, answer: ans, match: cand };
      }
      return null;
    };

    if (!blockOtherSections) {
      for (const cand of cands) {
        const d = fromEntry(cand);
        if (d) return d;
      }

      const pos = this.findPositional(courseCode, section, index);
      const dPos = fromEntry(pos);
      if (dPos) return dPos;
    }

    for (const t of blockOtherSections ? [] : texts) {
      const vm = t.match(/\(([a-zA-Z\s]+)\)/);
      const verb = vm ? vm[1].trim().toLowerCase() : '';
      if (verb && VERB_MAP[verb]) {
        const d = fromEntry({ question: t, correct_answer: VERB_MAP[verb], status: 'confirmed', known_wrong_answers: [], section, score: 1, method: 'verb-map' });
        if (d) return d;
        break;
      }
    }

    const missing = this.findMissingItem(courseCode, texts, section);
    if (missing && missing.hint) {
      const h = missing.hint;
      const wrong = [...extraWrong, ...missing.wrong_answers];
      const wrongLoose = new Set(wrong.map(looseKey).filter(Boolean));
      if (hasChoices) {
        const hLoose = looseKey(h);
        const pool = choices.map((t, i) => ({ i, loose: looseKey(t), t }))
          .filter(c => c.loose.length >= 3 && !wrongLoose.has(c.loose) && hLoose.includes(c.loose));
        const preferred = ['ปรับปรุงผลิตภัณฑ์เดิมให้ดีขึ้น', 'การรู้เท่าทันสื่อ', 'สิ่งใหม่ของผลิตภัณฑ์', 'Define'];
        let pick = pool.length === 1 ? pool[0] : null;
        if (!pick && pool.length > 1) {
          const pref = pool.filter(c => preferred.some(p => c.t.includes(p) && h.includes(p)));
          if (pref.length === 1) pick = pref[0];
        }
        if (pick) {
          return { ...base, action: 'choice', index: pick.i, answer: pick.t, choiceText: pick.t, hint: missing, match: null, choiceMethod: 'hint' };
        }
      } else if (textInputCount > 0) {
        const hit = HINT_TEXT_ANSWERS.find(([needle]) => h.includes(needle));
        if (hit) return { ...base, action: 'text', values: Array(textInputCount).fill(hit[1]), answer: hit[1], hint: missing, match: null };
      }
    }

    let reason = 'no match in answer bank';
    const top = cands[0];
    if (top && top.status !== 'confirmed') reason = 'bank entry is unconfirmed';
    else if (top && hasChoices) reason = 'bank answer not found among choices';
    return { ...base, action: 'skip', reason, match: top || null, hint: missing };
  }

  getCoursesSummary() {
    return this.courses.map(c => {
      let totalQuestions = 0;
      let confirmedQuestions = 0;
      if (c.sections && Array.isArray(c.sections)) {
        for (const s of c.sections) {
          if (s.questions && Array.isArray(s.questions)) {
            totalQuestions += s.questions.length;
            confirmedQuestions += s.questions.filter(q => q.status === 'confirmed').length;
          }
        }
      }
      return {
        course_code: c.course_code,
        course_name: c.course_name || c.course_code,
        org: c.org || '',
        url: c.course_id_url_if_known || '',
        totalQuestions,
        confirmedQuestions,
        sectionsCount: (c.sections || []).length
      };
    });
  }

  addCourse(courseData) {
    const newCourse = {
      course_code: courseData.course_code,
      course_name: courseData.course_name || courseData.course_code,
      org: courseData.org || 'Custom',
      course_id_url_if_known: courseData.url || '',
      pretest_policy: 'random',
      sections: courseData.sections || [
        {
          section: 'Default Section',
          questions: courseData.questions || []
        }
      ]
    };

    let customList = [];
    if (fs.existsSync(CUSTOM_DB_PATH)) {
      try {
        customList = JSON.parse(fs.readFileSync(CUSTOM_DB_PATH, 'utf-8'));
      } catch (e) {
        customList = [];
      }
    }

    const cIdx = customList.findIndex(c => c.course_code === courseData.course_code);
    if (cIdx >= 0) {
      customList[cIdx] = newCourse;
    } else {
      customList.push(newCourse);
    }

    fs.writeFileSync(CUSTOM_DB_PATH, JSON.stringify(customList, null, 2), 'utf-8');
    this.loadDatabase();
    return newCourse;
  }

  calculateSimilarity(s1, s2) {
    return seqRatio(looseKey(s1), looseKey(s2));
  }
}

const instance = new DBManager();
instance.normalizeText = normalizeText;
instance.looseKey = looseKey;
instance.seqRatio = seqRatio;
instance.sectionTokens = sectionTokens;
module.exports = instance;
