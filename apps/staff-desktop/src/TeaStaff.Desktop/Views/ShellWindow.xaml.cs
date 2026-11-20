// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using TeaStaff.Desktop.ViewModels;

namespace TeaStaff.Desktop.Views;

public partial class ShellWindow : Window
{
    public ShellWindow()
    {
        InitializeComponent();
        DataContextChanged += (_, e) =>
        {
            if (e.NewValue is MainViewModel vm) vm.ActivityArrived += (_, _) => FlashIfInactive();
        };
    }

    /// <summary>Flashes the taskbar button so the owner notices a phone event while working in another app.</summary>
    private void FlashIfInactive()
    {
        if (IsActive) return;
        var info = new FlashInfo
        {
            Size = (uint)Marshal.SizeOf<FlashInfo>(),
            Hwnd = new WindowInteropHelper(this).Handle,
            Flags = 3 | 12, // FLASHW_ALL | FLASHW_TIMERNOFG
            Count = 5,
        };
        FlashWindowEx(ref info);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FlashInfo
    {
        public uint Size;
        public IntPtr Hwnd;
        public uint Flags;
        public uint Count;
        public uint Timeout;
    }

    [DllImport("user32.dll")]
    private static extern bool FlashWindowEx(ref FlashInfo info);
}
