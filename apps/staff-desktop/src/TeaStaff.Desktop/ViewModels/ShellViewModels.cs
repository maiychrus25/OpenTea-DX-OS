// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.DependencyInjection;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;
using TeaStaff.Infrastructure;
using TeaStaff.Infrastructure.MobileApi;
using TeaStaff.Infrastructure.Sync;

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

public sealed partial class NavItem(string key, string label, string glyph) : ObservableObject
{
    public string Key { get; } = key;
    public string Label { get; } = label;
    public string Glyph { get; } = glyph;

    /// <summary>Number shown next to the label (e.g. pending leave requests); 0 hides it.</summary>
    [ObservableProperty] private int _badge;
}

public sealed record ToastMessage(string Text, string Area, DateTime At)
{
    public string Time => At.ToString("HH:mm");
    public string Source => Area == TeaStaff.Core.Abstractions.DataAreas.Automation ? "Tự động hoá" : "Từ điện thoại";
}

public sealed partial class MainViewModel : ObservableObject
{
    private readonly IServiceProvider _services;
    private readonly IDataChangeNotifier _notifier;
    private readonly IActivityFeed _activity;
    private readonly ILeaveRepository _leaves;
    private readonly ITaskRepository _tasks;
    private readonly IAutomationRepository _automation;
    private readonly AutomationEngine _engine;
    private System.Windows.Threading.DispatcherTimer? _timer;
    private readonly Dictionary<string, PageViewModel> _pages = new();

    public MainViewModel(IServiceProvider services, ITenantContext tenant, AppConfig config, MobileApiServer api, IDataChangeNotifier notifier,
        IActivityFeed activity, ILeaveRepository leaves, ITaskRepository tasks, IAutomationRepository automation, AutomationEngine engine)
    {
        _automation = automation;
        _engine = engine;
        _services = services;
        _notifier = notifier;
        _activity = activity;
        _leaves = leaves;
        _tasks = tasks;
        Tenant = tenant;
        Config = config;
        Api = api;
        _notifier.Changed += OnDataChanged;
        _activity.Raised += OnActivity;
    }

    public ITenantContext Tenant { get; }
    public AppConfig Config { get; }
    public MobileApiServer Api { get; }

    public ObservableCollection<NavItem> Navigation { get; } =
    [
        new("dashboard", "Tổng quan", "\uE80F"),
        new("reports", "Báo cáo", "\uE9D2"),
        new("employees", "Nhân viên", "\uE716"),
        new("departments", "Tổ / Phòng ban", "\uE8B7"),
        new("tasks", "Giao việc", "\uE8FD"),
        new("automation", "Tự động hoá", "\uE945"),
        new("attendance", "Chấm công", "\uE787"),
        new("leaves", "Nghỉ phép", "\uE709"),
        new("payroll", "Bảng lương", "\uE8C7"),
        new("settings", "Cài đặt", "\uE713"),
    ];

    /// <summary>Latest events from phones, newest first (at most four on screen).</summary>
    public ObservableCollection<ToastMessage> Toasts { get; } = [];

    [ObservableProperty] private PageViewModel? _currentPage;
    [ObservableProperty] private string _currentKey = "dashboard";
    [ObservableProperty] private string _apiStatus = string.Empty;
    [ObservableProperty] private bool _apiRunning;

    public event EventHandler? SignOutRequested;

    public async Task StartAsync()
    {
        if (Config.MobileApi.Enabled) await Api.StartAsync();
        UpdateApiStatus();
        await UpdateBadgesAsync();
        await NavigateAsync("dashboard");
        StartAutomation();
        _ = _services.GetRequiredService<CoreSyncService>().StartAsync(default);
    }

    /// <summary>Runs the automation rules a few seconds after sign-in and then every minute.</summary>
    private void StartAutomation()
    {
        _timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMinutes(1) };
        _timer.Tick += async (_, _) => await RunAutomationAsync();
        _timer.Start();
        _ = Task.Delay(TimeSpan.FromSeconds(3)).ContinueWith(_ => UiThread.Post(async () => await RunAutomationAsync()));
    }

    private async Task RunAutomationAsync()
    {
        try
        {
            await Task.Run(() => _engine.RunAsync());
            await UpdateBadgesAsync();
        }
        catch (Exception)
        {
            // A failing rule (for example a database hiccup) is retried on the next tick.
        }
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
                "reports" => _services.GetRequiredService<ReportsViewModel>(),
                "employees" => _services.GetRequiredService<EmployeesViewModel>(),
                "departments" => _services.GetRequiredService<DepartmentsViewModel>(),
                "tasks" => _services.GetRequiredService<TasksViewModel>(),
                "attendance" => _services.GetRequiredService<AttendanceViewModel>(),
                "leaves" => _services.GetRequiredService<LeavesViewModel>(),
                "payroll" => _services.GetRequiredService<PayrollViewModel>(),
                "settings" => _services.GetRequiredService<SettingsViewModel>(),
                "automation" => _services.GetRequiredService<AutomationViewModel>(),
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
        if (area is DataAreas.Leaves or DataAreas.Tasks or DataAreas.Automation) await UpdateBadgesAsync();
        if (CurrentPage is { } page && page.WatchedAreas.Contains(area) && !page.IsBusy)
            await page.RefreshCommand.ExecuteAsync(null);
    });

    private async Task UpdateBadgesAsync()
    {
        try
        {
            var pending = (await _leaves.ListAsync()).Count(l => l.Status == LeaveStatus.Pending);
            var rejected = (await _tasks.ListAsync()).Count(t => t.Status == WorkTaskStatus.Rejected || t.IsOverdue(DateTime.Now));
            Navigation.First(n => n.Key == "leaves").Badge = pending;
            Navigation.First(n => n.Key == "tasks").Badge = rejected;
            Navigation.First(n => n.Key == "automation").Badge = (await _automation.ListSuggestionsAsync(SuggestionStatus.Pending)).Count;
        }
        catch (Exception)
        {
            // Badges are a convenience; a transient database error must not break the shell.
        }
    }

    /// <summary>Shows what staff did on their phones, plays the system notification sound and flashes the taskbar.</summary>
    private void OnActivity(object? sender, ActivityEvent e) => UiThread.Post(() =>
    {
        var toast = new ToastMessage(e.Message, e.Area, DateTime.Now);
        Toasts.Insert(0, toast);
        while (Toasts.Count > 4) Toasts.RemoveAt(Toasts.Count - 1);
        System.Media.SystemSounds.Asterisk.Play();
        ActivityArrived?.Invoke(this, EventArgs.Empty);
        _ = Task.Delay(TimeSpan.FromSeconds(8)).ContinueWith(_ => UiThread.Post(() => Toasts.Remove(toast)));
    });

    public event EventHandler? ActivityArrived;

    [RelayCommand]
    private async Task OpenToast(ToastMessage? toast)
    {
        if (toast is null) return;
        Toasts.Remove(toast);
        await NavigateAsync(toast.Area switch
        {
            DataAreas.Leaves => "leaves",
            DataAreas.Tasks => "tasks",
            DataAreas.Attendance => "attendance",
            DataAreas.Automation => "automation",
            _ => "dashboard",
        });
    }

    [RelayCommand]
    private void DismissToast(ToastMessage? toast)
    {
        if (toast is not null) Toasts.Remove(toast);
    }

    [RelayCommand]
    private void SignOut()
    {
        _timer?.Stop();
        _ = _services.GetRequiredService<CoreSyncService>().StopAsync(default);
        _notifier.Changed -= OnDataChanged;
        _activity.Raised -= OnActivity;
        SignOutRequested?.Invoke(this, EventArgs.Empty);
    }
}