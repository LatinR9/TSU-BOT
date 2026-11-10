# C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\tsu_bot_gui.py
# -*- coding: utf-8 -*-
import json
import os
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox
import urllib.request
from pathlib import Path

DATA_FILE = Path(__file__).with_name("tsu_answers.json")
APP_VERSION = "1.0.0"
GITHUB_REPO = "LatinR9/TSU-BOT"

class TSUBotGUI:
    def __init__(self, root):
        self.root = root
        self.root.title(f"TSU-BOT Pro v{APP_VERSION} — Desktop Suite")
        self.root.geometry("820x640")
        self.root.configure(bg="#0f172a")

        self.courses_data = self.load_courses()
        self.workers = {}
        self.setup_ui()
        self.check_updates_async()

    def load_courses(self):
        if DATA_FILE.exists():
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"courses": []}

    def setup_ui(self):
        # Header
        header = tk.Frame(self.root, bg="#1e293b", padx=16, pady=12)
        header.pack(fill="x")

        lbl_title = tk.Label(header, text="⚡ TSU-BOT Pro (Desktop)", font=("Segoe UI", 16, "bold"), fg="#60a5fa", bg="#1e293b")
        lbl_title.pack(side="left")

        self.lbl_version = tk.Label(header, text=f"v{APP_VERSION}", font=("Segoe UI", 10, "bold"), fg="#93c5fd", bg="#334155", padx=8, pady=2)
        self.lbl_version.pack(side="left", padx=10)

        btn_chk = tk.Button(header, text="🔄 เช็คอัปเดต", command=self.check_updates_manual, bg="#3b82f6", fg="white", relief="flat")
        btn_chk.pack(side="right")

        # Control Toolbar
        toolbar = tk.Frame(self.root, bg="#0f172a", padx=16, pady=10)
        toolbar.pack(fill="x")

        btn_login = tk.Button(toolbar, text="🔐 เปิดหน้าต่างล็อกอินเว็บ TSU", command=self.open_login_browser, bg="#10b981", fg="white", font=("Segoe UI", 10, "bold"), relief="flat", padx=10, pady=4)
        btn_login.pack(side="left", padx=4)

        btn_add = tk.Button(toolbar, text="➕ เพิ่มวิชาใหม่", command=self.show_add_course_dialog, bg="#6366f1", fg="white", font=("Segoe UI", 10), relief="flat", padx=10, pady=4)
        btn_add.pack(side="left", padx=4)

        # Worker Launch Section
        launch_frame = tk.LabelFrame(self.root, text=" เริ่มต้นบอทใหม่ (Multi-Browser Launcher) ", bg="#1e293b", fg="#93c5fd", font=("Segoe UI", 10, "bold"), padx=12, pady=10)
        launch_frame.pack(fill="x", padx=16, pady=6)

        tk.Label(launch_frame, text="เลือกวิชา:", bg="#1e293b", fg="white").grid(row=0, column=0, sticky="w", pady=4)
        self.course_combo = ttk.Combobox(launch_frame, width=45, state="readonly")
        course_list = [f"{c['course_code']} - {c.get('course_name', '')}" for c in self.courses_data.get("courses", [])]
        self.course_combo["values"] = course_list
        if course_list:
            self.course_combo.current(0)
        self.course_combo.grid(row=0, column=1, sticky="w", padx=6, pady=4)

        tk.Label(launch_frame, text="ความเร็ว:", bg="#1e293b", fg="white").grid(row=0, column=2, sticky="w", pady=4)
        self.speed_combo = ttk.Combobox(launch_frame, width=15, state="readonly", values=["turbo", "normal", "safe"])
        self.speed_combo.current(1)
        self.speed_combo.grid(row=0, column=3, sticky="w", padx=6, pady=4)

        btn_start = tk.Button(launch_frame, text="▶️ เริ่มบอท (New Tab/Browser)", command=self.start_worker, bg="#2563eb", fg="white", font=("Segoe UI", 10, "bold"), relief="flat", padx=12, pady=4)
        btn_start.grid(row=0, column=4, padx=10, pady=4)

        # Multi-Browser Workers List
        workers_frame = tk.LabelFrame(self.root, text=" หน้าต่างบอทที่กำลังทำงาน ", bg="#1e293b", fg="#93c5fd", font=("Segoe UI", 10, "bold"), padx=12, pady=10)
        workers_frame.pack(fill="both", expand=True, padx=16, pady=6)

        self.log_text = tk.Text(workers_frame, bg="#090d16", fg="#a5b4fc", font=("Consolas", 10), insertbackground="white")
        self.log_text.pack(fill="both", expand=True)

    def log(self, message):
        self.log_text.insert("end", f"{message}\n")
        self.log_text.see("end")

    def open_login_browser(self):
        self.log("[*] กำลังเปิดเบราว์เซอร์สำหรับเข้าสู่ระบบ TSU...")
        threading.Thread(target=self._launch_login_browser, daemon=True).start()

    def _launch_login_browser(self):
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                context = p.chromium.launch_persistent_context("user_profile", headless=False)
                page = context.new_page()
                page.goto("https://apps.course.tsu.ac.th/login")
                self.log("[+] หน้าต่างล็อกอินเปิดแล้ว เมื่อล็อกอินเสร็จ สามารถปิดหรือปล่อยไว้ได้")
                while not page.is_closed():
                    page.wait_for_timeout(1000)
        except Exception as e:
            self.log(f"[!] เกิดข้อผิดพลาด: {e}")

    def start_worker(self):
        selected = self.course_combo.get()
        course_code = selected.split(" - ")[0] if selected else ""
        speed = self.speed_combo.get()
        worker_id = f"Worker-{len(self.workers) + 1}"
        self.log(f"🚀 เริ่มต้น {worker_id} สำหรับวิชา {course_code} (โหมด: {speed})")

        thread = threading.Thread(target=self._run_worker_thread, args=(worker_id, course_code, speed), daemon=True)
        self.workers[worker_id] = {"thread": thread, "running": True}
        thread.start()

    def _run_worker_thread(self, worker_id, course_code, speed):
        from tsu_bot import TSUBot
        from playwright.sync_api import sync_playwright
        try:
            with sync_playwright() as p:
                context = p.chromium.launch_persistent_context("user_profile", headless=False)
                page = context.new_page()
                page.goto("https://apps.course.tsu.ac.th/learning/courses")
                bot = TSUBot(page, course_code=course_code)
                self.log(f"[{worker_id}] บราวเซอร์พร้อมทำงาน เริ่มวนลูปวิชา {course_code}")

                while self.workers.get(worker_id, {}).get("running", False):
                    if page.is_closed():
                        break
                    if bot.handle_video():
                        self.log(f"[{worker_id}] ดูวิดีโอเรียบร้อย")
                    elif page.locator(".problem, button.submit").count() > 0:
                        bot.handle_quiz()
                        self.log(f"[{worker_id}] ทำควิซเรียบร้อย")
                    else:
                        bot.handle_document()

                    if not bot.go_next():
                        self.log(f"[{worker_id}] จบบทเรียนหรือถึงหน่วยสุดท้ายแล้ว")
                        break
                    page.wait_for_timeout(2000)
        except Exception as e:
            self.log(f"[{worker_id}] ข้อผิดพลาด: {e}")

    def show_add_course_dialog(self):
        dlg = tk.Toplevel(self.root)
        dlg.title("เพิ่มวิชาใหม่")
        dlg.geometry("400x250")
        dlg.configure(bg="#1e293b")

        tk.Label(dlg, text="รหัสวิชา (เช่น TSUGE000111):", bg="#1e293b", fg="white").pack(anchor="w", padx=16, pady=4)
        txt_code = tk.Entry(dlg, width=30)
        txt_code.pack(padx=16, pady=2)

        tk.Label(dlg, text="ชื่อวิชา:", bg="#1e293b", fg="white").pack(anchor="w", padx=16, pady=4)
        txt_name = tk.Entry(dlg, width=30)
        txt_name.pack(padx=16, pady=2)

        def save():
            code = txt_code.get().strip()
            name = txt_name.get().strip()
            if not code:
                return messagebox.showwarning("เตือน", "กรุณาระบุรหัสวิชา")
            new_item = {"course_code": code, "course_name": name, "sections": []}
            self.courses_data.setdefault("courses", []).append(new_item)
            try:
                with open("custom_courses.json", "w", encoding="utf-8") as f:
                    json.dump(self.courses_data.get("courses", []), f, ensure_ascii=False, indent=2)
                messagebox.showinfo("สำเร็จ", f"เพิ่มวิชา {code} สำเร็จ")
                dlg.destroy()
                self.course_combo["values"] = [f"{c['course_code']} - {c.get('course_name', '')}" for c in self.courses_data.get("courses", [])]
            except Exception as e:
                messagebox.showerror("ผิดพลาด", str(e))

        tk.Button(dlg, text="💾 บันทึก", command=save, bg="#10b981", fg="white", relief="flat", padx=12, pady=4).pack(pady=16)

    def check_updates_async(self):
        threading.Thread(target=self._check_updates, args=(False,), daemon=True).start()

    def check_updates_manual(self):
        threading.Thread(target=self._check_updates, args=(True,), daemon=True).start()

    def _check_updates(self, verbose=False):
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
            req = urllib.request.Request(url, headers={"User-Agent": "TSU-BOT"})
            with urllib.request.urlopen(req, timeout=5) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode())
                    tag = data.get("tag_name", "").replace("v", "")
                    if tag and tag > APP_VERSION:
                        if messagebox.askyesno("อัปเดตใหม่", f"มีเวอร์ชันใหม่ v{tag} (ปัจจุบัน v{APP_VERSION})\nต้องการเปิดหน้าดาวน์โหลดหรือไม่?"):
                            import webbrowser
                            webbrowser.open(data.get("html_url", url))
                        return
            if verbose:
                messagebox.showinfo("อัปเดต", f"คุณกำลังใช้งานเวอร์ชันล่าสุด (v{APP_VERSION}) อยู่แล้ว")
        except Exception:
            if verbose:
                messagebox.showwarning("อัปเดต", "ไม่สามารถเชื่อมต่อเพื่อตรวจสอบอัปเดตได้")

if __name__ == "__main__":
    root = tk.Tk()
    app = TSUBotGUI(root)
    root.mainloop()
