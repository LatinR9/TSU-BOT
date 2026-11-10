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

## ไฟล์ภายในโปรเจกต์
- `tsu_bot.py` : สคริปต์บอทสำหรับ TSU MOOC โดยเฉพาะ
- `bot.py` : บอทสำหรับแพลตฟอร์มการเรียนทั่วไป
- `tsu_answers.json` / `tsu_answers.csv` : ฐานข้อมูลเฉลยรายวิชา
- `video_handler.py` / `doc_handler.py` / `quiz_solver.py` : โมดูลแยกตามประเภทสื่อ
- `config.json` : ไฟล์ตั้งค่าการทำงาน
