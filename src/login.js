/**
 * Manual login: the user types their own credentials in the browser window.
 * The bot only watches the page and never fills, submits, or stores credentials.
 */
import { isLoginUrl } from "./lms/signals.js";
import { sleep } from "./util.js";

export const LOGIN_WAIT_MS = 15 * 60 * 1000;
const STATUS_EVERY_MS = 30_000;
const STABLE_HITS = 3;

/** Read login signals from the page (Moodle-first, then generic). */
export async function readLoginSignals(page) {
  return page
    .evaluate(() => {
      const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
      };
      const body = document.body;
      const cls = body ? body.className : "";
      const moodle = Boolean(window.M && window.M.cfg) || /\bpagelayout-/.test(cls);
      const moodleGuest = /\bnotloggedin\b/.test(cls) || /\bpagelayout-login\b/.test(cls);
      const passwordField = [...document.querySelectorAll('input[type="password"]')].some(visible);

      const logoutRe = /(ออกจากระบบ|log\s?out|sign\s?out)/i;
      const logoutLink =
        [...document.querySelectorAll('a[href*="logout" i], a[href*="signout" i], a[href*="sign_out" i]')].length > 0 ||
        [...document.querySelectorAll("a, button")].some((el) => logoutRe.test((el.textContent || "").trim().slice(0, 40)));

      const userMenu = Boolean(
        document.querySelector(
          '#user-menu-toggle, .usermenu .userbutton, .usermenu .avatar, [data-region="user-menu"] .avatar, .usermenu a[href*="user/profile.php"]'
        )
      );
      return { moodle, moodleGuest, passwordField, logoutLink, userMenu, href: location.href };
    })
    .catch(() => null);
}

/**
 * strong: positive evidence of a session (logout link / user menu).
 * weak: login form disappeared after we saw it — accepted for sites with no logout link.
 */
export function judgeLogin(signals, { sawLoginForm }) {
  if (!signals) return { ok: false };
  if (isLoginUrl(signals.href) || signals.passwordField) return { ok: false, loginForm: true };
  if (signals.moodle && signals.moodleGuest) return { ok: false, loginForm: false };
  if (signals.logoutLink || signals.userMenu) return { ok: true, strong: true };
  if (sawLoginForm && /^https?:/i.test(signals.href)) return { ok: true, strong: false };
  return { ok: false };
}

export async function runLogin({ page, startUrl, logger, signal, waitMs = LOGIN_WAIT_MS }) {
  if (startUrl) {
    logger.info(`เปิดหน้าเว็บ: ${startUrl}`);
    await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch((err) => {
      logger.warn(`โหลดหน้าเว็บช้าหรือผิดพลาด (${err.message.split("\n")[0]}) — รอต่อ`);
    });
  }

  logger.info("กรุณาเข้าสู่ระบบด้วยตัวเองในหน้าต่างเบราว์เซอร์ (โปรแกรมจะไม่กรอกรหัสให้)");
  logger.info(
    `รอจนเข้าสู่ระบบสำเร็จ — สูงสุด ${Math.round(waitMs / 60000)} นาที · กด "หยุด" ได้ตลอด · หน้าต่างจะไม่ถูกปิด`
  );

  const deadline = Date.now() + waitMs;
  let nextStatusAt = Date.now() + STATUS_EVERY_MS;
  let sawLoginForm = false;
  let hits = 0;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (page.isClosed()) {
      logger.warn("หน้าต่างเบราว์เซอร์ถูกปิด — กด \"เข้าสู่ระบบ\" ใหม่อีกครั้ง");
      return { ok: false, reason: "browser_closed" };
    }

    const signals = await readLoginSignals(page);
    const verdict = judgeLogin(signals, { sawLoginForm });
    if (verdict.loginForm && !sawLoginForm) {
      sawLoginForm = true;
      logger.info("พบหน้าล็อกอินแล้ว — พิมพ์ชื่อผู้ใช้/รหัสผ่านของคุณได้เลย");
    }
    hits = verdict.ok ? hits + 1 : 0;

    if (hits >= STABLE_HITS) {
      logger.ok(
        verdict.strong
          ? "เข้าสู่ระบบสำเร็จ ✓ — หน้าต่างเบราว์เซอร์ยังเปิดอยู่ พร้อมเล่นวิดีโอ/เปิดเอกสาร"
          : "หน้าล็อกอินหายไปแล้ว — ถือว่าเข้าสู่ระบบสำเร็จ ✓ (ถ้ายังไม่ได้เข้า ให้กดเข้าสู่ระบบอีกครั้ง)"
      );
      return { ok: true, strong: Boolean(verdict.strong), url: page.url() };
    }

    if (Date.now() >= nextStatusAt) {
      const left = Math.max(1, Math.ceil((deadline - Date.now()) / 60000));
      logger.info(`ยังรอให้คุณเข้าสู่ระบบอยู่… (เหลือประมาณ ${left} นาที)`);
      nextStatusAt = Date.now() + STATUS_EVERY_MS;
    }
    await sleep(1000, signal);
  }

  logger.warn("หมดเวลารอเข้าสู่ระบบ (15 นาที) — หน้าต่างยังเปิดอยู่ กด \"เข้าสู่ระบบ\" เพื่อรอใหม่");
  return { ok: false, reason: "login_timeout" };
}
