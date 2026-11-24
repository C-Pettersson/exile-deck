# Exile Deck input helper.
# Reads one JSON request per line on stdin, answers one JSON line on stdout.
# Only ever sends keys when a Path of Exile window is in the foreground.
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class PoeKb {
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public INPUTUNION u; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint uCode, uint uMapType);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);

    static INPUT Key(ushort vk, bool up) {
        INPUT i = new INPUT();
        i.type = 1;
        i.u.ki.wVk = vk;
        i.u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
        i.u.ki.dwFlags = up ? 2u : 0u;
        return i;
    }
    static void Send(params INPUT[] a) { SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT))); }
    public static void Tap(ushort vk) { Send(Key(vk, false), Key(vk, true)); }
    public static void Chord(ushort mod, ushort vk) { Send(Key(mod, false), Key(vk, false), Key(vk, true), Key(mod, true)); }
    public static void ReleaseModifiers() {
        ushort[] mods = { 0x10, 0x11, 0x12, 0x5B, 0x5C };
        foreach (ushort m in mods) if ((GetAsyncKeyState(m) & 0x8000) != 0) Send(Key(m, true));
    }
    public static uint ForegroundPid() { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid; }
}
'@

function Get-ClipText {
    for ($i = 0; $i -lt 10; $i++) {
        try {
            if ([System.Windows.Forms.Clipboard]::ContainsText()) { return [System.Windows.Forms.Clipboard]::GetText() }
            return $null
        } catch { Start-Sleep -Milliseconds 25 }
    }
    return $null
}

function Set-ClipText([string]$t) {
    for ($i = 0; $i -lt 10; $i++) {
        try {
            if ([string]::IsNullOrEmpty($t)) { [System.Windows.Forms.Clipboard]::Clear() }
            else { [System.Windows.Forms.Clipboard]::SetText($t) }
            return $true
        } catch { Start-Sleep -Milliseconds 25 }
    }
    return $false
}

function Get-Foreground {
    $procId = [PoeKb]::ForegroundPid()
    try {
        $p = Get-Process -Id $procId -ErrorAction Stop
        return @{ poe = ($p.ProcessName -like 'PathOfExile*'); name = $p.ProcessName }
    } catch { return @{ poe = $false; name = '' } }
}

function Reply($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim() -eq '') { continue }
    try { $req = $line | ConvertFrom-Json } catch { continue }
    $res = @{ id = $req.id; ok = $true }
    try {
        switch ($req.cmd) {
            'ping' { $res.version = $PSVersionTable.PSVersion.ToString() }
            'fg' { $fg = Get-Foreground; $res.poe = $fg.poe; $res.process = $fg.name }
            'copy' {
                $fg = Get-Foreground
                if (-not $fg.poe) { $res.ok = $false; $res.error = 'notpoe'; $res.process = $fg.name; break }
                $prev = Get-ClipText
                [void](Set-ClipText '')
                [PoeKb]::ReleaseModifiers()
                [PoeKb]::Chord(0x11, 0x43)  # Ctrl+C on the hovered item
                $text = $null
                for ($i = 0; $i -lt 25; $i++) {
                    Start-Sleep -Milliseconds 30
                    $text = Get-ClipText
                    if ($text) { break }
                }
                if ($prev) { [void](Set-ClipText $prev) }
                if (-not $text) { $res.ok = $false; $res.error = 'empty' } else { $res.text = $text }
            }
            'chat' {
                $fg = Get-Foreground
                if (-not $fg.poe) { $res.ok = $false; $res.error = 'notpoe'; $res.process = $fg.name; break }
                $prev = Get-ClipText
                if (-not (Set-ClipText ([string]$req.text))) { $res.ok = $false; $res.error = 'clipboard'; break }
                [PoeKb]::ReleaseModifiers()
                [PoeKb]::Tap(0x0D);          Start-Sleep -Milliseconds 45   # Enter: open chat
                [PoeKb]::Chord(0x11, 0x41);  Start-Sleep -Milliseconds 15   # Ctrl+A: clear any channel prefix
                [PoeKb]::Chord(0x11, 0x56);  Start-Sleep -Milliseconds 45   # Ctrl+V: paste the command
                [PoeKb]::Tap(0x0D)                                          # Enter: send
                Start-Sleep -Milliseconds 150
                if ($prev) { [void](Set-ClipText $prev) }
            }
            'search' {
                $fg = Get-Foreground
                if (-not $fg.poe) { $res.ok = $false; $res.error = 'notpoe'; $res.process = $fg.name; break }
                $prev = Get-ClipText
                if (-not (Set-ClipText ([string]$req.text))) { $res.ok = $false; $res.error = 'clipboard'; break }
                [PoeKb]::ReleaseModifiers()
                [PoeKb]::Chord(0x11, 0x46);  Start-Sleep -Milliseconds 45   # Ctrl+F: focus the search box
                [PoeKb]::Chord(0x11, 0x41);  Start-Sleep -Milliseconds 15   # Ctrl+A: replace the old search
                [PoeKb]::Chord(0x11, 0x56)                                  # Ctrl+V: paste. Enter is never sent
                Start-Sleep -Milliseconds 150
                if ($prev) { [void](Set-ClipText $prev) }
            }
            'setclip' { if (-not (Set-ClipText ([string]$req.text))) { $res.ok = $false; $res.error = 'clipboard' } }
            'getclip' { $t = Get-ClipText; if ($t) { $res.text = $t } else { $res.ok = $false; $res.error = 'empty' } }
            default { $res.ok = $false; $res.error = 'unknown command' }
        }
    } catch {
        $res.ok = $false
        $res.error = $_.Exception.Message
    }
    Reply $res
}
