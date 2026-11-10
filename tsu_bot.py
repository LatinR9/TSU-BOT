# C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\tsu_bot.py
# -*- coding: utf-8 -*-
"""
TSU MOOC (apps.course.tsu.ac.th) Automation Bot
- Video auto-fast-forward (~10s before end) & next
- Document reading timer & next
- Quiz solver with tsu_answers.json (difflib matching)
- Pre-test randomizer policy
"""

import difflib
import json
import os
import random
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, Frame

DATA_FILE = Path(__file__).with_name("tsu_answers.json")

class TSUBot:
    def __init__(self, page: Page, course_code: str = ""):
        self.page = page
        self.course_code = course_code
        self.answers_db = self._load_answers()

    def _load_answers(self):
        if DATA_FILE.exists():
            try:
                return json.loads(DATA_FILE.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"[!] Warning: Failed to load answer database: {e}")
        return {"courses": []}

    def lookup_answer(self, question_text: str, cutoff: float = 0.55):
        """Match question against database using difflib fuzzy matching."""
        if not self.answers_db.get("courses"):
            return None

        candidates = []
        for course in self.answers_db["courses"]:
            if self.course_code and course.get("course_code") != self.course_code:
                continue
            for section in course.get("sections", []):
                for item in section.get("questions", []):
                    candidates.append((section.get("section", ""), item))

        if not candidates:
            return None

        questions = [item["question"] for _, item in candidates]
        hits = difflib.get_close_matches(question_text, questions, n=1, cutoff=cutoff)
        if hits:
            matched_hit = hits[0]
            for sec, item in candidates:
                if item["question"] == matched_hit:
                    return {
                        "section": sec,
                        "question": item["question"],
                        "correct_answer": item.get("correct_answer"),
                        "status": item.get("status"),
                        "known_wrong_answers": item.get("known_wrong_answers", []),
                        "notes": item.get("notes", "")
                    }
        return None

    def handle_video(self) -> bool:
        """Handle video per TSU rule: play -> wait 1-2s -> seek to last ~10s -> next."""
        # Find video element across page and iframes
        video_frame = None
        frames = [self.page.main_frame] + self.page.frames
        for frame in frames:
            try:
                if frame.evaluate("() => document.querySelector('video') !== null"):
                    video_frame = frame
                    break
            except Exception:
                continue

        if not video_frame:
            return False

        print("[+] Video found. Initializing playback...")
        # 1. Click play & unmute
        video_frame.evaluate("""() => {
            const v = document.querySelector('video');
            if (v) {
                v.muted = true;
                v.play().catch(() => {});
            }
        }""")

        # 2. Wait until playback starts (1-2 seconds with currentTime > 0)
        started = False
        for _ in range(15):
            cur = video_frame.evaluate("""() => {
                const v = document.querySelector('video');
                return v ? v.currentTime : 0;
            }""")
            if cur > 0.5:
                started = True
                break
            time.sleep(1)

        if not started:
            print("[!] Video did not start playing. Retrying play...")
            video_frame.evaluate("() => { const v = document.querySelector('video'); if (v) v.play().catch(() => {}); }")
            time.sleep(2)

        # 3. Seek to last 10 seconds
        status = video_frame.evaluate("""() => {
            const v = document.querySelector('video');
            if (!v) return null;
            const dur = v.duration || 0;
            if (dur > 15) {
                v.currentTime = Math.max(0, dur - 10);
            }
            return { duration: dur, currentTime: v.currentTime };
        }""")
        print(f"[+] Video seeked to: {status}")
        time.sleep(3)
        return True

    def handle_document(self):
        """Handle document per TSU rule: wait loaded + 5s wait."""
        print("[+] Document view: waiting for render and reading delay...")
        time.sleep(5)

    def handle_quiz(self, is_pretest: bool = False):
        """Answer quiz questions based on tsu_answers.json or random choice for pre-test."""
        print(f"[+] Quiz detected (pre-test={is_pretest}). Solving...")
        # Open edX question problems
        problems = self.page.locator(".problem, .xblock-student_view[data-block-type='problem']").all()
        if not problems:
            # Fallback general selectors
            problems = self.page.locator(".que, .quiz-question, form").all()

        for prob in problems:
            try:
                q_text = prob.locator("legend, .question-title, p, h3").first.inner_text().strip()
                choices = prob.locator("label, input[type='radio'], input[type='checkbox']").all()

                if is_pretest:
                    # Random answer policy for pre-tests
                    if choices:
                        random.choice(choices).click()
                else:
                    ans_data = self.lookup_answer(q_text)
                    selected = False
                    if ans_data and ans_data.get("status") == "confirmed" and ans_data.get("correct_answer"):
                        target_ans = ans_data["correct_answer"].strip()
                        for ch in choices:
                            if target_ans in ch.inner_text().strip():
                                ch.click()
                                selected = True
                                break
                    if not selected and choices:
                        # If unconfirmed, avoid known wrong answers
                        wrong = ans_data.get("known_wrong_answers", []) if ans_data else []
                        valid_choices = [c for c in choices if not any(w in c.inner_text() for w in wrong)]
                        if valid_choices:
                            valid_choices[0].click()
                        else:
                            choices[0].click()
            except Exception:
                continue

        # Submit attempt
        sub_btn = self.page.locator("button.submit, button:has-text('Submit'), button:has-text('ส่ง')").first
        if sub_btn.is_visible(timeout=1000):
            sub_btn.click()
            time.sleep(2)

    def go_next(self) -> bool:
        """Click next sequence button."""
        next_btns = [
            "button.sequence-nav-button.button-next",
            "button:has-text('Next')",
            "a:has-text('ถัดไป')",
            ".next-btn"
        ]
        for sel in next_btns:
            try:
                btn = self.page.locator(sel).first
                if btn.is_visible(timeout=1000) and btn.is_enabled():
                    btn.click()
                    self.page.wait_for_load_state("networkidle", timeout=15000)
                    return True
            except Exception:
                pass
        return False

def main():
    print("==================================================")
    print(" TSU MOOC Automated Learning Bot (apps.course.tsu.ac.th)")
    print("==================================================")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print("[*] Opening TSU Course login page...")
        page.goto("https://apps.course.tsu.ac.th/login", timeout=60000)
        print("[*] Please log in manually and navigate to your course.")
        print("[*] Once ready on the course unit page, press ENTER to start automation...")
        try:
            input()
        except EOFError:
            time.sleep(5)

        bot = TSUBot(page)
        while True:
            # Check unit type
            url = page.url.lower()
            is_pretest = "pre-test" in url or "pretest" in url or "ก่อนเรียน" in page.content()

            if bot.handle_video():
                print("[+] Handled video unit.")
            elif page.locator(".problem, button.submit").count() > 0:
                bot.handle_quiz(is_pretest=is_pretest)
            else:
                bot.handle_document()

            print("[*] Moving to next unit...")
            if not bot.go_next():
                print("[!] Reached end of sequence or no next button found.")
                print("[*] Press ENTER to re-check, or Ctrl+C to exit.")
                try:
                    input()
                except EOFError:
                    break
            time.sleep(2)

if __name__ == "__main__":
    main()
