# C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\video_handler.py
import time
from typing import Optional
from playwright.sync_api import Page, Frame

class VideoHandler:
    def __init__(self, page: Page, playback_rate: float = 1.0, auto_skip_checkpoints: bool = True):
        self.page = page
        self.playback_rate = playback_rate
        self.auto_skip_checkpoints = auto_skip_checkpoints

    def detect_video(self) -> Optional[dict]:
        """Detect video elements across main page and iframes."""
        candidates = [self.page.main_frame] + self.page.frames
        for frame in candidates:
            try:
                has_video = frame.evaluate("() => document.querySelector('video') !== null")
                if has_video:
                    return {"frame": frame}
            except Exception:
                continue
        return None

    def handle_popups_and_checkpoints(self, frame: Frame):
        """Click through interactive pauses, modal alerts, or 'continue' prompts."""
        checkpoint_selectors = [
            "button:has-text('เล่นต่อ')",
            "button:has-text('ต่อไป')",
            "button:has-text('ตกลง')",
            "button:has-text('Continue')",
            "button:has-text('Resume')",
            "button:has-text('OK')",
            ".vjs-play-control",
            ".play-btn"
        ]
        for sel in checkpoint_selectors:
            try:
                elem = frame.locator(sel).first
                if elem.is_visible(timeout=300):
                    elem.click()
                    time.sleep(0.5)
            except Exception:
                pass

    def watch_to_completion(self, max_wait_sec: int = 7200) -> bool:
        """Play video, manage playback rate, prevent idle sleep, and wait until ended."""
        target = self.detect_video()
        if not target:
            return False

        frame: Frame = target["frame"]
        
        # Ensure audio is muted to allow background autoplay policy
        frame.evaluate("""() => {
            const v = document.querySelector('video');
            if (v) {
                v.muted = true;
                v.play().catch(() => {});
            }
        }""")

        # Set playback rate if safe
        if self.playback_rate != 1.0:
            frame.evaluate(f"""() => {{
                const v = document.querySelector('video');
                if (v) {{
                    try {{ v.playbackRate = {self.playback_rate}; }} catch(e) {{}}
                }}
            }}""")

        start_time = time.time()
        while time.time() - start_time < max_wait_sec:
            status = frame.evaluate("""() => {
                const v = document.querySelector('video');
                if (!v) return { exists: false };
                return {
                    exists: true,
                    currentTime: v.currentTime,
                    duration: v.duration,
                    ended: v.ended,
                    paused: v.paused
                };
            }""")

            if not status.get("exists"):
                return True

            if status.get("ended"):
                return True

            duration = status.get("duration") or 0
            curr = status.get("currentTime") or 0
            if duration > 0 and (curr / duration) >= 0.99:
                return True

            if status.get("paused"):
                if self.auto_skip_checkpoints:
                    self.handle_popups_and_checkpoints(frame)
                frame.evaluate("""() => {
                    const v = document.querySelector('video');
                    if (v && v.paused) v.play().catch(() => {});
                }""")

            time.sleep(2)
        return False
