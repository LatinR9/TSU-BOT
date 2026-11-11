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
const BANK_NOTE_PAREN_RE = /\([^()]*(?:truncated|not captured|two blanks|repeat of|question tag|fill gap with|match sentence)[^()]*\)/gi;
const BLANK_SPLIT_RE = /\.{3,}|…|_{2,}/;
// Page blank markers like "___1___", "__(1)__", "_(2)__" are one blank.
const PAGE_BLANK_RE = /_+\s*\(?\d\)?\s*_+/g;
// Fuzzy similarity on short text (block titles like "problem", "Dropdown") picks arbitrary entries.
const MIN_FUZZY_LOOSE = 20;
const MULTI_PART_SPLIT_RE = /\s+[;/]\s+/;

// user_supplied: the user's chosen answer, answered as given even though it is not graded correct.
const ANSWERABLE_STATUSES = new Set(['confirmed', 'inferred', 'user_supplied']);
const answerable = c => !!(c && c.correct_answer && ANSWERABLE_STATUSES.has(c.status));

// Typed contractions: some graders compare the exact apostrophe character.
function applyApostropheStyle(value, style) {
  const s = String(value);
  if (style === 'curly') return s.replace(/(?<=\p{L})'(?=\p{L})/gu, '\u2019');
  if (style === 'straight') return s.replace(/[\u2018\u2019]/g, "'");
  return s;
}

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
    this.apostropheStyle = new Map();
    for (const course of this.courses) {
      for (const section of (course.sections || [])) {
        const style = section.text_apostrophe || course.text_apostrophe;
        if (style) this.apostropheStyle.set(`${course.course_code}|${section.section || ''}`, style);
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
    const cleaned = String(questionText || '').replace(BANK_NOTE_PAREN_RE, ' ').replace(PAGE_BLANK_RE, ' ___ ');
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
    if (r >= (cand.loose.length < MIN_FUZZY_LOOSE ? 0.8 : 0.6)) return { score: 0.6 * r + 0.15, method: 'fuzzy' };
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
    const cands = this.pageKeys(texts);
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
      else if (entry.q.status === 'inferred' || entry.q.status === 'user_supplied') rank += 0.0005;
      out.push(this.toResult(entry, best.score, best.method, rank));
    }
    out.sort((a, b) => b.rank - a.rank);
    return out;
  }

  pageKeys(texts) {
    return (Array.isArray(texts) ? texts : [texts]).filter(Boolean)
      .map(t => String(t).replace(PAGE_BLANK_RE, ' ___ '))
      .map(t => ({ norm: normalizeText(t), loose: looseKey(t) })).filter(c => c.loose);
  }

  styleFor(courseCode, section) {
    return this.apostropheStyle.get(`${courseCode}|${section}`) || '';
  }

  // Bank section whose question count equals the number of problem blocks on the page:
  // block N is bank question N (works when the page prompt is missing or generic).
  findByBlockPosition(courseCode, section, problemIndex, problemCount) {
    if (!section || problemIndex < 0 || !problemCount) return null;
    const allowed = this.coursesFor(courseCode);
    const inSection = this.entries.filter(e => (!allowed || allowed.has(e.course)) && e.section === section);
    if (inSection.length !== problemCount) return null;
    const entry = inSection.find(e => e.qIdx === problemIndex);
    return entry ? this.toResult(entry, 0.85, 'block-position') : null;
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
    const cands = this.pageKeys(questionText);
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
   * Decide how to answer one problem block (one bank question, possibly several blanks).
   * info: { courseCode, section, texts[], slots[], index, problemIndex, problemCount }
   *   slots: in page order, { kind: 'choice'|'checkbox'|'select'|'text', choices?: string[] }
   *   index: page position of the first response (listed-order bank items)
   * Returns { action: 'fill', fills[], answer, match, inferred, userSupplied } or { action: 'skip', reason, ... }.
   *   fills[i]: { kind, index, choiceText, choiceMethod } | { kind: 'checkbox', indices } | { kind: 'text', value }
   */
  decideProblem(info) {
    const { courseCode, texts = [], slots = [], index = -1, problemIndex = -1, problemCount = 0 } = info;
    const section = info.section || '';
    const base = { section, questionText: texts[0] || '' };
    if (slots.length === 0) return { ...base, action: 'skip', reason: 'no answer inputs found in block', match: null };

    const cands = this.findAnswerCandidates(courseCode, texts, { section });
    // Same stem, but this section's copy has no usable answer: the bank warns that answers can
    // differ per section (chapter quiz vs Post-Test), so never borrow another section's answer.
    const topScore = cands.reduce((m, c) => Math.max(m, c.score), 0);
    const sameStemUnanswered = cands.filter(c => c.score >= topScore - 0.02 && !answerable(c) && (!section || c.section === section));
    const blockOtherSections = !!section && sameStemUnanswered.length > 0;
    const extraWrong = sameStemUnanswered.flatMap(c => c.known_wrong_answers || []);
    const extraWrongLoose = new Set(extraWrong.map(looseKey));
    let failure = '';

    const fillSlot = (slot, part, wrong) => {
      if (slot.kind === 'text') return { kind: 'text', value: part };
      const choices = slot.choices || [];
      if (slot.kind === 'checkbox') {
        const picks = part.split(/\s*[;|]\s*/).map(p => this.matchChoice(choices, p, wrong));
        if (picks.some(p => !p)) return null;
        return { kind: 'checkbox', indices: picks.map(p => p.index), choiceText: picks.map(p => choices[p.index]).join(' | '), choiceMethod: picks.map(p => p.method).join('+') };
      }
      const m = this.matchChoice(choices, part, wrong);
      if (!m) return null;
      let idx = m.index;
      // TSUGE07272: "นาง มานี" item lists "5 ปี" twice; the second one is graded correct.
      if (m.duplicates && m.duplicates.length > 1 && courseCode === 'TSUGE07272' &&
          texts.some(t => normalizeText(t).includes('มานี'))) {
        idx = m.duplicates[1];
      }
      return { kind: slot.kind, index: idx, choiceText: choices[idx], choiceMethod: m.method };
    };

    const fromEntry = (cand, extra = {}) => {
      if (!answerable(cand)) return null;
      let ans = String(cand.correct_answer).trim();
      if (extraWrongLoose.has(looseKey(ans))) return null;
      const parts = slots.length === 1 ? [ans] : ans.split(MULTI_PART_SPLIT_RE);
      if (parts.length !== slots.length) {
        failure = failure || `bank answer "${ans}" has ${parts.length} part(s) but the block has ${slots.length} blanks`;
        return null;
      }
      const style = this.styleFor(courseCode, cand.section);
      const wrong = [...(cand.known_wrong_answers || []), ...extraWrong];
      const fills = [];
      for (let i = 0; i < slots.length; i++) {
        const part = slots[i].kind === 'text' ? applyApostropheStyle(parts[i], style) : parts[i];
        const f = fillSlot(slots[i], part, wrong);
        if (!f) {
          failure = failure || (slots.length > 1
            ? `blank ${i + 1}: bank answer "${parts[i]}" not among its options`
            : 'bank answer not found among choices');
          return null;
        }
        fills.push(f);
      }
      if (slots.length === 1 && slots[0].kind === 'text') ans = fills[0].value;
      return { ...base, action: 'fill', fills, answer: ans, match: cand, inferred: cand.status === 'inferred', userSupplied: cand.status === 'user_supplied', ...extra };
    };

    if (!blockOtherSections) {
      const strong = cands.filter(c => c.score >= 0.9 && (!section || c.section === section));
      let weak = cands.filter(c => !strong.includes(c));
      // Near-tied fuzzy hits with different answers mean the text is not specific enough.
      if (weak.length > 1 && weak[0].method === 'fuzzy' && weak[0].score - weak[1].score < 0.01 &&
          (weak[0].section === section) === (weak[1].section === section) &&
          looseKey(weak[0].correct_answer || '') !== looseKey(weak[1].correct_answer || '')) {
        weak = weak.filter(c => c.method !== 'fuzzy');
      }
      // A single short captured piece ("They wouldn't...") is less specific than the block position.
      const specific = strong.filter(c => c.method !== 'contains');
      const ordered = [
        ...specific,
        this.findByBlockPosition(courseCode, section, problemIndex, problemCount),
        ...strong.filter(c => !specific.includes(c)),
        this.findPositional(courseCode, section, index),
        ...weak
      ].filter(Boolean);
      for (const cand of ordered) {
        const d = fromEntry(cand);
        if (d) return d;
      }
    }

    if (slots.length === 1) {
      for (const t of blockOtherSections ? [] : texts) {
        const vm = t.match(/\(([a-zA-Z\s]+)\)/);
        const verb = vm ? vm[1].trim().toLowerCase() : '';
        if (verb && VERB_MAP[verb]) {
          const d = fromEntry({ question: t, correct_answer: VERB_MAP[verb], status: 'confirmed', known_wrong_answers: [], section, score: 1, method: 'verb-map' });
          if (d) return d;
          break;
        }
      }
    }

    const missing = this.findMissingItem(courseCode, texts, section);
    if (missing && missing.hint && slots.length === 1) {
      const h = missing.hint;
      const slot = slots[0];
      const wrong = [...extraWrong, ...missing.wrong_answers];
      const wrongLoose = new Set(wrong.map(looseKey).filter(Boolean));
      if (slot.kind !== 'text') {
        const choices = slot.choices || [];
        const hLoose = looseKey(h);
        const pool = choices.map((t, i) => ({ i, loose: looseKey(t), t }))
          .filter(c => c.loose.length >= 3 && !wrongLoose.has(c.loose) && hLoose.includes(c.loose));
        const preferred = ['ปรับปรุงผลิตภัณฑ์เดิมให้ดีขึ้น', 'การรู้เท่าทันสื่อ', 'สิ่งใหม่ของผลิตภัณฑ์', 'Define'];
        let pick = pool.length === 1 ? pool[0] : null;
        if (!pick && pool.length > 1) {
          const pref = pool.filter(c => preferred.some(p => c.t.includes(p) && h.includes(p)));
          if (pref.length === 1) pick = pref[0];
        }
        if (pick && slot.kind !== 'checkbox') {
          return { ...base, action: 'fill', fills: [{ kind: slot.kind, index: pick.i, choiceText: pick.t, choiceMethod: 'hint' }], answer: pick.t, hint: missing, match: null };
        }
      } else {
        const hit = HINT_TEXT_ANSWERS.find(([needle]) => h.includes(needle));
        if (hit) {
          const value = applyApostropheStyle(hit[1], this.styleFor(courseCode, missing.section || section));
          return { ...base, action: 'fill', fills: [{ kind: 'text', value }], answer: value, hint: missing, match: null };
        }
      }
    }

    let reason = failure || 'no match in answer bank';
    const top = cands[0];
    if (!failure && top && !answerable(top)) reason = 'bank entry is unconfirmed';
    return { ...base, action: 'skip', reason, match: top || null, hint: missing };
  }

  /**
   * One response with a single choice group, or N text inputs (legacy shape).
   * info: { courseCode, texts[], choices[], textInputCount, section, index }
   * Returns { action: 'choice'|'text'|'skip', ... }.
   */
  decideResponse(info) {
    const { choices = [], textInputCount = 0 } = info;
    const slots = choices.length > 0 ? [{ kind: 'choice', choices }]
      : Array.from({ length: textInputCount }, () => ({ kind: 'text' }));
    const d = this.decideProblem({ ...info, slots });
    if (d.action !== 'fill') return d;
    if (d.fills[0].kind === 'text') return { ...d, action: 'text', values: d.fills.map(f => f.value) };
    return { ...d, action: 'choice', index: d.fills[0].index, choiceText: d.fills[0].choiceText, choiceMethod: d.fills[0].choiceMethod };
  }

  courseUrl(courseCode) {
    const c = this.courses.find(x => x.course_code === courseCode);
    return (c && c.course_id_url_if_known) || '';
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
instance.applyApostropheStyle = applyApostropheStyle;
module.exports = instance;
