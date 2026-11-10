let activeWorkers = {};
let ws = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCourses();
  initWebSocket();
  loadWorkers();
  checkAppUpdate(true); // silent check on load
});

// WebSocket Connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        appendLog(data.payload.workerId, data.payload.text, data.payload.time);
      } else if (data.type === 'status') {
        updateWorkerStatus(data.payload);
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 2000);
  };
}

// Load Courses
async function loadCourses() {
  try {
    const res = await fetch('/api/courses');
    const data = await res.json();
    const select = document.getElementById('selectCourse');
    select.innerHTML = '<option value="">-- เลือกวิชา --</option>';

    data.courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.course_code;
      opt.textContent = `${c.course_code} : ${c.course_name} (ข้อสอบในฐาน: ${c.confirmedQuestions}/${c.totalQuestions})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load courses', err);
  }
}

// Open Login Browser
async function openLoginBrowser() {
  try {
    const res = await fetch('/api/login-browser', { method: 'POST' });
    const data = await res.json();
    alert('เปิดเบราว์เซอร์สำหรับล็อกอินแล้วครับ กรุณาล็อกอินบนหน้าเว็บให้เรียบร้อย');
  } catch (e) {
    alert('เกิดข้อผิดพลาดในการเปิดเบราว์เซอร์: ' + e.message);
  }
}

// Reset bot browser (cache, cookies, storage, saved login)
const RESET_CONFIRM = 'ล้างแคชเบราว์เซอร์ของบอท?\n\n' +
  'จะลบ: แคช คุกกี้ ข้อมูลเว็บ และการล็อกอิน TSU ที่บันทึกไว้\n' +
  'ไม่ลบ: ฐานเฉลย การตั้งค่า บันทึกการทำงาน และตัวเบราว์เซอร์ที่ดาวน์โหลดไว้\n\n' +
  'หลังล้างแล้วต้องกด "เปิดหน้าต่างล็อกอิน" เพื่อล็อกอินใหม่';

async function resetBrowser() {
  if (!confirm(RESET_CONFIRM)) return;
  const btn = document.getElementById('btnResetBrowser');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'กำลังล้าง...';
  try {
    const post = stopRunning => fetch('/api/reset-browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stopRunning })
    });
    let res = await post(false);
    let data = await res.json();
    if (res.status === 409 && data.running) {
      if (!confirm(`มีบอทหรือหน้าต่างล็อกอินทำงานอยู่ ${data.running} หน้าต่าง\nต้องการหยุดทั้งหมดแล้วล้างแคชเบราว์เซอร์หรือไม่?`)) return;
      res = await post(true);
      data = await res.json();
    }
    if (data.success) {
      loadWorkers();
      alert(data.removed
        ? 'ล้างแคชเบราว์เซอร์เรียบร้อยแล้ว กรุณาล็อกอิน TSU ใหม่ก่อนเริ่มบอท'
        : 'ไม่มีแคชเบราว์เซอร์ให้ล้าง (ยังไม่เคยเปิดเบราว์เซอร์หรือถูกล้างไปแล้ว)');
    } else {
      alert('ล้างแคชเบราว์เซอร์ไม่สำเร็จ: ' + (data.error || res.status));
    }
  } catch (e) {
    alert('ล้างแคชเบราว์เซอร์ไม่สำเร็จ: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// Create New Multi-Worker
async function createNewWorker() {
  const courseCode = document.getElementById('selectCourse').value;
  const targetUrl = document.getElementById('customUrl').value;
  const speedMode = document.getElementById('globalSpeed').value;

  try {
    const res = await fetch('/api/workers/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseCode, targetUrl, speedMode })
    });
    const data = await res.json();
    if (data.success) {
      loadWorkers();
    }
  } catch (e) {
    alert('ไม่สามารถเริ่มบอทได้: ' + e.message);
  }
}

// Load Active Workers
async function loadWorkers() {
  try {
    const res = await fetch('/api/workers');
    const data = await res.json();
    const container = document.getElementById('workersContainer');
    container.innerHTML = '';

    if (data.workers.length === 0) {
      container.innerHTML = '<div class="empty-state">ยังไม่มีหน้าต่างบอทที่กำลังรันอยู่ กดปุ่ม "เริ่มต้นบอทใหม่" ด้านบนเพื่อรัน</div>';
      return;
    }

    data.workers.forEach(w => {
      renderWorkerCard(w);
    });
  } catch (e) {}
}

function renderWorkerCard(w) {
  const container = document.getElementById('workersContainer');
  let card = document.getElementById(`card-${w.id}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'worker-card';
    card.id = `card-${w.id}`;
    container.appendChild(card);
  }

  card.innerHTML = `
    <div class="worker-header">
      <span class="worker-title">${w.id} (${w.courseCode || 'ทั่วไป'})</span>
      <span class="status-tag status-${w.status}" id="status-${w.id}">${w.status}</span>
    </div>
    <div class="worker-step" id="step-${w.id}">สถานะ: ${w.currentStep || 'กำลังทำงาน...'}</div>
    <div class="worker-stats">
      <span>โหมด: <strong>${w.speedMode}</strong></span>
      <span id="counter-${w.id}">ผ่านแล้ว: <strong>${w.itemsCompleted || 0} หน่วย</strong></span>
    </div>
    <div class="log-box" id="log-${w.id}"></div>
    <div class="worker-actions">
      <button class="btn btn-warning" onclick="pauseWorker('${w.id}')" type="button">พัก</button>
      <button class="btn btn-primary" onclick="resumeWorker('${w.id}')" type="button">ต่อ</button>
      <button class="btn btn-danger" onclick="stopWorker('${w.id}')" type="button">ปิด</button>
    </div>
  `;
}

function updateWorkerStatus(p) {
  const statusEl = document.getElementById(`status-${p.workerId}`);
  const stepEl = document.getElementById(`step-${p.workerId}`);
  const counterEl = document.getElementById(`counter-${p.workerId}`);

  if (statusEl) {
    statusEl.className = `status-tag status-${p.status}`;
    statusEl.textContent = p.status;
  }
  if (stepEl && p.step) {
    stepEl.textContent = `สถานะ: ${p.step}`;
  }
  if (counterEl && p.itemsCompleted !== undefined) {
    counterEl.innerHTML = `ผ่านแล้ว: <strong>${p.itemsCompleted} หน่วย</strong>`;
  }
}

function appendLog(workerId, text, time) {
  const box = document.getElementById(`log-${workerId}`);
  if (box) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${time}] ${text}`;
    box.appendChild(entry);
    box.scrollTop = box.scrollHeight;
  }
}

// Worker Actions
async function pauseWorker(id) {
  await fetch(`/api/workers/${id}/pause`, { method: 'POST' });
}
async function resumeWorker(id) {
  await fetch(`/api/workers/${id}/resume`, { method: 'POST' });
}
async function stopWorker(id) {
  if (confirm(`ต้องการปิดการทำงานของ ${id} หรือไม่?`)) {
    await fetch(`/api/workers/${id}/stop`, { method: 'POST' });
    const card = document.getElementById(`card-${id}`);
    if (card) card.remove();
  }
}

// Modal Handlers
function openAddCourseModal() {
  document.getElementById('addCourseModal').classList.add('active');
}
function closeAddCourseModal() {
  document.getElementById('addCourseModal').classList.remove('active');
}

async function saveNewCourse() {
  const code = document.getElementById('newCourseCode').value.trim();
  const name = document.getElementById('newCourseName').value.trim();
  const url = document.getElementById('newCourseUrl').value.trim();

  if (!code) return alert('กรุณาระบุรหัสวิชา');

  try {
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_code: code, course_name: name, url })
    });
    const data = await res.json();
    if (data.success) {
      alert('เพิ่มวิชาสำเร็จ!');
      closeAddCourseModal();
      loadCourses();
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาด: ' + e.message);
  }
}

// Check Updates
async function checkAppUpdate(silent = false) {
  try {
    const res = await fetch('/api/check-update');
    const info = await res.json();
    const versionBadge = document.getElementById('appVersion');
    if (versionBadge && info.currentVersion) {
      versionBadge.textContent = `v${info.currentVersion}`;
    }

    if (info.hasUpdate) {
      document.getElementById('updateModalBody').innerHTML = `
        <p class="update-lead"><strong>มีเวอร์ชันใหม่ให้อัปเดต!</strong></p>
        <p class="update-meta">เวอร์ชันปัจจุบัน: <strong>v${info.currentVersion}</strong> → เวอร์ชันล่าสุด: <strong class="update-latest">v${info.latestVersion}</strong></p>
        <p class="update-notes">${info.releaseNotes || 'การปรับปรุงประสิทธิภาพและเพิ่มฐานเฉลย'}</p>
        <a href="${info.downloadUrl}" target="_blank" class="btn btn-success">
          ดาวน์โหลดเวอร์ชันล่าสุด (.exe)
        </a>
      `;
      document.getElementById('updateModal').classList.add('active');
    } else if (!silent) {
      alert(`คุณกำลังใช้เวอร์ชันล่าสุดแล้ว (v${info.currentVersion})`);
    }
  } catch (e) {
    if (!silent) alert('ไม่สามารถเชื่อมต่อตรวจสอบอัปเดตได้');
  }
}

function closeUpdateModal() {
  document.getElementById('updateModal').classList.remove('active');
}
