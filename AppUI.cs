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
    /// Modern Blue-Grey (ฟ้าเทา) SaaS Dashboard visual tokens.
    /// </summary>
    internal static class UiTheme
    {
        public static readonly Color BgWash = Color.FromArgb(241, 245, 249);
        public static readonly Color BgMist = Color.FromArgb(226, 232, 240);
        public static readonly Color Surface = Color.FromArgb(255, 255, 255);
        public static readonly Color SurfaceSoft = Color.FromArgb(248, 250, 252);
        public static readonly Color Line = Color.FromArgb(226, 232, 240);
        public static readonly Color Text = Color.FromArgb(15, 23, 42);
        public static readonly Color TextMuted = Color.FromArgb(100, 116, 139);
        public static readonly Color Brand = Color.FromArgb(37, 99, 235);
        public static readonly Color BrandDeep = Color.FromArgb(30, 58, 138);
        public static readonly Color BrandDark = Color.FromArgb(15, 23, 42);
        public static readonly Color BrandSoft = Color.FromArgb(239, 246, 255);
        public static readonly Color Accent = Color.FromArgb(14, 165, 233);
        public static readonly Color Success = Color.FromArgb(16, 185, 129);
        public static readonly Color SuccessSoft = Color.FromArgb(236, 253, 245);
        public static readonly Color Warning = Color.FromArgb(217, 119, 6);
        public static readonly Color WarningSoft = Color.FromArgb(255, 251, 235);
        public static readonly Color Danger = Color.FromArgb(220, 38, 38);
        public static readonly Color DangerSoft = Color.FromArgb(254, 242, 242);
        public static readonly Color Info = Color.FromArgb(51, 65, 85);
        public static readonly Color InfoSoft = Color.FromArgb(241, 245, 249);
        public static readonly Color LogBg = Color.FromArgb(15, 23, 42);
        public static readonly Color LogFg = Color.FromArgb(226, 232, 240);
        public static readonly Color LogDefault = Color.FromArgb(148, 163, 184);

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

    public class ProfileItem
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string CourseCode { get; set; }
        public string CustomUrl { get; set; }
        public string Speed { get; set; }
        public string Modes { get; set; }
        public bool EnabledForRunAll { get; set; }

        public override string ToString()
        {
            return string.IsNullOrEmpty(CourseCode) ? Name : string.Format("{0} [{1}]", Name, CourseCode);
        }
    }

    internal class RoundedPanel : Panel
    {
        public RoundedPanel()
        {
            this.DoubleBuffered = true;
            this.ResizeRedraw = true;
            this.SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }
    }

    internal class PillButton : Button
    {
        public int CornerRadius { get; set; }
        public Color BorderColor { get; set; }
        public bool HasBorder { get; set; }
        public Color OuterColor { get; set; }
        private bool isHovered = false;
        private bool isPressed = false;

        public PillButton()
        {
            CornerRadius = 16;
            BorderColor = UiTheme.Line;
            HasBorder = false;
            OuterColor = Color.Empty;
            this.DoubleBuffered = true;
            this.ResizeRedraw = true;
            this.SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }

        protected override void OnMouseEnter(EventArgs e) { isHovered = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { isHovered = false; isPressed = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { isPressed = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { isPressed = false; Invalidate(); base.OnMouseUp(e); }

        private Color ResolveOuterColor()
        {
            if (OuterColor != Color.Empty && OuterColor.A == 255) return OuterColor;
            if (this.Parent is RoundedPanel) return UiTheme.Surface;
            if (this.Parent != null && this.Parent.BackColor.A == 255) return this.Parent.BackColor;
            return UiTheme.BgWash;
        }

        protected override void OnPaint(PaintEventArgs pevent)
        {
            Graphics g = pevent.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(ResolveOuterColor());

            Color baseBg = (this.Tag is Color) ? (Color)this.Tag : this.BackColor;
            Color fill = baseBg;
            if (!this.Enabled) fill = UiTheme.BgMist;
            else if (isPressed) fill = UiTheme.Darken(baseBg, 16);
            else if (isHovered) fill = (baseBg.R > 235 && baseBg.G > 235 && baseBg.B > 235) ? UiTheme.SurfaceSoft : UiTheme.Lighten(baseBg, 14);

            Rectangle r = new Rectangle(0, 0, Math.Max(4, this.Width - 1), Math.Max(4, this.Height - 1));
            int rad = Math.Min(CornerRadius, Math.Min(r.Width, r.Height) / 2);
            using (GraphicsPath gp = MainForm.CreateRoundedPathPublic(r, rad))
            using (SolidBrush br = new SolidBrush(fill))
            {
                g.FillPath(br, gp);
                if (HasBorder)
                {
                    using (Pen pen = new Pen(BorderColor, 1f))
                        g.DrawPath(pen, gp);
                }
            }

            Color txtColor = this.Enabled ? this.ForeColor : UiTheme.TextMuted;
            TextRenderer.DrawText(g, this.Text, this.Font, r, txtColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
        }
    }

    public class MainForm : Form
    {
        private ComboBox comboProfile;
        private Button btnAddProfile;
        private Button btnManageProfiles;
        private Button btnStartAll;
        private bool suppressProfileEvents = false;
        private ComboBox comboCourse;
        private ComboBox comboSpeed;
        private CheckBox chkModeQuiz;
        private CheckBox chkModeVideo;
        private CheckBox chkModeDoc;
        private bool suppressModeEvents = false;
        private TextBox txtUrl;
        private TabControl tabLogs;
        private RichTextBox rtbLogs;
        private RichTextBox rtbErrorLogs;
        private TabPage tabErrorPage;
        private Button btnClearLog;
        private Panel pnlLogsHeader;
        private Dictionary<string, TabPage> profileLogPages = new Dictionary<string, TabPage>();
        private Dictionary<string, RichTextBox> profileLogBoxes = new Dictionary<string, RichTextBox>();
        private Dictionary<string, int> profileErrorCounts = new Dictionary<string, int>();
        private int totalErrorCount = 0;
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
        private Button btnResetBrowser;
        private Label lblUpdateStatus;
        private ProgressBar progUpdate;
        private Panel pnlHeader;
        private Panel pnlSidebar;
        private Button btnToggleSidebar;
        private bool sidebarCollapsed = false;
        private Panel pnlMainArea;
        private Panel pnlTopRow;
        private Panel pnlKpiRow;
        private Panel pnlMiddleRow;
        private Panel pnlControlCard;
        private Panel pnlGaugeCard;
        private Panel pnlTrackerCard;
        private Label lblKpiTotalProfiles;
        private Label lblKpiRunning;
        private Label lblKpiCourses;
        private Label lblKpiErrors;
        private Label lblTopProfileBadge;
        private Label lblTimerDisplay;
        private TextBox txtSearchCourse;
        private System.Windows.Forms.Timer uiTimer;
        private DateTime? trackerStartTime = null;
        private Dictionary<string, int> workerProgressPct = new Dictionary<string, int>();
        private int averageProgressPct = 0;
        private Panel pnlWorkersHeader;
        private SplitContainer splitMain;

        private List<CourseItem> courses = new List<CourseItem>();
        private List<ProfileItem> profiles = new List<ProfileItem>();
        private Dictionary<string, Process> runningWorkers = new Dictionary<string, Process>();
        private Dictionary<string, string> workerProfiles = new Dictionary<string, string>();
        private Dictionary<string, bool> workerPausedStates = new Dictionary<string, bool>();
        private List<Process> loginProcesses = new List<Process>();
        private int workerCounter = 1;
        private string appDir;
        private string nodePath;
        private string latestRemoteVersion = "";
        private string latestRemoteChangelog = "";
        private string latestRemoteSha256 = "";
        private bool updateInProgress = false;
        private Process loginProcess;
        private volatile bool resetInProgress = false;
        private const string APP_VERSION = "1.3.7";
        // Must match USER_DATA_DIR in worker.js / cli_worker.js / server.js (Playwright persistent profile).
        private const string PROFILE_DIR = "user_profile";
        private const string PROFILES_ROOT_DIR = "user_profiles";
        private const string PROFILES_CONFIG_FILE = "profiles_config.json";
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
            LoadProfiles();
            RefreshDashboardMetrics();
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
            using (SolidBrush br = new SolidBrush(UiTheme.BgWash))
            {
                e.Graphics.FillRectangle(br, rect);
            }
        }

        public static GraphicsPath CreateRoundedPathPublic(Rectangle rect, int radius)
        {
            return CreateRoundedPath(rect, radius);
        }

        private static GraphicsPath CreateRoundedPath(Rectangle rect, int radius)
        {
            GraphicsPath path = new GraphicsPath();
            int d = radius * 2;
            if (d > rect.Width) d = rect.Width;
            if (d > rect.Height) d = rect.Height;
            if (d <= 0)
            {
                path.AddRectangle(rect);
                return path;
            }
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private void PaintRoundedCard(object sender, PaintEventArgs e)
        {
            Control c = sender as Control;
            if (c == null || c.Width < 4 || c.Height < 4) return;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = new Rectangle(0, 0, c.Width - 1, c.Height - 1);
            using (GraphicsPath path = CreateRoundedPath(r, 14))
            using (SolidBrush bg = new SolidBrush(UiTheme.Surface))
            using (Pen pen = new Pen(UiTheme.Line, 1f))
            {
                e.Graphics.FillPath(bg, path);
                e.Graphics.DrawPath(pen, path);
            }
        }

        private void PaintGradientBlueCard(object sender, PaintEventArgs e)
        {
            Control c = sender as Control;
            if (c == null || c.Width < 4 || c.Height < 4) return;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = new Rectangle(0, 0, c.Width - 1, c.Height - 1);
            using (GraphicsPath path = CreateRoundedPath(r, 14))
            using (LinearGradientBrush br = new LinearGradientBrush(r, UiTheme.BrandDeep, UiTheme.Brand, LinearGradientMode.ForwardDiagonal))
            {
                e.Graphics.FillPath(br, path);
            }
        }

        private void PaintDarkTrackerCard(object sender, PaintEventArgs e)
        {
            Control c = sender as Control;
            if (c == null || c.Width < 4 || c.Height < 4) return;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = new Rectangle(0, 0, c.Width - 1, c.Height - 1);
            using (GraphicsPath path = CreateRoundedPath(r, 14))
            using (LinearGradientBrush br = new LinearGradientBrush(r, Color.FromArgb(15, 23, 42), Color.FromArgb(30, 41, 59), LinearGradientMode.ForwardDiagonal))
            {
                e.Graphics.FillPath(br, path);
                e.Graphics.SetClip(path);
                using (Pen wave = new Pen(Color.FromArgb(32, 56, 189, 248), 2f))
                {
                    for (int i = 0; i < 4; i++)
                    {
                        e.Graphics.DrawEllipse(wave, c.Width - 120 - i * 18, -30 + i * 16, 180, 180);
                    }
                }
                e.Graphics.ResetClip();
            }
        }

        private void PaintProgressGauge(object sender, PaintEventArgs e)
        {
            Panel p = sender as Panel;
            if (p == null) return;
            PaintRoundedCard(sender, e);

            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            int pct = Math.Max(0, Math.Min(100, averageProgressPct));
            int size = Math.Min(p.Width - 48, 128);
            if (size < 60) size = 60;
            int x = (p.Width - size) / 2;
            int y = 38;
            Rectangle arcRect = new Rectangle(x, y, size, size);

            using (Pen bgArc = new Pen(UiTheme.BgMist, 14f))
            {
                bgArc.StartCap = LineCap.Round;
                bgArc.EndCap = LineCap.Round;
                e.Graphics.DrawArc(bgArc, arcRect, 180, 180);
            }
            if (pct > 0)
            {
                using (Pen fgArc = new Pen(UiTheme.Brand, 14f))
                {
                    fgArc.StartCap = LineCap.Round;
                    fgArc.EndCap = LineCap.Round;
                    e.Graphics.DrawArc(fgArc, arcRect, 180, (180f * pct) / 100f);
                }
            }
            string pctStr = pct + "%";
            using (Font fPct = UiTheme.UiFont(18f, FontStyle.Bold))
            using (Font fSub = UiTheme.UiFont(8f, FontStyle.Regular))
            using (SolidBrush bTxt = new SolidBrush(UiTheme.Text))
            using (SolidBrush bMut = new SolidBrush(UiTheme.TextMuted))
            {
                SizeF sz = e.Graphics.MeasureString(pctStr, fPct);
                e.Graphics.DrawString(pctStr, fPct, bTxt, (p.Width - sz.Width) / 2f, y + size * 0.25f);
                string sub = runningWorkers.Count > 0 ? "กำลังทำงาน" : "พร้อมใช้งาน";
                SizeF sz2 = e.Graphics.MeasureString(sub, fSub);
                e.Graphics.DrawString(sub, fSub, bMut, (p.Width - sz2.Width) / 2f, y + size * 0.25f + 26);
            }
        }

        private Panel CreateSidebarMenuButton(string iconText, string title, bool active, EventHandler onClick)
        {
            Panel row = new Panel
            {
                Height = 36,
                Dock = DockStyle.Top,
                Cursor = Cursors.Hand,
                BackColor = active ? UiTheme.BrandSoft : Color.Transparent,
                Padding = new Padding(12, 0, 10, 0)
            };
            if (active)
            {
                Panel bar = new Panel
                {
                    Width = 4,
                    Dock = DockStyle.Left,
                    BackColor = UiTheme.Brand
                };
                row.Controls.Add(bar);
            }
            Label lbl = new Label
            {
                Text = iconText + "   " + title,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                Font = UiTheme.UiFont(9.5f, active ? FontStyle.Bold : FontStyle.Regular),
                ForeColor = active ? UiTheme.BrandDeep : UiTheme.TextMuted,
                BackColor = Color.Transparent,
                Cursor = Cursors.Hand,
                UseMnemonic = false,
                Padding = new Padding(8, 0, 0, 0)
            };
            lbl.Click += onClick;
            row.Click += onClick;
            row.Controls.Add(lbl);
            return row;
        }

        private Panel CreateKpiCard(string title, out Label lblValue, string subtext, bool isHero)
        {
            RoundedPanel card = new RoundedPanel
            {
                BackColor = UiTheme.BgWash,
                Padding = new Padding(16, 12, 16, 12)
            };
            if (isHero) card.Paint += PaintGradientBlueCard;
            else card.Paint += PaintRoundedCard;

            Label lblTitle = new Label
            {
                Text = title,
                Font = UiTheme.UiFont(9.5f, FontStyle.Bold),
                ForeColor = isHero ? Color.FromArgb(219, 234, 254) : UiTheme.TextMuted,
                Location = new Point(16, 12),
                AutoSize = true,
                UseMnemonic = false,
                BackColor = Color.Transparent
            };
            card.Controls.Add(lblTitle);

            Label lblArrow = new Label
            {
                Text = "↗",
                Font = UiTheme.UiFont(9.5f, FontStyle.Bold),
                ForeColor = isHero ? UiTheme.BrandDeep : UiTheme.Text,
                BackColor = Color.Transparent,
                Size = new Size(26, 26),
                TextAlign = ContentAlignment.MiddleCenter,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(card.Width - 38, 10)
            };
            lblArrow.Paint += (s, ev) =>
            {
                ev.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle ar = new Rectangle(0, 0, lblArrow.Width - 1, lblArrow.Height - 1);
                using (SolidBrush br = new SolidBrush(isHero ? Color.White : UiTheme.SurfaceSoft))
                using (Pen pn = new Pen(isHero ? Color.White : UiTheme.Line, 1f))
                {
                    ev.Graphics.FillEllipse(br, ar);
                    ev.Graphics.DrawEllipse(pn, ar);
                }
                TextRenderer.DrawText(ev.Graphics, "↗", lblArrow.Font, ar, lblArrow.ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            };
            card.Controls.Add(lblArrow);

            lblValue = new Label
            {
                Text = "0",
                Font = UiTheme.UiFont(22f, FontStyle.Bold),
                ForeColor = isHero ? Color.White : UiTheme.Text,
                Location = new Point(14, 34),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            card.Controls.Add(lblValue);

            Label lblSub = new Label
            {
                Text = subtext,
                Font = UiTheme.UiFont(8f, FontStyle.Regular),
                ForeColor = isHero ? Color.FromArgb(191, 219, 254) : UiTheme.TextMuted,
                Location = new Point(16, 72),
                AutoSize = true,
                UseMnemonic = false,
                BackColor = Color.Transparent
            };
            card.Controls.Add(lblSub);

            return card;
        }

        private void InitializeComponent()
        {
            this.Text = "TSU-BOT Pro — Desktop Suite";
            this.Size = new Size(1220, 820);
            this.MinimumSize = new Size(1060, 740);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = UiTheme.BgWash;
            this.ForeColor = UiTheme.Text;
            this.Font = UiTheme.UiFont(9.5f, FontStyle.Regular);
            this.DoubleBuffered = true;
            this.Padding = new Padding(12);

            // —— Left Sidebar ——
            pnlSidebar = new RoundedPanel
            {
                Dock = DockStyle.Left,
                Width = 212,
                BackColor = UiTheme.BgWash,
                Padding = new Padding(12, 16, 12, 12)
            };
            pnlSidebar.Paint += PaintRoundedCard;

            Panel pnlLogoBox = new Panel
            {
                Dock = DockStyle.Top,
                Height = 56,
                BackColor = Color.Transparent
            };
            pnlLogoBox.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (LinearGradientBrush br = new LinearGradientBrush(new Rectangle(4, 8, 34, 34), UiTheme.BrandDeep, UiTheme.Brand, LinearGradientMode.ForwardDiagonal))
                using (GraphicsPath gp = CreateRoundedPath(new Rectangle(4, 8, 34, 34), 10))
                {
                    e.Graphics.FillPath(br, gp);
                }
                using (Pen pw = new Pen(Color.White, 2.2f))
                {
                    e.Graphics.DrawEllipse(pw, 12, 16, 18, 18);
                    e.Graphics.DrawLine(pw, 17, 25, 21, 29);
                    e.Graphics.DrawLine(pw, 21, 29, 26, 21);
                }
            };

            lblBrand = new Label
            {
                Text = "TSU-BOT",
                Font = UiTheme.UiFont(15f, FontStyle.Bold),
                ForeColor = UiTheme.Text,
                AutoSize = true,
                Location = new Point(44, 8),
                BackColor = Color.Transparent
            };
            pnlLogoBox.Controls.Add(lblBrand);

            lblVersion = new Label
            {
                Text = "v" + APP_VERSION,
                Font = UiTheme.UiFont(7.5f, FontStyle.Bold),
                ForeColor = UiTheme.Brand,
                BackColor = UiTheme.BrandSoft,
                AutoSize = true,
                Padding = new Padding(5, 2, 5, 2),
                Location = new Point(46, 33)
            };
            pnlLogoBox.Controls.Add(lblVersion);

            lblTagline = new Label
            {
                Text = "Multi-Profile Suite",
                Font = UiTheme.UiFont(7.5f, FontStyle.Regular),
                ForeColor = UiTheme.TextMuted,
                AutoSize = true,
                Location = new Point(98, 35),
                BackColor = Color.Transparent
            };
            pnlLogoBox.Controls.Add(lblTagline);

            // Bottom update card inside sidebar
            Panel pnlSideUpdate = new RoundedPanel
            {
                Dock = DockStyle.Bottom,
                Height = 128,
                BackColor = UiTheme.Surface,
                Padding = new Padding(12)
            };
            pnlSideUpdate.Paint += PaintDarkTrackerCard;

            Label lblUpdTitle = new Label
            {
                Text = "GitHub Auto-Sync",
                Font = UiTheme.UiFont(9.5f, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(12, 10),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlSideUpdate.Controls.Add(lblUpdTitle);

            lblUpdateStatus = new Label
            {
                Text = "กำลังตรวจสอบอัปเดต...",
                Font = UiTheme.UiFont(7.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(12, 32),
                Size = new Size(164, 34),
                BackColor = Color.Transparent
            };
            pnlSideUpdate.Controls.Add(lblUpdateStatus);

            progUpdate = new ProgressBar
            {
                Location = new Point(12, 68),
                Size = new Size(164, 8),
                Minimum = 0,
                Maximum = 100,
                Value = 0,
                Visible = false,
                Style = ProgressBarStyle.Continuous
            };
            pnlSideUpdate.Controls.Add(progUpdate);

            btnCheckUpdate = CreateButton("เช็คอัปเดต", UiTheme.Brand, 164, 32, false);
            if (btnCheckUpdate is PillButton) ((PillButton)btnCheckUpdate).OuterColor = Color.FromArgb(22, 33, 52);
            btnCheckUpdate.Location = new Point(12, 84);
            btnCheckUpdate.Click += (s, e) => CheckUpdateAsync(true);
            pnlSideUpdate.Controls.Add(btnCheckUpdate);

            // Menu items inside sidebar
            Panel pnlSideMenu = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.Transparent,
                Padding = new Padding(0, 8, 0, 8)
            };

            Label lblGenHdr = new Label
            {
                Text = "GENERAL",
                Font = UiTheme.UiFont(7.5f, FontStyle.Bold),
                ForeColor = UiTheme.TextMuted,
                Dock = DockStyle.Top,
                Height = 24,
                TextAlign = ContentAlignment.BottomLeft,
                Padding = new Padding(10, 0, 0, 4),
                BackColor = Color.Transparent
            };
            Label lblMenuHdr = new Label
            {
                Text = "MENU",
                Font = UiTheme.UiFont(7.5f, FontStyle.Bold),
                ForeColor = UiTheme.TextMuted,
                Dock = DockStyle.Top,
                Height = 24,
                TextAlign = ContentAlignment.BottomLeft,
                Padding = new Padding(10, 0, 0, 4),
                BackColor = Color.Transparent
            };

            Panel navReset = CreateSidebarMenuButton("🧹", "ล้างแคชโปรไฟล์", false, (s, e) => BtnResetBrowser_Click(s, e));
            Panel navUpdate = CreateSidebarMenuButton("🔄", "ซิงค์ / อัปเดต", false, (s, e) => CheckUpdateAsync(true));
            Panel navLogs = CreateSidebarMenuButton("📋", "ดู Log & Error", false, (s, e) => { if (tabLogs != null && tabErrorPage != null) tabLogs.SelectedTab = tabErrorPage; });
            Panel navCourses = CreateSidebarMenuButton("📚", "ตั้งค่าวิชา & URL", false, (s, e) => BtnSettings_Click(s, e));
            Panel navProfiles = CreateSidebarMenuButton("👥", "จัดการทุกโปรไฟล์", false, (s, e) => BtnManageProfiles_Click(s, e));
            Panel navDash = CreateSidebarMenuButton("⊞", "Dashboard", true, (s, e) => { if (tabLogs != null && tabLogs.TabPages.Count > 0) tabLogs.SelectedIndex = 0; });

            // Dock.Top stacks bottom-to-top, so add in reverse visual order
            pnlSideMenu.Controls.Add(navReset);
            pnlSideMenu.Controls.Add(navUpdate);
            pnlSideMenu.Controls.Add(lblGenHdr);
            pnlSideMenu.Controls.Add(navLogs);
            pnlSideMenu.Controls.Add(navCourses);
            pnlSideMenu.Controls.Add(navProfiles);
            pnlSideMenu.Controls.Add(navDash);
            pnlSideMenu.Controls.Add(lblMenuHdr);

            pnlSidebar.Controls.Add(pnlSideMenu);
            pnlSidebar.Controls.Add(pnlSideUpdate);
            pnlSidebar.Controls.Add(pnlLogoBox);

            // —— Right Main Area ——
            pnlMainArea = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.Transparent,
                Padding = new Padding(12, 0, 0, 0)
            };

            // Top bar (Sidebar Toggle + Search + Profile Badge)
            pnlHeader = new RoundedPanel
            {
                Dock = DockStyle.Top,
                Height = 56,
                BackColor = UiTheme.BgWash,
                Padding = new Padding(14, 10, 14, 10)
            };
            pnlHeader.Paint += PaintRoundedCard;

            btnToggleSidebar = CreateButton("◀ ซ่อนเมนู", UiTheme.InfoSoft, 102, 32, false);
            btnToggleSidebar.ForeColor = UiTheme.Text;
            btnToggleSidebar.Tag = UiTheme.InfoSoft;
            btnToggleSidebar.Location = new Point(12, 12);
            btnToggleSidebar.Click += (s, ev) =>
            {
                sidebarCollapsed = !sidebarCollapsed;
                pnlSidebar.Visible = !sidebarCollapsed;
                pnlMainArea.Padding = new Padding(sidebarCollapsed ? 0 : 12, 0, 0, 0);
                btnToggleSidebar.Text = sidebarCollapsed ? "☰ เมนู" : "◀ ซ่อนเมนู";
                LayoutChrome();
            };
            new ToolTip().SetToolTip(btnToggleSidebar, "หุบพับ/แสดงแถบเมนูด้านซ้าย เพื่อให้เหลือเฉพาะ Dashboard");
            pnlHeader.Controls.Add(btnToggleSidebar);

            Label lblSearchIcon = new Label
            {
                Text = "🔍",
                Font = UiTheme.UiFont(10f, FontStyle.Regular),
                ForeColor = UiTheme.TextMuted,
                Location = new Point(126, 17),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlHeader.Controls.Add(lblSearchIcon);

            txtSearchCourse = new TextBox
            {
                Location = new Point(152, 15),
                Width = 240,
                BorderStyle = BorderStyle.None,
                BackColor = UiTheme.Surface,
                ForeColor = UiTheme.Text,
                Font = UiTheme.UiFont(9.5f, FontStyle.Regular),
                Text = ""
            };
            txtSearchCourse.TextChanged += (s, ev) => FilterCourseCombo(txtSearchCourse.Text);
            pnlHeader.Controls.Add(txtSearchCourse);

            Label lblSearchHint = new Label
            {
                Text = "พิมพ์รหัส/ชื่อวิชา เพื่อค้นหาเร็ว",
                Font = UiTheme.UiFont(8f, FontStyle.Regular),
                ForeColor = UiTheme.TextMuted,
                Location = new Point(400, 19),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlHeader.Controls.Add(lblSearchHint);

            lblTopProfileBadge = new Label
            {
                Text = "Profile 1 (หลัก)",
                Font = UiTheme.UiFont(9f, FontStyle.Bold),
                ForeColor = UiTheme.BrandDeep,
                BackColor = UiTheme.BrandSoft,
                AutoSize = true,
                Padding = new Padding(10, 5, 10, 5),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(720, 14)
            };
            pnlHeader.Controls.Add(lblTopProfileBadge);

            // Title row ("Dashboard" + "+ รันทุกโปรไฟล์พร้อมกัน" + "+ เพิ่มโปรไฟล์")
            pnlTopRow = new Panel
            {
                Dock = DockStyle.Top,
                Height = 62,
                BackColor = UiTheme.BgWash
            };
            Label lblDashTitle = new Label
            {
                Text = "Dashboard",
                Font = UiTheme.UiFont(20f, FontStyle.Bold),
                ForeColor = UiTheme.Text,
                Location = new Point(2, 6),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlTopRow.Controls.Add(lblDashTitle);

            Label lblDashSub = new Label
            {
                Text = "จัดการหลายโปรไฟล์ Chrome แยกบัญชี แยกวิชา และติดตามความคืบหน้าเรียลไทม์",
                Font = UiTheme.UiFont(9f, FontStyle.Regular),
                ForeColor = UiTheme.TextMuted,
                Location = new Point(4, 38),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlTopRow.Controls.Add(lblDashSub);

            btnStartAll = CreateButton("+ รันทุกโปรไฟล์พร้อมกัน", UiTheme.Brand, 184, 36, true);
            btnStartAll.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnStartAll.Click += BtnStartAll_Click;
            pnlTopRow.Controls.Add(btnStartAll);

            btnAddProfile = CreateButton("+ เพิ่มโปรไฟล์", UiTheme.Surface, 128, 36, false);
            btnAddProfile.ForeColor = UiTheme.Text;
            PillButton pbAdd = btnAddProfile as PillButton;
            if (pbAdd != null) { pbAdd.HasBorder = true; pbAdd.BorderColor = UiTheme.Line; }
            btnAddProfile.Tag = UiTheme.Surface;
            btnAddProfile.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            btnAddProfile.Click += BtnAddProfile_Click;
            pnlTopRow.Controls.Add(btnAddProfile);

            // KPI Row (4 cards)
            pnlKpiRow = new Panel
            {
                Dock = DockStyle.Top,
                Height = 102,
                BackColor = UiTheme.BgWash,
                Padding = new Padding(0, 2, 0, 8)
            };
            Panel kpi1 = CreateKpiCard("โปรไฟล์ทั้งหมด", out lblKpiTotalProfiles, "แยกเซสชัน Chrome อิสระ", true);
            Panel kpi2 = CreateKpiCard("กำลังทำงาน", out lblKpiRunning, "หน้าต่าง Chrome ที่เปิดอยู่", false);
            Panel kpi3 = CreateKpiCard("วิชาในฐานข้อมูล", out lblKpiCourses, "TSUGE / TSUPT พร้อมเฉลย", false);
            Panel kpi4 = CreateKpiCard("Error / คำเตือน", out lblKpiErrors, "ดูรายละเอียดในแท็บ Error", false);
            pnlKpiRow.Controls.Add(kpi1);
            pnlKpiRow.Controls.Add(kpi2);
            pnlKpiRow.Controls.Add(kpi3);
            pnlKpiRow.Controls.Add(kpi4);

            // Middle Row (Control Panel + Progress Gauge + Dark Time Tracker)
            pnlMiddleRow = new Panel
            {
                Dock = DockStyle.Top,
                Height = 196,
                BackColor = UiTheme.BgWash,
                Padding = new Padding(0, 0, 0, 10)
            };

            pnlControlCard = new RoundedPanel { BackColor = UiTheme.BgWash };
            pnlControlCard.Paint += PaintRoundedCard;

            Label lblCtrlHdr = new Label
            {
                Text = "ควบคุมโปรไฟล์ & เลือกรายวิชา",
                Font = UiTheme.UiFont(10.5f, FontStyle.Bold),
                ForeColor = UiTheme.Text,
                Location = new Point(16, 10),
                AutoSize = true,
                UseMnemonic = false,
                BackColor = Color.Transparent
            };
            pnlControlCard.Controls.Add(lblCtrlHdr);

            Label lblProfile = CreateFieldLabel("โปรไฟล์:", new Point(16, 42));
            pnlControlCard.Controls.Add(lblProfile);
            comboProfile = CreateCombo(new Point(76, 38), 186);
            comboProfile.SelectedIndexChanged += ComboProfile_SelectedIndexChanged;
            pnlControlCard.Controls.Add(comboProfile);

            btnManageProfiles = CreateButton("จัดการทุกโปรไฟล์", UiTheme.InfoSoft, 126, 30, false);
            btnManageProfiles.ForeColor = UiTheme.Text;
            btnManageProfiles.Tag = UiTheme.InfoSoft;
            btnManageProfiles.Location = new Point(270, 36);
            btnManageProfiles.Click += BtnManageProfiles_Click;
            pnlControlCard.Controls.Add(btnManageProfiles);

            btnLogin = CreateButton("ล็อกอินโปรไฟล์นี้", UiTheme.Success, 134, 30, true);
            btnLogin.Location = new Point(404, 36);
            btnLogin.Click += BtnLogin_Click;
            pnlControlCard.Controls.Add(btnLogin);

            Label lblCourse = CreateFieldLabel("วิชาที่ทำ:", new Point(16, 78));
            pnlControlCard.Controls.Add(lblCourse);
            comboCourse = CreateCombo(new Point(76, 74), 310);
            comboCourse.SelectedIndexChanged += (s, ev) =>
            {
                CourseItem ci = comboCourse.SelectedItem as CourseItem;
                if (ci != null && !string.IsNullOrEmpty(ci.Url)) txtUrl.Text = ci.Url;
                SyncCurrentControlsToSelectedProfile();
            };
            pnlControlCard.Controls.Add(comboCourse);

            comboSpeed = CreateCombo(new Point(394, 74), 144);
            comboSpeed.Items.AddRange(new object[] { "turbo (สายฟ้า)", "normal (สมดุล)", "safe (ปลอดภัย)" });
            comboSpeed.SelectedIndex = 1;
            comboSpeed.SelectedIndexChanged += (s, ev) => SyncCurrentControlsToSelectedProfile();
            pnlControlCard.Controls.Add(comboSpeed);

            Label lblModes = CreateFieldLabel("ให้บอททำ:", new Point(16, 112));
            pnlControlCard.Controls.Add(lblModes);
            chkModeQuiz = CreateModeCheckBox("แบบฝึก", new Point(82, 110));
            chkModeVideo = CreateModeCheckBox("วิดีโอ", new Point(160, 110));
            chkModeDoc = CreateModeCheckBox("เอกสาร", new Point(232, 110));
            pnlControlCard.Controls.Add(chkModeQuiz);
            pnlControlCard.Controls.Add(chkModeVideo);
            pnlControlCard.Controls.Add(chkModeDoc);

            btnSettings = CreateButton("ตั้งค่าวิชา", UiTheme.InfoSoft, 96, 26, false);
            btnSettings.ForeColor = UiTheme.Text;
            btnSettings.Tag = UiTheme.InfoSoft;
            btnSettings.Location = new Point(334, 108);
            btnSettings.Click += BtnSettings_Click;
            pnlControlCard.Controls.Add(btnSettings);

            btnResetBrowser = CreateButton("ล้างแคช", UiTheme.DangerSoft, 96, 26, false);
            btnResetBrowser.ForeColor = UiTheme.Danger;
            btnResetBrowser.Tag = UiTheme.DangerSoft;
            btnResetBrowser.Location = new Point(438, 108);
            btnResetBrowser.Click += BtnResetBrowser_Click;
            pnlControlCard.Controls.Add(btnResetBrowser);

            Label lblUrl = CreateFieldLabel("URL:", new Point(16, 148));
            pnlControlCard.Controls.Add(lblUrl);
            txtUrl = CreateTextBox(new Point(56, 144), 328);
            txtUrl.TextChanged += (s, ev) => SyncCurrentControlsToSelectedProfile();
            pnlControlCard.Controls.Add(txtUrl);

            btnStart = CreateButton("▶ เริ่มโปรไฟล์นี้", UiTheme.Brand, 146, 34, true);
            btnStart.Location = new Point(392, 140);
            btnStart.Click += BtnStart_Click;
            pnlControlCard.Controls.Add(btnStart);

            // Hidden/alias btnAddCourse for compatibility
            btnAddCourse = btnSettings;

            // Gauge Card
            pnlGaugeCard = new RoundedPanel { BackColor = UiTheme.BgWash };
            pnlGaugeCard.Paint += PaintProgressGauge;
            Label lblGaugeTitle = new Label
            {
                Text = "ความคืบหน้ารวม",
                Font = UiTheme.UiFont(10f, FontStyle.Bold),
                ForeColor = UiTheme.Text,
                Location = new Point(14, 10),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlGaugeCard.Controls.Add(lblGaugeTitle);

            Label lblGaugeLegend = new Label
            {
                Text = "● ทำแล้ว   ○ รอดำเนินการ",
                Font = UiTheme.UiFont(8f, FontStyle.Regular),
                ForeColor = UiTheme.Brand,
                Location = new Point(14, 158),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlGaugeCard.Controls.Add(lblGaugeLegend);

            // Dark Time Tracker Card
            pnlTrackerCard = new RoundedPanel { BackColor = UiTheme.BgWash };
            pnlTrackerCard.Paint += PaintDarkTrackerCard;
            Label lblTrackerTitle = new Label
            {
                Text = "Time Tracker",
                Font = UiTheme.UiFont(10f, FontStyle.Bold),
                ForeColor = Color.FromArgb(203, 213, 225),
                Location = new Point(16, 12),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlTrackerCard.Controls.Add(lblTrackerTitle);

            lblTimerDisplay = new Label
            {
                Text = "00:00:00",
                Font = UiTheme.UiFont(24f, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(14, 48),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            pnlTrackerCard.Controls.Add(lblTimerDisplay);

            btnPause = CreateButton("⏸ พักชั่วคราว", UiTheme.Warning, 108, 34, false);
            if (btnPause is PillButton) ((PillButton)btnPause).OuterColor = Color.FromArgb(22, 33, 52);
            btnPause.Location = new Point(14, 134);
            btnPause.Click += BtnPause_Click;
            pnlTrackerCard.Controls.Add(btnPause);

            btnCancel = CreateButton("■ ยกเลิก", UiTheme.Danger, 88, 34, false);
            if (btnCancel is PillButton) ((PillButton)btnCancel).OuterColor = Color.FromArgb(22, 33, 52);
            btnCancel.Location = new Point(128, 134);
            btnCancel.Click += BtnCancel_Click;
            pnlTrackerCard.Controls.Add(btnCancel);

            pnlMiddleRow.Controls.Add(pnlControlCard);
            pnlMiddleRow.Controls.Add(pnlGaugeCard);
            pnlMiddleRow.Controls.Add(pnlTrackerCard);

            uiTimer = new System.Windows.Forms.Timer { Interval = 1000 };
            uiTimer.Tick += (s, ev) =>
            {
                if (trackerStartTime.HasValue && runningWorkers.Count > 0)
                {
                    TimeSpan elapsed = DateTime.Now - trackerStartTime.Value;
                    lblTimerDisplay.Text = string.Format("{0:00}:{1:00}:{2:00}", (int)elapsed.TotalHours, elapsed.Minutes, elapsed.Seconds);
                }
            };
            uiTimer.Start();

            // —— Workers + logs ——
            splitMain = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 165,
                SplitterWidth = 8,
                BackColor = Color.Transparent,
                Panel1MinSize = 110,
                Panel2MinSize = 130
            };
            splitMain.Panel1.BackColor = Color.Transparent;
            splitMain.Panel2.BackColor = Color.Transparent;

            Panel pnlWorkersCard = CreateSurfacePanel(DockStyle.Fill, 0);
            pnlWorkersCard.Paint += PaintRoundedCard;
            pnlWorkersCard.Padding = new Padding(6, 4, 6, 6);

            pnlWorkersHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 40,
                BackColor = Color.Transparent,
                Padding = new Padding(10, 6, 10, 2)
            };

            Label lblWorkersTitle = new Label
            {
                Text = "หน้าต่าง Chrome ที่กำลังทำงาน / หยุดพัก (จบแล้วลบออกอัตโนมัติ)",
                Font = UiTheme.UiFont(10f, FontStyle.Bold),
                ForeColor = UiTheme.Text,
                AutoSize = true,
                Location = new Point(10, 10),
                BackColor = Color.Transparent
            };
            pnlWorkersHeader.Controls.Add(lblWorkersTitle);

            btnPauseWorker = CreateButton("พัก / ต่อ", UiTheme.Warning, 96, 28, false);
            btnPauseWorker.Click += BtnPause_Click;
            pnlWorkersHeader.Controls.Add(btnPauseWorker);

            btnStop = CreateButton("ยกเลิกที่เลือก", UiTheme.Danger, 114, 28, false);
            btnStop.Click += BtnCancel_Click;
            pnlWorkersHeader.Controls.Add(btnStop);

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
            lvWorkers.Columns.Add("Worker / โปรไฟล์", 175);
            lvWorkers.Columns.Add("รหัสวิชา", 110);
            lvWorkers.Columns.Add("โหมด", 75);
            lvWorkers.Columns.Add("ความคืบหน้า (%)", 165);
            lvWorkers.Columns.Add("สถานะการทำงาน", 360);
            lvWorkers.SelectedIndexChanged += (s, ev) =>
            {
                if (lvWorkers.SelectedItems.Count == 0 || lvWorkers.SelectedItems[0].Tag == null) return;
                string wId = lvWorkers.SelectedItems[0].Tag.ToString();
                string pId;
                if (workerProfiles.TryGetValue(wId, out pId) && profileLogPages.ContainsKey(pId))
                {
                    tabLogs.SelectedTab = profileLogPages[pId];
                }
            };
            pnlWorkersCard.Controls.Add(lvWorkers);
            pnlWorkersCard.Controls.Add(pnlWorkersHeader);

            splitMain.Panel1.Controls.Add(pnlWorkersCard);

            Panel pnlLogsCard = CreateSurfacePanel(DockStyle.Fill, 0);
            pnlLogsCard.Paint += PaintRoundedCard;
            pnlLogsCard.Padding = new Padding(6, 4, 6, 6);

            pnlLogsHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 36,
                BackColor = Color.Transparent
            };
            Label lblLogsTitle = new Label
            {
                Text = "บันทึกการทำงานแยกตามโปรไฟล์ & ตรวจจับ Error",
                Font = UiTheme.UiFont(10f, FontStyle.Bold),
                ForeColor = UiTheme.Text,
                AutoSize = true,
                UseMnemonic = false,
                Location = new Point(10, 8),
                BackColor = Color.Transparent
            };
            pnlLogsHeader.Controls.Add(lblLogsTitle);

            btnClearLog = CreateButton("ล้าง Log หน้านี้", UiTheme.InfoSoft, 114, 26, false);
            btnClearLog.ForeColor = UiTheme.Text;
            btnClearLog.Tag = UiTheme.InfoSoft;
            btnClearLog.Location = new Point(780, 5);
            btnClearLog.Click += (s, ev) => ClearCurrentLogTab();
            pnlLogsHeader.Controls.Add(btnClearLog);

            tabLogs = new TabControl
            {
                Dock = DockStyle.Fill,
                Font = UiTheme.UiFont(9f, FontStyle.Bold)
            };

            TabPage tabAll = new TabPage("รวมทั้งหมด (All)");
            rtbLogs = CreateLogRichTextBox();
            tabAll.Controls.Add(rtbLogs);
            tabLogs.TabPages.Add(tabAll);

            tabErrorPage = new TabPage("⚠️ เฉพาะ Error / คำเตือน (0)");
            rtbErrorLogs = CreateLogRichTextBox();
            tabErrorPage.Controls.Add(rtbErrorLogs);
            tabLogs.TabPages.Add(tabErrorPage);

            pnlLogsCard.Controls.Add(tabLogs);
            pnlLogsCard.Controls.Add(pnlLogsHeader);
            splitMain.Panel2.Controls.Add(pnlLogsCard);

            // Dock order inside pnlMainArea: Fill first, then Top panels in reverse visual order
            pnlMainArea.Controls.Add(splitMain);
            pnlMainArea.Controls.Add(pnlMiddleRow);
            pnlMainArea.Controls.Add(pnlKpiRow);
            pnlMainArea.Controls.Add(pnlTopRow);
            pnlMainArea.Controls.Add(pnlHeader);

            this.Controls.Add(pnlMainArea);
            this.Controls.Add(pnlSidebar);

            this.Resize += (s, e) => LayoutChrome();
            LayoutChrome();

            this.FormClosing += (s, e) =>
            {
                foreach (var p in runningWorkers.Values)
                {
                    try { if (!p.HasExited) p.Kill(); } catch { }
                }
                foreach (var lp in loginProcesses)
                {
                    try { if (lp != null && !lp.HasExited) lp.Kill(); } catch { }
                }
                try { if (loginProcess != null && !loginProcess.HasExited) loginProcess.Kill(); } catch { }
            };
        }

        private void FilterCourseCombo(string query)
        {
            string q = (query ?? "").Trim();
            if (string.IsNullOrEmpty(q)) return;
            for (int i = 0; i < comboCourse.Items.Count; i++)
            {
                CourseItem ci = comboCourse.Items[i] as CourseItem;
                if (ci != null && (ci.Code.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0 || ci.Name.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    comboCourse.SelectedIndex = i;
                    break;
                }
            }
        }

        private void RefreshDashboardMetrics()
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action(RefreshDashboardMetrics));
                return;
            }
            if (lblKpiTotalProfiles != null) lblKpiTotalProfiles.Text = profiles.Count.ToString();
            if (lblKpiRunning != null) lblKpiRunning.Text = runningWorkers.Count.ToString();
            if (lblKpiCourses != null) lblKpiCourses.Text = courses.Count.ToString();
            if (lblKpiErrors != null) lblKpiErrors.Text = totalErrorCount.ToString();

            ProfileItem selProf = comboProfile != null ? comboProfile.SelectedItem as ProfileItem : null;
            if (lblTopProfileBadge != null && selProf != null)
            {
                lblTopProfileBadge.Text = string.Format("👤 {0}  •  {1}", selProf.Name, IsProfileLoggedIn(selProf) ? "พร้อมใช้งาน" : "รอล็อกอิน");
            }

            if (runningWorkers.Count > 0)
            {
                if (!trackerStartTime.HasValue) trackerStartTime = DateTime.Now;
            }
            else
            {
                trackerStartTime = null;
            }

            if (workerProgressPct.Count > 0)
            {
                int sum = 0;
                foreach (int v in workerProgressPct.Values) sum += v;
                averageProgressPct = sum / workerProgressPct.Count;
            }
            else if (runningWorkers.Count == 0)
            {
                averageProgressPct = 0;
            }
            if (pnlGaugeCard != null) pnlGaugeCard.Invalidate();
        }

        private void LayoutChrome()
        {
            if (pnlHeader != null && lblTopProfileBadge != null)
            {
                lblTopProfileBadge.Location = new Point(Math.Max(360, pnlHeader.ClientSize.Width - lblTopProfileBadge.Width - 16), 14);
                pnlHeader.Invalidate();
            }

            if (pnlTopRow != null && btnStartAll != null && btnAddProfile != null)
            {
                int right = pnlTopRow.ClientSize.Width - 4;
                btnAddProfile.Location = new Point(right - btnAddProfile.Width, 12);
                btnStartAll.Location = new Point(btnAddProfile.Left - 10 - btnStartAll.Width, 12);
            }

            if (pnlKpiRow != null && pnlKpiRow.Controls.Count == 4)
            {
                int gap = 12;
                int totalW = pnlKpiRow.ClientSize.Width;
                int cardW = Math.Max(160, (totalW - gap * 3) / 4);
                for (int i = 0; i < 4; i++)
                {
                    Control c = pnlKpiRow.Controls[i];
                    c.Location = new Point(i * (cardW + gap), 0);
                    c.Size = new Size(cardW, 92);
                    c.Invalidate();
                }
            }

            if (pnlMiddleRow != null && pnlControlCard != null && pnlGaugeCard != null && pnlTrackerCard != null)
            {
                int gap = 12;
                int totalW = pnlMiddleRow.ClientSize.Width;
                int trackerW = 236;
                int gaugeW = 204;
                int ctrlW = Math.Max(540, totalW - trackerW - gaugeW - gap * 2);
                pnlControlCard.Location = new Point(0, 0);
                pnlControlCard.Size = new Size(ctrlW, 186);

                // Responsive layout inside pnlControlCard
                int padR = 16;
                if (btnLogin != null && btnManageProfiles != null && comboProfile != null)
                {
                    btnLogin.Location = new Point(ctrlW - padR - btnLogin.Width, 36);
                    btnManageProfiles.Location = new Point(btnLogin.Left - 8 - btnManageProfiles.Width, 36);
                    comboProfile.Width = Math.Max(140, btnManageProfiles.Left - 8 - comboProfile.Left);
                }
                if (comboSpeed != null && comboCourse != null)
                {
                    comboSpeed.Location = new Point(ctrlW - padR - comboSpeed.Width, 74);
                    comboCourse.Width = Math.Max(200, comboSpeed.Left - 8 - comboCourse.Left);
                }
                if (btnResetBrowser != null && btnSettings != null)
                {
                    btnResetBrowser.Location = new Point(ctrlW - padR - btnResetBrowser.Width, 108);
                    btnSettings.Location = new Point(btnResetBrowser.Left - 8 - btnSettings.Width, 108);
                }
                if (btnStart != null && txtUrl != null)
                {
                    btnStart.Location = new Point(ctrlW - padR - btnStart.Width, 140);
                    txtUrl.Width = Math.Max(180, btnStart.Left - 10 - txtUrl.Left);
                }

                pnlGaugeCard.Location = new Point(ctrlW + gap, 0);
                pnlGaugeCard.Size = new Size(gaugeW, 186);

                pnlTrackerCard.Location = new Point(ctrlW + gap + gaugeW + gap, 0);
                pnlTrackerCard.Size = new Size(Math.Max(200, totalW - (ctrlW + gap + gaugeW + gap)), 186);

                pnlControlCard.Invalidate();
                pnlGaugeCard.Invalidate();
                pnlTrackerCard.Invalidate();
            }

            if (pnlWorkersHeader != null && btnStop != null && btnPauseWorker != null)
            {
                int right = pnlWorkersHeader.ClientSize.Width - 10;
                btnStop.Location = new Point(right - btnStop.Width, 6);
                btnPauseWorker.Location = new Point(btnStop.Left - 8 - btnPauseWorker.Width, 6);
            }

            if (pnlLogsHeader != null && btnClearLog != null)
            {
                btnClearLog.Location = new Point(Math.Max(360, pnlLogsHeader.ClientSize.Width - btnClearLog.Width - 10), 5);
            }

            if (lvWorkers != null && lvWorkers.Columns.Count >= 5 && lvWorkers.ClientSize.Width > 100)
            {
                int w = lvWorkers.ClientSize.Width;
                lvWorkers.Columns[0].Width = 175;
                lvWorkers.Columns[1].Width = 110;
                lvWorkers.Columns[2].Width = 75;
                lvWorkers.Columns[3].Width = 165;
                lvWorkers.Columns[4].Width = Math.Max(200, w - 535);
            }
        }

        private Panel CreateSurfacePanel(DockStyle dock, int height)
        {
            RoundedPanel p = new RoundedPanel
            {
                Dock = dock,
                Height = height,
                BackColor = UiTheme.BgWash
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
            SyncCurrentControlsToSelectedProfile();
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

        private string GetProfileDataDir(ProfileItem p)
        {
            if (p == null || string.IsNullOrEmpty(p.Id) || p.Id == "profile_1")
            {
                return Path.GetFullPath(Path.Combine(appDir, PROFILE_DIR));
            }
            string safe = Regex.Replace(p.Id, "[^a-zA-Z0-9_-]", "_");
            return Path.GetFullPath(Path.Combine(appDir, PROFILES_ROOT_DIR, safe));
        }

        private bool IsProfileLoggedIn(ProfileItem p)
        {
            try
            {
                string dir = GetProfileDataDir(p);
                return Directory.Exists(Path.Combine(dir, "Default"));
            }
            catch { return false; }
        }

        private CourseItem FindCourseByCode(string code)
        {
            if (string.IsNullOrEmpty(code)) return null;
            foreach (var c in courses)
            {
                if (string.Equals(c.Code, code, StringComparison.OrdinalIgnoreCase)) return c;
            }
            return null;
        }

        private void LoadProfiles()
        {
            profiles.Clear();
            string cfgPath = Path.Combine(appDir, PROFILES_CONFIG_FILE);
            string defaultCourse = courses.Count > 0 ? courses[0].Code : "TSUGE000111";
            string defaultUrl = courses.Count > 0 ? (courses[0].Url ?? "") : "";
            string defaultModes = GetSelectedModes();

            if (File.Exists(cfgPath))
            {
                try
                {
                    string json = File.ReadAllText(cfgPath, Encoding.UTF8);
                    MatchCollection blocks = Regex.Matches(json, "\\{[^{}]*\"id\"\\s*:\\s*\"([^\"]+)\"[^{}]*\\}");
                    foreach (Match b in blocks)
                    {
                        string obj = b.Value;
                        string id = Regex.Match(obj, "\"id\"\\s*:\\s*\"([^\"]+)\"").Groups[1].Value;
                        Match mName = Regex.Match(obj, "\"name\"\\s*:\\s*\"([^\"]+)\"");
                        Match mCourse = Regex.Match(obj, "\"course\"\\s*:\\s*\"([^\"]*)\"");
                        Match mUrl = Regex.Match(obj, "\"url\"\\s*:\\s*\"([^\"]*)\"");
                        Match mSpeed = Regex.Match(obj, "\"speed\"\\s*:\\s*\"([^\"]*)\"");
                        Match mModes = Regex.Match(obj, "\"modes\"\\s*:\\s*\"([^\"]*)\"");
                        Match mRunAll = Regex.Match(obj, "\"run_all\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);

                        string cCode = mCourse.Success && !string.IsNullOrEmpty(mCourse.Groups[1].Value) ? mCourse.Groups[1].Value : defaultCourse;
                        CourseItem ci = FindCourseByCode(cCode);
                        string cUrl = mUrl.Success && !string.IsNullOrEmpty(mUrl.Groups[1].Value) ? mUrl.Groups[1].Value : (ci != null ? (ci.Url ?? "") : defaultUrl);

                        profiles.Add(new ProfileItem
                        {
                            Id = id,
                            Name = mName.Success ? mName.Groups[1].Value : id,
                            CourseCode = cCode,
                            CustomUrl = cUrl,
                            Speed = mSpeed.Success && !string.IsNullOrEmpty(mSpeed.Groups[1].Value) ? mSpeed.Groups[1].Value : "normal",
                            Modes = mModes.Success && !string.IsNullOrEmpty(mModes.Groups[1].Value) ? mModes.Groups[1].Value : defaultModes,
                            EnabledForRunAll = !mRunAll.Success || string.Equals(mRunAll.Groups[1].Value, "true", StringComparison.OrdinalIgnoreCase)
                        });
                    }
                }
                catch { }
            }

            if (profiles.Count == 0)
            {
                profiles.Add(new ProfileItem { Id = "profile_1", Name = "Profile 1 (หลัก)", CourseCode = defaultCourse, CustomUrl = defaultUrl, Speed = "normal", Modes = defaultModes, EnabledForRunAll = true });
                profiles.Add(new ProfileItem { Id = "profile_2", Name = "Profile 2", CourseCode = defaultCourse, CustomUrl = defaultUrl, Speed = "normal", Modes = defaultModes, EnabledForRunAll = true });
                profiles.Add(new ProfileItem { Id = "profile_3", Name = "Profile 3", CourseCode = defaultCourse, CustomUrl = defaultUrl, Speed = "normal", Modes = defaultModes, EnabledForRunAll = true });
                SaveProfiles();
            }

            RefreshProfileCombo(0);
        }

        private static string EscapeJsonString(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        }

        private void SaveProfiles()
        {
            try
            {
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("[");
                for (int i = 0; i < profiles.Count; i++)
                {
                    ProfileItem p = profiles[i];
                    sb.AppendFormat(
                        "  {{ \"id\": \"{0}\", \"name\": \"{1}\", \"course\": \"{2}\", \"url\": \"{3}\", \"speed\": \"{4}\", \"modes\": \"{5}\", \"run_all\": {6} }}{7}\r\n",
                        EscapeJsonString(p.Id),
                        EscapeJsonString(p.Name),
                        EscapeJsonString(p.CourseCode),
                        EscapeJsonString(p.CustomUrl),
                        EscapeJsonString(p.Speed),
                        EscapeJsonString(p.Modes),
                        p.EnabledForRunAll ? "true" : "false",
                        i < profiles.Count - 1 ? "," : "");
                }
                sb.AppendLine("]");
                File.WriteAllText(Path.Combine(appDir, PROFILES_CONFIG_FILE), sb.ToString(), new UTF8Encoding(false));
            }
            catch { }
        }

        private void RefreshProfileCombo(int selectIndex)
        {
            if (comboProfile == null) return;
            suppressProfileEvents = true;
            comboProfile.Items.Clear();
            foreach (var p in profiles)
            {
                comboProfile.Items.Add(p);
            }
            if (comboProfile.Items.Count > 0)
            {
                int idx = Math.Max(0, Math.Min(selectIndex, comboProfile.Items.Count - 1));
                comboProfile.SelectedIndex = idx;
            }
            suppressProfileEvents = false;
            ApplySelectedProfileToControls();
        }

        private void ComboProfile_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (suppressProfileEvents) return;
            ApplySelectedProfileToControls();
        }

        private void ApplySelectedProfileToControls()
        {
            ProfileItem p = comboProfile != null ? comboProfile.SelectedItem as ProfileItem : null;
            if (p == null) return;

            suppressProfileEvents = true;
            suppressModeEvents = true;
            try
            {
                if (!string.IsNullOrEmpty(p.CourseCode))
                {
                    for (int i = 0; i < comboCourse.Items.Count; i++)
                    {
                        CourseItem ci = comboCourse.Items[i] as CourseItem;
                        if (ci != null && string.Equals(ci.Code, p.CourseCode, StringComparison.OrdinalIgnoreCase))
                        {
                            comboCourse.SelectedIndex = i;
                            break;
                        }
                    }
                }

                CourseItem selCourse = comboCourse.SelectedItem as CourseItem;
                txtUrl.Text = !string.IsNullOrEmpty(p.CustomUrl) ? p.CustomUrl : (selCourse != null ? (selCourse.Url ?? "") : "");

                string spd = (p.Speed ?? "normal").ToLowerInvariant();
                if (spd.StartsWith("turbo")) comboSpeed.SelectedIndex = 0;
                else if (spd.StartsWith("safe")) comboSpeed.SelectedIndex = 2;
                else comboSpeed.SelectedIndex = 1;

                string[] ms = (p.Modes ?? "quiz,video,doc").ToLowerInvariant().Split(new char[] { ',' });
                bool q = Array.IndexOf(ms, "quiz") >= 0;
                bool v = Array.IndexOf(ms, "video") >= 0;
                bool d = Array.IndexOf(ms, "doc") >= 0;
                if (!q && !v && !d) { q = true; v = true; d = true; }
                chkModeQuiz.Checked = q;
                chkModeVideo.Checked = v;
                chkModeDoc.Checked = d;
            }
            finally
            {
                suppressModeEvents = false;
                suppressProfileEvents = false;
                RefreshDashboardMetrics();
            }
        }

        private void SyncCurrentControlsToSelectedProfile()
        {
            if (suppressProfileEvents || comboProfile == null) return;
            ProfileItem p = comboProfile.SelectedItem as ProfileItem;
            if (p == null) return;

            CourseItem ci = comboCourse != null ? comboCourse.SelectedItem as CourseItem : null;
            if (ci != null) p.CourseCode = ci.Code;

            if (txtUrl != null) p.CustomUrl = txtUrl.Text.Trim();
            if (comboSpeed != null && comboSpeed.SelectedItem != null)
            {
                p.Speed = comboSpeed.SelectedItem.ToString().Split(new char[] { ' ' })[0];
            }
            p.Modes = GetSelectedModes();
            SaveProfiles();

            // Refresh display text in comboProfile without firing selection change
            int idx = comboProfile.SelectedIndex;
            if (idx >= 0)
            {
                suppressProfileEvents = true;
                comboProfile.Items[idx] = p;
                comboProfile.SelectedIndex = idx;
                suppressProfileEvents = false;
            }
        }

        private ProfileItem CreateNewProfile(string customName)
        {
            int nextNum = profiles.Count + 1;
            string id = "profile_" + nextNum;
            while (profiles.Exists(x => string.Equals(x.Id, id, StringComparison.OrdinalIgnoreCase)))
            {
                nextNum++;
                id = "profile_" + nextNum;
            }
            CourseItem ci = comboCourse.SelectedItem as CourseItem;
            string code = ci != null ? ci.Code : (courses.Count > 0 ? courses[0].Code : "TSUGE000111");
            string url = ci != null && !string.IsNullOrEmpty(ci.Url) ? ci.Url : txtUrl.Text.Trim();
            string spd = comboSpeed.SelectedItem != null ? comboSpeed.SelectedItem.ToString().Split(new char[] { ' ' })[0] : "normal";
            string mds = GetSelectedModes();

            ProfileItem np = new ProfileItem
            {
                Id = id,
                Name = string.IsNullOrEmpty(customName) ? ("Profile " + nextNum) : customName.Trim(),
                CourseCode = code,
                CustomUrl = url,
                Speed = spd,
                Modes = string.IsNullOrEmpty(mds) ? "quiz,video,doc" : mds,
                EnabledForRunAll = true
            };
            profiles.Add(np);
            SaveProfiles();
            RefreshDashboardMetrics();
            return np;
        }

        private void BtnAddProfile_Click(object sender, EventArgs e)
        {
            ProfileItem np = CreateNewProfile(null);
            RefreshProfileCombo(profiles.Count - 1);
            AppendLog(string.Format("เพิ่มโปรไฟล์ใหม่ [{0}] เรียบร้อยแล้ว — กด \"ล็อกอินโปรไฟล์นี้\" เพื่อล็อกอินบัญชี TSU ของโปรไฟล์นี้ได้เลย", np.Name), UiTheme.Success);
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
            PillButton btn = new PillButton
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
                UseVisualStyleBackColor = false,
                CornerRadius = height / 2
            };
            btn.FlatAppearance.BorderSize = 0;
            btn.Padding = new Padding(6, 0, 6, 0);
            btn.Tag = bg;
            return btn;
        }

        private RichTextBox CreateLogRichTextBox()
        {
            return new RichTextBox
            {
                Dock = DockStyle.Fill,
                BackColor = UiTheme.LogBg,
                ForeColor = UiTheme.LogDefault,
                Font = UiTheme.MonoFont(9.5f),
                ReadOnly = true,
                BorderStyle = BorderStyle.None,
                DetectUrls = false
            };
        }

        private RichTextBox EnsureProfileLogTab(string profileId, string profileName)
        {
            if (string.IsNullOrEmpty(profileId)) return rtbLogs;
            if (tabLogs.InvokeRequired)
            {
                return (RichTextBox)tabLogs.Invoke(new Func<RichTextBox>(() => EnsureProfileLogTab(profileId, profileName)));
            }
            RichTextBox existing;
            if (profileLogBoxes.TryGetValue(profileId, out existing))
            {
                return existing;
            }
            string title = string.IsNullOrEmpty(profileName) ? profileId : profileName;
            TabPage tp = new TabPage(title);
            RichTextBox rtb = CreateLogRichTextBox();
            tp.Controls.Add(rtb);
            // Insert before the Error tab so Error tab stays visible or after All tab
            int errIdx = tabLogs.TabPages.IndexOf(tabErrorPage);
            if (errIdx >= 0) tabLogs.TabPages.Insert(errIdx, tp);
            else tabLogs.TabPages.Add(tp);

            profileLogPages[profileId] = tp;
            profileLogBoxes[profileId] = rtb;
            profileErrorCounts[profileId] = 0;
            return rtb;
        }

        private void ClearCurrentLogTab()
        {
            if (tabLogs == null || tabLogs.SelectedTab == null) return;
            TabPage sel = tabLogs.SelectedTab;
            foreach (Control c in sel.Controls)
            {
                RichTextBox rtb = c as RichTextBox;
                if (rtb != null)
                {
                    rtb.Clear();
                    break;
                }
            }
            if (sel == tabErrorPage)
            {
                totalErrorCount = 0;
                tabErrorPage.Text = "⚠️ เฉพาะ Error / คำเตือน (0)";
                RefreshDashboardMetrics();
            }
        }

        private static bool IsErrorOrWarningLine(string text)
        {
            if (string.IsNullOrEmpty(text)) return false;
            return text.Contains("ERROR") || text.Contains("❌") || text.Contains("⚠️")
                || text.Contains("Error:") || text.Contains("ล้มเหลว") || text.Contains("ไม่สำเร็จ");
        }

        private static void WriteRtbLine(RichTextBox rtb, string formattedLine, Color color)
        {
            if (rtb == null || rtb.IsDisposed) return;
            rtb.SelectionStart = rtb.TextLength;
            rtb.SelectionLength = 0;
            rtb.SelectionColor = color;
            rtb.AppendText(formattedLine);
            rtb.ScrollToCaret();
        }

        private void AppendLog(string text, Color? color = null)
        {
            if (rtbLogs.InvokeRequired)
            {
                rtbLogs.Invoke(new Action(() => AppendLog(text, color)));
                return;
            }
            string line = string.Format("[{0}] {1}\n", DateTime.Now.ToString("HH:mm:ss"), text);
            Color c = color ?? (IsErrorOrWarningLine(text) ? UiTheme.Danger : UiTheme.LogDefault);
            WriteRtbLine(rtbLogs, line, c);
        }

        private void AppendProfileLog(string profileId, string profileName, string courseCode, string text, Color? color = null)
        {
            if (rtbLogs.InvokeRequired)
            {
                rtbLogs.Invoke(new Action(() => AppendProfileLog(profileId, profileName, courseCode, text, color)));
                return;
            }
            bool isErr = IsErrorOrWarningLine(text) || (color.HasValue && color.Value == UiTheme.Danger);
            Color c = color ?? (isErr ? UiTheme.Danger : UiTheme.LogDefault);
            string ts = DateTime.Now.ToString("HH:mm:ss");
            string tag = string.Format("[{0} | {1}]", profileName, courseCode);
            string allLine = string.Format("[{0}] {1} {2}\n", ts, tag, text);
            string profLine = string.Format("[{0}] [{1}] {2}\n", ts, courseCode, text);

            WriteRtbLine(rtbLogs, allLine, c);

            RichTextBox profRtb = EnsureProfileLogTab(profileId, profileName);
            WriteRtbLine(profRtb, profLine, c);

            if (isErr)
            {
                totalErrorCount++;
                WriteRtbLine(rtbErrorLogs, allLine, UiTheme.Danger);
                if (tabErrorPage != null)
                {
                    tabErrorPage.Text = string.Format("⚠️ เฉพาะ Error / คำเตือน ({0})", totalErrorCount);
                }
                RefreshDashboardMetrics();
                TabPage tp;
                if (profileLogPages.TryGetValue(profileId, out tp))
                {
                    int cnt = 0;
                    profileErrorCounts.TryGetValue(profileId, out cnt);
                    cnt++;
                    profileErrorCounts[profileId] = cnt;
                    tp.Text = string.Format("{0} (!{1})", profileName, cnt);
                }
            }
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
            if (resetInProgress) return;
            ProfileItem prof = (comboProfile != null ? comboProfile.SelectedItem as ProfileItem : null)
                ?? (profiles.Count > 0 ? profiles[0] : new ProfileItem { Id = "profile_1", Name = "Profile 1" });
            OpenLoginForProfile(prof);
        }

        private void OpenLoginForProfile(ProfileItem prof)
        {
            if (resetInProgress || prof == null) return;
            string profileDir = GetProfileDataDir(prof);
            AppendLog(string.Format("กำลังเปิดหน้าต่าง Chrome สำหรับล็อกอิน [{0}] (โฟลเดอร์แยก: {1})...", prof.Name, Path.GetFileName(profileDir)), UiTheme.Success);
            Thread t = new Thread(() =>
            {
                EnsureDependencies();
                string script = Path.Combine(appDir, "cli_worker.js");
                string args = string.Format("\"{0}\" --action login --profile \"{1}\" --profile-dir \"{2}\"", script, prof.Name, profileDir);
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
                    loginProcess = p;
                    lock (loginProcesses) { loginProcesses.Add(p); }
                    p.OutputDataReceived += (s, ev) =>
                    {
                        if (!string.IsNullOrEmpty(ev.Data))
                            AppendLog(string.Format("[Login {0}] {1}", prof.Name, ev.Data));
                    };
                    p.ErrorDataReceived += (s, ev) =>
                    {
                        if (!string.IsNullOrEmpty(ev.Data))
                            AppendLog(string.Format("[Login {0} ERROR] {1}", prof.Name, ev.Data), UiTheme.Danger);
                    };
                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    p.WaitForExit();
                    lock (loginProcesses) { loginProcesses.Remove(p); }
                    if (loginProcess == p) loginProcess = null;
                    if (!resetInProgress)
                        AppendLog(string.Format("ปิดหน้าต่างล็อกอิน [{0}] แล้ว บัญชีถูกบันทึกแยกในโปรไฟล์นี้เรียบร้อย", prof.Name), UiTheme.Success);
                }
                catch (Exception ex)
                {
                    AppendLog(string.Format("ข้อผิดพลาดในการเปิดล็อกอิน [{0}]: {1}", prof.Name, ex.Message), UiTheme.Danger);
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        private bool IsProfileRunning(ProfileItem prof)
        {
            if (prof == null) return false;
            foreach (var kvp in workerProfiles)
            {
                if (string.Equals(kvp.Value, prof.Id, StringComparison.OrdinalIgnoreCase) && runningWorkers.ContainsKey(kvp.Key))
                {
                    return true;
                }
            }
            return false;
        }

        private void BtnStart_Click(object sender, EventArgs e)
        {
            if (resetInProgress) return;
            SyncCurrentControlsToSelectedProfile();
            ProfileItem prof = (comboProfile != null ? comboProfile.SelectedItem as ProfileItem : null)
                ?? (profiles.Count > 0 ? profiles[0] : new ProfileItem { Id = "profile_1", Name = "Profile 1" });

            if (IsProfileRunning(prof))
            {
                MessageBox.Show(
                    string.Format("โปรไฟล์ \"{0}\" กำลังเปิดทำงานอยู่แล้ว!\n\nหากต้องการเปิดอีกหน้าต่างพร้อมกัน กรุณาเลือกโปรไฟล์อื่น (เช่น Profile 2, Profile 3) หรือกด \"+ โปรไฟล์\" เพื่อแยกเซสชัน Chrome ไม่ให้ชนกัน", prof.Name),
                    "โปรไฟล์นี้กำลังทำงานอยู่",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            StartWorkerForProfile(prof);
        }

        private void BtnStartAll_Click(object sender, EventArgs e)
        {
            if (resetInProgress) return;
            SyncCurrentControlsToSelectedProfile();

            List<ProfileItem> targets = new List<ProfileItem>();
            foreach (var p in profiles)
            {
                if (p.EnabledForRunAll && !IsProfileRunning(p))
                {
                    targets.Add(p);
                }
            }

            if (targets.Count == 0)
            {
                MessageBox.Show(
                    "ไม่มีโปรไฟล์ที่พร้อมเริ่มทำงานใหม่ (ทุกโปรไฟล์ที่เลือกกำลังทำงานอยู่แล้ว หรือยังไม่ได้ติ๊กเปิดใช้งานในหน้าจัดการโปรไฟล์)",
                    "รันทุกโปรไฟล์พร้อมกัน",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            StringBuilder summary = new StringBuilder();
            summary.AppendFormat("ต้องการเปิดรันพร้อมกัน {0} โปรไฟล์ (แยกหน้าต่าง Chrome และแยกวิชาตามที่ตั้งไว้) ใช่หรือไม่?\n\n", targets.Count);
            foreach (var p in targets)
            {
                summary.AppendFormat("• {0}  →  วิชา: {1}  |  ความเร็ว: {2}  |  ทำ: {3}\n",
                    p.Name,
                    string.IsNullOrEmpty(p.CourseCode) ? "(ยังไม่เลือก)" : p.CourseCode,
                    string.IsNullOrEmpty(p.Speed) ? "normal" : p.Speed,
                    DescribeModes(string.IsNullOrEmpty(p.Modes) ? "quiz,video,doc" : p.Modes));
            }
            summary.AppendLine("\n(สามารถปรับเปลี่ยนวิชาของแต่ละโปรไฟล์ได้โดยสลับช่องโปรไฟล์ หรือกดปุ่ม \"จัดการทุกโปรไฟล์\")");

            if (MessageBox.Show(summary.ToString(), "ยืนยันรันทุกโปรไฟล์พร้อมกัน", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
                return;

            AppendLog(string.Format("🚀 เริ่มรันพร้อมกันทั้งหมด {0} โปรไฟล์...", targets.Count), UiTheme.Success);
            foreach (var p in targets)
            {
                StartWorkerForProfile(p);
            }
        }

        private void StartWorkerForProfile(ProfileItem prof)
        {
            if (resetInProgress || prof == null) return;

            string courseCode = prof.CourseCode;
            if (string.IsNullOrEmpty(courseCode))
            {
                CourseItem ci = comboCourse.SelectedItem as CourseItem;
                courseCode = ci != null ? ci.Code : (courses.Count > 0 ? courses[0].Code : "");
            }
            if (courseCode.Contains(" - ")) courseCode = courseCode.Split(new string[] { " - " }, StringSplitOptions.None)[0];

            CourseItem matchedCourse = FindCourseByCode(courseCode);
            string speed = !string.IsNullOrEmpty(prof.Speed) ? prof.Speed : "normal";
            string customUrl = !string.IsNullOrEmpty(prof.CustomUrl) ? prof.CustomUrl.Trim() : "";
            if (string.IsNullOrEmpty(customUrl) && matchedCourse != null && !string.IsNullOrEmpty(matchedCourse.Url))
            {
                customUrl = matchedCourse.Url;
            }

            string modes = !string.IsNullOrEmpty(prof.Modes) ? prof.Modes : GetSelectedModes();
            if (string.IsNullOrEmpty(modes))
            {
                AppendLog(string.Format("[{0}] กรุณาเลือกอย่างน้อย 1 อย่าง: แบบฝึก / วิดีโอ / เอกสาร", prof.Name), UiTheme.Warning);
                return;
            }

            string profileDir = GetProfileDataDir(prof);
            string profId = prof.Id;
            string profName = prof.Name;
            string workerId = string.Format("Worker-{0} ({1})", workerCounter++, profName);
            workerProfiles[workerId] = profId;

            EnsureProfileLogTab(profId, profName);
            AppendProfileLog(profId, profName, courseCode, string.Format("เริ่มต้น {0} | โหมด: {1} | ทำ: {2}", workerId, speed, DescribeModes(modes)), UiTheme.Info);

            ListViewItem item = new ListViewItem(workerId);
            item.SubItems.Add(courseCode);
            item.SubItems.Add(speed);
            item.SubItems.Add("กำลังตรวจสอบ (0%)");
            item.SubItems.Add("กำลังเปิดเบราว์เซอร์ Chrome...");
            item.Tag = workerId;
            lvWorkers.Items.Add(item);
            workerProgressPct[workerId] = 0;
            RefreshDashboardMetrics();

            Thread t = new Thread(() =>
            {
                EnsureDependencies();
                string script = Path.Combine(appDir, "cli_worker.js");
                string args = string.Format("\"{0}\" --action run --id \"{1}\" --course \"{2}\" --speed \"{3}\" --modes \"{4}\" --profile \"{5}\" --profile-dir \"{6}\"",
                    script, workerId, courseCode, speed, modes, profName, profileDir);
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
                            AppendProfileLog(profId, profName, courseCode, msg);
                            UpdateWorkerStatus(workerId, msg);
                            Match mCourse = Regex.Match(msg, @"ทั้งหมด\s+(\d+)\s+รายการ\s*\|\s*ติ๊กแล้ว\s+(\d+)");
                            if (mCourse.Success)
                            {
                                int tot = int.Parse(mCourse.Groups[1].Value);
                                int dn = int.Parse(mCourse.Groups[2].Value);
                                int pct = tot > 0 ? (dn * 100) / tot : 0;
                                UpdateWorkerProgress(workerId, string.Format("{0}% ({1}/{2})", pct, dn, tot));
                            }
                        }
                        else if (line.StartsWith("[STATUS] "))
                        {
                            string json = line.Substring(9);
                            Match mStep = Regex.Match(json, "\"step\"\\s*:\\s*\"([^\"]+)\"");
                            if (mStep.Success)
                            {
                                string step = mStep.Groups[1].Value;
                                Match mPct = Regex.Match(step, @"Progress\s+(\d+%\s*\([^)]+\))");
                                if (mPct.Success)
                                {
                                    UpdateWorkerProgress(workerId, mPct.Groups[1].Value);
                                }
                            }
                        }
                        else if (line.StartsWith("[PROGRESS] "))
                        {
                            string json = line.Substring(11);
                            Match mComp = Regex.Match(json, "\"completion\"\\s*:\\s*(\\d+)");
                            if (mComp.Success)
                            {
                                UpdateWorkerProgress(workerId, string.Format("{0}% (ยืนยันแล้ว)", mComp.Groups[1].Value));
                            }
                        }
                    };

                    p.ErrorDataReceived += (s, ev) =>
                    {
                        if (!string.IsNullOrEmpty(ev.Data))
                            AppendProfileLog(profId, profName, courseCode, "[ERROR] " + ev.Data, UiTheme.Danger);
                    };

                    p.BeginOutputReadLine();
                    p.BeginErrorReadLine();
                    p.WaitForExit();

                    AppendProfileLog(profId, profName, courseCode, "เสร็จสิ้นการทำงานและปิดหน้าต่างเรียบร้อยแล้ว", UiTheme.Success);
                    runningWorkers.Remove(workerId);
                    workerProfiles.Remove(workerId);
                    if (workerPausedStates.ContainsKey(workerId)) workerPausedStates.Remove(workerId);
                    RemoveWorkerRow(workerId);
                }
                catch (Exception ex)
                {
                    AppendProfileLog(profId, profName, courseCode, "Error: " + ex.Message, UiTheme.Danger);
                    runningWorkers.Remove(workerId);
                    workerProfiles.Remove(workerId);
                    RemoveWorkerRow(workerId);
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
                    if (item.SubItems.Count > 4) item.SubItems[4].Text = status;
                    break;
                }
            }
        }

        private void UpdateWorkerProgress(string workerId, string progress)
        {
            if (lvWorkers.InvokeRequired)
            {
                lvWorkers.Invoke(new Action(() => UpdateWorkerProgress(workerId, progress)));
                return;
            }
            Match m = Regex.Match(progress ?? "", @"(\d+)%");
            if (m.Success)
            {
                int pct;
                if (int.TryParse(m.Groups[1].Value, out pct))
                {
                    workerProgressPct[workerId] = pct;
                }
            }
            foreach (ListViewItem item in lvWorkers.Items)
            {
                if (item.Tag != null && item.Tag.ToString() == workerId)
                {
                    if (item.SubItems.Count > 3) item.SubItems[3].Text = progress;
                    break;
                }
            }
            RefreshDashboardMetrics();
        }

        private void RemoveWorkerRow(string workerId)
        {
            if (lvWorkers.InvokeRequired)
            {
                lvWorkers.Invoke(new Action(() => RemoveWorkerRow(workerId)));
                return;
            }
            workerProgressPct.Remove(workerId);
            for (int i = lvWorkers.Items.Count - 1; i >= 0; i--)
            {
                if (lvWorkers.Items[i].Tag != null && lvWorkers.Items[i].Tag.ToString() == workerId)
                {
                    lvWorkers.Items.RemoveAt(i);
                    break;
                }
            }
            RefreshDashboardMetrics();
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
                runningWorkers.Remove(workerId);
                workerProfiles.Remove(workerId);
                if (workerPausedStates.ContainsKey(workerId)) workerPausedStates.Remove(workerId);
                RemoveWorkerRow(workerId);
            }
            catch (Exception ex)
            {
                AppendLog(string.Format("ข้อผิดพลาดในการยกเลิก {0}: {1}", workerId, ex.Message), UiTheme.Danger);
            }
        }

        private void BtnResetBrowser_Click(object sender, EventArgs e)
        {
            if (resetInProgress) return;

            ProfileItem selectedProf = (comboProfile != null ? comboProfile.SelectedItem as ProfileItem : null)
                ?? (profiles.Count > 0 ? profiles[0] : new ProfileItem { Id = "profile_1", Name = "Profile 1" });
            string profileDir = GetProfileDataDir(selectedProf);
            List<string> workerIds = new List<string>(runningWorkers.Keys);
            int activeLogins = 0;
            lock (loginProcesses)
            {
                foreach (var lp in loginProcesses)
                {
                    try { if (lp != null && !lp.HasExited) activeLogins++; } catch { }
                }
            }
            int activeCount = workerIds.Count + activeLogins;

            string msg =
                string.Format("ล้างแคชเบราว์เซอร์ของโปรไฟล์ \"{0}\"?\n\n", selectedProf.Name) +
                "จะลบ: แคช คุกกี้ ข้อมูลเว็บ และการล็อกอิน TSU ที่บันทึกไว้ของโปรไฟล์นี้\n(" + profileDir + ")\n\n" +
                "ไม่ลบ: โปรไฟล์อื่น ฐานเฉลย การตั้งค่า และบันทึกการทำงาน\n\n" +
                "หลังล้างแล้วต้องกด \"ล็อกอินโปรไฟล์นี้\" เพื่อล็อกอินใหม่";
            if (activeCount > 0)
            {
                msg = string.Format("ขณะนี้มีบอทหรือหน้าต่างล็อกอินทำงานอยู่ {0} หน้าต่าง\nโปรแกรมจะหยุดและปิด Chrome ที่เกี่ยวข้องก่อนล้าง\n\n", activeCount) + msg;
            }
            if (MessageBox.Show(msg, "ยืนยันล้างแคชโปรไฟล์ " + selectedProf.Name, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
                return;

            resetInProgress = true;
            SetResetBusy(true);

            List<Process> toStop = new List<Process>();
            foreach (string id in workerIds)
            {
                Process p;
                if (!runningWorkers.TryGetValue(id, out p)) continue;
                try { p.StandardInput.WriteLine("stop"); } catch { }
                toStop.Add(p);
                runningWorkers.Remove(id);
                workerProfiles.Remove(id);
                if (workerPausedStates.ContainsKey(id)) workerPausedStates.Remove(id);
                RemoveWorkerRow(id);
            }
            lock (loginProcesses)
            {
                foreach (var lp in loginProcesses)
                {
                    try { if (lp != null && !lp.HasExited) toStop.Add(lp); } catch { }
                }
                loginProcesses.Clear();
            }
            UpdatePauseButtons(false);
            AppendLog(activeCount > 0 ? "กำลังหยุดบอท/ปิด Chrome และล้างแคชโปรไฟล์ " + selectedProf.Name + "..." : "กำลังล้างแคชโปรไฟล์ " + selectedProf.Name + "...", UiTheme.Warning);

            Thread t = new Thread(() =>
            {
                bool removed = false;
                string error = null;
                try
                {
                    StopProcessesForReset(toStop);
                    if (Directory.Exists(profileDir)) KillChromeUsingProfile(profileDir);
                    removed = DeleteProfileDir(profileDir);
                }
                catch (Exception ex)
                {
                    error = ex.Message;
                }

                this.BeginInvoke(new Action(() =>
                {
                    resetInProgress = false;
                    SetResetBusy(false);
                    if (error == null)
                    {
                        string done = removed
                            ? string.Format("ล้างแคชของ [{0}] เรียบร้อยแล้ว กรุณากด \"ล็อกอินโปรไฟล์นี้\" เพื่อล็อกอิน TSU ใหม่ก่อนเริ่มบอท", selectedProf.Name)
                            : string.Format("โปรไฟล์ [{0}] ยังไม่มีแคชให้ล้าง (ยังไม่เคยเปิดเบราว์เซอร์ หรือถูกล้างไปแล้ว)", selectedProf.Name);
                        AppendLog(done, UiTheme.Success);
                        MessageBox.Show(done, "สำเร็จ", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                        AppendLog("ล้างแคชเบราว์เซอร์ไม่สำเร็จ: " + error, UiTheme.Danger);
                        MessageBox.Show(
                            "ล้างแคชเบราว์เซอร์ไม่สำเร็จ\n\n" + error +
                            "\n\nกรุณาปิดหน้าต่าง Chrome ของบอททั้งหมดแล้วลองใหม่อีกครั้ง",
                            "ล้มเหลว", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }));
            });
            t.IsBackground = true;
            t.Start();
        }

        private void SetResetBusy(bool busy)
        {
            btnResetBrowser.Enabled = !busy;
            btnResetBrowser.Text = busy ? "กำลังล้าง..." : "ล้างแคช";
            btnStart.Enabled = !busy;
            if (btnStartAll != null) btnStartAll.Enabled = !busy;
            btnLogin.Enabled = !busy;
        }

        // Give each worker a moment to close its browser after "stop", then kill whatever is left
        // (node + its Chrome children) so no process keeps the profile files locked.
        private static void StopProcessesForReset(List<Process> procs)
        {
            DateTime deadline = DateTime.UtcNow.AddSeconds(6);
            foreach (Process p in procs)
            {
                try
                {
                    int remaining = (int)Math.Max(0, (deadline - DateTime.UtcNow).TotalMilliseconds);
                    if (!p.HasExited) p.WaitForExit(remaining);
                }
                catch { }
            }
            foreach (Process p in procs)
            {
                try
                {
                    if (!p.HasExited) RunHidden("taskkill.exe", "/PID " + p.Id + " /T /F", 10000);
                }
                catch { }
                try { if (!p.HasExited) p.Kill(); } catch { }
            }
        }

        // Chrome children can outlive a killed node.exe; find them by their --user-data-dir.
        private static void KillChromeUsingProfile(string profileDir)
        {
            string script =
                "$d = '--user-data-dir=" + profileDir.TrimEnd(new char[] { '\\' }).Replace("'", "''") + "'.ToLowerInvariant();" +
                "Get-WmiObject Win32_Process -Filter \"Name='chrome.exe' OR Name='chrome-headless-shell.exe'\" | " +
                "Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($d) } | " +
                "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
            string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(script));
            try { RunHidden("powershell.exe", "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + encoded, 20000); } catch { }
            Thread.Sleep(500);
        }

        private static void RunHidden(string file, string args, int timeoutMs)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = file,
                Arguments = args,
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            using (Process p = Process.Start(psi))
            {
                if (p != null && !p.WaitForExit(timeoutMs))
                {
                    try { p.Kill(); } catch { }
                }
            }
        }

        // Returns false when there was no profile to delete; throws if it could not be fully removed.
        private bool DeleteProfileDir(string profileDir)
        {
            string full = Path.GetFullPath(profileDir).TrimEnd(new char[] { '\\', '/' });
            string parent = Path.GetDirectoryName(full);
            string expectedParent = Path.GetFullPath(appDir).TrimEnd(new char[] { '\\', '/' });
            string expectedProfilesRoot = Path.GetFullPath(Path.Combine(appDir, PROFILES_ROOT_DIR)).TrimEnd(new char[] { '\\', '/' });
            bool isMainProfile = string.Equals(Path.GetFileName(full), PROFILE_DIR, StringComparison.OrdinalIgnoreCase) &&
                                 string.Equals(parent, expectedParent, StringComparison.OrdinalIgnoreCase);
            bool isMultiProfile = string.Equals(parent, expectedProfilesRoot, StringComparison.OrdinalIgnoreCase);
            if (!isMainProfile && !isMultiProfile)
            {
                throw new InvalidOperationException("ไม่ลบโฟลเดอร์ที่ไม่ใช่โปรไฟล์เบราว์เซอร์ของบอท: " + full);
            }
            if (!Directory.Exists(full)) return false;

            Exception last = null;
            for (int attempt = 0; attempt < 8; attempt++)
            {
                try
                {
                    foreach (string f in Directory.GetFiles(full, "*", SearchOption.AllDirectories))
                    {
                        try { File.SetAttributes(f, FileAttributes.Normal); } catch { }
                    }
                    Directory.Delete(full, true);
                }
                catch (IOException ex) { last = ex; }
                catch (UnauthorizedAccessException ex) { last = ex; }
                if (!Directory.Exists(full)) return true;
                Thread.Sleep(750);
            }
            throw new IOException("ยังมีไฟล์ถูกใช้งานอยู่ ลบโฟลเดอร์ " + full + " ไม่หมด" + (last != null ? " (" + last.Message + ")" : ""));
        }

        private void BtnManageProfiles_Click(object sender, EventArgs e)
        {
            SyncCurrentControlsToSelectedProfile();

            Form dlg = new Form
            {
                Text = "จัดการโปรไฟล์ Chrome แยกบัญชี & ตั้งค่าวิชาแยกแต่ละโปรไฟล์",
                Size = new Size(920, 620),
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
                Size = new Size(872, 548),
                BackColor = UiTheme.Surface
            };
            card.Paint += PaintSurfaceCard;
            dlg.Controls.Add(card);

            Label lblH = new Label
            {
                Text = "จัดการโปรไฟล์ Chrome (แยกบัญชีล็อกอิน & แยกรายวิชา)",
                Font = UiTheme.UiFont(15f, FontStyle.Bold),
                ForeColor = UiTheme.Brand,
                Location = new Point(20, 14),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            card.Controls.Add(lblH);

            Label lblSub = new Label
            {
                Text = "ติ๊กช่องหน้าโปรไฟล์ที่ต้องการรวมเมื่อกด \"รันทุกโปรไฟล์พร้อมกัน\" • คลิกเลือกแถวเพื่อตั้งค่าวิชาแยกของแต่ละโปรไฟล์ หรือกดรันแยกเฉพาะโปรไฟล์",
                Font = UiTheme.UiFont(9f, FontStyle.Regular),
                ForeColor = UiTheme.TextMuted,
                Location = new Point(22, 44),
                AutoSize = true,
                BackColor = Color.Transparent
            };
            card.Controls.Add(lblSub);

            ListView lv = new ListView
            {
                Location = new Point(20, 72),
                Size = new Size(832, 220),
                View = View.Details,
                FullRowSelect = true,
                CheckBoxes = true,
                HideSelection = false,
                BackColor = UiTheme.SurfaceSoft,
                ForeColor = UiTheme.Text,
                BorderStyle = BorderStyle.FixedSingle,
                Font = UiTheme.UiFont(9.5f, FontStyle.Regular)
            };
            lv.Columns.Add("รันพร้อมกัน", 90);
            lv.Columns.Add("ชื่อโปรไฟล์ (บัญชี)", 170);
            lv.Columns.Add("วิชาที่เลือกไว้", 220);
            lv.Columns.Add("ความเร็ว", 85);
            lv.Columns.Add("สิ่งที่ทำ", 145);
            lv.Columns.Add("สถานะเซสชัน", 110);
            card.Controls.Add(lv);

            bool suppressLvCheck = false;
            Action<int> populateProfiles = (selIdx) =>
            {
                suppressLvCheck = true;
                lv.Items.Clear();
                foreach (var p in profiles)
                {
                    CourseItem ci = FindCourseByCode(p.CourseCode);
                    string courseDisplay = ci != null ? string.Format("{0} - {1}", ci.Code, ci.Name) : (p.CourseCode ?? "");
                    ListViewItem it = new ListViewItem(p.EnabledForRunAll ? "เปิด" : "ปิด");
                    it.Checked = p.EnabledForRunAll;
                    it.SubItems.Add(p.Name);
                    it.SubItems.Add(courseDisplay);
                    it.SubItems.Add(p.Speed ?? "normal");
                    it.SubItems.Add(DescribeModes(string.IsNullOrEmpty(p.Modes) ? "quiz,video,doc" : p.Modes));
                    it.SubItems.Add(IsProfileRunning(p) ? "กำลังรันอยู่" : (IsProfileLoggedIn(p) ? "มีเซสชันแล้ว" : "ยังไม่ล็อกอิน"));
                    it.Tag = p;
                    lv.Items.Add(it);
                }
                if (lv.Items.Count > 0)
                {
                    int idx = Math.Max(0, Math.Min(selIdx, lv.Items.Count - 1));
                    lv.Items[idx].Selected = true;
                }
                suppressLvCheck = false;
            };

            lv.ItemChecked += (s, ev) =>
            {
                if (suppressLvCheck) return;
                ProfileItem p = ev.Item.Tag as ProfileItem;
                if (p != null)
                {
                    p.EnabledForRunAll = ev.Item.Checked;
                    ev.Item.Text = p.EnabledForRunAll ? "เปิด" : "ปิด";
                    SaveProfiles();
                }
            };

            // Edit controls for selected profile
            Label lName = CreateFieldLabel("ชื่อโปรไฟล์ / ชื่อบัญชี:", new Point(20, 306));
            TextBox tName = CreateTextBox(new Point(20, 328), 200);
            card.Controls.Add(lName); card.Controls.Add(tName);

            Label lCourse = CreateFieldLabel("วิชาที่โปรไฟล์นี้จะทำ:", new Point(236, 306));
            ComboBox cbCourse = CreateCombo(new Point(236, 328), 320);
            foreach (var c in courses) cbCourse.Items.Add(c);
            card.Controls.Add(lCourse); card.Controls.Add(cbCourse);

            Label lSpeed = CreateFieldLabel("ความเร็ว:", new Point(572, 306));
            ComboBox cbSpeed = CreateCombo(new Point(572, 328), 120);
            cbSpeed.Items.AddRange(new object[] { "turbo", "normal", "safe" });
            cbSpeed.SelectedIndex = 1;
            card.Controls.Add(lSpeed); card.Controls.Add(cbSpeed);

            Label lModes = CreateFieldLabel("ให้ทำ:", new Point(706, 306));
            CheckBox ckQ = new CheckBox { Text = "ฝึก", Location = new Point(706, 330), AutoSize = true, Checked = true };
            CheckBox ckV = new CheckBox { Text = "คลิป", Location = new Point(756, 330), AutoSize = true, Checked = true };
            CheckBox ckD = new CheckBox { Text = "ชีท", Location = new Point(810, 330), AutoSize = true, Checked = true };
            card.Controls.Add(lModes); card.Controls.Add(ckQ); card.Controls.Add(ckV); card.Controls.Add(ckD);

            Label lUrl = CreateFieldLabel("ลิงก์ URL ของโปรไฟล์นี้ (ว่างไว้ = ใช้ลิงก์เริ่มต้นของวิชา):", new Point(20, 366));
            TextBox tUrl = CreateTextBox(new Point(20, 388), 672);
            card.Controls.Add(lUrl); card.Controls.Add(tUrl);

            cbCourse.SelectedIndexChanged += (s, ev) =>
            {
                CourseItem ci = cbCourse.SelectedItem as CourseItem;
                if (ci != null && !string.IsNullOrEmpty(ci.Url))
                {
                    tUrl.Text = ci.Url;
                }
            };

            Button btnSaveRow = CreateButton("บันทึกค่าโปรไฟล์นี้", UiTheme.Brand, 144, 32, true);
            btnSaveRow.Location = new Point(708, 385);
            card.Controls.Add(btnSaveRow);

            lv.SelectedIndexChanged += (s, ev) =>
            {
                if (lv.SelectedItems.Count == 0) return;
                ProfileItem p = lv.SelectedItems[0].Tag as ProfileItem;
                if (p == null) return;
                tName.Text = p.Name;
                for (int i = 0; i < cbCourse.Items.Count; i++)
                {
                    CourseItem ci = cbCourse.Items[i] as CourseItem;
                    if (ci != null && string.Equals(ci.Code, p.CourseCode, StringComparison.OrdinalIgnoreCase))
                    {
                        cbCourse.SelectedIndex = i;
                        break;
                    }
                }
                tUrl.Text = p.CustomUrl ?? "";
                string spd = (p.Speed ?? "normal").ToLowerInvariant();
                cbSpeed.SelectedIndex = spd.StartsWith("turbo") ? 0 : (spd.StartsWith("safe") ? 2 : 1);
                string[] ms = (p.Modes ?? "quiz,video,doc").ToLowerInvariant().Split(new char[] { ',' });
                ckQ.Checked = Array.IndexOf(ms, "quiz") >= 0;
                ckV.Checked = Array.IndexOf(ms, "video") >= 0;
                ckD.Checked = Array.IndexOf(ms, "doc") >= 0;
            };

            Action saveCurrentRow = () =>
            {
                if (lv.SelectedItems.Count == 0) return;
                ProfileItem p = lv.SelectedItems[0].Tag as ProfileItem;
                if (p == null) return;
                if (!string.IsNullOrEmpty(tName.Text.Trim())) p.Name = tName.Text.Trim();
                CourseItem ci = cbCourse.SelectedItem as CourseItem;
                if (ci != null) p.CourseCode = ci.Code;
                p.CustomUrl = tUrl.Text.Trim();
                p.Speed = cbSpeed.SelectedItem != null ? cbSpeed.SelectedItem.ToString() : "normal";
                List<string> mList = new List<string>();
                if (ckQ.Checked) mList.Add("quiz");
                if (ckV.Checked) mList.Add("video");
                if (ckD.Checked) mList.Add("doc");
                if (mList.Count == 0) { mList.Add("quiz"); ckQ.Checked = true; }
                p.Modes = string.Join(",", mList.ToArray());
                SaveProfiles();
                int idx = lv.SelectedIndices[0];
                populateProfiles(idx);
                RefreshProfileCombo(comboProfile != null ? comboProfile.SelectedIndex : 0);
            };

            btnSaveRow.Click += (s, ev) =>
            {
                saveCurrentRow();
                AppendLog("บันทึกการตั้งค่าโปรไฟล์เรียบร้อยแล้ว", UiTheme.Success);
            };

            // Bottom action buttons
            Button bAdd = CreateButton("+ เพิ่มโปรไฟล์ใหม่", UiTheme.Brand, 140, 36, false);
            bAdd.Location = new Point(20, 442);
            bAdd.Click += (s, ev) =>
            {
                ProfileItem np = CreateNewProfile(null);
                populateProfiles(profiles.Count - 1);
                RefreshProfileCombo(profiles.Count - 1);
            };
            card.Controls.Add(bAdd);

            Button bDel = CreateButton("ลบโปรไฟล์ที่เลือก", UiTheme.Danger, 134, 36, false);
            bDel.Location = new Point(168, 442);
            bDel.Click += (s, ev) =>
            {
                if (lv.SelectedItems.Count == 0) return;
                if (profiles.Count <= 1)
                {
                    MessageBox.Show("ต้องมีอย่างน้อย 1 โปรไฟล์ในระบบ", "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                ProfileItem p = lv.SelectedItems[0].Tag as ProfileItem;
                if (p == null) return;
                if (MessageBox.Show(string.Format("ต้องการลบโปรไฟล์ \"{0}\" ออกจากรายการหรือไม่?", p.Name), "ยืนยันการลบ", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                {
                    profiles.Remove(p);
                    SaveProfiles();
                    populateProfiles(0);
                    RefreshProfileCombo(0);
                }
            };
            card.Controls.Add(bDel);

            Button bLoginOne = CreateButton("เปิด Chrome ล็อกอินโปรไฟล์นี้", UiTheme.Success, 200, 36, true);
            bLoginOne.Location = new Point(312, 442);
            bLoginOne.Click += (s, ev) =>
            {
                saveCurrentRow();
                if (lv.SelectedItems.Count == 0) return;
                ProfileItem p = lv.SelectedItems[0].Tag as ProfileItem;
                if (p != null) OpenLoginForProfile(p);
            };
            card.Controls.Add(bLoginOne);

            Button bRunOne = CreateButton("รันเฉพาะโปรไฟล์นี้", UiTheme.Info, 152, 36, true);
            bRunOne.Location = new Point(522, 442);
            bRunOne.Click += (s, ev) =>
            {
                saveCurrentRow();
                if (lv.SelectedItems.Count == 0) return;
                ProfileItem p = lv.SelectedItems[0].Tag as ProfileItem;
                if (p == null) return;
                if (IsProfileRunning(p))
                {
                    MessageBox.Show(string.Format("โปรไฟล์ \"{0}\" กำลังทำงานอยู่แล้ว", p.Name), "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                StartWorkerForProfile(p);
                populateProfiles(lv.SelectedIndices[0]);
            };
            card.Controls.Add(bRunOne);

            Button bRunAll = CreateButton("รันทุกโปรไฟล์ที่ติ๊ก", UiTheme.Accent, 168, 36, true);
            bRunAll.Location = new Point(684, 442);
            bRunAll.Click += (s, ev) =>
            {
                saveCurrentRow();
                List<ProfileItem> targets = new List<ProfileItem>();
                foreach (var p in profiles)
                {
                    if (p.EnabledForRunAll && !IsProfileRunning(p)) targets.Add(p);
                }
                if (targets.Count == 0)
                {
                    MessageBox.Show("ไม่มีโปรไฟล์ที่ติ๊กเลือกไว้หรือทุกโปรไฟล์กำลังรันอยู่แล้ว", "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                foreach (var p in targets) StartWorkerForProfile(p);
                dlg.Close();
            };
            card.Controls.Add(bRunAll);

            Button bClose = CreateButton("ปิดหน้าต่าง", UiTheme.TextMuted, 120, 34, false);
            bClose.Location = new Point(732, 496);
            bClose.Click += (s, ev) =>
            {
                saveCurrentRow();
                dlg.Close();
            };
            card.Controls.Add(bClose);

            populateProfiles(comboProfile != null && comboProfile.SelectedIndex >= 0 ? comboProfile.SelectedIndex : 0);
            dlg.ShowDialog(this);
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
                        wc.Headers[HttpRequestHeader.CacheControl] = "no-cache";
                        string rawUrl = string.Format("https://raw.githubusercontent.com/{0}/main/version.json?t={1}", GITHUB_REPO, DateTime.UtcNow.Ticks);
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
                    long ticks = DateTime.UtcNow.Ticks;
                    string baseRaw = string.Format("https://raw.githubusercontent.com/{0}/main/", GITHUB_REPO);
                    wc.DownloadFile(baseRaw + "tsu_answers.json?t=" + ticks, Path.Combine(appDir, "tsu_answers.json"));
                    try { wc.DownloadFile(baseRaw + "tsu_missing.json?t=" + ticks, Path.Combine(appDir, "tsu_missing.json")); } catch { }
                    wc.DownloadFile(baseRaw + "cli_worker.js?t=" + ticks, Path.Combine(appDir, "cli_worker.js"));
                    wc.DownloadFile(baseRaw + "worker.js?t=" + ticks, Path.Combine(appDir, "worker.js"));
                    wc.DownloadFile(baseRaw + "db_manager.js?t=" + ticks, Path.Combine(appDir, "db_manager.js"));
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
