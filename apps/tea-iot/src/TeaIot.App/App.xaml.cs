// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using TeaIot.App.ViewModels;
using TeaIot.App.Views;

namespace TeaIot.App;

public partial class App : Application
{
    private MainViewModel? _vm;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(args.Exception.Message, "Tea IoT Station", MessageBoxButton.OK, MessageBoxImage.Warning);
            args.Handled = true;
        };
        _vm = new MainViewModel();
        var window = new MainWindow { DataContext = _vm };
        MainWindow = window;
        window.Show();

        // --screenshot <file.png>: renders the console once (used for the README and visual checks).
        var i = Array.IndexOf(e.Args, "--screenshot");
        if (i >= 0 && i + 1 < e.Args.Length)
        {
            window.Width = 1440;
            window.Height = 900;
            for (var n = 0; n < 6; n++) await _vm.StepCommand.ExecuteAsync(null);
            await Task.Delay(800);
            await Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
            Save(window, e.Args[i + 1]);
            Shutdown();
        }
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        if (_vm is not null) await _vm.DisposeAsync();
        base.OnExit(e);
    }

    private static void Save(Window window, string path)
    {
        var content = (FrameworkElement)window.Content;
        var dpi = VisualTreeHelper.GetDpi(window);
        var bitmap = new RenderTargetBitmap((int)(content.ActualWidth * dpi.DpiScaleX), (int)(content.ActualHeight * dpi.DpiScaleY),
            dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
        var background = new DrawingVisual();
        using (var ctx = background.RenderOpen()) ctx.DrawRectangle(window.Background, null, new Rect(0, 0, content.ActualWidth, content.ActualHeight));
        bitmap.Render(background);
        bitmap.Render(content);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        using var stream = File.Create(path);
        encoder.Save(stream);
    }
}
