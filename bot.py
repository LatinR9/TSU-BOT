# C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\bot.py
import json
import os
import sys
import time
from playwright.sync_api import sync_playwright

from video_handler import VideoHandler
from doc_handler import DocumentHandler
from quiz_solver import QuizSolver

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

def load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "target_url": "about:blank",
        "headless": False,
        "video_playback_rate": 1.0,
        "auto_skip_checkpoints": True,
        "document_scroll_step_delay_sec": 1.5,
        "gemini_api_key": ""
    }

def run_bot():
    cfg = load_config()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=cfg.get("headless", False))
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print(f"[*] Navigating to {cfg.get('target_url')}...")
        page.goto(cfg.get("target_url"), timeout=60000)

        # Allow user to perform initial login if not authenticated
        print("[*] Browser is open. Please log in if authentication is required.")
        print("[*] Press Enter in this console once you are on the course page to start automation...")
        try:
            input()
        except EOFError:
            time.sleep(5)

        video_h = VideoHandler(
            page,
            playback_rate=cfg.get("video_playback_rate", 1.0),
            auto_skip_checkpoints=cfg.get("auto_skip_checkpoints", True)
        )
        doc_h = DocumentHandler(
            page,
            step_delay_sec=cfg.get("document_scroll_step_delay_sec", 1.5)
        )
        quiz_s = QuizSolver(
            page,
            answer_bank_path=os.path.join(os.path.dirname(__file__), cfg.get("answer_bank_file", "answer_bank.json")),
            api_key=cfg.get("gemini_api_key", "")
        )

        print("[*] Running automated course progression loop...")
        while True:
            # Check 1: Video elements
            if video_h.detect_video():
                print("[+] Video detected. Starting playback monitor...")
                finished = video_h.watch_to_completion()
                print(f"[+] Video completed: {finished}")

            # Check 2: Quiz elements
            elif page.locator(".que, .quiz-question, form[id*='quiz']").count() > 0:
                print("[+] Quiz detected. Solving questions...")
                quiz_s.solve_current_quiz()
                print("[+] Quiz submitted.")

            # Check 3: Document / Reading material
            else:
                print("[+] Document/Text content detected. Reading and scrolling...")
                doc_h.scroll_and_read(min_total_seconds=10)

            # Look for "Next Activity" or "Next" navigation button
            next_nav_selectors = [
                "a:has-text('ถัดไป')",
                "a:has-text('บทเรียนถัดไป')",
                "button:has-text('ถัดไป')",
                "a:has-text('Next activity')",
                "a:has-text('Next')",
                ".nav-next",
                "#next-activity-link"
            ]
            navigated = False
            for sel in next_nav_selectors:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=1000):
                        print(f"[*] Advancing to next activity: {sel}")
                        btn.click()
                        page.wait_for_load_state("networkidle", timeout=15000)
                        navigated = True
                        break
                except Exception:
                    pass

            if not navigated:
                print("[!] No next lesson button found. Pausing loop (press Enter to re-scan or Ctrl+C to stop)...")
                try:
                    input()
                except EOFError:
                    break

            time.sleep(2)

if __name__ == "__main__":
    run_bot()
