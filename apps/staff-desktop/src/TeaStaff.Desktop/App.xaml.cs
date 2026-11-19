// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Markup;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
using TeaStaff.Desktop.Services;
using TeaStaff.Desktop.ViewModels;
using TeaStaff.Desktop.Views;
using TeaStaff.Infrastructure;
using TeaStaff.Infrastructure.MobileApi;
using TeaStaff.Infrastructure.Persistence;

namespace TeaStaff.Desktop;

public partial class App : Application
{
    private ServiceProvider? _services;
    private Window? _shell;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var vi = CultureInfo.GetCultureInfo("vi-VN");
        CultureInfo.DefaultThreadCurrentCulture = vi;
        CultureInfo.DefaultThreadCurrentUICulture = vi;
        Thread.CurrentThread.CurrentCulture = vi;
        Thread.CurrentThread.CurrentUICulture = vi;
        FrameworkElement.LanguageProperty.OverrideMetadata(typeof(FrameworkElement),
            new FrameworkPropertyMetadata(XmlLanguage.GetLanguage(vi.IetfLanguageTag)));
        DispatcherUnhandledException += OnUnhandled;

        var scriptIndex = Array.IndexOf(e.Args, "--postgres-script");
        if (scriptIndex >= 0 && scriptIndex + 1 < e.Args.Length)
        {
            File.WriteAllText(e.Args[scriptIndex + 1], SchemaScript.ForPostgres());
            Shutdown();
            return;
        }

        var config = AppConfig.Load();
        if (!File.Exists(AppConfig.FilePath)) config.Save();

        var services = new ServiceCollection();
        services.AddTeaStaffInfrastructure(config);
        services.AddSingleton<IDialogService, DialogService>();
        services.AddTransient<LoginViewModel>();
        services.AddTransient<MainViewModel>();
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<EmployeesViewModel>();
        services.AddTransient<DepartmentsViewModel>();
        services.AddTransient<TasksViewModel>();
        services.AddTransient<AttendanceViewModel>();
        services.AddTransient<LeavesViewModel>();
        services.AddTransient<PayrollViewModel>();
        services.AddTransient<SettingsViewModel>();
        _services = services.BuildServiceProvider();

        try
        {
            await _services.GetRequiredService<DatabaseInitializer>().InitializeAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Không mở được cơ sở dữ liệu ({config.Database.Provider}).\n\n{ex.Message}\n\nCấu hình: {AppConfig.FilePath}",
                "Tea Staff Manager", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
            return;
        }

        var shotIndex = Array.IndexOf(e.Args, "--screenshots");
        if (shotIndex >= 0 && shotIndex + 1 < e.Args.Length)
        {
            await ScreenshotTool.RunAsync(_services, e.Args[shotIndex + 1]);
            Shutdown();
            return;
        }

        if (e.Args.Contains("--serve"))
        {
            // Headless mode: only the staff mobile API runs (e.g. on an always-on office PC). Stop it from Task Manager.
            var api = _services.GetRequiredService<MobileApiServer>();
            if (!await api.StartAsync())
            {
                MessageBox.Show(api.LastError, "Tea Staff Manager", MessageBoxButton.OK, MessageBoxImage.Error);
                Shutdown(1);
            }
            return;
        }

        ShowLogin();
    }

    private void ShowLogin()
    {
        var vm = _services!.GetRequiredService<LoginViewModel>();
        var login = new LoginWindow { DataContext = vm };
        var signedIn = false;
        vm.SignedIn += async (_, _) =>
        {
            signedIn = true;
            var shellVm = _services!.GetRequiredService<MainViewModel>();
            var shell = new ShellWindow { DataContext = shellVm };
            var signingOut = false;
            shellVm.SignOutRequested += async (_, _) =>
            {
                signingOut = true;
                await _services!.GetRequiredService<MobileApiServer>().StopAsync();
                ShowLogin();
                shell.Close();
            };
            shell.Closed += (_, _) => { if (!signingOut) Shutdown(); };
            _shell = shell;
            MainWindow = shell;
            shell.Show();
            login.Close();
            await shellVm.StartAsync();
        };
        login.Closed += (_, _) => { if (!signedIn) Shutdown(); };
        MainWindow = login;
        login.Show();
    }

    private void OnUnhandled(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        MessageBox.Show("Đã xảy ra lỗi không mong muốn:\n\n" + e.Exception.Message, "Tea Staff Manager", MessageBoxButton.OK, MessageBoxImage.Warning);
        e.Handled = true;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (_services is not null)
        {
            var api = _services.GetRequiredService<MobileApiServer>();
            Task.Run(api.StopAsync).Wait(TimeSpan.FromSeconds(3));
            _services.Dispose();
        }
        base.OnExit(e);
    }
}
