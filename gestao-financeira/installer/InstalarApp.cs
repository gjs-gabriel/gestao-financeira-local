using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

internal sealed class InstallForm : Form
{
    const string ModelName = "qwen2.5:1.5b";
    const int MinNodeMajor = 20;

    readonly Label statusLabel;
    readonly ProgressBar progress;
    readonly Button closeButton;
    readonly StringBuilder log = new StringBuilder();

    InstallForm()
    {
        Text = "Gestão Financeira — Instalação";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new System.Drawing.Size(520, 320);
        Font = new System.Drawing.Font("Segoe UI", 10f);

        var title = new Label();
        title.AutoSize = false;
        title.Left = 20;
        title.Top = 16;
        title.Width = 480;
        title.Height = 28;
        title.Text = "Instalando o que o aplicativo precisa";
        Controls.Add(title);

        statusLabel = new Label();
        statusLabel.AutoSize = false;
        statusLabel.Left = 20;
        statusLabel.Top = 52;
        statusLabel.Width = 480;
        statusLabel.Height = 190;
        statusLabel.Text = "Preparando…";
        Controls.Add(statusLabel);

        progress = new ProgressBar();
        progress.Left = 20;
        progress.Top = 252;
        progress.Width = 480;
        progress.Height = 18;
        progress.Style = ProgressBarStyle.Marquee;
        Controls.Add(progress);

        closeButton = new Button();
        closeButton.Text = "Fechar";
        closeButton.Left = 400;
        closeButton.Top = 278;
        closeButton.Width = 100;
        closeButton.Enabled = false;
        closeButton.Click += delegate { Close(); };
        Controls.Add(closeButton);

        Shown += OnShown;
    }

    async void OnShown(object sender, EventArgs e)
    {
        try
        {
            await Task.Factory.StartNew(RunInstall);
            Step("Instalação concluída. Abra Gestão Financeira.exe ou o atalho na área de trabalho.");
        }
        catch (Exception ex)
        {
            Step("Falha: " + ex.Message);
        }
        finally
        {
            progress.Style = ProgressBarStyle.Continuous;
            progress.Value = 100;
            closeButton.Enabled = true;
        }
    }

    void Step(string text)
    {
        log.AppendLine(text);
        string snapshot = log.ToString();
        if (statusLabel.InvokeRequired)
        {
            statusLabel.Invoke(new Action<string>(SetStatusText), new object[] { snapshot });
            return;
        }
        SetStatusText(snapshot);
    }

    void SetStatusText(string text)
    {
        statusLabel.Text = text;
    }

    void RunInstall()
    {
        RefreshPath();
        string appExe = Path.Combine(AppDir(), "GestaoFinanceira.exe");
        if (!File.Exists(appExe))
        {
            throw new InvalidOperationException("GestaoFinanceira.exe não está ao lado do instalador.");
        }

        if (NodeOk())
        {
            Step("Node.js e npm já estão utilizáveis.");
        }
        else
        {
            Step("Instalando Node.js LTS (inclui npm)…");
            WingetInstall("OpenJS.NodeJS.LTS");
            RefreshPath();
            if (!NodeOk())
            {
                throw new InvalidOperationException("Node.js LTS (com npm) não ficou disponível. Abra Instalar.exe de novo.");
            }
            Step("Node.js e npm instalados.");
        }

        if (FindOllamaExe() != null)
        {
            Step("Ollama já está instalado.");
        }
        else
        {
            Step("Instalando Ollama…");
            WingetInstall("Ollama.Ollama");
            RefreshPath();
            if (FindOllamaExe() == null)
            {
                throw new InvalidOperationException("Ollama não ficou disponível. Abra Instalar.exe de novo.");
            }
            Step("Ollama instalado.");
        }

        EnsureOllama();

        string ollama = FindOllamaExe();
        if (ollama == null)
        {
            throw new InvalidOperationException("ollama.exe não encontrado.");
        }

        if (ModelPresent(ollama))
        {
            Step("Modelo " + ModelName + " já está instalado.");
        }
        else
        {
            Step("Baixando o modelo " + ModelName + " (pode demorar)…");
            int code = RunWait(ollama, "pull " + ModelName);
            if (code != 0)
            {
                throw new InvalidOperationException("Não foi possível baixar o modelo " + ModelName + ".");
            }
            Step("Modelo " + ModelName + " instalado.");
        }

        CreateShortcut(appExe);
        Step("Atalho criado na área de trabalho.");
    }

    static string AppDir()
    {
        return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    static void RefreshPath()
    {
        string machine = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.Machine) ?? "";
        string user = Environment.GetEnvironmentVariable("Path", EnvironmentVariableTarget.User) ?? "";
        Environment.SetEnvironmentVariable("Path", machine + ";" + user);
    }

    static bool NodeOk()
    {
        string node = FindNodeExe();
        if (node == null) return false;
        string npm = Path.Combine(Path.GetDirectoryName(node), "npm.cmd");
        if (!File.Exists(npm)) return false;
        string raw = RunCapture(node, "-v");
        Match match = Regex.Match(raw ?? "", @"v(\d+)");
        if (!match.Success) return false;
        if (int.Parse(match.Groups[1].Value) < MinNodeMajor) return false;
        return RunWait(npm, "-v") == 0;
    }

    static string FindNodeExe()
    {
        string programFiles = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
        string bundled = Path.Combine(programFiles, "nodejs", "node.exe");
        if (File.Exists(bundled)) return bundled;
        return FindOnPath("node.exe");
    }

    static string FindOllamaExe()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string userExe = Path.Combine(local, "Programs", "Ollama", "ollama.exe");
        if (File.Exists(userExe)) return userExe;
        string programFiles = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
        string systemExe = Path.Combine(programFiles, "Ollama", "ollama.exe");
        if (File.Exists(systemExe)) return systemExe;
        return FindOnPath("ollama.exe");
    }

    static string FindOllamaApp()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string userApp = Path.Combine(local, "Programs", "Ollama", "ollama app.exe");
        if (File.Exists(userApp)) return userApp;
        string programFiles = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
        string systemApp = Path.Combine(programFiles, "Ollama", "ollama app.exe");
        if (File.Exists(systemApp)) return systemApp;
        return null;
    }

    static string FindWinget()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string alias = Path.Combine(local, "Microsoft", "WindowsApps", "winget.exe");
        if (File.Exists(alias)) return alias;
        return FindOnPath("winget.exe");
    }

    static string FindOnPath(string fileName)
    {
        string path = Environment.GetEnvironmentVariable("Path") ?? "";
        string[] dirs = path.Split(';');
        for (int i = 0; i < dirs.Length; i++)
        {
            string dir = dirs[i].Trim();
            if (dir.Length == 0) continue;
            try
            {
                string candidate = Path.Combine(dir, fileName);
                if (File.Exists(candidate)) return candidate;
            }
            catch (ArgumentException)
            {
            }
        }
        return null;
    }

    static void WingetInstall(string id)
    {
        string winget = FindWinget();
        if (winget == null)
        {
            throw new InvalidOperationException("winget não encontrado. Instale o App Installer pela Microsoft Store e abra Instalar.exe de novo.");
        }
        RunWait(winget, "install --id " + id + " -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity");
    }

    static void EnsureOllama()
    {
        if (OllamaUp())
        {
            return;
        }
        string app = FindOllamaApp();
        if (app != null)
        {
            StartHidden(app, "");
        }
        else
        {
            string exe = FindOllamaExe();
            if (exe == null)
            {
                throw new InvalidOperationException("Ollama instalado, mas o executável não foi encontrado.");
            }
            StartHidden(exe, "serve");
        }
        if (!WaitOllama(90))
        {
            throw new InvalidOperationException("Ollama não respondeu em 127.0.0.1:11434.");
        }
    }

    static bool WaitOllama(int seconds)
    {
        DateTime deadline = DateTime.UtcNow.AddSeconds(seconds);
        while (DateTime.UtcNow < deadline)
        {
            if (OllamaUp()) return true;
            Thread.Sleep(1000);
        }
        return false;
    }

    static bool OllamaUp()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:11434/api/tags");
            request.Timeout = 3000;
            request.Method = "GET";
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                return (int)response.StatusCode < 500;
            }
        }
        catch (WebException)
        {
            return false;
        }
    }

    static bool ModelPresent(string ollamaExe)
    {
        string output = RunCapture(ollamaExe, "list");
        return output != null && output.IndexOf(ModelName, StringComparison.OrdinalIgnoreCase) >= 0;
    }

    static void CreateShortcut(string exePath)
    {
        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string lnk = Path.Combine(desktop, "Gestão Financeira.lnk");
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember(
            "CreateShortcut",
            System.Reflection.BindingFlags.InvokeMethod,
            null,
            shell,
            new object[] { lnk });
        Type shortcutType = shortcut.GetType();
        SetProp(shortcutType, shortcut, "TargetPath", exePath);
        SetProp(shortcutType, shortcut, "WorkingDirectory", Path.GetDirectoryName(exePath));
        SetProp(shortcutType, shortcut, "Description", "Gestão Financeira");
        SetProp(shortcutType, shortcut, "WindowStyle", 1);
        shortcutType.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, shortcut, null);
    }

    static void SetProp(Type type, object target, string name, object value)
    {
        type.InvokeMember(name, System.Reflection.BindingFlags.SetProperty, null, target, new object[] { value });
    }

    static void StartHidden(string file, string args)
    {
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = file;
        info.Arguments = args ?? "";
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.WindowStyle = ProcessWindowStyle.Hidden;
        Process.Start(info);
    }

    static int RunWait(string file, string args)
    {
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = file;
        info.Arguments = args ?? "";
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        using (Process process = Process.Start(info))
        {
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    static string RunCapture(string file, string args)
    {
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = file;
        info.Arguments = args ?? "";
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;
        using (Process process = Process.Start(info))
        {
            string stdout = process.StandardOutput.ReadToEnd();
            string stderr = process.StandardError.ReadToEnd();
            process.WaitForExit();
            return (stdout ?? "") + (stderr ?? "");
        }
    }

    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallForm());
    }
}
