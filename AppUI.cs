// TSU-BOT Pro — Desktop Suite (WinForms)
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace TSUBotDesktop
{
    /// <summary>
    /// Visual tokens aligned with the polished web control panel
    /// (teal mist atmosphere, brand-first hierarchy).
    /// </summary>
    internal static class UiTheme
    {
        public static readonly Color BgWash = Color.FromArgb(238, 247, 242);
        public static readonly Color BgMist = Color.FromArgb(217, 235, 228);
        public static readonly Color Surface = Color.FromArgb(255, 255, 255);
        public static readonly Color SurfaceSoft = Color.FromArgb(247, 252, 249);
        public static readonly Color Line = Color.FromArgb(198, 216, 208);
        public static readonly Color Text = Color.FromArgb(22, 53, 44);
        public static readonly Color TextMuted = Color.FromArgb(90, 115, 105);
        public static readonly Color Brand = Color.FromArgb(11, 95, 75);
        public static readonly Color BrandDeep = Color.FromArgb(8, 69, 54);
        public static readonly Color BrandSoft = Color.FromArgb(215, 238, 229);
        public static readonly Color Accent = Color.FromArgb(196, 122, 26);
        public static readonly Color Success = Color.FromArgb(31, 138, 91);
        public static readonly Color SuccessSoft = Color.FromArgb(225, 245, 234);
        public static readonly Color Warning = Color.FromArgb(183, 121, 31);
        public static readonly Color WarningSoft = Color.FromArgb(248, 236, 214);
        public static readonly Color Danger = Color.FromArgb(192, 57, 43);
        public static readonly Color DangerSoft = Color.FromArgb(248, 228, 225);
        public static readonly Color Info = Color.FromArgb(29, 107, 138);
        public static readonly Color InfoSoft = Color.FromArgb(223, 241, 247);
        public static readonly Color LogBg = Color.FromArgb(18, 48, 40);
        public static readonly Color LogFg = Color.FromArgb(196, 224, 212);
        public static readonly Color LogDefault = Color.FromArgb(168, 210, 194);

        public static Font UiFont(float size, FontStyle style)
        {
            string[] candidates = new string[] { "Segoe UI", "Noto Sans Thai", "Tahoma", "Microsoft Sans Serif" };
            foreach (string name in candidates)
            {
                try
                {
                    Font f = new Font(name, size, style, GraphicsUnit.Point);
                    if (string.Equals(f.FontFamily.Name, name, StringComparison.OrdinalIgnoreCase))
                        return f;
                    f.Dispose();
                }
                catch { }
            }
            return new Font(SystemFonts.DefaultFont.FontFamily, size, style, GraphicsUnit.Point);
        }

        public static Font MonoFont(float size)
        {
            string[] candidates = new string[] { "Cascadia Mono", "Consolas", "JetBrains Mono", "Courier New" };
            foreach (string name in candidates)
            {
                try
                {
                    Font f = new Font(name, size, FontStyle.Regular, GraphicsUnit.Point);
                    if (string.Equals(f.FontFamily.Name, name, StringComparison.OrdinalIgnoreCase))
                        return f;
                    f.Dispose();
                }
                catch { }
            }
            return new Font(FontFamily.GenericMonospace, size, FontStyle.Regular, GraphicsUnit.Point);
        }

        public static Color Lighten(Color c, int amount)
        {
            return Color.FromArgb(
                c.A,
                Math.Min(255, c.R + amount),
                Math.Min(255, c.G + amount),
                Math.Min(255, c.B + amount));
        }

        public static Color Darken(Color c, int amount)
        {
            return Color.FromArgb(
                c.A,
                Math.Max(0, c.R - amount),
                Math.Max(0, c.G - amount),
                Math.Max(0, c.B - amount));
        }
    }

    public class CourseItem
    {
        public string Code { get; set; }
        public string Name { get; set; }
        public string Url { get; set; }
        public string Org { get; set; }

        public override string ToString()
        {
            return string.Format("{0} - {1}", Code, Name);
        }
    }

    public class MainForm : Form
    {
        private ComboBox comboCourse;
        private ComboBox comboSpeed;
        private CheckBox chkModeQuiz;
        private CheckBox chkModeVideo;
        private CheckBox chkModeDoc;
        private bool suppressModeEvents = false;
        private TextBox txtUrl;
        private RichTextBox rtbLogs;
        private ListView lvWorkers;
        private Label lblVersion;
        private Label lblBrand;
        private Label lblTagline;
        private Button btnLogin;
        private Button btnStart;
        private Button btnPause;
        private Button btnCancel;
        private Button btnPauseWorker;
        private Button btnStop;
        private Button btnAddCourse;
        private Button btnSettings;
        private Button btnCheckUpdate;
        private Label lblUpdateStatus;
        private ProgressBar progUpdate;
        private Panel pnlHeader;
        private Panel pnlWorkersHeader;
        private SplitContainer splitMain;

        private List<CourseItem> courses = new List<CourseItem>();
        private Dictionary<string, Process> runningWorkers = new Dictionary<string, Process>();
        private Dictionary<string, bool> workerPausedStates = new Dictionary<string, bool>();
        private int workerCounter = 1;
        private string appDir;
        private string nodePath;
        private string latestRemoteVersion = "";
        private string latestRemoteChangelog = "";
        private string latestRemoteSha256 = "";
        private bool updateInProgress = false;
        private const string APP_VERSION = "1.0.8";
        private const string GITHUB_REPO = "LatinR9/TSU-BOT";
        private const string EXE_NAME = "TSU-BOT-Pro.exe";
        private const string SETTINGS_FILE = "desktop_settings.json";

        private const string CRASH_LOG = "crash.log";

        [STAThread]
        public static void Main()
        {
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (s, e) => ReportCrash("UI thread", e.Exception, false);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => ReportCrash("background thread", e.ExceptionObject as Exception, true);

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            }
            catch (Exception ex)
            {
                ReportCrash("startup", ex, true);
            }
        }

        // Must stay free of anything that could itself fail to JIT or throw: it is the last line of defence.
        private static void ReportCrash(string where, Exception ex, bool fatal)
        {
            string logPath = CRASH_LOG;
            try
            {
                logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, CRASH_LOG);
                string entry = string.Format(
                    "[{0}] TSU-BOT Pro v{1} — unhandled exception ({2}){3}OS: {4} | CLR: {5}{3}{6}{3}{3}",
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), APP_VERSION, where, Environment.NewLine,
                    Environment.OSVersion, Environment.Version, ex != null ? ex.ToString() : "(no exception object)");
                File.AppendAllText(logPath, entry, Encoding.UTF8);
            }
            catch { }

            try
            {
                MessageBox.Show(
                    "TSU-BOT Pro เกิดข้อผิดพลาดและ" + (fatal ? "ต้องปิดโปรแกรม" : "อาจทำงานไม่สมบูรณ์") + "\n\n" +
                    (ex != null ? ex.GetType().Name + ": " + ex.Message : "") +
                    "\n\nบันทึกรายละเอียดไว้ที่:\n" + logPath +
                    "\n\nกรุณาส่งไฟล์ crash.log ให้ผู้พัฒนา",
                    "TSU-BOT Pro — ข้อผิดพลาด",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            catch { }
        }

        public MainForm()
        {
            ConfigureTls();

            appDir = AppDomain.CurrentDomain.BaseDirectory;
            ResolveNodePath();
            InitializeComponent();
            LoadCourses();
            LoadModeSettings();
            this.Shown += (s, e) => CheckUpdateAsync(false);
        }

        private static void ConfigureTls()
        {
            try
            {
                ServicePointManager.Expect100Continue = true;
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                // Keep system TLS certificate validation enabled (never bypass).
                ServicePointManager.ServerCertificateValidationCallback = null;
            }
            catch { }
            // TLS 1.3 (12288) throws NotSupportedException on older Windows/.NET; add it separately so TLS 1.2 still sticks.
            try { ServicePointManager.SecurityProtocol |= (SecurityProtocolType)12288; } catch { }
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

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            Rectangle rect = this.ClientRectangle;
            if (rect.Width <= 0 || rect.Height <= 0)
            {
                base.OnPaintBackground(e);
                return;
            }

            using (LinearGradientBrush wash = new LinearGradientBrush(
                rect,
                UiTheme.BgWash,
                UiTheme.BgMist,
                LinearGradientMode.Vertical))
            {
                e.Graphics.FillRectangle(wash, rect);
            }

            using (GraphicsPath path = new GraphicsPath())
            {
                path.AddEllipse(-120, -160, 520, 360);
                using (PathGradientBrush glow = new PathGradientBrush(path))
                {
                    glow.CenterColor = Color.FromArgb(70, 36, 140, 112);
                    glow.SurroundColors = new Color[] { Color.FromArgb(0, 36, 140, 112) };
                    e.Graphics.FillPath(glow, path);
                }
            }

            using (GraphicsPath path2 = new GraphicsPath())
            {
                path2.AddEllipse(rect.Width - 380, -40, 460, 300);
                using (PathGradientBrush glow2 = new PathGradientBrush(path2))
                {
                    glow2.CenterColor = Color.FromArgb(42, 196, 122, 26);
                    glow2.SurroundColors = new Color[] { Color.FromArgb(0, 196, 122, 26) };
                    e.Graphics.FillPath(glow2, path2);
                }
            }
        }

        private void InitializeComponent()
        {
            this.Text = "TSU-BOT Pro — Desktop Suite";
            this.Size = new Size(1040, 760);
            this.MinimumSize = new Size(960, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = UiTheme.BgWash;
            this.ForeColor = UiTheme.Text;
            this.Font = UiTheme.UiFont(9.5f, FontStyle.Regular);
            this.DoubleBuffered = true;
            this.Padding = new Padding(16, 12, 16, 16);

            // —— Brand header ——
            pnlHeader = CreateSurfacePanel(DockStyle.Top, 118);
            pnlHeader.Padding = new Padding(22, 14, 22, 12);
            pnlHeader.Paint += PaintSurfaceCard;

            lblBrand = new Label
            {
                Text = "TSU-BOT",
                Font = UiTheme.UiFont(28f, FontStyle.Bold),
                ForeColor = UiTheme.Brand,
                AutoSize = true,
                Location = new Point(22, 12),
                BackColor = Color.Transparent
            };
            pnlHeader.Controls.Add(lblBrand);

            lblTagline = new Label
            {
                Text = "Pro Desktop Suite  ·  Multi-Browser Workers",
                Font = UiTheme.UiFont(10f, FontStyle.Regular),
                ForeColor = UiTheme.TextMuted,
                AutoSize = true,
                Location = new Point(26, 52),
                BackColor = Color.Transparent
            };
            pnlHeader.Controls.Add(lblTagline);

            lblVersion = new Label
            {
                Text = "v" + APP_VERSION,
                Font = UiTheme.UiFont(9f, FontStyle.Bold),
                ForeColor = UiTheme.Brand,
                BackColor = UiTheme.BrandSoft,
                AutoSize = true,
                Padding = new Padding(10, 4, 10, 4),
                Location = new Point(210, 22)
            };
            pnlHeader.Controls.Add(lblVersion);

            lblUpdateStatus = new Label
            {
                Text = "อัปเดต: กำลังตรวจสอบจาก GitHub...",
                Font = UiTheme.UiFont(8.5f, FontStyle.Regular),
                ForeColor = UiTheme.TextMuted,
                AutoSize = true,
                Location = new Point(26, 78),
                BackColor = Color.Transparent,
                MaximumSize = new Size(620, 0)
            };
            pnlHeader.Controls.Add(lblUpdateStatus);

            progUpdate = new ProgressBar
            {
                Location = new Point(26, 98),
                Size = new Size(420, 10),
                Minimum = 0,
                Maximum = 100,
                Value = 0,
                Visible = false,
                Style = ProgressBarStyle.Continuous
            };
            pnlHeader.Controls.Add(progUpdate);

            btnCheckUpdate = CreateButton("เช็คอัปเดต", UiTheme.Info, 128, 36, false);
            btnCheckUpdate.Click += (s, e) => CheckUpdateAsync(true);
            pnlHeader.Controls.Add(btnCheckUpdate);

            this.Controls.Add(pnlHeader);

            // —— Launch / controls ——
            Panel pnlControls = CreateSurfacePanel(DockStyle.Top, 188);
            pnlControls.Padding = new Padding(18, 14, 18, 14);
            pnlControls.Paint += PaintSurfaceCard;
            pnlControls.Margin = new Padding(0, 10, 0, 0);

            Label lblSetup = new Label
            {
                Text = "ตั้งค่าและเริ่มทำงาน",
                Font = UiTheme.UiFont(11f, FontStyle.Bold),
                ForeColor = UiTheme.BrandDeep,
                AutoSize = true,
                Location = new Point(18, 12),
                BackColor = Color.Transparent
            };
            pnlControls.Controls.Add(lblSetup);

            btnLogin = CreateButton("เปิด Chrome เข้าสู่ระบบ", UiTheme.Success, 220, 36, true);
            btnLogin.Location = new Point(18, 42);
            btnLogin.Click += BtnLogin_Click;
            pnlControls.Controls.Add(btnLogin);

            btnSettings = CreateButton("ตั้งค่ารายวิชา & URL", UiTheme.Info, 180, 36, false);
            btnSettings.Location = new Point(248, 42);
            btnSettings.Click += BtnSettings_Click;
            pnlControls.Controls.Add(btnSettings);

            btnAddCourse = CreateButton("เพิ่มวิชาด่วน", UiTheme.Brand, 130, 36, false);
            btnAddCourse.Location = new Point(438, 42);
            btnAddCourse.Click += BtnSettings_Click;
            pnlControls.Controls.Add(btnAddCourse);

            Label lblCourse = CreateFieldLabel("เลือกวิชาที่จะทำ", new Point(18, 92));
            pnlControls.Controls.Add(lblCourse);

            comboCourse = CreateCombo(new Point(18, 114), 460);
            comboCourse.SelectedIndexChanged += (s, ev) =>
            {
                CourseItem ci = comboCourse.SelectedItem as CourseItem;
                if (ci != null && !string.IsNullOrEmpty(ci.Url))
                {
                    txtUrl.Text = ci.Url;
                }
            };
            pnlControls.Controls.Add(comboCourse);

            Label lblSpeed = CreateFieldLabel("ความเร็ว", new Point(498, 92));
            pnlControls.Controls.Add(lblSpeed);

            comboSpeed = CreateCombo(new Point(498, 114), 160);
            comboSpeed.Items.AddRange(new object[] { "turbo (สายฟ้า)", "normal (สมดุล)", "safe (ปลอดภัย)" });
            comboSpeed.SelectedIndex = 1;
            pnlControls.Controls.Add(comboSpeed);

            Label lblModes = CreateFieldLabel("ให้บอททำ (เลือกอย่างน้อย 1)", new Point(680, 92));
            pnlControls.Controls.Add(lblModes);

            chkModeQuiz = CreateModeCheckBox("แบบฝึก", new Point(680, 115));
            chkModeVideo = CreateModeCheckBox("วิดีโอ", new Point(770, 115));
            chkModeDoc = CreateModeCheckBox("เอกสาร", new Point(855, 115));
            pnlControls.Controls.Add(chkModeQuiz);
            pnlControls.Controls.Add(chkModeVideo);
            pnlControls.Controls.Add(chkModeDoc);

            Label lblUrl = CreateFieldLabel("URL เจาะจง (ถ้ามี)", new Point(18, 148));
            pnlControls.Controls.Add(lblUrl);

            txtUrl = CreateTextBox(new Point(150, 144), 300);
            pnlControls.Controls.Add(txtUrl);

            btnStart = CreateButton("เริ่มบอท (+ New)", UiTheme.Brand, 168, 36, true);
            btnStart.Location = new Point(468, 142);
            btnStart.Click += BtnStart_Click;
            pnlControls.Controls.Add(btnStart);

            btnPause = CreateButton("หยุดชั่วคราว", UiTheme.Warning, 128, 36, false);
            btnPause.Location = new Point(646, 142);
            btnPause.Click += BtnPause_Click;
            pnlControls.Controls.Add(btnPause);

            btnCancel = CreateButton("ยกเลิกการทำงาน", UiTheme.Danger, 148, 36, false);
            btnCancel.Location = new Point(784, 142);
            btnCancel.Click += BtnCancel_Click;
            pnlControls.Controls.Add(btnCancel);

            // Spacer between header/controls and content
            Panel spacer = new Panel
            {
                Dock = DockStyle.Top,
                Height = 12,
                BackColor = Color.Transparent
            };

            // —— Workers + logs ——
            splitMain = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 210,
                SplitterWidth = 8,
                BackColor = Color.Transparent,
                Panel1MinSize = 120,
                Panel2MinSize = 140
            };
            splitMain.Panel1.BackColor = Color.Transparent;
            splitMain.Panel2.BackColor = Color.Transparent;

            Panel pnlWorkersCard = CreateSurfacePanel(DockStyle.Fill, 0);
            pnlWorkersCard.Paint += PaintSurfaceCard;
            pnlWorkersCard.Padding = new Padding(2);

            pnlWorkersHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 44,
                BackColor = Color.Transparent,
                Padding = new Padding(14, 8, 14, 4)
            };

            Label lblWorkersTitle = new Label
            {
                Text = "หน้าต่าง Chrome ที่กำลังทำงาน",
                Font = UiTheme.UiFont(11f, FontStyle.Bold),
                ForeColor = UiTheme.BrandDeep,
                AutoSize = true,
                Location = new Point(14, 12),
                BackColor = Color.Transparent
            };
            pnlWorkersHeader.Controls.Add(lblWorkersTitle);

            btnPauseWorker = CreateButton("พัก / ต่อ", UiTheme.Warning, 108, 30, false);
            btnPauseWorker.Click += BtnPause_Click;
            pnlWorkersHeader.Controls.Add(btnPauseWorker);

            btnStop = CreateButton("ยกเลิกที่เลือก", UiTheme.Danger, 124, 30, false);
            btnStop.Click += BtnCancel_Click;
            pnlWorkersHeader.Controls.Add(btnStop);

            pnlWorkersCard.Controls.Add(pnlWorkersHeader);

            lvWorkers = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                BackColor = UiTheme.SurfaceSoft,
                ForeColor = UiTheme.Text,
                BorderStyle = BorderStyle.None,
                Font = UiTheme.UiFont(9.5f, FontStyle.Regular),
                HeaderStyle = ColumnHeaderStyle.Nonclickable,
                HideSelection = false,
                GridLines = false
            };
            lvWorkers.Columns.Add("Worker ID", 120);
            lvWorkers.Columns.Add("รหัสวิชา", 140);
            lvWorkers.Columns.Add("โหมด", 100);
            lvWorkers.Columns.Add("สถานะการทำงาน", 420);
            pnlWorkersCard.Controls.Add(lvWorkers);
            // Ensure header stays on top of list
            lvWorkers.BringToFront();
            pnlWorkersHeader.BringToFront();
            // Fix z-order: Dock Fill then Dock Top means Top wins for layout; add header first then list is wrong.
            // Re-add in correct order: list first (fill), header second (top).
            pnlWorkersCard.Controls.Clear();
            pnlWorkersCard.Controls.Add(lvWorkers);
            pnlWorkersCard.Controls.Add(pnlWorkersHeader);

            splitMain.Panel1.Controls.Add(pnlWorkersCard);

            Panel pnlLogsCard = CreateSurfacePanel(DockStyle.Fill, 0);
            pnlLogsCard.Paint += PaintSurfaceCard;

            Panel pnlLogsHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 40,
                BackColor = Color.Transparent
            };
            Label lblLogsTitle = new Label
            {
                Text = "บันทึกการทำงานเรียลไทม์",
                Font = UiTheme.UiFont(11f, FontStyle.Bold),
                ForeColor = UiTheme.BrandDeep,
                AutoSize = true,
                Location = new Point(14, 10),
                BackColor = Color.Transparent
            };
            pnlLogsHeader.Controls.Add(lblLogsTitle);

            rtbLogs = new RichTextBox
            {
                Dock = DockStyle.Fill,
                BackColor = UiTheme.LogBg,
                ForeColor = UiTheme.LogDefault,
                Font = UiTheme.MonoFont(9.5f),
                ReadOnly = true,
                BorderStyle = BorderStyle.None,
                DetectUrls = false
            };

            pnlLogsCard.Controls.Add(rtbLogs);
            pnlLogsCard.Controls.Add(pnlLogsHeader);
            splitMain.Panel2.Controls.Add(pnlLogsCard);

            // Add in reverse dock order: Fill first, then Top panels
            this.Controls.Add(splitMain);
            this.Controls.Add(spacer);
            this.Controls.Add(pnlControls);
            this.Controls.Add(pnlHeader);

            this.Resize += (s, e) => LayoutChrome();
            LayoutChrome();

            this.FormClosing += (s, e) =>
            {
                foreach (var p in runningWorkers.Values)
                {
                    try { if (!p.HasExited) p.Kill(); } catch { }
                }
            };
        }

        private void LayoutChrome()
        {
            if (pnlHeader != null && btnCheckUpdate != null)
            {
                int rightPad = 22;
                btnCheckUpdate.Location = new Point(
                    Math.Max(360, pnlHeader.ClientSize.Width - btnCheckUpdate.Width - rightPad),
                    22);
                if (lblVersion != null && lblBrand != null)
                {
                    lblVersion.Location = new Point(lblBrand.Right + 12, 22);
                }
                if (lblUpdateStatus != null)
                {
                    lblUpdateStatus.MaximumSize = new Size(
                        Math.Max(200, btnCheckUpdate.Left - 40),
                        0);
                }
                if (progUpdate != null)
                {
                    progUpdate.Width = Math.Max(180, Math.Min(520, btnCheckUpdate.Left - 40));
                }
            }

            if (pnlWorkersHeader != null && btnStop != null && btnPauseWorker != null)
            {
                int right = pnlWorkersHeader.ClientSize.Width - 14;
                btnStop.Location = new Point(right - btnStop.Width, 7);
                btnPauseWorker.Location = new Point(btnStop.Left - 10 - btnPauseWorker.Width, 7);
            }

            if (lvWorkers != null && lvWorkers.Columns.Count >= 4 && lvWorkers.ClientSize.Width > 100)
            {
                int w = lvWorkers.ClientSize.Width;
                lvWorkers.Columns[0].Width = 120;
                lvWorkers.Columns[1].Width = 140;
                lvWorkers.Columns[2].Width = 100;
                lvWorkers.Columns[3].Width = Math.Max(200, w - 370);
            }
        }

        private Panel CreateSurfacePanel(DockStyle dock, int height)
        {
            Panel p = new Panel
            {
                Dock = dock,
                Height = height,
                BackColor = UiTheme.Surface
            };
            return p;
        }

        private void PaintSurfaceCard(object sender, PaintEventArgs e)
        {
            Panel p = sender as Panel;
            if (p == null) return;
            Rectangle r = new Rectangle(0, 0, p.Width - 1, p.Height - 1);
            using (Pen pen = new Pen(UiTheme.Line))
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                e.Graphics.DrawRectangle(pen, r);
            }
            using (Pen accent = new Pen(Color.FromArgb(90, UiTheme.Brand), 2))
            {
                e.Graphics.DrawLine(accent, 0, 0, p.Width, 0);
            }
        }

        private Label CreateFieldLabel(string text, Point location)
        {
            return new Label
            {
                Text = text,
                Location = location,
                AutoSize = true,
                ForeColor = UiTheme.TextMuted,
                BackColor = Color.Transparent,
                Font = UiTheme.UiFont(9f, FontStyle.Regular)
            };
        }

        private ComboBox CreateCombo(Point location, int width)
        {
            return new ComboBox
            {
                Location = location,
                Width = width,
                DropDownStyle = ComboBoxStyle.DropDownList,
                BackColor = UiTheme.SurfaceSoft,
                ForeColor = UiTheme.Text,
                FlatStyle = FlatStyle.Flat,
                Font = UiTheme.UiFont(9.5f, FontStyle.Regular)
            };
        }

        private CheckBox CreateModeCheckBox(string text, Point location)
        {
            CheckBox chk = new CheckBox
            {
                Text = text,
                Location = location,
                AutoSize = true,
                Checked = true,
                ForeColor = UiTheme.Text,
                BackColor = Color.Transparent,
                Cursor = Cursors.Hand,
                Font = UiTheme.UiFont(9.5f, FontStyle.Bold)
            };
            chk.CheckedChanged += ModeCheckBox_CheckedChanged;
            return chk;
        }

        private void ModeCheckBox_CheckedChanged(object sender, EventArgs e)
        {
            if (suppressModeEvents) return;
            CheckBox chk = sender as CheckBox;
            if (!chkModeQuiz.Checked && !chkModeVideo.Checked && !chkModeDoc.Checked && chk != null)
            {
                suppressModeEvents = true;
                chk.Checked = true;
                suppressModeEvents = false;
                AppendLog("ต้องเลือกสิ่งที่ให้บอททำอย่างน้อย 1 อย่าง (แบบฝึก / วิดีโอ / เอกสาร)", UiTheme.Warning);
                return;
            }
            SaveModeSettings();
        }

        private string GetSelectedModes()
        {
            List<string> modes = new List<string>();
            if (chkModeQuiz.Checked) modes.Add("quiz");
            if (chkModeVideo.Checked) modes.Add("video");
            if (chkModeDoc.Checked) modes.Add("doc");
            return string.Join(",", modes.ToArray());
        }

        private static string DescribeModes(string modes)
        {
            List<string> names = new List<string>();
            foreach (string m in modes.Split(new char[] { ',' }))
            {
                if (m == "quiz") names.Add("แบบฝึก");
                else if (m == "video") names.Add("วิดีโอ");
                else if (m == "doc") names.Add("เอกสาร");
            }
            return string.Join(" + ", names.ToArray());
        }

        private void LoadModeSettings()
        {
            string path = Path.Combine(appDir, SETTINGS_FILE);
            if (!File.Exists(path)) return;
            try
            {
                string json = File.ReadAllText(path, Encoding.UTF8);
                Match m = Regex.Match(json, "\"modes\"\\s*:\\s*\"([^\"]*)\"");
                if (!m.Success) return;
                string[] saved = m.Groups[1].Value.ToLowerInvariant().Split(new char[] { ',' });
                bool quiz = Array.IndexOf(saved, "quiz") >= 0;
                bool video = Array.IndexOf(saved, "video") >= 0;
                bool doc = Array.IndexOf(saved, "doc") >= 0;
                if (!quiz && !video && !doc) return;
                suppressModeEvents = true;
                chkModeQuiz.Checked = quiz;
                chkModeVideo.Checked = video;
                chkModeDoc.Checked = doc;
                suppressModeEvents = false;
            }
            catch { suppressModeEvents = false; }
        }

        private void SaveModeSettings()
        {
            try
            {
                string json = "{\r\n  \"modes\": \"" + GetSelectedModes() + "\"\r\n}\r\n";
                File.WriteAllText(Path.Combine(appDir, SETTINGS_FILE), json, new UTF8Encoding(false));
            }
            catch (Exception ex)
            {
                AppendLog("บันทึกการตั้งค่าโหมดไม่สำเร็จ: " + ex.Message, UiTheme.Warning);
            }
        }

        private TextBox CreateTextBox(Point location, int width)
        {
            return new TextBox
            {
                Location = location,
                Width = width,
                Height = 28,
                BackColor = UiTheme.SurfaceSoft,
                ForeColor = UiTheme.Text,
                BorderStyle = BorderStyle.FixedSingle,
                Font = UiTheme.UiFont(9.5f, FontStyle.Regular)
            };
        }

        private Button CreateButton(string text, Color bg, int width, int height, bool primary)
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
                Font = UiTheme.UiFont(primary ? 9.5f : 9f, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter,
                UseVisualStyleBackColor = false
            };
            btn.FlatAppearance.BorderSize = 0;
            btn.FlatAppearance.MouseOverBackColor = UiTheme.Lighten(bg, 18);
            btn.FlatAppearance.MouseDownBackColor = UiTheme.Darken(bg, 18);
            btn.Padding = new Padding(4, 0, 4, 0);
            btn.Tag = bg;

            btn.MouseEnter += (s, e) =>
            {
                Color baseBg = (btn.Tag is Color) ? (Color)btn.Tag : btn.BackColor;
                btn.BackColor = UiTheme.Lighten(baseBg, 14);
            };
            btn.MouseLeave += (s, e) =>
            {
                if (btn.Tag is Color) btn.BackColor = (Color)btn.Tag;
            };
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
            rtbLogs.SelectionColor = color ?? UiTheme.LogDefault;
            rtbLogs.AppendText(string.Format("[{0}] {1}\n", DateTime.Now.ToString("HH:mm:ss"), text));
            rtbLogs.ScrollToCaret();
        }

        private void LoadCourses()
        {
            courses.Clear();
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
                        string code = m.Groups[1].Value;
                        string name = m.Groups[2].Value;
                        string url = "";

                        int cIdx = m.Index;
                        int nextCIdx = json.IndexOf("\"course_code\"", cIdx + 20);
                        string block = nextCIdx > cIdx ? json.Substring(cIdx, nextCIdx - cIdx) : json.Substring(cIdx);
                        Match mUrl = Regex.Match(block, "\"course_id_url_if_known\"\\s*:\\s*\"([^\"]+)\"");
                        if (mUrl.Success) url = mUrl.Groups[1].Value;

                        bool exists = false;
                        foreach (var c in courses)
                        {
                            if (c.Code.Equals(code, StringComparison.OrdinalIgnoreCase)) { exists = true; break; }
                        }
                        if (!exists)
                        {
                            courses.Add(new CourseItem { Code = code, Name = name, Url = url });
                        }
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
                        string code = m.Groups[1].Value;
                        string name = m.Groups[2].Value;
                        string url = "";

                        int cIdx = m.Index;
                        int nextCIdx = json.IndexOf("\"course_code\"", cIdx + 20);
                        string block = nextCIdx > cIdx ? json.Substring(cIdx, nextCIdx - cIdx) : json.Substring(cIdx);
                        Match mUrl = Regex.Match(block, "\"(?:course_id_url_if_known|url)\"\\s*:\\s*\"([^\"]+)\"");
                        if (mUrl.Success) url = mUrl.Groups[1].Value;

                        CourseItem existing = null;
                        foreach (var c in courses)
                        {
                            if (c.Code.Equals(code, StringComparison.OrdinalIgnoreCase)) { existing = c; break; }
                        }

                        if (existing != null)
                        {
                            existing.Name = name;
                            if (!string.IsNullOrEmpty(url)) existing.Url = url;
                        }
                        else
                        {
                            courses.Add(new CourseItem { Code = code, Name = name, Url = url });
                        }
                    }
                }
                catch { }
            }

            foreach (var c in courses)
            {
                comboCourse.Items.Add(c);
            }

            if (comboCourse.Items.Count > 0)
            {
                comboCourse.SelectedIndex = 0;
                CourseItem ci = comboCourse.SelectedItem as CourseItem;
                if (ci != null && !string.IsNullOrEmpty(ci.Url))
                {
                    txtUrl.Text = ci.Url;
                }
            }
        }

        private void EnsureDependencies()
        {
            string pwDir = Path.Combine(appDir, "node_modules", "playwright");
            if (!Directory.Exists(pwDir))
            {
                AppendLog("ยังไม่พบโมดูล playwright กำลังติดตั้งระบบให้อัตโนมัติ (ครั้งแรกครั้งเดียว)...", UiTheme.Warning);
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
                    AppendLog("ติดตั้งระบบเรียบร้อยแล้ว!", UiTheme.Success);
                }
                catch (Exception ex)
                {
                    AppendLog("ไม่สามารถติดตั้งแพ็กเกจได้: " + ex.Message, UiTheme.Danger);
                }
            }
        }

        private void BtnLogin_Click(object sender, EventArgs e)
        {
            AppendLog("กำลังตรวจสอบระบบและเปิดหน้าต่าง Chrome สำหรับล็อกอินเข้าสู่ระบบ TSU...", UiTheme.Success);
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
                            AppendLog("[ERROR] " + ev.Data, UiTheme.Danger);
                    };
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    p.WaitForExit();
                    AppendLog("ปิดหน้าต่างล็อกอินแล้ว บัญชีถูกบันทึกในระบบเรียบร้อย", UiTheme.Success);
                }
                catch (Exception ex)
                {
                    AppendLog("ข้อผิดพลาดในการเปิดล็อกอิน: " + ex.Message, UiTheme.Danger);
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        private void BtnStart_Click(object sender, EventArgs e)
        {
            CourseItem ci = comboCourse.SelectedItem as CourseItem;
            string courseCode = ci != null ? ci.Code : (comboCourse.SelectedItem != null ? comboCourse.SelectedItem.ToString() : "");
            if (courseCode.Contains(" - ")) courseCode = courseCode.Split(new string[] { " - " }, StringSplitOptions.None)[0];

            string speed = comboSpeed.SelectedItem.ToString().Split(new char[] { ' ' })[0];
            string customUrl = txtUrl.Text.Trim();
            if (string.IsNullOrEmpty(customUrl) && ci != null && !string.IsNullOrEmpty(ci.Url))
            {
                customUrl = ci.Url;
            }

            string modes = GetSelectedModes();
            if (string.IsNullOrEmpty(modes))
            {
                AppendLog("กรุณาเลือกอย่างน้อย 1 อย่าง: แบบฝึก / วิดีโอ / เอกสาร", UiTheme.Warning);
                return;
            }

            string workerId = "Worker-" + (workerCounter++);

            AppendLog(string.Format("เริ่มต้น {0} | วิชา: {1} | โหมด: {2} | ทำ: {3}", workerId, courseCode, speed, DescribeModes(modes)), UiTheme.Info);

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
                string args = string.Format("\"{0}\" --action run --id \"{1}\" --course \"{2}\" --speed \"{3}\" --modes \"{4}\"", script, workerId, courseCode, speed, modes);
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
                            AppendLog(string.Format("[{0} ERROR] {1}", workerId, ev.Data), UiTheme.Danger);
                    };

                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    p.WaitForExit();

                    UpdateWorkerStatus(workerId, "เสร็จสิ้น / ปิดหน้าต่างแล้ว");
                    runningWorkers.Remove(workerId);
                }
                catch (Exception ex)
                {
                    AppendLog(string.Format("[{0}] Error: {1}", workerId, ex.Message), UiTheme.Danger);
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
                    AppendLog(string.Format("[หยุดชั่วคราว] {0} หยุดการทำงานชั่วคราวแล้ว", workerId), UiTheme.Warning);
                    UpdateWorkerStatus(workerId, "หยุดชั่วคราว (Paused)");
                }
                else
                {
                    p.StandardInput.WriteLine("resume");
                    workerPausedStates[workerId] = false;
                    AppendLog(string.Format("[ทำงานต่อ] {0} กลับมาทำงานต่อแล้ว", workerId), UiTheme.Success);
                    UpdateWorkerStatus(workerId, "กำลังทำงานต่อ (Resumed)");
                }
            }
            catch (Exception ex)
            {
                AppendLog(string.Format("ข้อผิดพลาดในการส่งคำสั่ง Pause/Resume: {0}", ex.Message), UiTheme.Danger);
            }
        }

        private void UpdatePauseButtons(bool isPaused)
        {
            if (isPaused)
            {
                btnPause.Text = "ทำงานต่อ";
                btnPause.BackColor = UiTheme.Success;
                btnPause.Tag = UiTheme.Success;
                if (btnPauseWorker != null)
                {
                    btnPauseWorker.Text = "ทำงานต่อ";
                    btnPauseWorker.BackColor = UiTheme.Success;
                    btnPauseWorker.Tag = UiTheme.Success;
                }
            }
            else
            {
                btnPause.Text = "หยุดชั่วคราว";
                btnPause.BackColor = UiTheme.Warning;
                btnPause.Tag = UiTheme.Warning;
                if (btnPauseWorker != null)
                {
                    btnPauseWorker.Text = "พัก / ต่อ";
                    btnPauseWorker.BackColor = UiTheme.Warning;
                    btnPauseWorker.Tag = UiTheme.Warning;
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

                AppendLog(string.Format("[ยกเลิก] {0} ได้รับคำสั่งยกเลิกการทำงานและกำลังปิดหน้าต่าง", workerId), UiTheme.Danger);
                UpdateWorkerStatus(workerId, "ยกเลิกการทำงานแล้ว (Stopped)");
                runningWorkers.Remove(workerId);
                if (workerPausedStates.ContainsKey(workerId)) workerPausedStates.Remove(workerId);
            }
            catch (Exception ex)
            {
                AppendLog(string.Format("ข้อผิดพลาดในการยกเลิก {0}: {1}", workerId, ex.Message), UiTheme.Danger);
            }
        }

        private void BtnSettings_Click(object sender, EventArgs e)
        {
            Form dlg = new Form
            {
                Text = "ตั้งค่ารายวิชาและลิงก์ URL",
                Size = new Size(860, 600),
                StartPosition = FormStartPosition.CenterParent,
                BackColor = UiTheme.BgWash,
                ForeColor = UiTheme.Text,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false,
                Font = UiTheme.UiFont(9.5f, FontStyle.Regular)
            };

            Panel card = new Panel
            {
                Location = new Point(16, 16),
                Size = new Size(812, 528),
                BackColor = UiTheme.Surface
            };
            card.Paint += PaintSurfaceCard;
            dlg.Controls.Add(card);

            Label lblH = new Label
            {
                Text = "ตั้งค่ารายวิชา",
                Font = UiTheme.UiFont(16f, FontStyle.Bold),
                ForeColor = UiTheme.Brand,
                Location = new Point(20, 16),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            card.Controls.Add(lblH);

            Label lblSub = new Label
            {
                Text = "กำหนดชื่อวิชา และแนบลิงก์ URL ให้ตรงกับวิชานั้น",
                Font = UiTheme.UiFont(9.5f, FontStyle.Regular),
                ForeColor = UiTheme.TextMuted,
                Location = new Point(22, 48),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            card.Controls.Add(lblSub);

            ListView lv = new ListView
            {
                Location = new Point(20, 78),
                Size = new Size(772, 210),
                View = View.Details,
                FullRowSelect = true,
                BackColor = UiTheme.SurfaceSoft,
                ForeColor = UiTheme.Text,
                BorderStyle = BorderStyle.FixedSingle,
                Font = UiTheme.UiFont(9.5f, FontStyle.Regular)
            };
            lv.Columns.Add("รหัสวิชา (Code)", 130);
            lv.Columns.Add("ชื่อวิชา (Course Name)", 260);
            lv.Columns.Add("ลิงก์ URL ประจำวิชา (Default URL)", 360);
            card.Controls.Add(lv);

            Action populateList = () =>
            {
                lv.Items.Clear();
                foreach (var c in courses)
                {
                    ListViewItem it = new ListViewItem(c.Code);
                    it.SubItems.Add(c.Name);
                    it.SubItems.Add(c.Url ?? "");
                    it.Tag = c;
                    lv.Items.Add(it);
                }
            };
            populateList();

            Label l1 = new Label { Text = "รหัสวิชา (Course Code)", Location = new Point(20, 304), AutoSize = true, ForeColor = UiTheme.TextMuted, BackColor = Color.Transparent };
            TextBox tCode = CreateTextBox(new Point(20, 326), 180);
            card.Controls.Add(l1); card.Controls.Add(tCode);

            Label l2 = new Label { Text = "ชื่อวิชา (Course Name)", Location = new Point(220, 304), AutoSize = true, ForeColor = UiTheme.TextMuted, BackColor = Color.Transparent };
            TextBox tName = CreateTextBox(new Point(220, 326), 572);
            card.Controls.Add(l2); card.Controls.Add(tName);

            Label l3 = new Label { Text = "ลิงก์ URL ประจำวิชา (เช่น https://apps.course.tsu.ac.th/learning/course/.../home)", Location = new Point(20, 366), AutoSize = true, ForeColor = UiTheme.TextMuted, BackColor = Color.Transparent };
            TextBox tUrl = CreateTextBox(new Point(20, 388), 772);
            card.Controls.Add(l3); card.Controls.Add(tUrl);

            lv.SelectedIndexChanged += (s, ev) =>
            {
                if (lv.SelectedItems.Count > 0)
                {
                    CourseItem ci = lv.SelectedItems[0].Tag as CourseItem;
                    if (ci != null)
                    {
                        tCode.Text = ci.Code;
                        tName.Text = ci.Name;
                        tUrl.Text = ci.Url ?? "";
                    }
                }
            };

            Action saveAllToDisk = () =>
            {
                string customDb = Path.Combine(appDir, "custom_courses.json");
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("[");
                for (int i = 0; i < courses.Count; i++)
                {
                    var c = courses[i];
                    sb.AppendLine("  {");
                    sb.AppendLine(string.Format("    \"course_code\": \"{0}\",", c.Code));
                    sb.AppendLine(string.Format("    \"course_name\": \"{0}\",", c.Name));
                    sb.AppendLine(string.Format("    \"url\": \"{0}\",", c.Url ?? ""));
                    sb.AppendLine(string.Format("    \"course_id_url_if_known\": \"{0}\"", c.Url ?? ""));
                    sb.Append("  }");
                    if (i < courses.Count - 1) sb.Append(",");
                    sb.AppendLine();
                }
                sb.AppendLine("]");
                File.WriteAllText(customDb, sb.ToString(), Encoding.UTF8);
            };

            Button btnSave = CreateButton("บันทึกการแก้ไข", UiTheme.Success, 150, 36, true);
            btnSave.Location = new Point(20, 440);
            btnSave.Click += (s, ev) =>
            {
                string code = tCode.Text.Trim();
                string name = tName.Text.Trim();
                string url = tUrl.Text.Trim();

                if (string.IsNullOrEmpty(code))
                {
                    MessageBox.Show("กรุณาระบุรหัสวิชา", "เตือน");
                    return;
                }

                CourseItem target = null;
                foreach (var c in courses)
                {
                    if (c.Code.Equals(code, StringComparison.OrdinalIgnoreCase))
                    {
                        target = c;
                        break;
                    }
                }

                if (target != null)
                {
                    target.Name = name;
                    target.Url = url;
                }
                else
                {
                    courses.Add(new CourseItem { Code = code, Name = name, Url = url });
                }

                saveAllToDisk();
                populateList();
                LoadCourses();
                AppendLog(string.Format("บันทึกการตั้งค่าวิชา {0} (URL: {1}) เรียบร้อยแล้ว", code, url), UiTheme.Success);
                MessageBox.Show("บันทึกการตั้งค่ารายวิชาเรียบร้อยแล้ว!", "สำเร็จ", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };
            card.Controls.Add(btnSave);

            Button btnAddNew = CreateButton("เพิ่มเป็นวิชาใหม่", UiTheme.Brand, 150, 36, false);
            btnAddNew.Location = new Point(180, 440);
            btnAddNew.Click += (s, ev) =>
            {
                string code = tCode.Text.Trim();
                string name = tName.Text.Trim();
                string url = tUrl.Text.Trim();

                if (string.IsNullOrEmpty(code))
                {
                    MessageBox.Show("กรุณาระบุรหัสวิชาใหม่", "เตือน");
                    return;
                }

                foreach (var c in courses)
                {
                    if (c.Code.Equals(code, StringComparison.OrdinalIgnoreCase))
                    {
                        MessageBox.Show("มีรหัสวิชานี้อยู่ในระบบแล้ว กรุณากดปุ่ม 'บันทึกการแก้ไข' แทน", "แจ้งเตือน");
                        return;
                    }
                }

                courses.Add(new CourseItem { Code = code, Name = name, Url = url });
                saveAllToDisk();
                populateList();
                LoadCourses();
                AppendLog(string.Format("เพิ่มวิชาใหม่ {0} - {1} เรียบร้อย", code, name), UiTheme.Success);
                MessageBox.Show("เพิ่มวิชาใหม่เรียบร้อยแล้ว!", "สำเร็จ", MessageBoxButtons.OK, MessageBoxIcon.Information);
            };
            card.Controls.Add(btnAddNew);

            Button btnDel = CreateButton("ลบวิชาที่เลือก", UiTheme.Danger, 130, 36, false);
            btnDel.Location = new Point(340, 440);
            btnDel.Click += (s, ev) =>
            {
                if (lv.SelectedItems.Count == 0)
                {
                    MessageBox.Show("กรุณาเลือกวิชาในตารางที่ต้องการลบ", "เตือน");
                    return;
                }
                CourseItem ci = lv.SelectedItems[0].Tag as CourseItem;
                if (ci == null) return;

                if (MessageBox.Show(string.Format("ต้องการลบวิชา {0} - {1} ใช่หรือไม่?", ci.Code, ci.Name), "ยืนยันการลบ", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                {
                    courses.Remove(ci);
                    saveAllToDisk();
                    populateList();
                    LoadCourses();
                    tCode.Clear(); tName.Clear(); tUrl.Clear();
                    AppendLog(string.Format("ลบวิชา {0} เรียบร้อย", ci.Code), UiTheme.Danger);
                }
            };
            card.Controls.Add(btnDel);

            Button btnUpdateHere = CreateButton("เช็คอัปเดต", UiTheme.Info, 120, 36, false);
            btnUpdateHere.Location = new Point(490, 440);
            btnUpdateHere.Click += (s, ev) => CheckUpdateAsync(true);
            card.Controls.Add(btnUpdateHere);

            Button btnClose = CreateButton("ปิดหน้าต่าง", UiTheme.TextMuted, 110, 36, false);
            btnClose.Location = new Point(682, 440);
            btnClose.Click += (s, ev) => dlg.Close();
            card.Controls.Add(btnClose);

            dlg.ShowDialog();
        }

        private void SetUpdateStatus(string text, Color? color = null)
        {
            if (lblUpdateStatus == null) return;
            if (lblUpdateStatus.InvokeRequired)
            {
                lblUpdateStatus.Invoke(new Action(() => SetUpdateStatus(text, color)));
                return;
            }
            lblUpdateStatus.Text = text;
            lblUpdateStatus.ForeColor = color ?? UiTheme.TextMuted;
        }

        private void SetUpdateProgress(int percent, bool visible)
        {
            if (progUpdate == null) return;
            if (progUpdate.InvokeRequired)
            {
                progUpdate.Invoke(new Action(() => SetUpdateProgress(percent, visible)));
                return;
            }
            progUpdate.Visible = visible;
            progUpdate.Value = Math.Max(0, Math.Min(100, percent));
        }

        private void SetUpdateBusy(bool busy)
        {
            if (btnCheckUpdate == null) return;
            if (btnCheckUpdate.InvokeRequired)
            {
                btnCheckUpdate.Invoke(new Action(() => SetUpdateBusy(busy)));
                return;
            }
            btnCheckUpdate.Enabled = !busy;
            updateInProgress = busy;
        }

        private WebClient CreateUpdateClient()
        {
            ConfigureTls();
            WebClient wc = new WebClient();
            wc.Headers.Add("User-Agent", "TSU-BOT-Desktop");
            wc.Encoding = Encoding.UTF8;
            wc.Headers.Add("Cache-Control", "no-cache");
            wc.Headers.Add("Pragma", "no-cache");

            // Optional local token file only — never commit tokens.
            string tokenPath = Path.Combine(appDir, "github_token.txt");
            if (File.Exists(tokenPath))
            {
                string token = File.ReadAllText(tokenPath).Trim();
                if (!string.IsNullOrEmpty(token))
                    wc.Headers.Add("Authorization", "token " + token);
            }
            return wc;
        }

        private static string ComputeSha256Hex(string filePath)
        {
            using (FileStream fs = File.OpenRead(filePath))
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(fs);
                StringBuilder sb = new StringBuilder(hash.Length * 2);
                for (int i = 0; i < hash.Length; i++)
                    sb.Append(hash[i].ToString("x2"));
                return sb.ToString();
            }
        }

        private void CheckUpdateAsync(bool verbose)
        {
            if (updateInProgress)
            {
                if (verbose)
                    MessageBox.Show("กำลังอัปเดตอยู่ กรุณารอสักครู่", "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            SetUpdateBusy(true);
            SetUpdateStatus("อัปเดต: กำลังตรวจสอบ version.json จาก GitHub...", UiTheme.Info);
            SetUpdateProgress(0, verbose);

            Thread t = new Thread(() =>
            {
                try
                {
                    using (WebClient wc = CreateUpdateClient())
                    {
                        string rawUrl = string.Format("https://raw.githubusercontent.com/{0}/main/version.json", GITHUB_REPO);
                        string json = wc.DownloadString(rawUrl);

                        Match mV = Regex.Match(json, "\"version\"\\s*:\\s*\"([^\"]+)\"");
                        Match mC = Regex.Match(json, "\"changelog\"\\s*:\\s*\"([^\"]+)\"");
                        Match mH = Regex.Match(json, "\"sha256\"\\s*:\\s*\"([^\"]*)\"");

                        string latestVer = mV.Success ? mV.Groups[1].Value : APP_VERSION;
                        string changelog = mC.Success ? mC.Groups[1].Value : "การปรับปรุงประสิทธิภาพทั่วไป";
                        string sha256 = mH.Success ? mH.Groups[1].Value.Trim().ToLowerInvariant() : "";

                        latestRemoteVersion = latestVer;
                        latestRemoteChangelog = changelog;
                        latestRemoteSha256 = sha256;

                        if (latestVer != APP_VERSION)
                        {
                            SetUpdateStatus(
                                string.Format("มีอัปเดตใหม่: ปัจจุบัน v{0} → ล่าสุด v{1}", APP_VERSION, latestVer),
                                UiTheme.Accent);

                            bool shouldUpdate = false;
                            this.Invoke(new Action(() =>
                            {
                                shouldUpdate = ShowUpdatePrompt(latestVer, changelog, sha256, verbose);
                            }));

                            if (shouldUpdate)
                            {
                                PerformInPlaceUpdate(latestVer, sha256);
                                return;
                            }

                            SetUpdateBusy(false);
                            SetUpdateProgress(0, false);
                            return;
                        }

                        SetUpdateStatus(
                            string.Format("อัปเดต: ใช้งานเวอร์ชันล่าสุดแล้ว (v{0})", APP_VERSION),
                            UiTheme.Success);
                        SetUpdateProgress(0, false);

                        if (verbose)
                        {
                            bool sync = false;
                            this.Invoke(new Action(() =>
                            {
                                sync = MessageBox.Show(
                                    string.Format(
                                        "คุณกำลังใช้งานเวอร์ชันล่าสุด (v{0}) อยู่แล้ว\n\nChangelog ล่าสุด:\n{1}\n\nต้องการซิงค์ฐานเฉลย/สคริปต์จาก GitHub ตอนนี้หรือไม่?",
                                        APP_VERSION, changelog),
                                    "เวอร์ชันล่าสุด",
                                    MessageBoxButtons.YesNo,
                                    MessageBoxIcon.Information) == DialogResult.Yes;
                            }));
                            if (sync)
                            {
                                PerformDataSync();
                                return;
                            }
                        }

                        SetUpdateBusy(false);
                        SetUpdateProgress(0, false);
                    }
                }
                catch (WebException wex)
                {
                    SetUpdateStatus("อัปเดต: ตรวจสอบไม่สำเร็จ — " + wex.Message, UiTheme.Danger);
                    if (verbose)
                    {
                        this.Invoke(new Action(() =>
                        {
                            HttpWebResponse resp = wex.Response as HttpWebResponse;
                            if (resp != null && resp.StatusCode == HttpStatusCode.NotFound)
                            {
                                MessageBox.Show(
                                    "ไม่สามารถเช็คอัปเดตได้ (Error 404):\n\nRepository อาจเป็น Private หรือยังไม่มี version.json\n\nทางเลือก:\n1. ตั้ง Repo เป็น Public\n2. ใส่ GitHub token ในไฟล์ local ชื่อ github_token.txt (อย่า commit ไฟล์นี้)",
                                    "เช็คอัปเดตไม่สำเร็จ",
                                    MessageBoxButtons.OK,
                                    MessageBoxIcon.Information);
                            }
                            else
                            {
                                MessageBox.Show("ไม่สามารถเชื่อมต่อเพื่อเช็คอัปเดตได้: " + wex.Message, "เตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            }
                        }));
                    }
                    SetUpdateBusy(false);
                    SetUpdateProgress(0, false);
                }
                catch (Exception ex)
                {
                    SetUpdateStatus("อัปเดต: เกิดข้อผิดพลาด — " + ex.Message, UiTheme.Danger);
                    if (verbose)
                    {
                        this.Invoke(new Action(() =>
                        {
                            MessageBox.Show("ไม่สามารถเชื่อมต่อเพื่อเช็คอัปเดตได้: " + ex.Message, "เตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        }));
                    }
                    SetUpdateBusy(false);
                    SetUpdateProgress(0, false);
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        private bool ShowUpdatePrompt(string latestVer, string changelog, string sha256, bool verbose)
        {
            using (Form dlg = new Form())
            {
                dlg.Text = "อัปเดต TSU-BOT Pro";
                dlg.Size = new Size(560, 420);
                dlg.StartPosition = FormStartPosition.CenterParent;
                dlg.BackColor = UiTheme.BgWash;
                dlg.ForeColor = UiTheme.Text;
                dlg.FormBorderStyle = FormBorderStyle.FixedDialog;
                dlg.MaximizeBox = false;
                dlg.MinimizeBox = false;
                dlg.Font = UiTheme.UiFont(9.5f, FontStyle.Regular);

                Panel card = new Panel
                {
                    Location = new Point(16, 16),
                    Size = new Size(512, 348),
                    BackColor = UiTheme.Surface
                };
                card.Paint += PaintSurfaceCard;
                dlg.Controls.Add(card);

                Label title = new Label
                {
                    Text = "พบเวอร์ชันใหม่",
                    Font = UiTheme.UiFont(16f, FontStyle.Bold),
                    ForeColor = UiTheme.Brand,
                    Location = new Point(20, 16),
                    AutoSize = true,
                    BackColor = Color.Transparent
                };
                card.Controls.Add(title);

                Label versions = new Label
                {
                    Text = string.Format("ปัจจุบัน: v{0}    →    ล่าสุด: v{1}", APP_VERSION, latestVer),
                    Font = UiTheme.UiFont(11f, FontStyle.Bold),
                    ForeColor = UiTheme.BrandDeep,
                    Location = new Point(20, 52),
                    AutoSize = true,
                    BackColor = Color.Transparent
                };
                card.Controls.Add(versions);

                Label hashNote = new Label
                {
                    Text = string.IsNullOrEmpty(sha256)
                        ? "คำเตือน: version.json ยังไม่มี sha256 — จะไม่ติดตั้งจนกว่าจะมีค่าแฮช"
                        : ("SHA256: " + (sha256.Length > 20 ? sha256.Substring(0, 20) + "…" : sha256)),
                    Font = UiTheme.UiFont(8.5f, FontStyle.Regular),
                    ForeColor = string.IsNullOrEmpty(sha256) ? UiTheme.Danger : UiTheme.TextMuted,
                    Location = new Point(20, 78),
                    AutoSize = true,
                    BackColor = Color.Transparent
                };
                card.Controls.Add(hashNote);

                Label clLabel = new Label
                {
                    Text = "Changelog",
                    Font = UiTheme.UiFont(9.5f, FontStyle.Bold),
                    ForeColor = UiTheme.TextMuted,
                    Location = new Point(20, 108),
                    AutoSize = true,
                    BackColor = Color.Transparent
                };
                card.Controls.Add(clLabel);

                TextBox txtCl = new TextBox
                {
                    Location = new Point(20, 130),
                    Size = new Size(472, 140),
                    Multiline = true,
                    ReadOnly = true,
                    ScrollBars = ScrollBars.Vertical,
                    BackColor = UiTheme.SurfaceSoft,
                    ForeColor = UiTheme.Text,
                    BorderStyle = BorderStyle.FixedSingle,
                    Text = changelog,
                    Font = UiTheme.UiFont(9.5f, FontStyle.Regular)
                };
                card.Controls.Add(txtCl);

                bool accepted = false;
                Button btnGo = CreateButton("อัปเดตเลย", UiTheme.Success, 140, 36, true);
                btnGo.Location = new Point(20, 290);
                btnGo.Enabled = !string.IsNullOrEmpty(sha256);
                btnGo.Click += (s, e) => { accepted = true; dlg.Close(); };
                card.Controls.Add(btnGo);

                Button btnLater = CreateButton("ไว้ทีหลัง", UiTheme.TextMuted, 120, 36, false);
                btnLater.Location = new Point(172, 290);
                btnLater.Click += (s, e) => dlg.Close();
                card.Controls.Add(btnLater);

                if (!verbose)
                {
                    // Auto-check still shows the prompt so the user can one-click update.
                }

                dlg.ShowDialog(this);
                return accepted;
            }
        }

        private void PerformDataSync()
        {
            AppendLog("กำลังซิงค์ฐานเฉลยข้อสอบล่าสุดจาก GitHub...", UiTheme.Info);
            SetUpdateStatus("อัปเดต: กำลังซิงค์ข้อมูลจาก GitHub...", UiTheme.Info);
            try
            {
                using (WebClient wc = CreateUpdateClient())
                {
                    string baseRaw = string.Format("https://raw.githubusercontent.com/{0}/main/", GITHUB_REPO);
                    wc.DownloadFile(baseRaw + "tsu_answers.json", Path.Combine(appDir, "tsu_answers.json"));
                    wc.DownloadFile(baseRaw + "cli_worker.js", Path.Combine(appDir, "cli_worker.js"));
                    wc.DownloadFile(baseRaw + "worker.js", Path.Combine(appDir, "worker.js"));
                    wc.DownloadFile(baseRaw + "db_manager.js", Path.Combine(appDir, "db_manager.js"));
                }
                LoadCourses();
                AppendLog("ซิงค์ฐานเฉลยและไฟล์ระบบล่าสุดเรียบร้อยแล้ว!", UiTheme.Success);
                SetUpdateStatus(string.Format("อัปเดต: ซิงค์ข้อมูลแล้ว (แอปยังเป็น v{0})", APP_VERSION), UiTheme.Success);
                MessageBox.Show("ซิงค์ฐานเฉลยและระบบล่าสุดเรียบร้อยแล้ว!", "สำเร็จ", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                AppendLog("ซิงค์ข้อมูลล้มเหลว: " + ex.Message, UiTheme.Danger);
                SetUpdateStatus("อัปเดต: ซิงค์ล้มเหลว — " + ex.Message, UiTheme.Danger);
            }
            finally
            {
                SetUpdateBusy(false);
                SetUpdateProgress(0, false);
            }
        }

        private void PerformInPlaceUpdate(string targetVersion, string expectedSha256)
        {
            updateInProgress = true;
            SetUpdateBusy(true);
            AppendLog(string.Format("กำลังเริ่มดาวน์โหลดอัปเดตเวอร์ชัน v{0}...", targetVersion), UiTheme.Info);
            SetUpdateStatus(string.Format("อัปเดต: กำลังดาวน์โหลด v{0}...", targetVersion), UiTheme.Info);
            SetUpdateProgress(1, true);

            if (string.IsNullOrEmpty(expectedSha256))
            {
                string msg = "ปฏิเสธการอัปเดต: version.json ไม่มีค่า sha256 ของไฟล์ exe";
                AppendLog(msg, UiTheme.Danger);
                SetUpdateStatus(msg, UiTheme.Danger);
                MessageBox.Show(msg + "\n\nให้รัน build_desktop.bat บนเครื่อง Windows เพื่อเขียน sha256 ลง version.json แล้ว push ขึ้น repo", "อัปเดตล้มเหลว", MessageBoxButtons.OK, MessageBoxIcon.Error);
                SetUpdateBusy(false);
                SetUpdateProgress(0, false);
                updateInProgress = false;
                return;
            }

            string updateExePath = Path.Combine(appDir, "TSU-BOT-Pro.update");
            string backupExePath = Path.Combine(appDir, "TSU-BOT-Pro.exe.bak");
            string currentExe = Process.GetCurrentProcess().MainModule.FileName;

            try
            {
                using (WebClient wc = CreateUpdateClient())
                {
                    long ticks = DateTime.UtcNow.Ticks;
                    string baseRaw = string.Format("https://raw.githubusercontent.com/{0}/main/", GITHUB_REPO);

                    AppendLog("1/5 ดาวน์โหลดฐานเฉลยล่าสุด...");
                    SetUpdateStatus("อัปเดต: 1/5 ดาวน์โหลดฐานเฉลย...", UiTheme.Info);
                    SetUpdateProgress(8, true);
                    wc.DownloadFile(baseRaw + "tsu_answers.json?t=" + ticks, Path.Combine(appDir, "tsu_answers.json"));
                    try { wc.DownloadFile(baseRaw + "tsu_missing.json?t=" + ticks, Path.Combine(appDir, "tsu_missing.json")); } catch { }

                    AppendLog("2/5 ดาวน์โหลดสคริปต์ระบบล่าสุด...");
                    SetUpdateStatus("อัปเดต: 2/5 ดาวน์โหลดสคริปต์...", UiTheme.Info);
                    SetUpdateProgress(20, true);
                    wc.DownloadFile(baseRaw + "cli_worker.js?t=" + ticks, Path.Combine(appDir, "cli_worker.js"));
                    wc.DownloadFile(baseRaw + "worker.js?t=" + ticks, Path.Combine(appDir, "worker.js"));
                    wc.DownloadFile(baseRaw + "db_manager.js?t=" + ticks, Path.Combine(appDir, "db_manager.js"));

                    AppendLog("3/5 ดาวน์โหลดโปรแกรม .exe เวอร์ชันใหม่...");
                    SetUpdateStatus("อัปเดต: 3/5 ดาวน์โหลด TSU-BOT-Pro.exe...", UiTheme.Info);
                    SetUpdateProgress(40, true);
                    if (File.Exists(updateExePath))
                    {
                        try { File.Delete(updateExePath); } catch { }
                    }
                    // Synchronous download still raises DownloadProgressChanged on some frameworks when using DownloadFileTask-less API;
                    // WebClient.DownloadFile does not fire progress — use OpenRead stream copy for progress.
                    DownloadFileWithProgress(wc, baseRaw + EXE_NAME + "?t=" + ticks, updateExePath, targetVersion);

                    AppendLog("4/5 ตรวจสอบ SHA256...");
                    SetUpdateStatus("อัปเดต: 4/5 ตรวจสอบความถูกต้องของไฟล์...", UiTheme.Info);
                    SetUpdateProgress(92, true);
                    string actual = ComputeSha256Hex(updateExePath);
                    if (!string.Equals(actual, expectedSha256, StringComparison.OrdinalIgnoreCase))
                    {
                        try { File.Delete(updateExePath); } catch { }
                        string mismatch = string.Format(
                            "ปฏิเสธการอัปเดต: SHA256 ไม่ตรงกัน\nคาดหวัง: {0}\nได้จริง: {1}",
                            expectedSha256, actual);
                        AppendLog(mismatch, UiTheme.Danger);
                        SetUpdateStatus("อัปเดต: SHA256 ไม่ตรง — ยกเลิกและคงไฟล์เดิมไว้", UiTheme.Danger);
                        MessageBox.Show(mismatch, "อัปเดตล้มเหลว", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        SetUpdateBusy(false);
                        SetUpdateProgress(0, false);
                        updateInProgress = false;
                        return;
                    }

                    AppendLog("5/5 สำรองไฟล์เดิมแล้วเตรียมติดตั้ง...", UiTheme.Success);
                    SetUpdateStatus("อัปเดต: 5/5 สำรอง exe เดิมและติดตั้ง...", UiTheme.Success);
                    SetUpdateProgress(96, true);

                    try
                    {
                        File.Copy(currentExe, backupExePath, true);
                    }
                    catch (Exception bakEx)
                    {
                        AppendLog("ไม่สามารถสร้างไฟล์สำรองได้: " + bakEx.Message, UiTheme.Warning);
                    }

                    string batPath = Path.Combine(appDir, "updater_runner.bat");
                    int currentPid = Process.GetCurrentProcess().Id;
                    string batScript = string.Format(
                        "@echo off\r\n" +
                        "setlocal\r\n" +
                        "set \"EXE={0}\"\r\n" +
                        "set \"NEW={1}\"\r\n" +
                        "set \"BAK={2}\"\r\n" +
                        "set \"PID={3}\"\r\n" +
                        "set /a TRIES=0\r\n" +
                        "taskkill /F /PID %PID% >nul 2>nul\r\n" +
                        ":retry\r\n" +
                        "set /a TRIES+=1\r\n" +
                        "timeout /t 1 /nobreak >nul\r\n" +
                        "move /y \"%NEW%\" \"%EXE%\" >nul 2>nul\r\n" +
                        "if not errorlevel 1 goto launch\r\n" +
                        "if %TRIES% LSS 15 goto retry\r\n" +
                        "echo rollback\r\n" +
                        "if exist \"%BAK%\" copy /y \"%BAK%\" \"%EXE%\" >nul 2>nul\r\n" +
                        ":launch\r\n" +
                        "start \"\" \"%EXE%\"\r\n" +
                        "del \"%~f0\"\r\n" +
                        "endlocal\r\n",
                        currentExe, updateExePath, backupExePath, currentPid);
                    File.WriteAllText(batPath, batScript, Encoding.Default);

                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = batPath,
                        WorkingDirectory = appDir,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    Process.Start(psi);

                    SetUpdateProgress(100, true);
                    if (this.InvokeRequired)
                        this.Invoke(new Action(() => Application.Exit()));
                    else
                        Application.Exit();
                }
            }
            catch (Exception ex)
            {
                // Roll back: restore backup if current exe was somehow replaced mid-flight (usually still running).
                try
                {
                    if (File.Exists(backupExePath) && !File.Exists(currentExe))
                        File.Copy(backupExePath, currentExe, true);
                }
                catch { }
                try { if (File.Exists(updateExePath)) File.Delete(updateExePath); } catch { }

                AppendLog("อัปเดตล้มเหลว: " + ex.Message, UiTheme.Danger);
                SetUpdateStatus("อัปเดต: ล้มเหลว — กู้คืนไฟล์เดิมแล้ว", UiTheme.Danger);
                MessageBox.Show("เกิดข้อผิดพลาดในการอัปเดต: " + ex.Message, "ผิดพลาด", MessageBoxButtons.OK, MessageBoxIcon.Error);
                SetUpdateBusy(false);
                SetUpdateProgress(0, false);
                updateInProgress = false;
            }
        }

        private void DownloadFileWithProgress(WebClient wc, string url, string destination, string targetVersion)
        {
            using (Stream remote = wc.OpenRead(url))
            {
                if (remote == null)
                    throw new IOException("ไม่สามารถเปิดสตรีมดาวน์โหลดได้: " + url);

                long total = -1;
                try
                {
                    string len = wc.ResponseHeaders != null ? wc.ResponseHeaders["Content-Length"] : null;
                    if (!string.IsNullOrEmpty(len)) long.TryParse(len, out total);
                }
                catch { }

                using (FileStream fs = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    byte[] buffer = new byte[81920];
                    long readTotal = 0;
                    int read;
                    int lastPct = -1;
                    while ((read = remote.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        fs.Write(buffer, 0, read);
                        readTotal += read;
                        if (total > 0)
                        {
                            int pct = (int)((readTotal * 100L) / total);
                            if (pct != lastPct)
                            {
                                lastPct = pct;
                                int mapped = 40 + (int)(pct * 0.50);
                                SetUpdateProgress(mapped, true);
                                SetUpdateStatus(
                                    string.Format("อัปเดต: ดาวน์โหลด exe {0}% (v{1})", pct, targetVersion),
                                    UiTheme.Info);
                            }
                        }
                    }
                }
            }
        }
    }
}
