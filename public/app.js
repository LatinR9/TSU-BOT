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
      container.innerHTML = '<div style="color: #64748b; padding: 20px;">ยังไม่มีหน้าต่างบอทที่กำลังรันอยู่ กดปุ่ม "เริ่มต้นบอทใหม่" ด้านบนเพื่อรัน</div>';
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
      <button class="btn btn-warning" onclick="pauseWorker('${w.id}')">⏸️ พัก</button>
      <button class="btn btn-primary" onclick="resumeWorker('${w.id}')">▶️ ต่อ</button>
      <button class="btn btn-danger" onclick="stopWorker('${w.id}')">⏹️ ปิด</button>
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
        <p>🎉 <strong>มีเวอร์ชันใหม่ให้อัปเดต!</strong></p>
        <p>เวอร์ชันปัจจุบัน: <strong>v${info.currentVersion}</strong> ➜ เวอร์ชันล่าสุด: <strong style="color: #34d399;">v${info.latestVersion}</strong></p>
        <p style="margin-top: 10px; font-size: 13px; color: #94a3b8;">${info.releaseNotes || 'การปรับปรุงประสิทธิภาพและเพิ่มฐานเฉลย'}</p>
        <a href="${info.downloadUrl}" target="_blank" class="btn btn-success" style="margin-top: 15px; text-decoration: none; justify-content: center;">
          ⬇️ ดาวน์โหลดเวอร์ชันล่าสุด (.exe)
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
