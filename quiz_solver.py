# C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\quiz_solver.py
import json
import os
import re
import requests
from typing import Dict, List, Optional
from playwright.sync_api import Page, Locator

class QuizSolver:
    def __init__(self, page: Page, answer_bank_path: str = "answer_bank.json", api_key: str = ""):
        self.page = page
        self.answer_bank_path = answer_bank_path
        self.api_key = api_key
        self.answer_bank = self._load_answer_bank()

    def _load_answer_bank(self) -> Dict[str, str]:
        if os.path.exists(self.answer_bank_path):
            try:
                with open(self.answer_bank_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def save_answer(self, question: str, answer: str):
        cleaned_q = self._clean_text(question)
        self.answer_bank[cleaned_q] = answer
        try:
            with open(self.answer_bank_path, "w", encoding="utf-8") as f:
                json.dump(self.answer_bank, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _clean_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", text or "").strip()

    def query_llm_answer(self, question: str, options: List[str]) -> Optional[str]:
        """Query Gemini REST API to select the best answer from options."""
        if not self.api_key or not options:
            return options[0] if options else None

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.api_key}"
        prompt = (
            f"คำถาม: {question}\n"
            f"ตัวเลือก:\n" + "\n".join([f"- {opt}" for opt in options]) + "\n\n"
            "ตอบเฉพาะข้อความตัวเลือกที่ถูกต้องที่สุดเพียงบรรทัดเดียว ไม่ต้องอธิบายเพิ่ม"
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        try:
            res = requests.post(url, json=payload, timeout=10)
            if res.status_code == 200:
                data = res.json()
                candidate_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                # Find closest option
                for opt in options:
                    if opt in candidate_text or candidate_text in opt:
                        return opt
                return candidate_text
        except Exception:
            pass
        return options[0] if options else None

    def solve_current_quiz(self) -> bool:
        """Parse all questions on the page, select answers, and submit."""
        # Find question blocks
        q_selectors = [
            ".que",  # Moodle standard
            ".quiz-question",
            ".question-item",
            "div[class*='question']"
        ]
        
        q_elements = []
        for sel in q_selectors:
            locs = self.page.locator(sel).all()
            if locs:
                q_elements = locs
                break

        if not q_elements:
            return False

        for q_el in q_elements:
            try:
                # Extract question text
                q_text_loc = q_el.locator(".qtext, .question-text, .title, p").first
                question_text = self._clean_text(q_text_loc.inner_text() if q_text_loc.count() > 0 else "")
                if not question_text:
                    continue

                # Collect choices
                choice_locs = q_el.locator("label, .answer > div, input[type='radio'], input[type='checkbox']").all()
                options = []
                for cloc in choice_locs:
                    t = self._clean_text(cloc.inner_text())
                    if t and t not in options:
                        options.append(t)

                # Determine target answer
                target_answer = None
                for key in self.answer_bank:
                    if key in question_text or question_text in key:
                        target_answer = self.answer_bank[key]
                        break

                if not target_answer:
                    target_answer = self.query_llm_answer(question_text, options)

                # Click choice
                selected = False
                if target_answer:
                    for cloc in choice_locs:
                        text = self._clean_text(cloc.inner_text())
                        if target_answer in text or text in target_answer:
                            cloc.click()
                            selected = True
                            break
                
                # Fallback: pick first option if nothing matched
                if not selected and choice_locs:
                    choice_locs[0].click()

            except Exception:
                continue

        # Submit quiz
        self.submit_quiz()
        return True

    def submit_quiz(self):
        """Locate and trigger quiz submission."""
        submit_selectors = [
            "input[type='submit'][name='finishattempt']",
            "button:has-text('ส่งคำตอบ')",
            "button:has-text('ส่งแบบทดสอบ')",
            "button:has-text('Submit')",
            "button:has-text('Finish attempt...')"
        ]
        for sel in submit_selectors:
            try:
                btn = self.page.locator(sel).first
                if btn.is_visible(timeout=500):
                    btn.click()
                    break
            except Exception:
                pass

        # Confirm submission dialogs
        confirm_selectors = [
            "button:has-text('ยืนยัน')",
            "button:has-text('Submit all and finish')",
            "input[value='Submit all and finish']",
            ".modal-footer button.btn-primary"
        ]
        for csel in confirm_selectors:
            try:
                cbtn = self.page.locator(csel).first
                if cbtn.is_visible(timeout=500):
                    cbtn.click()
                    break
            except Exception:
                pass
