// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\AppUI.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace TSUBotDesktop
{
    public class MainForm : Form
    {
        private ComboBox comboCourse;
        private ComboBox comboSpeed;
        private TextBox txtUrl;
        private RichTextBox rtbLogs;
        private ListView lvWorkers;
        private Label lblVersion;
        private Button btnLogin;
        private Button btnStart;
        private Button btnStop;
        private Button btnAddCourse;
        private Button btnCheckUpdate;

        private Dictionary<string, Process> runningWorkers = new Dictionary<string, Process>();
        private int workerCounter = 1;
        private string appDir;
        private string nodePath;
        private const string APP_VERSION = "1.0.0";
        private const string GITHUB_REPO = "LatinR9/TSU-BOT";

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }

        public MainForm()
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;
            ResolveNodePath();
            InitializeComponent();
            LoadCourses();
            CheckUpdateAsync(false);
        }

        private void ResolveNodePath()
        {
            if (File.Exists(Path.Combine(appDir, "node.exe")))
                nodePath = Path.Combine(appDir, "node.exe");
            else if (File.Exists(@"C:\Program Files\nodejs\node.exe"))
                nodePath = @"C:\Program Files\nodejs\node.exe";
            else
                nodePath = "node.exe";
        }

        private void InitializeComponent()
        {
            this.Text = "TSU-BOT Pro — Desktop Suite (Multi-Browser)";
            this.Size = new Size(950, 700);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(15, 23, 42);
            this.ForeColor = Color.FromArgb(248, 250, 252);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Header Panel
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 65,
                BackColor = Color.FromArgb(30, 41, 59),
                Padding = new Padding(20, 12, 20, 12)
            };

            Label lblTitle = new Label
            {
                Text = "⚡ TSU-BOT Pro (Desktop)",
                Font = new Font("Segoe UI", 16f, FontStyle.Bold),
                ForeColor = Color.FromArgb(96, 165, 250),
                AutoSize = true,
                Location = new Point(18, 16)
            };
            pnlHeader.Controls.Add(lblTitle);

            lblVersion = new Label
            {
                Text = "v" + APP_VERSION,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(147, 197, 253),
                BackColor = Color.FromArgb(51, 65, 85),
                AutoSize = true,
                Padding = new Padding(6, 3, 6, 3),
                Location = new Point(310, 18)
            };
            pnlHeader.Controls.Add(lblVersion);

            btnCheckUpdate = CreateButton("🔄 เช็คอัปเดต", Color.FromArgb(59, 130, 246), 110, 34);
            btnCheckUpdate.Location = new Point(800, 15);
            btnCheckUpdate.Click += (s, e) => CheckUpdateAsync(true);
            pnlHeader.Controls.Add(btnCheckUpdate);

            this.Controls.Add(pnlHeader);

            // Controls Panel
            Panel pnlControls = new Panel
            {
                Dock = DockStyle.Top,
                Height = 165,
                BackColor = Color.FromArgb(30, 41, 59),
                Padding = new Padding(20)
            };

            // Login Button
            btnLogin = CreateButton("🔐 เปิด Chrome เข้าสู่ระบบ (Manual Login)", Color.FromArgb(16, 185, 129), 290, 36);
            btnLogin.Location = new Point(20, 15);
            btnLogin.Click += BtnLogin_Click;
            pnlControls.Controls.Add(btnLogin);

            btnAddCourse = CreateButton("➕ เพิ่มวิชาใหม่", Color.FromArgb(99, 102, 241), 140, 36);
            btnAddCourse.Location = new Point(320, 15);
            btnAddCourse.Click += BtnAddCourse_Click;
            pnlControls.Controls.Add(btnAddCourse);

            // Course Selector
            Label lblCourse = new Label { Text = "เลือกวิชาที่จะทำ:", Location = new Point(20, 68), AutoSize = true, ForeColor = Color.FromArgb(203, 213, 225) };
            pnlControls.Controls.Add(lblCourse);

            comboCourse = new ComboBox
            {
                Location = new Point(130, 65),
                Width = 440,
                DropDownStyle = ComboBoxStyle.DropDownList,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.White
            };
            pnlControls.Controls.Add(comboCourse);

            // Speed Selector
            Label lblSpeed = new Label { Text = "ความเร็ว:", Location = new Point(590, 68), AutoSize = true, ForeColor = Color.FromArgb(203, 213, 225) };
            pnlControls.Controls.Add(lblSpeed);

            comboSpeed = new ComboBox
            {
                Location = new Point(660, 65),
                Width = 140,
                DropDownStyle = ComboBoxStyle.DropDownList,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.White
            };
            comboSpeed.Items.AddRange(new object[] { "turbo (สายฟ้า)", "normal (สมดุล)", "safe (ปลอดภัย)" });
            comboSpeed.SelectedIndex = 1;
            pnlControls.Controls.Add(comboSpeed);

            // URL input (optional)
            Label lblUrl = new Label { Text = "URL เจาะจง (ถ้ามี):", Location = new Point(20, 115), AutoSize = true, ForeColor = Color.FromArgb(203, 213, 225) };
            pnlControls.Controls.Add(lblUrl);

            txtUrl = new TextBox
            {
                Location = new Point(130, 112),
                Width = 440,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.White
            };
            pnlControls.Controls.Add(txtUrl);

            // Start Bot Button
            btnStart = CreateButton("▶️ เปิด Chrome เริ่มบอท (+ New Browser)", Color.FromArgb(37, 99, 235), 270, 38);
            btnStart.Location = new Point(590, 108);
            btnStart.Click += BtnStart_Click;
            pnlControls.Controls.Add(btnStart);

            this.Controls.Add(pnlControls);

            // Split Container for Workers List & Logs
            SplitContainer split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 180,
                BackColor = Color.FromArgb(15, 23, 42)
            };

            // Top: Workers List
            Panel pnlWorkersHeader = new Panel { Dock = DockStyle.Top, Height = 32, BackColor = Color.FromArgb(15, 23, 42) };
            Label lblWorkersTitle = new Label { Text = "🖥️ หน้าต่าง Chrome บอทที่กำลังทำงาน (Multi-Browser Workers):", AutoSize = true, Location = new Point(10, 8), Font = new Font("Segoe UI", 9.5f, FontStyle.Bold) };
            btnStop = CreateButton("⏹️ ปิดบอทที่เลือก", Color.FromArgb(239, 68, 68), 130, 26);
            btnStop.Location = new Point(780, 4);
            btnStop.Click += BtnStop_Click;
            pnlWorkersHeader.Controls.Add(lblWorkersTitle);
            pnlWorkersHeader.Controls.Add(btnStop);
            split.Panel1.Controls.Add(pnlWorkersHeader);

            lvWorkers = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.None
            };
            lvWorkers.Columns.Add("Worker ID", 110);
            lvWorkers.Columns.Add("รหัสวิชา", 130);
            lvWorkers.Columns.Add("โหมด", 90);
            lvWorkers.Columns.Add("สถานะการทำงาน", 350);
            split.Panel1.Controls.Add(lvWorkers);

            // Bottom: Logs
            Panel pnlLogsHeader = new Panel { Dock = DockStyle.Top, Height = 28, BackColor = Color.FromArgb(15, 23, 42) };
            Label lblLogsTitle = new Label { Text = "📜 บันทึกการทำงานเรียลไทม์ (Live Logs):", AutoSize = true, Location = new Point(10, 6), Font = new Font("Segoe UI", 9.5f, FontStyle.Bold) };
            pnlLogsHeader.Controls.Add(lblLogsTitle);
            split.Panel2.Controls.Add(pnlLogsHeader);

            rtbLogs = new RichTextBox
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(9, 13, 22),
                ForeColor = Color.FromArgb(165, 180, 252),
                Font = new Font("Consolas", 9.5f),
                ReadOnly = true,
                BorderStyle = BorderStyle.None
            };
            split.Panel2.Controls.Add(rtbLogs);

            this.Controls.Add(split);

            this.FormClosing += (s, e) => {
                foreach (var p in runningWorkers.Values)
                {
                    try { if (!p.HasExited) p.Kill(); } catch { }
                }
            };
        }

        private Button CreateButton(string text, Color bg, int width, int height)
        {
            Button btn = new Button
            {
                Text = text,
                Width = width,
                Height = height,
                BackColor = bg,
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
            };
            btn.FlatAppearance.BorderSize = 0;
            return btn;
        }

        private void AppendLog(string text, Color? color = null)
        {
            if (rtbLogs.InvokeRequired)
            {
                rtbLogs.Invoke(new Action(() => AppendLog(text, color)));
                return;
            }
            rtbLogs.SelectionStart = rtbLogs.TextLength;
            rtbLogs.SelectionLength = 0;
            rtbLogs.SelectionColor = color ?? Color.FromArgb(165, 180, 252);
            rtbLogs.AppendText(string.Format("[{0}] {1}\n", DateTime.Now.ToString("HH:mm:ss"), text));
            rtbLogs.ScrollToCaret();
        }

        private void LoadCourses()
        {
            comboCourse.Items.Clear();
            string mainDb = Path.Combine(appDir, "tsu_answers.json");
            string customDb = Path.Combine(appDir, "custom_courses.json");

            if (File.Exists(mainDb))
            {
                try
                {
                    string json = File.ReadAllText(mainDb, Encoding.UTF8);
                    var matches = Regex.Matches(json, "\"course_code\"\\s*:\\s*\"([^\"]+)\"\\s*,\\s*\"course_name\"\\s*:\\s*\"([^\"]+)\"");
                    foreach (Match m in matches)
                    {
                        comboCourse.Items.Add(string.Format("{0} - {1}", m.Groups[1].Value, m.Groups[2].Value));
                    }
                }
                catch { }
            }

            if (File.Exists(customDb))
            {
                try
                {
                    string json = File.ReadAllText(customDb, Encoding.UTF8);
                    var matches = Regex.Matches(json, "\"course_code\"\\s*:\\s*\"([^\"]+)\"\\s*,\\s*\"course_name\"\\s*:\\s*\"([^\"]+)\"");
                    foreach (Match m in matches)
                    {
                        comboCourse.Items.Add(string.Format("{0} - {1}", m.Groups[1].Value, m.Groups[2].Value));
                    }
                }
                catch { }
            }

            if (comboCourse.Items.Count > 0)
                comboCourse.SelectedIndex = 0;
        }

        private void EnsureDependencies()
        {
            string pwDir = Path.Combine(appDir, "node_modules", "playwright");
            if (!Directory.Exists(pwDir))
            {
                AppendLog("⚠️ ยังไม่พบโมดูล playwright กำลังติดตั้งระบบให้อัตโนมัติ (ครั้งแรกครั้งเดียว)...", Color.FromArgb(245, 158, 11));
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c npm install && npx playwright install chromium",
                        WorkingDirectory = appDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true
                    };
                    Process p = Process.Start(psi);
                    p.WaitForExit();
                    AppendLog("✅ ติดตั้งระบบเรียบร้อยแล้ว!", Color.FromArgb(52, 211, 153));
                }
                catch (Exception ex)
                {
                    AppendLog("❌ ไม่สามารถติดตั้งแพ็กเกจได้: " + ex.Message, Color.FromArgb(248, 113, 113));
                }
            }
        }

        private void BtnLogin_Click(object sender, EventArgs e)
        {
            AppendLog("กำลังตรวจสอบระบบและเปิดหน้าต่าง Chrome สำหรับล็อกอินเข้าสู่ระบบ TSU...", Color.FromArgb(52, 211, 153));
            Thread t = new Thread(() =>
            {
                EnsureDependencies();
                string script = Path.Combine(appDir, "cli_worker.js");
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = string.Format("\"{0}\" --action login", script),
                    WorkingDirectory = appDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };
                try
                {
                    Process p = Process.Start(psi);
                    p.OutputDataReceived += (s, ev) =>
                    {
                        if (!string.IsNullOrEmpty(ev.Data))
                            AppendLog(ev.Data);
                    };
                    p.ErrorDataReceived += (s, ev) =>
                    {
                        if (!string.IsNullOrEmpty(ev.Data))
                            AppendLog("[ERROR] " + ev.Data, Color.FromArgb(248, 113, 113));
                    };
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    p.WaitForExit();
                    AppendLog("ปิดหน้าต่างล็อกอินแล้ว บัญชีถูกบันทึกในระบบเรียบร้อย", Color.FromArgb(52, 211, 153));
                }
                catch (Exception ex)
                {
                    AppendLog("ข้อผิดพลาดในการเปิดล็อกอิน: " + ex.Message, Color.FromArgb(248, 113, 113));
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        private void BtnStart_Click(object sender, EventArgs e)
        {
            string selected = comboCourse.SelectedItem != null ? comboCourse.SelectedItem.ToString() : "";
            string courseCode = selected.Contains(" - ") ? selected.Split(new string[] { " - " }, StringSplitOptions.None)[0] : "";
            string speed = comboSpeed.SelectedItem.ToString().Split(' ')[0];
            string customUrl = txtUrl.Text.Trim();
            string workerId = "Worker-" + (workerCounter++);

            AppendLog(string.Format("🚀 เริ่มต้น {0} | วิชา: {1} | โหมด: {2}", workerId, courseCode, speed), Color.FromArgb(96, 165, 250));

            ListViewItem item = new ListViewItem(workerId);
            item.SubItems.Add(courseCode);
            item.SubItems.Add(speed);
            item.SubItems.Add("กำลังเปิดเบราว์เซอร์ Chrome...");
            item.Tag = workerId;
            lvWorkers.Items.Add(item);

            Thread t = new Thread(() =>
            {
                EnsureDependencies();
                string script = Path.Combine(appDir, "cli_worker.js");
                string args = string.Format("\"{0}\" --action run --id \"{1}\" --course \"{2}\" --speed \"{3}\"", script, workerId, courseCode, speed);
                if (!string.IsNullOrEmpty(customUrl))
                {
                    args += string.Format(" --url \"{0}\"", customUrl);
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = args,
                    WorkingDirectory = appDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };

                try
                {
                    Process p = Process.Start(psi);
                    runningWorkers[workerId] = p;

                    p.OutputDataReceived += (s, ev) =>
                    {
                        if (string.IsNullOrEmpty(ev.Data)) return;
                        string line = ev.Data;
                        if (line.StartsWith("[LOG] "))
                        {
                            string msg = line.Substring(6);
                            AppendLog(string.Format("[{0}] {1}", workerId, msg));
                            UpdateWorkerStatus(workerId, msg);
                        }
                    };

                    p.ErrorDataReceived += (s, ev) =>
                    {
                        if (!string.IsNullOrEmpty(ev.Data))
                            AppendLog(string.Format("[{0} ERROR] {1}", workerId, ev.Data), Color.FromArgb(248, 113, 113));
                    };

                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    p.WaitForExit();

                    UpdateWorkerStatus(workerId, "เสร็จสิ้น / ปิดหน้าต่างแล้ว");
                    runningWorkers.Remove(workerId);
                }
                catch (Exception ex)
                {
                    AppendLog(string.Format("[{0}] Error: {1}", workerId, ex.Message), Color.FromArgb(248, 113, 113));
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        private void UpdateWorkerStatus(string workerId, string status)
        {
            if (lvWorkers.InvokeRequired)
            {
                lvWorkers.Invoke(new Action(() => UpdateWorkerStatus(workerId, status)));
                return;
            }
            foreach (ListViewItem item in lvWorkers.Items)
            {
                if (item.Tag != null && item.Tag.ToString() == workerId)
                {
                    item.SubItems[3].Text = status;
                    break;
                }
            }
        }

        private void BtnStop_Click(object sender, EventArgs e)
        {
            if (lvWorkers.SelectedItems.Count == 0)
            {
                MessageBox.Show("กรุณาเลือก Worker ในตารางที่ต้องการปิด", "ข้อความ", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string workerId = lvWorkers.SelectedItems[0].Tag.ToString();
            if (runningWorkers.ContainsKey(workerId))
            {
                try
                {
                    runningWorkers[workerId].Kill();
                    AppendLog(string.Format("⏹️ ปิด {0} สำเร็จ", workerId), Color.FromArgb(248, 113, 113));
                    UpdateWorkerStatus(workerId, "ถูกสั่งปิด");
                    runningWorkers.Remove(workerId);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("ไม่สามารถปิดได้: " + ex.Message);
                }
            }
        }

        private void BtnAddCourse_Click(object sender, EventArgs e)
        {
            Form dlg = new Form
            {
                Text = "เพิ่มวิชาใหม่",
                Size = new Size(420, 260),
                StartPosition = FormStartPosition.CenterParent,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false
            };

            Label l1 = new Label { Text = "รหัสวิชา (เช่น TSUGE99999):", Location = new Point(20, 20), AutoSize = true };
            TextBox t1 = new TextBox { Location = new Point(20, 45), Width = 360, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

            Label l2 = new Label { Text = "ชื่อวิชา:", Location = new Point(20, 80), AutoSize = true };
            TextBox t2 = new TextBox { Location = new Point(20, 105), Width = 360, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

            Button btnSave = CreateButton("💾 บันทึก", Color.FromArgb(16, 185, 129), 100, 32);
            btnSave.Location = new Point(280, 160);
            btnSave.Click += (s, ev) =>
            {
                if (string.IsNullOrEmpty(t1.Text.Trim())) return;
                string newEntry = string.Format("  {{\n    \"course_code\": \"{0}\",\n    \"course_name\": \"{1}\",\n    \"sections\": []\n  }}\n", t1.Text.Trim(), t2.Text.Trim());
                string path = Path.Combine(appDir, "custom_courses.json");
                File.WriteAllText(path, "[\n" + newEntry + "]", Encoding.UTF8);
                MessageBox.Show("เพิ่มวิชาสำเร็จ!", "สำเร็จ");
                dlg.Close();
                LoadCourses();
            };

            dlg.Controls.Add(l1); dlg.Controls.Add(t1);
            dlg.Controls.Add(l2); dlg.Controls.Add(t2);
            dlg.Controls.Add(btnSave);
            dlg.ShowDialog();
        }

        private void CheckUpdateAsync(bool verbose)
        {
            Thread t = new Thread(() =>
            {
                try
                {
                    using (WebClient wc = new WebClient())
                    {
                        wc.Headers.Add("User-Agent", "TSU-BOT-Desktop");
                        wc.Encoding = Encoding.UTF8;
                        string rawUrl = string.Format("https://raw.githubusercontent.com/{0}/main/version.json", GITHUB_REPO);
                        string json = wc.DownloadString(rawUrl);

                        Match mV = Regex.Match(json, "\"version\"\\s*:\\s*\"([^\"]+)\"");
                        Match mC = Regex.Match(json, "\"changelog\"\\s*:\\s*\"([^\"]+)\"");

                        string latestVer = mV.Success ? mV.Groups[1].Value : APP_VERSION;
                        string changelog = mC.Success ? mC.Groups[1].Value : "การปรับปรุงประสิทธิภาพทั่วไป";

                        if (latestVer != APP_VERSION)
                        {
                            string msg = string.Format("🎉 พบอัปเดตใหม่: v{0} (ปัจจุบัน v{1})\n\nรายละเอียด:\n{2}\n\nต้องการอัปเดตโปรแกรมตอนนี้เลยหรือไม่?\n(ระบบจะดาวน์โหลดและเริ่มโปรแกรมใหม่ให้อัตโนมัติ โดยไม่ต้องโหลดไฟล์ใหม่)", latestVer, APP_VERSION, changelog);
                            if (MessageBox.Show(msg, "📢 มีอัปเดตเวอร์ชันใหม่", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                            {
                                PerformInPlaceUpdate(latestVer);
                            }
                            return;
                        }
                    }

                    if (verbose)
                    {
                        if (MessageBox.Show(string.Format("คุณกำลังใช้งานเวอร์ชันล่าสุด (v{0}) อยู่แล้ว\n\nต้องการซิงค์และอัปเดตฐานเฉลยข้อสอบล่าสุดจาก GitHub ทันทีหรือไม่?", APP_VERSION), "เวอร์ชันล่าสุด", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                        {
                            PerformDataSync();
                        }
                    }
                }
                catch (Exception ex)
                {
                    if (verbose)
                        MessageBox.Show("ไม่สามารถเชื่อมต่อเพื่อเช็คอัปเดตได้: " + ex.Message, "เตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        private void PerformDataSync()
        {
            AppendLog("🔄 กำลังซิงค์ฐานเฉลยข้อสอบล่าสุดจาก GitHub...", Color.FromArgb(96, 165, 250));
            try
            {
                using (WebClient wc = new WebClient())
                {
                    wc.Headers.Add("User-Agent", "TSU-BOT-Desktop");
                    wc.Encoding = Encoding.UTF8;

                    string baseRaw = string.Format("https://raw.githubusercontent.com/{0}/main/", GITHUB_REPO);
                    wc.DownloadFile(baseRaw + "tsu_answers.json", Path.Combine(appDir, "tsu_answers.json"));
                    wc.DownloadFile(baseRaw + "cli_worker.js", Path.Combine(appDir, "cli_worker.js"));
                    wc.DownloadFile(baseRaw + "worker.js", Path.Combine(appDir, "worker.js"));
                    wc.DownloadFile(baseRaw + "db_manager.js", Path.Combine(appDir, "db_manager.js"));
                }
                LoadCourses();
                AppendLog("✅ ซิงค์ฐานเฉลยและไฟล์ระบบล่าสุดเรียบร้อยแล้ว!", Color.FromArgb(52, 211, 153));
                MessageBox.Show("ซิงค์ฐานเฉลยและระบบล่าสุดเรียบร้อยแล้ว!", "สำเร็จ", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                AppendLog("❌ ซิงค์ข้อมูลล้มเหลว: " + ex.Message, Color.FromArgb(248, 113, 113));
            }
        }

        private void PerformInPlaceUpdate(string targetVersion)
        {
            AppendLog(string.Format("🚀 กำลังเริ่มดาวน์โหลดอัปเดตเวอร์ชัน v{0}...", targetVersion), Color.FromArgb(96, 165, 250));
            try
            {
                using (WebClient wc = new WebClient())
                {
                    wc.Headers.Add("User-Agent", "TSU-BOT-Desktop");
                    string baseRaw = string.Format("https://raw.githubusercontent.com/{0}/main/", GITHUB_REPO);

                    AppendLog("1/4 ดาวน์โหลดฐานเฉลยล่าสุด...");
                    wc.DownloadFile(baseRaw + "tsu_answers.json", Path.Combine(appDir, "tsu_answers.json"));

                    AppendLog("2/4 ดาวน์โหลดสคริปต์ระบบล่าสุด...");
                    wc.DownloadFile(baseRaw + "cli_worker.js", Path.Combine(appDir, "cli_worker.js"));
                    wc.DownloadFile(baseRaw + "worker.js", Path.Combine(appDir, "worker.js"));
                    wc.DownloadFile(baseRaw + "db_manager.js", Path.Combine(appDir, "db_manager.js"));

                    AppendLog("3/4 ดาวน์โหลดโปรแกรม .exe เวอร์ชั่นใหม่...");
                    string updateExePath = Path.Combine(appDir, "TSU-BOT-Pro.update");
                    wc.DownloadFile(baseRaw + "TSU-BOT-Pro.exe", updateExePath);

                    AppendLog("4/4 เตรียมรีสตาร์ทเพื่อติดตั้ง...", Color.FromArgb(52, 211, 153));

                    // Write self-updating bat
                    string batPath = Path.Combine(appDir, "updater_runner.bat");
                    string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                    string batScript = string.Format("@echo off\r\ntimeout /t 2 /nobreak > nul\r\ncopy /y \"{0}\" \"{1}\"\r\ndel \"{0}\"\r\nstart \"\" \"{1}\"\r\ndel \"%~f0\"\r\n", updateExePath, currentExe);
                    File.WriteAllText(batPath, batScript, Encoding.Default);

                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = batPath,
                        WorkingDirectory = appDir,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi);

                    // Close current instance
                    if (this.InvokeRequired)
                    {
                        this.Invoke(new Action(() => Application.Exit()));
                    }
                    else
                    {
                        Application.Exit();
                    }
                }
            }
            catch (Exception ex)
            {
                AppendLog("❌ อัปเดตล้มเหลว: " + ex.Message, Color.FromArgb(248, 113, 113));
                MessageBox.Show("เกิดข้อผิดพลาดในการอัปเดต: " + ex.Message, "ผิดพลาด", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
