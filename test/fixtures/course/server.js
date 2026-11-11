// Local stand-in for apps.course.tsu.ac.th (Open edX learning MFE + LMS xblock iframe).
// Not the live TSU site: markup and completion rules are modeled on Open edX defaults
// (sequence nav check icons, iframe#unit-iframe, capa problems, video complete at 95%,
// HTML/document blocks complete after being viewed, Course tab outline with check-circle icons).
const http = require('http');
const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function startCourseServer(spec) {
  const cid = `course-v1:TSU+${spec.courseCode}+2026_T1`;
  const blockKey = (type, id) => `block-v1:TSU+${spec.courseCode}+2026_T1+type@${type}+block@${id}`;
  // Subsections (sequences). Units without `seq` get a one-unit sequence of their own.
  const sequences = [];
  const units = spec.units.map((u, i) => {
    const seqId = u.seq || `seq_${u.id}`;
    let sq = sequences.find(x => x.id === seqId);
    if (!sq) {
      const def = (spec.sequences || []).find(x => x.id === seqId) || {};
      sq = { id: seqId, title: def.title || u.title, chapter: def.chapter || u.section, graded: def.graded !== false, key: blockKey('sequential', seqId), units: [] };
      sequences.push(sq);
    }
    const unit = { ...u, idx: i, seqId, key: blockKey('vertical', u.id) };
    sq.units.push(unit);
    return unit;
  });
  const gradeOf = p => (p.preGraded === true ? 'correct' : p.preGraded || null);
  const state = {
    complete: Object.fromEntries(units.map(u => [u.id, !!u.complete])),
    graded: Object.fromEntries(units.flatMap(u => (u.problems || []).map(p => [p.id, gradeOf(p)]))),
    attempts: Object.fromEntries(units.flatMap(u => (u.problems || []).map(p => [p.id, p.attemptsUsed != null ? p.attemptsUsed : (gradeOf(p) ? 1 : 0)]))),
    completeReports: {},
    events: []
  };
  const ev = (type, unit, data = {}) => state.events.push({ t: Date.now(), type, unit, ...data });
  const seqOf = u => sequences.find(x => x.id === u.seqId);
  const unitUrl = u => `/learning/course/${cid}/${seqOf(u).key}/${u.key}`;
  const seqUrl = sq => `/learning/course/${cid}/${sq.key}`;
  const slug = s => String(s || 'ch').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'ch';
  // Identity / non-Language TSU courses often link outline rows with courseware, jump_to_id,
  // or type@vertical hrefs instead of (or mixed with) type@sequential.
  const seqHref = sq => {
    const style = sq.linkStyle || spec.linkStyle || 'sequential';
    if (style === 'vertical') return `/learning/course/${cid}/${sq.units[0].key}`;
    if (style === 'courseware') return `/courses/${cid}/courseware/${slug(sq.chapter)}/${sq.id}/`;
    if (style === 'jump_to_id') return `/courses/${cid}/jump_to_id/${sq.id}`;
    if (style === 'jump_to') return `/courses/${cid}/jump_to/${encodeURIComponent(sq.key)}`;
    return seqUrl(sq);
  };
  const openSeq = keyOrId => {
    const sq = sequences.find(x => x.id === keyOrId || x.key === keyOrId);
    if (!sq) return null;
    ev('sequence-open', sq.units[0].id, { seq: sq.id });
    return unitUrl(sq.units[0]);
  };
  const tabs = active => `<nav class="nav nav-underline-tabs course-tabs-navigation" aria-label="Course Material">
    ${[['Course', `/learning/course/${cid}/home`], ['Progress', `/learning/course/${cid}/progress`], ['Dates', `/learning/course/${cid}/dates`]]
      .map(([n, h]) => `<a class="nav-item flex-shrink-0 nav-link${n === active ? ' active' : ''}" href="${h}">${n}</a>`).join('')}</nav>`;

  function shell(u) {
    const navItems = seqOf(u).units.map(x => `
      <li><button class="btn nav-link sequence-navigation-tabs-nav-item${x.id === u.id ? ' active' : ''}" data-unit="${x.id}" ${x.id === u.id ? 'aria-current="page"' : ''}
          aria-label="${esc(x.title)}${state.complete[x.id] ? ', Completed' : ''}">
        <span class="pgn__icon unit-icon"><svg width="16" height="16" data-prefix="fas" data-icon="${x.type === 'video' ? 'video' : x.type === 'doc' ? 'file' : 'question'}"></svg></span>
        ${state.complete[x.id] ? '<span class="pgn__icon"><svg width="16" height="16" data-prefix="fas" data-icon="check-circle"></svg></span>' : ''}
      </button></li>`).join('');
    const prev = units[u.idx - 1], next = units[u.idx + 1];
    return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>${esc(u.title)} | ${esc(spec.courseName)} | TSU COURSE</title></head>
<body style="margin:0;font-family:sans-serif">
<header style="height:60px;background:#0b6">TSU COURSE</header>
${tabs('Course')}
<aside class="course-outline-sidebar" style="position:fixed;right:0;top:60px;width:200px">
  <h4>Course Outline</h4><ul><li>แบบทดสอบก่อนเรียน (Pre-Test)</li>${spec.outline.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
</aside>
<main style="margin-right:220px">
  <nav aria-label="breadcrumb" class="breadcrumbs"><ol><li>${esc(spec.courseName)}</li><li>${esc(u.section)}</li><li>${esc(seqOf(u).title)}</li></ol></nav>
  <div class="sequence-container">
    <nav class="sequence-navigation" aria-label="Unit navigation" style="display:flex">
      <button class="btn previous-btn" ${prev ? '' : 'disabled'} data-go="${prev ? prev.id : ''}">Previous</button>
      <ol style="display:flex;list-style:none">${navItems}</ol>
      <button class="btn next-btn" ${next ? '' : 'disabled'} data-go="${next ? next.id : ''}">Next</button>
    </nav>
    <h1 class="unit-title">${esc(u.title)}</h1>
    <iframe id="unit-iframe" title="${esc(u.title)}" src="/xblock/${u.id}" style="width:100%;height:600px;border:0" scrolling="no"></iframe>
    <div class="unit-navigation"><button class="btn previous-button" ${prev ? '' : 'disabled'} data-go="${prev ? prev.id : ''}">Previous</button>
      <button class="btn next-button" ${next ? '' : 'disabled'} data-go="${next ? next.id : ''}">Next</button></div>
  </div>
</main>
<script>
  const UNITS = ${JSON.stringify(units.map(x => ({ id: x.id, url: unitUrl(x) })))};
  let current = ${JSON.stringify(u.id)};
  const post = (o) => navigator.sendBeacon('/event', JSON.stringify(o));
  post({ type: 'enter', unit: current });
  addEventListener('pagehide', () => post({ type: 'leave', unit: current, to: 'page' }));
  let maxScroll = innerHeight, quietUntil = 0;
  addEventListener('scroll', () => {
    if (Date.now() < quietUntil) return; // scroll clamping caused by the shell's own navigation
    const y = scrollY + innerHeight;
    if (y > maxScroll + 50) { maxScroll = y; post({ type: 'scroll', unit: current, bottom: y, height: document.documentElement.scrollHeight }); }
  });
  addEventListener('message', (e) => {
    if (e.data && e.data.type === 'plugin.resize') document.getElementById('unit-iframe').style.height = e.data.payload.height + 'px';
    if (e.data && e.data.type === 'completed') refreshNav();
  });
  async function refreshNav() {
    const st = await (await fetch('/state')).json();
    document.querySelectorAll('.sequence-navigation li button').forEach(b => {
      const done = st.complete[b.dataset.unit];
      const has = b.querySelector('[data-prefix="fas"][data-icon="check-circle"], .complete-checkmark');
      if (done && !has) b.insertAdjacentHTML('beforeend', '<span class="pgn__icon"><svg width="16" height="16" data-prefix="fas" data-icon="check-circle"></svg></span>');
    });
  }
  // SPA navigation like the learning MFE: no page load, only the unit iframe changes.
  function go(id) {
    if (!id) return;
    post({ type: 'leave', unit: current, to: id });
    const i = UNITS.findIndex(x => x.id === id);
    current = id; maxScroll = innerHeight; quietUntil = Date.now() + 1000;
    history.pushState({}, '', UNITS[i].url);
    fetch('/shell-fragment/' + id).then(r => r.json()).then(f => {
      document.title = f.title;
      document.querySelector('.breadcrumbs').innerHTML = f.breadcrumb;
      document.querySelector('.sequence-navigation').outerHTML = f.nav;
      document.querySelector('.unit-navigation').outerHTML = f.bottom;
      document.querySelector('.unit-title').textContent = f.unitTitle;
      const fr = document.getElementById('unit-iframe');
      fr.style.height = '600px';
      fr.src = '/xblock/' + id;
      scrollTo(0, 0);
      post({ type: 'enter', unit: current });
      bind();
    });
  }
  function bind() {
    document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    document.querySelectorAll('.sequence-navigation li button').forEach(b => b.onclick = () => go(b.dataset.unit));
  }
  bind();
</script></body></html>`;
  }

  function fragment(u) {
    const html = shell(u);
    const grab = (re) => (html.match(re) || [])[0] || '';
    return {
      title: (html.match(/<title>([^<]*)<\/title>/) || [])[1],
      breadcrumb: (html.match(/<nav aria-label="breadcrumb" class="breadcrumbs">([\s\S]*?)<\/nav>/) || [])[1],
      nav: grab(/<nav class="sequence-navigation"[\s\S]*?<\/nav>/),
      bottom: grab(/<div class="unit-navigation">[\s\S]*?<\/div>/),
      unitTitle: u.title
    };
  }

  const resizeScript = `<script>
    const sendSize = () => parent.postMessage({ type: 'plugin.resize', payload: { height: document.documentElement.scrollHeight } }, '*');
    addEventListener('load', sendSize); new ResizeObserver(sendSize).observe(document.body);
    const post = (o) => navigator.sendBeacon('/event', JSON.stringify(o));
  </script>`;

  function videoUnit(u) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${resizeScript}
<div class="xblock xblock-student_view xblock-student_view-video" data-block-type="video">
  <h3 class="hd hd-2">${esc(u.title)}</h3>
  <div class="video closed" data-metadata='{"duration": ${u.clip === 'clip180s.webm' ? 180 : 40}, "autoplay": false, "completionPercentage": 0.95}'>
    <div class="video-wrapper">
      <div class="video-player-pre"></div>
      <div class="video-player"><video src="/media/${u.clip || 'clip40s.webm'}" preload="metadata" width="640" height="360" playsinline></video></div>
      <div class="video-controls">
        <div class="slider" role="slider" style="width:640px;height:12px;background:#ccc;cursor:pointer"></div>
        <button class="control video_control play" aria-label="Play">Play</button>
        <div class="vidtime"><span class="duration">${u.clip === 'clip180s.webm' ? '3:00' : '0:40'}</span></div>
      </div>
    </div>
  </div>
  <p>Transcript: lorem ipsum</p>
</div>
<script>
  const v = document.querySelector('video');
  let reported = ${state.complete[u.id] ? 'true' : 'false'};
  const UNIT = ${JSON.stringify(u.id)};
  document.querySelector('.control.play').onclick = () => (v.paused ? v.play() : v.pause());
  document.querySelector('.video-player').onclick = () => (v.paused ? v.play() : v.pause());
  document.querySelector('.slider').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (v.duration) v.currentTime = v.duration * ((e.clientX - r.left) / r.width);
  };
  v.addEventListener('play', () => post({ type: 'video-play', unit: UNIT, at: v.currentTime }));
  v.addEventListener('seeked', () => post({ type: 'video-seek', unit: UNIT, at: v.currentTime }));
  v.addEventListener('ended', () => post({ type: 'video-ended', unit: UNIT }));
  // edX VideoCompletionHandler: complete once playback passes completionPercentage of the duration.
  v.addEventListener('timeupdate', () => {
    if (!reported && !v.paused && v.duration && v.currentTime >= v.duration * 0.95) {
      reported = true;
      fetch('/complete/' + UNIT, { method: 'POST' }).then(() => parent.postMessage({ type: 'completed' }, '*'));
    }
  });
</script></body></html>`;
  }

  function docUnit(u) {
    const paras = Array.from({ length: 40 }, (_, i) => `<p>${esc(u.docText || 'เนื้อหาเอกสารประกอบการเรียน')} (${i + 1})</p>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${resizeScript}
<div class="xblock xblock-student_view xblock-student_view-html" data-block-type="html">
  <h2>${esc(u.title)}</h2>
  <div class="document-sheet" style="line-height:60px">${paras}</div>
</div>
<script>
  // Completion on view (edX marks HTML blocks complete once viewed); here: unit open for 5 s.
  const UNIT = ${JSON.stringify(u.id)};
  setTimeout(() => fetch('/complete/' + UNIT, { method: 'POST' }).then(() => parent.postMessage({ type: 'completed' }, '*')), 5000);
</script></body></html>`;
  }

  // p.kind: 'radio' (default, p.choices + p.answer index), 'select' (p.blanks: [{ options, answer }],
  // several dropdowns in one block) or 'text' (p.answers: exact strings, one text box each).
  const answersOf = p => (p.kind === 'select' ? p.blanks.map(b => b.answer) : p.answers);
  function inputsHtml(p, graded, locked) {
    const dis = locked ? 'disabled' : '';
    if (p.kind === 'select') {
      return p.blanks.map((b, k) => {
        const shown = graded === 'correct' ? b.answer : graded ? b.options.find(o => o !== b.answer) : '';
        return `
        <div class="wrapper-problem-response" tabindex="-1" role="group" aria-label="Question ${k + 1}">
          <div class="inputtype option-input"><label class="problem-group-label" for="input_${p.id}_${k}">${k + 1}</label>
            <div class="input-wrapper"><select name="input_${p.id}_${k}" id="input_${p.id}_${k}" ${dis}>
              <option value="option_${p.id}_${k}_dummy_default">Select an option</option>
              ${b.options.map(o => `<option value="${esc(o)}" ${o === shown ? 'selected' : ''}>${esc(o)}</option>`).join('')}
            </select></div></div>
        </div>`;
      }).join('');
    }
    if (p.kind === 'text') {
      return p.answers.map((a, k) => `
        <div class="wrapper-problem-response" tabindex="-1" role="group" aria-label="Question">
          <div class="inputtype textline capa_inputtype"><input type="text" name="input_${p.id}_${k}" id="input_${p.id}_${k}" value="${graded ? esc(graded === 'correct' ? a : 'wrong') : ''}" ${dis}></div>
        </div>`).join('');
    }
    const choices = p.choices.map((c, ci) => `
        <div class="field">
          <input type="radio" name="input_${p.id}" id="input_${p.id}_choice_${ci}" class="field-input input-radio" value="choice_${ci}" ${graded && (graded === 'correct' ? p.answer === ci : ci !== p.answer && ci === (p.answer + 1) % p.choices.length) ? 'checked' : ''} ${dis}>
          <label id="${p.id}-choice_${ci}-label" for="input_${p.id}_choice_${ci}" class="response-label field-label label-inline">${esc(c)}</label>
        </div>`).join('');
    const stem = p.stemAsParagraph
      ? `<p>${esc(p.stem)}</p><div class="choicegroup capa_inputtype"><fieldset>`
      : `<div class="choicegroup capa_inputtype"><fieldset><legend class="response-fieldset-legend field-group-hd">${esc(p.stem)}</legend>`;
    return `
        <div class="wrapper-problem-response" tabindex="-1" role="group" aria-label="Question">
          ${stem}${choices}</fieldset>
            <div class="indicator-container">${graded ? `<span class="status ${graded}"><span class="sr">${graded}</span></span>` : '<span class="status unanswered"></span>'}</div>
          </div>
        </div>`;
  }

  function problemHtml(u, p, n) {
    if (p.instructional) {
      return `
<div class="vert vert-${n}">
  <div class="xblock xblock-student_view xblock-student_view-problem" data-block-type="problem">
    <div class="problems-wrapper" id="problem_${p.id}">
      <h3 class="hd hd-3 problem-header">${esc(p.title || 'คำชี้แจง')}</h3>
      <div class="problem"><p>${esc(p.stem)}</p></div>
    </div>
  </div>
</div>`;
    }
    const graded = state.graded[p.id];
    const maxAttempts = p.maxAttempts || 1;
    const used = state.attempts[p.id];
    const locked = graded && used >= maxAttempts;
    const progress = graded === 'correct' ? '1/1 point (graded)' : graded === 'incorrect' ? '0/1 point (graded)' : '1 point possible (graded)';
    return `
<div class="vert vert-${n}">
  <div class="xblock xblock-student_view xblock-student_view-problem" data-block-type="problem">
    <div class="problems-wrapper" id="problem_${p.id}">
      <h3 class="hd hd-3 problem-header">${esc(p.title || `Question ${n + 1}`)}</h3>
      <div class="problem-progress">${progress}</div>
      <div class="problem"><div>
        ${p.kind ? `<p>${esc(p.stem)}</p>` : ''}${inputsHtml(p, graded, locked)}
      </div></div>
      <div class="action"><div class="submit-attempt-container">
        <button type="button" class="submit btn-brand" data-value="Submit" data-problem="${p.id}" ${locked ? 'disabled' : ''}><span class="submit-label">${spec.submitLabel || 'Submit'}</span></button>
        <div class="submission-feedback">${graded ? 'Your answer has been received. ' : ''}You have used ${used} of ${maxAttempts} attempt${maxAttempts > 1 ? 's' : ''}</div>
      </div></div>
      </div>
    </div>
  </div>
</div>`;
  }

  function quizUnit(u) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${resizeScript}
<div class="vert-mod">${u.problems.map((p, n) => problemHtml(u, p, n)).join('')}</div>
<script>
  const UNIT = ${JSON.stringify(u.id)};
  document.querySelectorAll('button.submit').forEach(b => b.onclick = async () => {
    const pid = b.dataset.problem;
    const w0 = document.getElementById('problem_' + pid);
    const fields = Array.from(w0.querySelectorAll('select, input[type="text"]'));
    const sel = document.querySelector('input[name="input_' + pid + '"]:checked');
    const val = fields.length ? encodeURIComponent(JSON.stringify(fields.map(f => f.value))) : (sel ? sel.value : 'none');
    const res = await (await fetch('/submit/' + UNIT + '/' + pid + '/' + val, { method: 'POST' })).json();
    const w = document.getElementById('problem_' + pid);
    w.querySelector('.problem-progress').textContent = res.correct ? '1/1 point (graded)' : '0/1 point (graded)';
    w.querySelector('.indicator-container').innerHTML = '<span class="status ' + (res.correct ? 'correct' : 'incorrect') + '"></span>';
    b.disabled = true;
    if (res.unitComplete) parent.postMessage({ type: 'completed' }, '*');
  });
</script></body></html>`;
  }

  function progressData() {
    const done = units.filter(u => state.complete[u.id]).length;
    const graded = sequences.filter(sq => sq.graded && sq.units.some(u => (u.problems || []).some(p => !p.instructional))).map(sq => {
      const probs = sq.units.flatMap(u => (u.problems || []).filter(p => !p.instructional));
      return {
        chapter: sq.chapter, title: sq.title, url: seqHref(sq),
        earned: probs.filter(p => state.graded[p.id] === 'correct').length, possible: probs.length,
        problems: probs.map(p => `${state.graded[p.id] === 'correct' ? 1 : 0}/1`)
      };
    });
    return { completion: Math.round((100 * done) / units.length), graded };
  }

  // Learning MFE progress tab: rendered client-side after the API call, like frontend-app-learning
  // (CompletionDonutChart + GradeSummary + DetailedGrades tables with expandable problem scores).
  function progressPage() {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Progress | ${esc(spec.courseName)} | TSU COURSE</title></head>
<body style="margin:0;font-family:sans-serif">
<header style="height:60px;background:#0b6">TSU COURSE</header>
${tabs('Progress')}
<main id="main-content"><div class="spinner" role="status">Loading...</div></main>
<script>
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  setTimeout(async () => {
    const d = await (await fetch('/progress-data')).json();
    const chapters = [];
    d.graded.forEach(g => { let c = chapters.find(x => x.name === g.chapter); if (!c) chapters.push(c = { name: g.chapter, rows: [] }); c.rows.push(g); });
    document.getElementById('main-content').innerHTML = \`
      <h1>Your progress</h1>
      <section class="course-completion">
        <h2>Course completion</h2>
        <p>This represents how much of the course content you have completed. Note that some content may not yet be released.</p>
        <div class="donut"><svg class="donut-chart" role="img" width="160" height="160" viewBox="0 0 42 42">
          <circle class="donut-hole" cx="21" cy="21" r="15.9"></circle>
          <g class="donut-chart-text"><text class="donut-chart-number" x="50%" y="50%">\${d.completion}<tspan>%</tspan></text>
          <text class="donut-chart-label" x="50%" y="62%">completed</text></g></svg></div>
      </section>
      <section class="grade-summary"><h2>Grade summary</h2>
        <table class="pgn__data-table"><thead><tr><th>Assignment type</th><th>Weight</th><th>Grade</th></tr></thead>
        <tbody><tr><td>Quiz</td><td>100%</td><td>0%</td></tr></tbody></table></section>
      <section class="detailed-grades"><h2>Detailed grades</h2>
        \${chapters.map(c => \`<div class="pgn__data-table-wrapper detailed-grades-table"><table class="pgn__data-table" role="table">
          <thead><tr><th>\${esc(c.name)}</th><th class="text-right">Score</th></tr></thead><tbody>
          \${c.rows.map(r => \`<tr><td><div class="d-flex">
              <button class="btn btn-icon toggle" aria-label="Toggle individual problem scores for \${esc(r.title)}" aria-expanded="false">&#9660;</button>
              <a class="muted-link" href="\${r.url}">\${esc(r.title)}</a></div>
              <div class="problem-scores" hidden>Problem Scores: \${r.problems.join(' ')}</div></td>
            <td class="text-right">\${r.earned}/\${r.possible}</td></tr>\`).join('')}
          </tbody></table></div>\`).join('')}
      </section>\`;
    document.querySelectorAll('button.toggle').forEach(b => b.onclick = () => {
      const body = b.closest('td').querySelector('.problem-scores');
      body.hidden = !body.hidden; b.setAttribute('aria-expanded', String(!body.hidden));
    });
    document.querySelectorAll('.detailed-grades a').forEach(a => a.addEventListener('click', () =>
      navigator.sendBeacon('/event', JSON.stringify({ type: 'progress-link', title: a.textContent }))));
  }, 700);
</script></body></html>`;
  }

  // Course tab outline (frontend-app-learning CourseOutline): one card per section, subsection links
  // with a filled (fas, text-success) or hollow (far, text-gray-400) check-circle and an sr-only
  // ", Completed" / ", Incomplete". A subsection is complete when all of its units are.
  function outlineData() {
    const sections = [];
    sequences.forEach(sq => {
      let s = sections.find(x => x.title === sq.chapter);
      if (!s) sections.push(s = { title: sq.chapter, sequences: [] });
      s.sequences.push({
        title: sq.title, url: seqHref(sq), complete: sq.units.every(u => state.complete[u.id]),
        unitType: (sq.units[0] && sq.units[0].type) || 'quiz'
      });
    });
    sections.forEach(s => { s.complete = s.sequences.every(x => x.complete); });
    return { sections };
  }

  function homePage() {
    // spec.noCourseOutline: a course home whose outline the bot cannot read (fallback path).
    if (spec.noCourseOutline) {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(spec.courseName)} | Home</title></head><body>
        ${tabs('Course')}<h1>${esc(spec.courseName)}</h1><a class="btn btn-primary" href="${unitUrl(units[0])}">Resume course</a></body></html>`;
    }
    const home = spec.outlineHome || {};
    const expandText = home.expandText || 'Expand all';
    const collapseText = home.collapseText || 'Collapse all';
    const expandTag = home.expandTag || 'button';
    const useAria = home.ariaExpanded !== false;
    const typeIcons = !!home.typeIcons;
    const outlineId = home.outlineId || 'courseHome-outline';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Course | ${esc(spec.courseName)} | TSU COURSE</title>
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)} .text-success{color:#15376d} .text-gray-400{color:#adadad}
.collapsible-card-lg{border:1px solid #eee;margin:8px 0;padding:12px} #${esc(outlineId)} li{min-height:48px}</style></head>
<body style="margin:0;font-family:sans-serif">
<header style="height:60px;background:#0b6">TSU COURSE</header>
${tabs('Course')}
<main id="main-content"><h1>${esc(spec.courseName)}</h1>
  <div class="alert">Pick up where you left off <a class="btn btn-primary" href="${unitUrl(units[0])}">Resume course</a></div>
  <div id="outline-root"><div class="spinner" role="status">Loading...</div></div>
</main>
<script>
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const typeGlyph = t => t === 'video' ? 'play' : t === 'doc' ? 'file' : 'pencil';
  const typeSvg = unitType => '<svg aria-hidden="true" focusable="false" data-icon="' + typeGlyph(unitType) + '" class="svg-inline--fa fa-' + typeGlyph(unitType) + ' fa-fw float-left mt-1" width="16" height="16" style="color:#15376d"><title>' + typeGlyph(unitType) + '</title></svg>';
  const filled = what => '<svg aria-hidden="true" focusable="false" data-prefix="fas" data-icon="check-circle" class="svg-inline--fa fa-check-circle fa-fw float-left mt-1 text-success" width="16" height="16"><title>Completed ' + what + '</title><circle cx="8" cy="8" r="8" fill="currentColor"></circle></svg>';
  const hollow = what => '<svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="check-circle" class="svg-inline--fa fa-check-circle fa-fw float-left mt-1 text-gray-400" width="16" height="16"><title>Incomplete ' + what + '</title><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor"></circle></svg>';
  // Completed videos keep the play/file type icon *and* a filled check (live TSUGE000111).
  const icon = (done, what, unitType) => done
    ? ((${typeIcons} && what === 'assignment') ? typeSvg(unitType) : '') + filled(what)
    : (${typeIcons} && what === 'assignment' ? typeSvg(unitType) : hollow(what));
  let data, open = new Set(${home.startCollapsed ? '[]' : '[0]'}), expandAll = false;
  function render() {
    const expandLabel = expandAll ? ${JSON.stringify(collapseText)} : ${JSON.stringify(expandText)};
    const expandCtl = ${JSON.stringify(expandTag)} === 'a'
      ? '<a class="btn btn-outline-primary btn-block" id="expand-all" href="#outline">' + expandLabel + '</a>'
      : '<button class="btn btn-outline-primary btn-block" id="expand-all">' + expandLabel + '</button>';
    document.getElementById('outline-root').innerHTML = \`
      <div class="row">\${expandCtl}</div>
      <ol id="${esc(outlineId)}" class="list-unstyled block-tree">\${data.sections.map((s, i) => \`
        <li class="outline-item section"><div class="pgn_collapsible collapsible-card-lg\${open.has(i) ? ' is-open' : ''}">
          <div class="collapsible-trigger section-toggle" role="button" tabindex="0"${useAria ? ' aria-expanded="\${open.has(i)}"' : ''} data-sec="\${i}">
            <div class="collapsible-title section-name"><div class="d-flex row w-100 m-0"><div class="col-auto p-0">\${icon(s.complete, 'section')}</div>
              <div class="col-10 ml-3 p-0 font-weight-bold"><span class="align-middle">\${esc(s.title)}</span>
              <span class="sr-only">, \${s.complete ? 'Completed section' : 'Incomplete section'}</span></div></div></div>
            <span class="collapsible-icon">\${open.has(i) ? '&minus;' : '+'}</span>
          </div>
          \${open.has(i) ? \`<div class="collapsible-body"><ol class="list-unstyled">\${s.sequences.map(q => \`
            <li class="outline-item"><div class="row w-100 m-0"><div class="col-auto p-0">\${icon(q.complete, 'assignment', q.unitType)}</div>
              <div class="col-10 p-0 ml-3 text-break"><span class="align-middle"><a href="\${q.url}">\${esc(q.title)}</a></span>
              <span class="sr-only">, \${q.complete ? 'Completed' : 'Incomplete'}</span></div></div></li>\`).join('')}</ol></div>\` : ''}
        </div></li>\`).join('')}
      </ol>\`;
    document.getElementById('expand-all').onclick = (e) => {
      e.preventDefault();
      expandAll = !expandAll;
      open = expandAll ? new Set(data.sections.map((_, i) => i)) : new Set();
      render();
    };
    document.querySelectorAll('.collapsible-trigger').forEach(t => t.onclick = () => {
      const i = +t.dataset.sec; open.has(i) ? open.delete(i) : open.add(i); render();
    });
    document.querySelectorAll('#${esc(outlineId)} a').forEach(a => a.addEventListener('click', () =>
      navigator.sendBeacon('/event', JSON.stringify({ type: 'outline-link', title: a.textContent }))));
  }
  setTimeout(async () => { data = await (await fetch('/outline-data')).json(); render(); }, 600);
</script></body></html>`;
  }

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const send = (code, body, type = 'text/html; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
    let m;
    if (url === `/learning/course/${cid}/home`) {
      ev('outline-view');
      return send(200, homePage());
    }
    if (url === '/outline-data') return send(200, JSON.stringify(outlineData()), 'application/json');
    if (url === `/learning/course/${cid}/progress`) {
      ev('progress-view');
      return send(200, progressPage());
    }
    if (url === '/progress-data') return send(200, JSON.stringify(progressData()), 'application/json');
    if ((m = url.match(/^\/learning\/course\/[^/]+\/(block-v1:[^/]+type@sequential[^/]+)$/))) {
      const loc = openSeq(m[1]);
      if (!loc) return send(404, 'no sequence');
      res.writeHead(302, { Location: loc });
      return res.end();
    }
    if ((m = url.match(/^\/learning\/course\/[^/]+\/(block-v1:[^/]+type@vertical[^/]+)$/))) {
      const u = units.find(x => x.key === m[1]);
      if (!u) return send(404, 'no unit');
      ev('sequence-open', u.id, { seq: u.seqId });
      return send(200, shell(u));
    }
    if ((m = url.match(/^\/courses\/[^/]+\/courseware\/[^/]+\/([^/]+)\/?$/))) {
      const loc = openSeq(m[1]);
      if (!loc) return send(404, 'no sequence');
      res.writeHead(302, { Location: loc });
      return res.end();
    }
    if ((m = url.match(/^\/courses\/[^/]+\/jump_to_id\/([^/]+)\/?$/))) {
      const loc = openSeq(m[1]);
      if (!loc) {
        const u = units.find(x => x.id === m[1]);
        if (!u) return send(404, 'no jump_to_id');
        ev('sequence-open', u.id, { seq: u.seqId });
        res.writeHead(302, { Location: unitUrl(u) });
        return res.end();
      }
      res.writeHead(302, { Location: loc });
      return res.end();
    }
    if ((m = url.match(/^\/courses\/[^/]+\/jump_to\/(.+)$/))) {
      const loc = openSeq(decodeURIComponent(m[1]));
      if (!loc) return send(404, 'no jump_to');
      res.writeHead(302, { Location: loc });
      return res.end();
    }
    if ((m = url.match(/^\/learning\/course\/[^/]+\/block-v1:[^/]+type@sequential[^/]+\/(block-v1:.+)$/))) {
      const u = units.find(x => x.key === m[1]);
      return u ? send(200, shell(u)) : send(404, 'no unit');
    }
    if ((m = url.match(/^\/shell-fragment\/(.+)$/))) {
      const u = units.find(x => x.id === m[1]);
      return send(200, JSON.stringify(fragment(u)), 'application/json');
    }
    if ((m = url.match(/^\/xblock\/(.+)$/))) {
      const u = units.find(x => x.id === m[1]);
      if (!u) return send(404, 'no block');
      ev('xblock-load', u.id);
      return send(200, u.type === 'video' ? videoUnit(u) : u.type === 'doc' ? docUnit(u) : quizUnit(u));
    }
    if (url === '/state') return send(200, JSON.stringify({ complete: state.complete }), 'application/json');
    if ((m = url.match(/^\/complete\/(.+)$/)) && req.method === 'POST') {
      // u.completeAfter: completion is only recorded on that many-th report (e.g. a flaky first
      // view); u.neverComplete: never recorded (content the bot cannot finish).
      const u = units.find(x => x.id === m[1]);
      state.completeReports[m[1]] = (state.completeReports[m[1]] || 0) + 1;
      if (u && (u.neverComplete || state.completeReports[m[1]] < (u.completeAfter || 1))) {
        ev('complete-ignored', m[1]);
        return send(200, '{}', 'application/json');
      }
      state.complete[m[1]] = true; ev('complete', m[1]);
      return send(200, '{}', 'application/json');
    }
    if ((m = url.match(/^\/submit\/([^/]+)\/([^/]+)\/(.+)$/)) && req.method === 'POST') {
      const u = units.find(x => x.id === m[1]);
      const p = u.problems.find(x => x.id === m[2]);
      const values = p.kind ? JSON.parse(decodeURIComponent(m[3])) : null;
      const correct = p.kind ? JSON.stringify(values) === JSON.stringify(answersOf(p)) : m[3] === `choice_${p.answer}`;
      state.graded[p.id] = correct ? 'correct' : 'incorrect';
      state.attempts[p.id]++;
      ev('submit', u.id, { problem: p.id, choice: p.kind ? undefined : m[3], values, correct });
      const unitComplete = u.problems.filter(x => !x.instructional).every(x => state.graded[x.id]);
      if (unitComplete) { state.complete[u.id] = true; ev('complete', u.id); }
      return send(200, JSON.stringify({ correct, unitComplete }), 'application/json');
    }
    if (url === '/event' && req.method === 'POST') {
      let body = '';
      req.on('data', d => (body += d));
      req.on('end', () => { try { const o = JSON.parse(body); ev(o.type, o.unit, o); } catch (e) {} send(204, ''); });
      return;
    }
    if ((m = url.match(/^\/media\/(clip\d+s\.webm)$/))) {
      const CLIP = path.join(__dirname, m[1]);
      const size = fs.statSync(CLIP).size;
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (range) {
        const start = +range[1], end = range[2] ? +range[2] : size - 1;
        res.writeHead(206, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        return fs.createReadStream(CLIP, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': size });
      return fs.createReadStream(CLIP).pipe(res);
    }
    send(404, 'not found');
  });

  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ base, homeUrl: `${base}/learning/course/${cid}/home`, progressUrl: `${base}/learning/course/${cid}/progress`,
      unitUrl: u => base + unitUrl(units.find(x => x.id === u)), units, sequences, state, progressData, outlineData, close: () => new Promise(r => server.close(r)) });
  }));
}

module.exports = { startCourseServer };
