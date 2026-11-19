// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.DependencyInjection;
using TeaStaff.Core.Abstractions;
using TeaStaff.Infrastructure;
using TeaStaff.Infrastructure.MobileApi;

namespace TeaStaff.Desktop.ViewModels;

public sealed partial class LoginViewModel(IIdentityProvider identity, ITenantContext tenant, AppConfig config) : ObservableObject
{
    [ObservableProperty] private string _userName = "admin";
    [ObservableProperty] private string? _error;
    [ObservableProperty] private bool _isBusy;

    public string ProviderName => identity.Name;
    public string HtxName => config.HtxName;
    public bool IsLocalMode => config.AuthMode == AuthMode.Local;

    public event EventHandler? SignedIn;

    public async Task SignInAsync(string password)
    {
        Error = null;
        if (string.IsNullOrWhiteSpace(UserName) || string.IsNullOrEmpty(password))
        {
            Error = "Vui lòng nhập tên đăng nhập và mật khẩu.";
            return;
        }
        IsBusy = true;
        try
        {
            var result = await identity.SignInAsync(UserName, password);
            if (!result.Success)
            {
                Error = result.Error;
                return;
            }
            tenant.SignIn(result.HtxCode, result.UserName, result.DisplayName);
            SignedIn?.Invoke(this, EventArgs.Empty);
        }
        finally
        {
            IsBusy = false;
        }
    }
}

public sealed record NavItem(string Key, string Label, string Glyph);

public sealed partial class MainViewModel : ObservableObject
{
    private readonly IServiceProvider _services;
    private readonly IDataChangeNotifier _notifier;
    private readonly Dictionary<string, PageViewModel> _pages = new();

    public MainViewModel(IServiceProvider services, ITenantContext tenant, AppConfig config, MobileApiServer api, IDataChangeNotifier notifier)
    {
        _services = services;
        _notifier = notifier;
        Tenant = tenant;
        Config = config;
        Api = api;
        _notifier.Changed += OnDataChanged;
    }

    public ITenantContext Tenant { get; }
    public AppConfig Config { get; }
    public MobileApiServer Api { get; }

    public ObservableCollection<NavItem> Navigation { get; } =
    [
        new("dashboard", "Tổng quan", ""),
        new("employees", "Nhân viên", ""),
        new("departments", "Tổ / Phòng ban", ""),
        new("tasks", "Giao việc", ""),
        new("attendance", "Chấm công", ""),
        new("leaves", "Nghỉ phép", ""),
        new("payroll", "Bảng lương", ""),
        new("settings", "Cài đặt", ""),
    ];

    [ObservableProperty] private PageViewModel? _currentPage;
    [ObservableProperty] private string _currentKey = "dashboard";
    [ObservableProperty] private string _apiStatus = string.Empty;
    [ObservableProperty] private bool _apiRunning;
    [ObservableProperty] private string? _toast;

    public string UserInitialsSource => Tenant.DisplayName;

    public event EventHandler? SignOutRequested;

    public async Task StartAsync()
    {
        if (Config.MobileApi.Enabled) await Api.StartAsync();
        UpdateApiStatus();
        await NavigateAsync("dashboard");
    }

    public void UpdateApiStatus()
    {
        ApiRunning = Api.IsRunning;
        if (Api.IsRunning)
        {
            var ip = MobileApiServer.LocalAddresses().FirstOrDefault() ?? "127.0.0.1";
            ApiStatus = $"Máy chủ cho điện thoại: http://{ip}:{Api.Port}";
        }
        else
        {
            ApiStatus = Api.LastError ?? "Máy chủ cho điện thoại đang tắt";
        }
    }

    [RelayCommand]
    private Task Navigate(string key) => NavigateAsync(key);

    public async Task NavigateAsync(string key)
    {
        CurrentKey = key;
        if (!_pages.TryGetValue(key, out var page))
        {
            page = key switch
            {
                "employees" => _services.GetRequiredService<EmployeesViewModel>(),
                "departments" => _services.GetRequiredService<DepartmentsViewModel>(),
                "tasks" => _services.GetRequiredService<TasksViewModel>(),
                "attendance" => _services.GetRequiredService<AttendanceViewModel>(),
                "leaves" => _services.GetRequiredService<LeavesViewModel>(),
                "payroll" => _services.GetRequiredService<PayrollViewModel>(),
                "settings" => _services.GetRequiredService<SettingsViewModel>(),
                _ => _services.GetRequiredService<DashboardViewModel>(),
            };
            if (page is DashboardViewModel dash) dash.NavigateRequested += async (_, k) => await NavigateAsync(k);
            if (page is SettingsViewModel settings) settings.ApiChanged += (_, _) => UpdateApiStatus();
            _pages[key] = page;
        }
        CurrentPage = page;
        await page.RefreshCommand.ExecuteAsync(null);
    }

    private void OnDataChanged(object? sender, string area) => UiThread.Post(async () =>
    {
        if (CurrentPage is { } page && page.WatchedAreas.Contains(area) && !page.IsBusy)
            await page.RefreshCommand.ExecuteAsync(null);
    });

    public void ShowToast(string message)
    {
        Toast = message;
        _ = Task.Delay(3500).ContinueWith(_ => UiThread.Post(() => { if (Toast == message) Toast = null; }));
    }

    [RelayCommand]
    private void SignOut()
    {
        _notifier.Changed -= OnDataChanged;
        SignOutRequested?.Invoke(this, EventArgs.Empty);
    }
}
