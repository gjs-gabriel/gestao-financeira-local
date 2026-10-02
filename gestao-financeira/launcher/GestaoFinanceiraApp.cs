using System;
using System.IO;
using System.Windows.Forms;

internal sealed class Program
{
    [STAThread]
    static void Main()
    {
        try
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string script = Path.Combine(dir, "start.mjs");
            if (!File.Exists(script))
            {
                script = Path.Combine(dir, "launcher", "src", "main.js");
            }
            if (!File.Exists(script))
            {
                MessageBox.Show(
                    "Não encontrei o aplicativo ao lado deste executável.",
                    "Gestão Financeira",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            string node = FindNode(dir);
            if (node == null)
            {
                MessageBox.Show(
                    "O Node.js não está instalado.\nAbra Instalar.exe primeiro.",
                    "Gestão Financeira",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            Environment.SetEnvironmentVariable("GF_ROOT", dir);
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            shellType.InvokeMember(
                "CurrentDirectory",
                System.Reflection.BindingFlags.SetProperty,
                null,
                shell,
                new object[] { dir });
            string cmd = "\"" + node + "\" \"" + script + "\"";
            shellType.InvokeMember(
                "Run",
                System.Reflection.BindingFlags.InvokeMethod,
                null,
                shell,
                new object[] { cmd, 0, false });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Gestão Financeira", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static string FindNode(string dir)
    {
        string portable = Path.Combine(dir, "runtime", "node", "node.exe");
        if (File.Exists(portable)) return portable;

        string programFiles = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
        string installed = Path.Combine(programFiles, "nodejs", "node.exe");
        if (File.Exists(installed)) return installed;

        string path = Environment.GetEnvironmentVariable("Path") ?? "";
        string[] dirs = path.Split(';');
        for (int i = 0; i < dirs.Length; i++)
        {
            string folder = dirs[i].Trim();
            if (folder.Length == 0) continue;
            try
            {
                string candidate = Path.Combine(folder, "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch (ArgumentException)
            {
            }
        }
        return null;
    }
}
