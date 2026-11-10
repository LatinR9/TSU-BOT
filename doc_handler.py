# C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\doc_handler.py
import time
from playwright.sync_api import Page

class DocumentHandler:
    def __init__(self, page: Page, step_delay_sec: float = 1.5):
        self.page = page
        self.step_delay_sec = step_delay_sec

    def scroll_and_read(self, min_total_seconds: int = 15) -> bool:
        """Simulate realistic scrolling behavior to fulfill document view requirements."""
        total_height = self.page.evaluate("() => document.body.scrollHeight")
        viewport_height = self.page.evaluate("() => window.innerHeight")
        
        current_scroll = 0
        scroll_step = max(300, viewport_height // 2)
        elapsed = 0
        start = time.time()

        while current_scroll < total_height:
            current_scroll += scroll_step
            self.page.evaluate(f"window.scrollTo({{ top: {current_scroll}, behavior: 'smooth' }})")
            time.sleep(self.step_delay_sec)
            
            # Update scrollHeight dynamically in case lazy loading is present
            total_height = self.page.evaluate("() => document.body.scrollHeight")

        # Handle paginated slide decks if present (e.g. Next slide button)
        self.handle_slide_pagination()

        # Ensure minimum required view time is met
        remaining = min_total_seconds - (time.time() - start)
        if remaining > 0:
            time.sleep(remaining)

        # Attempt to click completion mark or next button
        self.click_complete_mark()
        return True

    def handle_slide_pagination(self):
        """Advance embedded PDF or slide readers until reaching the last slide."""
        next_selectors = [
            ".pdf-next",
            "#next-slide",
            "button[aria-label='Next page']",
            "button[title='Next']",
            ".slide-next-btn"
        ]
        max_pages = 100
        for _ in range(max_pages):
            advanced = False
            for sel in next_selectors:
                try:
                    btn = self.page.locator(sel).first
                    if btn.is_visible(timeout=200) and btn.is_enabled():
                        btn.click()
                        time.sleep(self.step_delay_sec)
                        advanced = True
                        break
                except Exception:
                    pass
            if not advanced:
                break

    def click_complete_mark(self):
        """Click mark as read / finished button if present."""
        mark_selectors = [
            "button:has-text('ทำเครื่องหมายว่าเสร็จสิ้น')",
            "button:has-text('อ่านจบแล้ว')",
            "button:has-text('เสร็จสิ้น')",
            "button:has-text('Mark as done')",
            "button:has-text('Complete')",
            "input[type='submit'][value*='เสร็จ']"
        ]
        for sel in mark_selectors:
            try:
                elem = self.page.locator(sel).first
                if elem.is_visible(timeout=300):
                    elem.click()
                    time.sleep(1)
                    break
            except Exception:
                pass
