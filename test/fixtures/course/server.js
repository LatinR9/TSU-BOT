// Local stand-in for apps.course.tsu.ac.th (Open edX learning MFE + LMS xblock iframe).
// Not the live TSU site: markup and completion rules are modeled on Open edX defaults
// (sequence nav check icons, iframe#unit-iframe, capa problems, video complete at 95%,
// HTML/document blocks complete after being viewed).
const http = require('http');
const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function startCourseServer(spec) {
  const cid = `course-v1:TSU+${spec.courseCode}+2026_T1`;
  const units = spec.units.map((u, i) => ({ ...u, idx: i, key: `block-v1:TSU+${spec.courseCode}+2026_T1+type@vertical+block@${u.id}` }));
  const state = {
    complete: Object.fromEntries(units.map(u => [u.id, !!u.complete])),
    graded: Object.fromEntries(units.flatMap(u => (u.problems || []).map(p => [p.id, p.preGraded ? 'correct' : null]))),
    events: []
  };
  const ev = (type, unit, data = {}) => state.events.push({ t: Date.now(), type, unit, ...data });
  const unitUrl = u => `/learning/course/${cid}/${u.key}`;

  function shell(u) {
    const navItems = units.map(x => `
      <li><button class="btn nav-link${x.id === u.id ? ' active' : ''}" data-unit="${x.id}" ${x.id === u.id ? 'aria-current="page"' : ''}
          aria-label="${esc(x.title)}${state.complete[x.id] ? ', Completed' : ''}">
        <span class="pgn__icon unit-icon"><svg width="16" height="16"></svg></span>
        ${state.complete[x.id] ? '<span class="pgn__icon text-success complete-checkmark"><svg width="16" height="16" data-icon="check"></svg></span>' : ''}
      </button></li>`).join('');
    const prev = units[u.idx - 1], next = units[u.idx + 1];
    return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>${esc(u.title)} | ${esc(spec.courseName)} | TSU COURSE</title></head>
<body style="margin:0;font-family:sans-serif">
<header style="height:60px;background:#0b6">TSU COURSE</header>
<aside class="course-outline-sidebar" style="position:fixed;right:0;top:60px;width:200px">
  <h4>Course Outline</h4><ul><li>แบบทดสอบก่อนเรียน (Pre-Test)</li>${spec.outline.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
</aside>
<main style="margin-right:220px">
  <nav aria-label="breadcrumb" class="breadcrumbs"><ol><li>${esc(spec.courseName)}</li><li>${esc(u.section)}</li></ol></nav>
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
      const has = b.querySelector('.complete-checkmark');
      if (done && !has) b.insertAdjacentHTML('beforeend', '<span class="pgn__icon text-success complete-checkmark"><svg width="16" height="16" data-icon="check"></svg></span>');
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

  function problemHtml(u, p, n) {
    const graded = state.graded[p.id];
    const progress = graded === 'correct' ? '1/1 point (graded)' : graded === 'incorrect' ? '0/1 point (graded)' : '1 point possible (graded)';
    const choices = p.choices.map((c, ci) => `
        <div class="field">
          <input type="radio" name="input_${p.id}" id="input_${p.id}_choice_${ci}" class="field-input input-radio" value="choice_${ci}" ${graded && p.answer === ci ? 'checked' : ''} ${graded ? 'disabled' : ''}>
          <label id="${p.id}-choice_${ci}-label" for="input_${p.id}_choice_${ci}" class="response-label field-label label-inline">${esc(c)}</label>
        </div>`).join('');
    const stem = p.stemAsParagraph
      ? `<p>${esc(p.stem)}</p><div class="choicegroup capa_inputtype"><fieldset>`
      : `<div class="choicegroup capa_inputtype"><fieldset><legend class="response-fieldset-legend field-group-hd">${esc(p.stem)}</legend>`;
    return `
<div class="vert vert-${n}">
  <div class="xblock xblock-student_view xblock-student_view-problem" data-block-type="problem">
    <div class="problems-wrapper" id="problem_${p.id}">
      <h3 class="hd hd-3 problem-header">Question ${n + 1}</h3>
      <div class="problem-progress">${progress}</div>
      <div class="problem"><div>
        <div class="wrapper-problem-response" tabindex="-1" role="group" aria-label="Question ${n + 1}">
          ${stem}${choices}</fieldset>
            <div class="indicator-container">${graded ? `<span class="status ${graded}"><span class="sr">${graded}</span></span>` : '<span class="status unanswered"></span>'}</div>
          </div>
        </div>
      </div>
      <div class="action"><div class="submit-attempt-container">
        <button type="button" class="submit btn-brand" data-value="Submit" data-problem="${p.id}" ${graded ? 'disabled' : ''}><span class="submit-label">${spec.submitLabel || 'Submit'}</span></button>
        ${graded ? '<div class="submission-feedback">Your answer has been received. You have used 1 of 1 attempt</div>' : ''}
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
    const sel = document.querySelector('input[name="input_' + pid + '"]:checked');
    const res = await (await fetch('/submit/' + UNIT + '/' + pid + '/' + (sel ? sel.value : 'none'), { method: 'POST' })).json();
    const w = document.getElementById('problem_' + pid);
    w.querySelector('.problem-progress').textContent = res.correct ? '1/1 point (graded)' : '0/1 point (graded)';
    w.querySelector('.indicator-container').innerHTML = '<span class="status ' + (res.correct ? 'correct' : 'incorrect') + '"></span>';
    b.disabled = true;
    if (res.unitComplete) parent.postMessage({ type: 'completed' }, '*');
  });
</script></body></html>`;
  }

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const send = (code, body, type = 'text/html; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
    let m;
    if (url === `/learning/course/${cid}/home`) {
      return send(200, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(spec.courseName)} | Home</title></head><body>
        <h1>${esc(spec.courseName)}</h1><a class="btn btn-primary" href="${unitUrl(units[0])}">Resume course</a>
        <ol class="outline-sections">${units.map(x => `<li><a href="${unitUrl(x)}">${esc(x.title)}</a></li>`).join('')}</ol></body></html>`);
    }
    if ((m = url.match(/^\/learning\/course\/[^/]+\/(block-v1:.+)$/))) {
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
      state.complete[m[1]] = true; ev('complete', m[1]);
      return send(200, '{}', 'application/json');
    }
    if ((m = url.match(/^\/submit\/([^/]+)\/([^/]+)\/(.+)$/)) && req.method === 'POST') {
      const u = units.find(x => x.id === m[1]);
      const p = u.problems.find(x => x.id === m[2]);
      const correct = m[3] === `choice_${p.answer}`;
      state.graded[p.id] = correct ? 'correct' : 'incorrect';
      ev('submit', u.id, { problem: p.id, choice: m[3], correct });
      const unitComplete = u.problems.every(x => state.graded[x.id] === 'correct');
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
    resolve({ base, homeUrl: `${base}/learning/course/${cid}/home`, units, state, close: () => new Promise(r => server.close(r)) });
  }));
}

module.exports = { startCourseServer };
