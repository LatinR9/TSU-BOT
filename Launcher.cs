// C:\Users\acer\.gemini\antigravity\scratch\elearn_bot\Launcher.cs
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace TSUBotLauncher
{
    static class Program
    {
        private static Process serverProcess;
        private static NotifyIcon trayIcon;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = File.Exists(Path.Combine(appDir, "server.js")) 
                ? Path.Combine(appDir, "server.js") 
                : Path.Combine(appDir, "..", "server.js");

            string workingDir = Path.GetDirectoryName(Path.GetFullPath(serverScript));

            // Find node.exe
            string nodePath = "node.exe";
            if (File.Exists(Path.Combine(appDir, "node.exe")))
            {
                nodePath = Path.Combine(appDir, "node.exe");
            }
            else if (File.Exists(Path.Combine(workingDir, "node.exe")))
            {
                nodePath = Path.Combine(workingDir, "node.exe");
            }
            else if (File.Exists(@"C:\Program Files\nodejs\node.exe"))
            {
                nodePath = @"C:\Program Files\nodejs\node.exe";
            }

            // Start Node.js server
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = "\"" + serverScript + "\"",
                    WorkingDirectory = workingDir,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                serverProcess = Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("ไม่สามารถเริ่ม Node.js ได้: " + ex.Message, "TSU-BOT Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // Wait for server to become responsive
            bool isReady = false;
            for (int i = 0; i < 20; i++)
            {
                Thread.Sleep(300);
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://localhost:3000/");
                    request.Timeout = 500;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        if (response.StatusCode == HttpStatusCode.OK)
                        {
                            isReady = true;
                            break;
                        }
                    }
                }
                catch { }
            }

            // Open dashboard in browser
            try
            {
                Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
            }
            catch { }

            // Create Tray Icon
            ContextMenu contextMenu = new ContextMenu();
            contextMenu.MenuItems.Add("🌐 เปิดแดชบอร์ด (Open Dashboard)", (s, e) => {
                Process.Start(new ProcessStartInfo("http://localhost:3000") { UseShellExecute = true });
            });
            contextMenu.MenuItems.Add("📂 เปิดโฟลเดอร์โปรแกรม", (s, e) => {
                Process.Start("explorer.exe", workingDir);
            });
            contextMenu.MenuItems.Add("-");
            contextMenu.MenuItems.Add("❌ ออกจากโปรแกรม (Exit)", (s, e) => {
                Shutdown();
            });

            trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                ContextMenu = contextMenu,
                Text = "TSU-BOT Pro (http://localhost:3000)",
                Visible = true
            };

            trayIcon.ShowBalloonTip(3000, "⚡ TSU-BOT Pro", "บอทพร้อมทำงานแล้วที่ http://localhost:3000\nคลิกขวาที่ไอคอนตรง Taskbar เพื่อจัดการ", ToolTipIcon.Info);

            Application.ApplicationExit += (s, e) => Shutdown();
            Application.Run();
        }

        private static void Shutdown()
        {
            try
            {
                if (trayIcon != null)
                {
                    trayIcon.Visible = false;
                    trayIcon.Dispose();
                }
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    serverProcess.Kill();
                }
            }
            catch { }
            Application.Exit();
        }
    }
}
