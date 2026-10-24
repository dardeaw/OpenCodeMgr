using System;
using System.Diagnostics;
using System.IO;

public class Program
{
    [STAThread]
    public static void Main()
    {
        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string workDir = Path.Combine(userProfile, @".config\opencode\opencode-manager");
        string appScript = Path.Combine(workDir, "app.mjs");

        string nodeExe = "node.exe";
        string progFilesNode = @"C:\Program Files\nodejs\node.exe";
        if (File.Exists(progFilesNode))
        {
            nodeExe = progFilesNode;
        }

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = nodeExe;
        psi.Arguments = "\"" + appScript + "\"";
        psi.WorkingDirectory = workDir;
        psi.CreateNoWindow = true;
        psi.UseShellExecute = false;
        psi.WindowStyle = ProcessWindowStyle.Hidden;

        try
        {
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            // Fallback message box
            System.Windows.Forms.MessageBox.Show(
                "OpenCode Manager 啟動失敗: " + ex.Message,
                "OpenCode Manager",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Error
            );
        }
    }
}
