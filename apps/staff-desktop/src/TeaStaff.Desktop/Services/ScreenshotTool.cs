// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
using TeaStaff.Core.Abstractions;
using TeaStaff.Desktop.ViewModels;
using TeaStaff.Desktop.Views;
using TeaStaff.Infrastructure.Persistence;

namespace TeaStaff.Desktop.Services;

/// <summary>
/// Renders every screen to PNG for documentation and visual regression checks:
/// <c>TeaStaffManager.exe --screenshots docs/screenshots</c>. Signs in with the demo owner account.
/// </summary>
public static class ScreenshotTool
{
    public static async Task RunAsync(IServiceProvider services, string folder)
    {
        Directory.CreateDirectory(folder);

        var login = new LoginWindow { DataContext = services.GetRequiredService<LoginViewModel>(), WindowStartupLocation = WindowStartupLocation.Manual, Left = 0, Top = 0 };
        login.Show();
        await Settle();
        Save(login, Path.Combine(folder, "00-login.png"));
        login.Close();

        var owner = await services.GetRequiredService<IOwnerAccountRepository>().FindAsync(DatabaseInitializer.DefaultOwnerUser);
        services.GetRequiredService<ITenantContext>().SignIn(owner?.HtxCode ?? "TC", owner?.Username ?? "admin", owner?.DisplayName ?? "Chủ nhiệm HTX");

        var vm = services.GetRequiredService<MainViewModel>();
        var shell = new ShellWindow
        {
            DataContext = vm, WindowState = WindowState.Normal, Width = 1440, Height = 900,
            WindowStartupLocation = WindowStartupLocation.Manual, Left = 0, Top = 0,
        };
        shell.Show();
        await vm.StartAsync();
        var index = 1;
        foreach (var item in vm.Navigation)
        {
            await vm.NavigateAsync(item.Key);
            await Settle();
            Save(shell, Path.Combine(folder, $"{index++:00}-{item.Key}.png"));
        }
        shell.Close();
    }

    private static async Task Settle()
    {
        await Task.Delay(700);
        await Application.Current.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
    }

    private static void Save(Window window, string path)
    {
        var content = (FrameworkElement)window.Content;
        var dpi = VisualTreeHelper.GetDpi(window);
        var bitmap = new RenderTargetBitmap(
            (int)(content.ActualWidth * dpi.DpiScaleX), (int)(content.ActualHeight * dpi.DpiScaleY),
            dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
        var background = new DrawingVisual();
        using (var ctx = background.RenderOpen())
            ctx.DrawRectangle(window.Background, null, new Rect(0, 0, content.ActualWidth, content.ActualHeight));
        bitmap.Render(background);
        bitmap.Render(content);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));
        using var stream = File.Create(path);
        encoder.Save(stream);
    }
}
