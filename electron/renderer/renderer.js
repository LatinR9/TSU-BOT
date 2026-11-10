(function () {
  const api = window.studyBot;
  const $ = (id) => document.getElementById(id);

  const fields = {
    courseUrl: $("courseUrl"),
    loginUrl: $("loginUrl"),
    lessonUrls: $("lessonUrls"),
    browserChannel: $("browserChannel"),
    playbackRate: $("playbackRate"),
    docReadSeconds: $("docReadSeconds"),
    maxVideoMinutes: $("maxVideoMinutes"),
    skipCompleted: $("skipCompleted"),
    muteVideo: $("muteVideo"),
  };
  const logEl = $("log");
  const statusPill = $("statusPill");
  const jobButtons = [$("btnLogin"), $("btnVideos"), $("btnDocuments"), $("btnAll")];
  const btnStop = $("btnStop");
  const btnCloseBrowser = $("btnCloseBrowser");

  const MODE_TEXT = {
    login: "กำลังรอเข้าสู่ระบบ…",
    videos: "กำลังเล่นวิดีโอ…",
    documents: "กำลังเปิดเอกสาร…",
    all: "กำลังทำตามลำดับ…",
  };

  function readForm() {
    return {
      courseUrl: fields.courseUrl.value.trim(),
      loginUrl: fields.loginUrl.value.trim(),
      lessonUrls: fields.lessonUrls.value,
      browserChannel: fields.browserChannel.value,
      playbackRate: Number(fields.playbackRate.value),
      docReadSeconds: Number(fields.docReadSeconds.value),
      maxVideoMinutes: Number(fields.maxVideoMinutes.value),
      skipCompleted: fields.skipCompleted.checked,
      muteVideo: fields.muteVideo.checked,
    };
  }

  function fillForm(s) {
    fields.courseUrl.value = s.courseUrl || "";
    fields.loginUrl.value = s.loginUrl || "";
    fields.lessonUrls.value = s.lessonUrls || "";
    fields.browserChannel.value = s.browserChannel || "auto";
    fields.playbackRate.value = String(s.playbackRate || 1);
    fields.docReadSeconds.value = s.docReadSeconds || 20;
    fields.maxVideoMinutes.value = s.maxVideoMinutes || 180;
    fields.skipCompleted.checked = s.skipCompleted !== false;
    fields.muteVideo.checked = Boolean(s.muteVideo);
  }

  function appendLog({ level, message, at }) {
    const time = new Date(at || Date.now()).toLocaleTimeString("th-TH", { hour12: false });
    const line = document.createElement("span");
    line.className = level;
    line.textContent = `[${time}] ${message}\n`;
    logEl.appendChild(line);
    while (logEl.childNodes.length > 2000) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(text, cls) {
    statusPill.textContent = text;
    statusPill.className = `status ${cls}`;
  }

  function setRunning(running, mode) {
    jobButtons.forEach((b) => (b.disabled = running));
    btnCloseBrowser.disabled = running;
    btnStop.disabled = !running;
    if (running) setStatus(MODE_TEXT[mode] || "กำลังทำงาน…", "running");
  }

  function validate(mode) {
    const s = readForm();
    const url = mode === "login" ? s.loginUrl || s.courseUrl : s.courseUrl;
    if (!url) {
      appendLog({ level: "warn", message: "กรุณาวางลิงก์หน้ารายวิชาก่อน" });
      fields.courseUrl.focus();
      return null;
    }
    try {
      new URL(url);
    } catch {
      appendLog({ level: "warn", message: `ลิงก์ไม่ถูกต้อง: ${url}` });
      return null;
    }
    return s;
  }

  async function start(mode) {
    const settings = validate(mode);
    if (!settings) return;
    setRunning(true, mode);
    const res = await api.startJob({ mode, settings });
    if (res?.ok) setStatus(mode === "login" ? "เข้าสู่ระบบแล้ว ✓" : "เสร็จแล้ว ✓", "ok");
    else if (res?.reason === "stopped") setStatus("หยุดแล้ว", "idle");
    else if (res?.reason === "busy") appendLog({ level: "warn", message: "มีงานกำลังทำอยู่ — กดหยุดก่อน" });
    else setStatus("ไม่สำเร็จ — ดูบันทึกด้านล่าง", "err");
  }

  $("btnLogin").addEventListener("click", () => start("login"));
  $("btnVideos").addEventListener("click", () => start("videos"));
  $("btnDocuments").addEventListener("click", () => start("documents"));
  $("btnAll").addEventListener("click", () => start("all"));
  btnStop.addEventListener("click", () => api.stopJob());
  btnCloseBrowser.addEventListener("click", () => api.closeBrowser());
  $("btnDownloads").addEventListener("click", () => api.openDownloads());
  $("btnClearLog").addEventListener("click", () => (logEl.textContent = ""));
  $("btnSave").addEventListener("click", async () => {
    await api.saveSettings(readForm());
    appendLog({ level: "info", message: "บันทึกค่าแล้ว" });
  });

  api.onLog(appendLog);
  api.onStatus((s) => setRunning(Boolean(s?.running), s?.mode));

  api.getSettings().then((s) => {
    fillForm(s || {});
    appendLog({
      level: "info",
      message: s?.courseUrl
        ? "พร้อมแล้ว — กด 1 เข้าสู่ระบบ แล้วกด 2 หรือ 3"
        : "เริ่มต้น: วางลิงก์หน้ารายวิชา แล้วกด 1 เข้าสู่ระบบ",
    });
  });
})();
