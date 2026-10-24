using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public class Program
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    private const int SW_MAXIMIZE = 3;
    private const int PORT = 5210;
    private const string APP_URL = "http://127.0.0.1:5210";

    private static bool IsPortOpen()
    {
        try
        {
            using (TcpClient client = new TcpClient())
            {
                IAsyncResult result = client.BeginConnect("127.0.0.1", PORT, null, null);
                bool success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(200));
                if (!success) return false;
                client.EndConnect(result);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    private static IntPtr FindOpenCodeAppWindow()
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam)
        {
            if (!IsWindowVisible(hWnd)) return true;

            StringBuilder cls = new StringBuilder(128);
            GetClassName(hWnd, cls, cls.Capacity);
            if (cls.ToString() != "Chrome_WidgetWin_1") return true;

            uint pid = 0;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == 0) return true;
            try
            {
                Process p = Process.GetProcessById((int)pid);
                string pname = p.ProcessName.ToLowerInvariant();
                if (pname != "msedge" && pname != "chrome") return true;
            }
            catch
            {
                return true;
            }

            StringBuilder sb = new StringBuilder(512);
            if (GetWindowText(hWnd, sb, sb.Capacity) > 0)
            {
                string title = sb.ToString();
                // \u5168\u666f\u7ba1\u7406 = 全景管理, \u30d1\u30ce\u30e9\u30de = パノラマ
                if (title.IndexOf("OpenCode \u5168\u666f\u7ba1\u7406", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("OpenCode Panorama Manager", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("OpenCode \u30d1\u30ce\u30e9\u30de", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("127.0.0.1:5210", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    found = hWnd;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    [STAThread]
    public static void Main()
    {
        try
        {
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string workDir = Path.Combine(userProfile, @".config\opencode\opencode-manager");
            string appScript = Path.Combine(workDir, "app.mjs");

            // 1. Ensure Backend HTTP Server is running on 127.0.0.1:5210
            if (!IsPortOpen())
            {
                string nodeExe = "node.exe";
                string progFilesNode = @"C:\Program Files\nodejs\node.exe";
                if (File.Exists(progFilesNode))
                {
                    nodeExe = progFilesNode;
                }

                ProcessStartInfo nodePsi = new ProcessStartInfo();
                nodePsi.FileName = nodeExe;
                nodePsi.Arguments = "\"" + appScript + "\" --server-only";
                nodePsi.WorkingDirectory = workDir;
                nodePsi.CreateNoWindow = true;
                nodePsi.UseShellExecute = false;
                nodePsi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(nodePsi);

                for (int i = 0; i < 40; i++)
                {
                    if (IsPortOpen()) break;
                    Thread.Sleep(150);
                }
            }

            // 2. Launch Edge or Chrome in --app mode unconditionally
            string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
            string edgePath64 = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
            string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string chromePathUser = Path.Combine(localAppData, @"Google\Chrome\Application\chrome.exe");

            string browserExe = null;
            if (File.Exists(edgePath)) browserExe = edgePath;
            else if (File.Exists(edgePath64)) browserExe = edgePath64;
            else if (File.Exists(chromePath)) browserExe = chromePath;
            else if (File.Exists(chromePathUser)) browserExe = chromePathUser;

            if (browserExe != null)
            {
                ProcessStartInfo browserPsi = new ProcessStartInfo();
                browserPsi.FileName = browserExe;
                browserPsi.Arguments = "--app=" + APP_URL + " --start-maximized";
                browserPsi.UseShellExecute = true;
                browserPsi.WindowStyle = ProcessWindowStyle.Maximized;
                Process.Start(browserPsi);

                // Poll for the Chrome_WidgetWin_1 app window and force Win32 SW_MAXIMIZE + SetForegroundWindow
                for (int i = 0; i < 40; i++)
                {
                    Thread.Sleep(150);
                    IntPtr hWnd = FindOpenCodeAppWindow();
                    if (hWnd != IntPtr.Zero)
                    {
                        ShowWindow(hWnd, SW_MAXIMIZE);
                        SetForegroundWindow(hWnd);
                        Thread.Sleep(250);
                        ShowWindow(hWnd, SW_MAXIMIZE);
                        break;
                    }
                }
            }
            else
            {
                Process.Start(APP_URL);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "OpenCode Manager Launch Error: " + ex.Message,
                "OpenCode Manager",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
