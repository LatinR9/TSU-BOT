# TSU MOOC & E-Learning Automation Bot

ระบบบอทอัตโนมัติสำหรับการเรียน ดูคลิป ดูเอกสาร และทำแบบทดสอบ (Quiz) รองรับแพลตฟอร์ม TSU MOOC / TSU COURSE (`apps.course.tsu.ac.th`) พร้อมฐานเฉลยข้อสอบ

## ฟีเจอร์หลัก
- **Auto Video Watcher**: เล่นวิดีโอ ข้ามไป 10 วินาทีก่อนจบตามนโยบายระบบ เพื่อให้ได้เครื่องหมายติ๊กถูก (Green Checkmark) โดยไม่ต้องรอเต็มเวลา
- **Auto Document Reader**: เลื่อนอ่านและหน่วงเวลาตามเกณฑ์เพื่อบันทึกสถานะการอ่าน
- **Auto Quiz Solver**:
  - ตรวจสอบโจทย์แบบ Fuzzy Text Matching (`difflib`) เทียบกับฐานเฉลย `tsu_answers.json`
  - รองรับนโยบาย Pre-Test (สุ่มตัวเลือกอัตโนมัติ ไม่ใช้เฉลยตายตัว)
  - รองรับ Post-Test และ Chapter Quiz (เลือกคำตอบที่ยืนยันแล้ว และหลีกเลี่ยงข้อที่เคยตอบผิด)
- **Auto Next Activity**: กดเปลี่ยนบทเรียนถัดไปต่อเนื่องอัตโนมัติ

## การติดตั้ง

1. ติดตั้ง Python (เวอร์ชัน 3.10 ขึ้นไป)
2. ติดตั้งไลบรารีที่จำเป็น:
```bash
pip install -r requirements.txt
playwright install chromium
```

## การใช้งาน

### สำหรับ TSU MOOC โดยเฉพาะ:
```bash
python tsu_bot.py
```
1. เบราว์เซอร์จะเปิดหน้าเข้าสู่ระบบ TSU COURSE ขึ้นมา
2. เข้าสู่ระบบด้วยตนเอง แล้วเปิดไปยังหน้ารายวิชาที่ต้องการเรียน
3. กด `Enter` ในหน้าต่าง Terminal เพื่อให้บอทเริ่มทำงานอัตโนมัติ

### สำหรับคอร์สทั่วไป:
```bash
python bot.py
```

## Desktop WinForms UI (`TSU-BOT-Pro.exe`)

The desktop control panel is a .NET Framework 4.x WinForms app sourced from `AppUI.cs` (namespace `TSUBotDesktop`).

### Build on Windows
Requires .NET Framework 4.x (`csc.exe` ships with the Framework runtime / Developer Pack):

```bat
build_desktop.bat
```

This compiles `AppUI.cs` to `TSU-BOT-Pro.exe`, copies it to `dist\TSU-BOT-Pro.exe`, and writes the exe **SHA-256** into `version.json` (`sha256` field) for the in-app updater.

Manual equivalent:

```bat
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /optimize+ /out:TSU-BOT-Pro.exe /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Core.dll AppUI.cs
```

Linux CI / Cloud Agent environments cannot produce a trustworthy Windows WinForms PE here (no Windows `csc` / Wine toolchain in this image). Ship polished `AppUI.cs` and rebuild the `.exe` on a Windows machine with the script above.

In-app updates read `version.json` from GitHub (`version`, `changelog`, `sha256`), verify the downloaded exe hash before swap, keep `TSU-BOT-Pro.exe.bak`, and refuse mismatch/missing hashes. Optional local `github_token.txt` is supported for private repos — never commit it.

## Quiz answer matching tests (Node)

`worker.js` / `db_manager.js` match each question on the page to `tsu_answers.json` (exact → blank/truncation-aware → difflib-style fuzzy, Thai/HTML text normalized) and click the choice whose text equals the bank answer. Questions with no confirmed match are logged as `[no match]` and left unanswered.

```bash
npm ci
npm test                                  # unit tests + Chromium end-to-end on test/fixtures/*.html
node test/hit_rate.js --legacy origin/main # simulate every bank question, compare with old logic
```

Set `CHROME_PATH` to use an installed Chrome instead of Playwright's bundled Chromium.

### Related
- `Launcher.cs` — tray launcher that starts the Node web dashboard (`localhost:3000`), separate from the WinForms desktop suite.
- `build_exe.bat` — packages the Node server with `pkg` (web control panel), not the WinForms UI.

## ไฟล์ภายในโปรเจกต์
- `tsu_bot.py` : สคริปต์บอทสำหรับ TSU MOOC โดยเฉพาะ
- `bot.py` : บอทสำหรับแพลตฟอร์มการเรียนทั่วไป
- `AppUI.cs` / `TSU-BOT-Pro.exe` : WinForms desktop suite
- `tsu_answers.json` / `tsu_answers.csv` : ฐานข้อมูลเฉลยรายวิชา
- `video_handler.py` / `doc_handler.py` / `quiz_solver.py` : โมดูลแยกตามประเภทสื่อ
- `config.json` : ไฟล์ตั้งค่าการทำงาน
