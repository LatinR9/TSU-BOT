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
        private Button btnPause;
        private Button btnCancel;
        private Button btnPauseWorker;
        private Button btnStop;
        private Button btnAddCourse;
        private Button btnCheckUpdate;

        private Dictionary<string, Process> runningWorkers = new Dictionary<string, Process>();
        private Dictionary<string, bool> workerPausedStates = new Dictionary<string, bool>();
        private int workerCounter = 1;
        private string appDir;
        private string nodePath;
        private const string APP_VERSION = "1.0.2";
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
            try
            {
                ServicePointManager.Expect100Continue = true;
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288 | SecurityProtocolType.Tls12;
                ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
            }
            catch { }

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
                Location = new Point(135, 112),
                Width = 310,
                BackColor = Color.FromArgb(15, 23, 42),
                ForeColor = Color.White
            };
            pnlControls.Controls.Add(txtUrl);

            // Start Bot Button
            btnStart = CreateButton("▶️ เริ่มบอท (+ New)", Color.FromArgb(37, 99, 235), 170, 36);
            btnStart.Location = new Point(460, 108);
            btnStart.Click += BtnStart_Click;
            pnlControls.Controls.Add(btnStart);

            // Pause Bot Button
            btnPause = CreateButton("⏸️ หยุดชั่วคราว", Color.FromArgb(217, 119, 6), 140, 36);
            btnPause.Location = new Point(640, 108);
            btnPause.Click += BtnPause_Click;
            pnlControls.Controls.Add(btnPause);

            // Cancel Bot Button
            btnCancel = CreateButton("⏹️ ยกเลิกการทำงาน", Color.FromArgb(220, 38, 38), 145, 36);
            btnCancel.Location = new Point(790, 108);
            btnCancel.Click += BtnCancel_Click;
            pnlControls.Controls.Add(btnCancel);

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
            
            btnPauseWorker = CreateButton("⏸️ พัก / ▶️ ต่อ", Color.FromArgb(217, 119, 6), 125, 26);
            btnPauseWorker.Location = new Point(640, 3);
            btnPauseWorker.Click += BtnPause_Click;
            pnlWorkersHeader.Controls.Add(btnPauseWorker);

            btnStop = CreateButton("⏹️ ยกเลิกบอทที่เลือก", Color.FromArgb(220, 38, 38), 145, 26);
            btnStop.Location = new Point(780, 3);
            btnStop.Click += BtnCancel_Click;
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
                    RedirectStandardInput = true,
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
                    RedirectStandardInput = true,
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

        private void BtnPause_Click(object sender, EventArgs e)
        {
            if (runningWorkers.Count == 0)
            {
                MessageBox.Show("ขณะนี้ยังไม่มีบอทกำลังทำงานอยู่", "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string targetWorkerId = null;
            if (lvWorkers.SelectedItems.Count > 0 && lvWorkers.SelectedItems[0].Tag != null)
            {
                targetWorkerId = lvWorkers.SelectedItems[0].Tag.ToString();
            }
            else if (runningWorkers.Count == 1)
            {
                foreach (var k in runningWorkers.Keys) { targetWorkerId = k; break; }
            }

            if (targetWorkerId != null && runningWorkers.ContainsKey(targetWorkerId))
            {
                ToggleWorkerPause(targetWorkerId);
            }
            else
            {
                // Toggle all running workers
                bool anyRunning = false;
                foreach (var kvp in runningWorkers)
                {
                    if (!workerPausedStates.ContainsKey(kvp.Key) || !workerPausedStates[kvp.Key])
                    {
                        anyRunning = true;
                        break;
                    }
                }

                List<string> keys = new List<string>(runningWorkers.Keys);
                foreach (var workerId in keys)
                {
                    SetWorkerPause(workerId, anyRunning);
                }

                UpdatePauseButtons(anyRunning);
            }
        }

        private void ToggleWorkerPause(string workerId)
        {
            bool isPaused = workerPausedStates.ContainsKey(workerId) && workerPausedStates[workerId];
            SetWorkerPause(workerId, !isPaused);
            UpdatePauseButtons(!isPaused);
        }

        private void SetWorkerPause(string workerId, bool pause)
        {
            if (!runningWorkers.ContainsKey(workerId)) return;
            Process p = runningWorkers[workerId];
            try
            {
                if (pause)
                {
                    p.StandardInput.WriteLine("pause");
                    workerPausedStates[workerId] = true;
                    AppendLog(string.Format("⏸️ [หยุดชั่วคราว] {0} หยุดการทำงานชั่วคราวแล้ว", workerId), Color.FromArgb(245, 158, 11));
                    UpdateWorkerStatus(workerId, "⏸️ หยุดชั่วคราว (Paused)");
                }
                else
                {
                    p.StandardInput.WriteLine("resume");
                    workerPausedStates[workerId] = false;
                    AppendLog(string.Format("▶️ [ทำงานต่อ] {0} กลับมาทำงานต่อแล้ว", workerId), Color.FromArgb(52, 211, 153));
                    UpdateWorkerStatus(workerId, "▶️ กำลังทำงานต่อ (Resumed)");
                }
            }
            catch (Exception ex)
            {
                AppendLog(string.Format("❌ ข้อผิดพลาดในการส่งคำสั่ง Pause/Resume: {0}", ex.Message), Color.FromArgb(248, 113, 113));
            }
        }

        private void UpdatePauseButtons(bool isPaused)
        {
            if (isPaused)
            {
                btnPause.Text = "▶️ ทำงานต่อ";
                btnPause.BackColor = Color.FromArgb(16, 185, 129); // Emerald Green
                if (btnPauseWorker != null)
                {
                    btnPauseWorker.Text = "▶️ ทำงานต่อ";
                    btnPauseWorker.BackColor = Color.FromArgb(16, 185, 129);
                }
            }
            else
            {
                btnPause.Text = "⏸️ หยุดชั่วคราว";
                btnPause.BackColor = Color.FromArgb(217, 119, 6); // Amber
                if (btnPauseWorker != null)
                {
                    btnPauseWorker.Text = "⏸️ พัก / ▶️ ต่อ";
                    btnPauseWorker.BackColor = Color.FromArgb(217, 119, 6);
                }
            }
        }

        private void BtnCancel_Click(object sender, EventArgs e)
        {
            if (runningWorkers.Count == 0)
            {
                MessageBox.Show("ขณะนี้ไม่มีบอทกำลังทำงานอยู่", "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string targetWorkerId = null;
            if (lvWorkers.SelectedItems.Count > 0 && lvWorkers.SelectedItems[0].Tag != null)
            {
                targetWorkerId = lvWorkers.SelectedItems[0].Tag.ToString();
            }
            else if (runningWorkers.Count == 1)
            {
                foreach (var k in runningWorkers.Keys) { targetWorkerId = k; break; }
            }

            if (targetWorkerId != null)
            {
                CancelWorker(targetWorkerId);
            }
            else
            {
                DialogResult res = MessageBox.Show(string.Format("มีบอททำงานอยู่ {0} หน้าต่าง คุณต้องการยกเลิกการทำงานทั้งหมดใช่หรือไม่?", runningWorkers.Count), "ยืนยันยกเลิกทั้งหมด", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (res == DialogResult.Yes)
                {
                    List<string> keys = new List<string>(runningWorkers.Keys);
                    foreach (var workerId in keys)
                    {
                        CancelWorker(workerId);
                    }
                }
            }
        }

        private void CancelWorker(string workerId)
        {
            if (!runningWorkers.ContainsKey(workerId)) return;
            Process p = runningWorkers[workerId];
            try
            {
                try { p.StandardInput.WriteLine("stop"); } catch { }

                Thread t = new Thread(() =>
                {
                    Thread.Sleep(1500);
                    try
                    {
                        if (!p.HasExited) p.Kill();
                    }
                    catch { }
                });
                t.IsBackground = true;
                t.Start();

                AppendLog(string.Format("⏹️ [ยกเลิก] {0} ได้รับคำสั่งยกเลิกการทำงานและกำลังปิดหน้าต่าง", workerId), Color.FromArgb(239, 68, 68));
                UpdateWorkerStatus(workerId, "⏹️ ยกเลิกการทำงานแล้ว (Stopped)");
                runningWorkers.Remove(workerId);
                if (workerPausedStates.ContainsKey(workerId)) workerPausedStates.Remove(workerId);
            }
            catch (Exception ex)
            {
                AppendLog(string.Format("ข้อผิดพลาดในการยกเลิก {0}: {1}", workerId, ex.Message), Color.FromArgb(248, 113, 113));
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
                    ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288 | SecurityProtocolType.Tls12;
                    ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };

                    using (WebClient wc = new WebClient())
                    {
                        wc.Headers.Add("User-Agent", "TSU-BOT-Desktop");
                        wc.Encoding = Encoding.UTF8;

                        string tokenPath = Path.Combine(appDir, "github_token.txt");
                        if (File.Exists(tokenPath))
                        {
                            string token = File.ReadAllText(tokenPath).Trim();
                            if (!string.IsNullOrEmpty(token))
                                wc.Headers.Add("Authorization", "token " + token);
                        }

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
                catch (WebException wex)
                {
                    if (verbose)
                    {
                        HttpWebResponse resp = wex.Response as HttpWebResponse;
                        if (resp != null && resp.StatusCode == HttpStatusCode.NotFound)
                        {
                            MessageBox.Show("ไม่สามารถเช็คอัปเดตได้ (Error 404):\n\nเกิดจาก Repository บน GitHub ของคุณถูกตั้งค่าเป็น 'Private' (ส่วนตัว) อยู่ครับ\n\nวิธีแก้ (เลือกวิธีใดวิธีหนึ่ง):\n1. ไปที่หน้า GitHub Repo -> Settings -> เลื่อนลงล่างสุด -> เปลี่ยนเป็น 'Public'\nหรือ\n2. นำ GitHub Token มาใส่ในไฟล์ github_token.txt ในโฟลเดอร์โปรแกรมครับ", "Repository เป็นแบบ Private", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                        else
                        {
                            MessageBox.Show("ไม่สามารถเชื่อมต่อเพื่อเช็คอัปเดตได้: " + wex.Message, "เตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288 | SecurityProtocolType.Tls12;
                ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };

                using (WebClient wc = new WebClient())
                {
                    wc.Headers.Add("User-Agent", "TSU-BOT-Desktop");
                    wc.Encoding = Encoding.UTF8;

                    string tokenPath = Path.Combine(appDir, "github_token.txt");
                    if (File.Exists(tokenPath))
                    {
                        string token = File.ReadAllText(tokenPath).Trim();
                        if (!string.IsNullOrEmpty(token))
                            wc.Headers.Add("Authorization", "token " + token);
                    }

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
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)12288 | SecurityProtocolType.Tls12;
                ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };

                using (WebClient wc = new WebClient())
                {
                    wc.Headers.Add("User-Agent", "TSU-BOT-Desktop");
                    wc.Headers.Add("Cache-Control", "no-cache");
                    wc.Headers.Add("Pragma", "no-cache");
                    long ticks = DateTime.UtcNow.Ticks;
                    string baseRaw = string.Format("https://raw.githubusercontent.com/{0}/main/", GITHUB_REPO);

                    AppendLog("1/4 ดาวน์โหลดฐานเฉลยล่าสุด...");
                    wc.DownloadFile(baseRaw + "tsu_answers.json?t=" + ticks, Path.Combine(appDir, "tsu_answers.json"));
                    try { wc.DownloadFile(baseRaw + "tsu_missing.json?t=" + ticks, Path.Combine(appDir, "tsu_missing.json")); } catch { }

                    AppendLog("2/4 ดาวน์โหลดสคริปต์ระบบล่าสุด...");
                    wc.DownloadFile(baseRaw + "cli_worker.js?t=" + ticks, Path.Combine(appDir, "cli_worker.js"));
                    wc.DownloadFile(baseRaw + "worker.js?t=" + ticks, Path.Combine(appDir, "worker.js"));
                    wc.DownloadFile(baseRaw + "db_manager.js?t=" + ticks, Path.Combine(appDir, "db_manager.js"));

                    AppendLog("3/4 ดาวน์โหลดโปรแกรม .exe เวอร์ชั่นใหม่...");
                    string updateExePath = Path.Combine(appDir, "TSU-BOT-Pro.update");
                    wc.DownloadFile(baseRaw + "TSU-BOT-Pro.exe?t=" + ticks, updateExePath);

                    AppendLog("4/4 เตรียมรีสตาร์ทเพื่อติดตั้ง...", Color.FromArgb(52, 211, 153));

                    // Write self-updating bat with retry loop and process kill
                    string batPath = Path.Combine(appDir, "updater_runner.bat");
                    string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                    int currentPid = Process.GetCurrentProcess().Id;
                    string batScript = string.Format(
                        "@echo off\r\n" +
                        ":loop\r\n" +
                        "taskkill /F /PID {0} >nul 2>nul\r\n" +
                        "move /y \"{1}\" \"{2}\" >nul 2>nul\r\n" +
                        "if errorlevel 1 (\r\n" +
                        "    timeout /t 1 /nobreak >nul\r\n" +
                        "    goto loop\r\n" +
                        ")\r\n" +
                        "start \"\" \"{2}\"\r\n" +
                        "del \"%~f0\"\r\n",
                        currentPid, updateExePath, currentExe);
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
