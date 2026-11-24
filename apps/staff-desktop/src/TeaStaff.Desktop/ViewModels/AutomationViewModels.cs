// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;
using TeaStaff.Desktop.Services;

namespace TeaStaff.Desktop.ViewModels;

public sealed class SuggestionRow(AutomationSuggestion s)
{
    public AutomationSuggestion Suggestion { get; } = s;
    public string Title => Suggestion.Title;
    public IReadOnlyList<string> Facts { get; } = (s.Detail ?? string.Empty).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    public string KindLabel => Suggestion.Kind switch
    {
        SuggestionKind.AssignRecurring => "Việc định kỳ",
        SuggestionKind.ReassignRejected => "Việc bị từ chối",
        SuggestionKind.ReassignLeave => "Người nhận nghỉ phép",
        _ => "Gợi ý",
    };
    public string Time => Suggestion.CreatedAt.ToLocalTime().ToString("HH:mm dd/MM");
}

public sealed class TemplateRow(RecurringTask t)
{
    private static readonly string[] DayNames = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];

    public RecurringTask Template { get; } = t;
    public string Title => Template.Title;
    public string DaysText => Template.Days.Count == 7 ? "Hằng ngày" : string.Join(" ", Template.Days.OrderBy(d => d).Select(d => DayNames[d]));
    public string TimeText => $"{TimeSpan.FromMinutes(Template.StartMinute):hh\\:mm}–{TimeSpan.FromMinutes(Template.DueMinute):hh\\:mm}";
    public string AssigneeText => Template.PreferredAssignee?.FullName ?? (Template.Department is { } d ? $"Người hợp nhất trong {d.Name}" : "Người hợp nhất");
    public string ModeText => Template.AutoAssign ? "Tự giao" : Template.PreferredAssigneeId is not null ? "Giao người phụ trách" : "Chờ chủ duyệt";
    public bool IsActive => Template.IsActive;
    public string? Location => Template.Location;
}

public sealed record LogRow(string Rule, string Message, DateTime At)
{
    public string Time => At.ToLocalTime().ToString("HH:mm dd/MM");
}

public sealed partial class AutomationViewModel(IDialogService dialogs, AutomationEngine engine, IAutomationRepository store, IRecurringTaskRepository templates,
    IEmployeeRepository employees, IDepartmentRepository departments, ITenantContext tenant, IClock clock) : PageViewModel(dialogs)
{
    private bool _loading;

    public override string Title => "Tự động hoá";
    public override string Subtitle => "Việc lặp lại tự sinh, gợi ý người hợp việc kèm lý do; anh chị chỉ cần bấm Đồng ý.";
    public override IReadOnlyCollection<string> WatchedAreas => [DataAreas.Automation, DataAreas.Tasks, DataAreas.Leaves];

    public ObservableCollection<SuggestionRow> Suggestions { get; } = [];
    public ObservableCollection<TemplateRow> Templates { get; } = [];
    public ObservableCollection<LogRow> Logs { get; } = [];

    [ObservableProperty] private int _pendingCount;
    [ObservableProperty] private int _actionsToday;
    [ObservableProperty] private int _activeTemplates;
    [ObservableProperty] private string _lastRun = "Chưa chạy";

    [ObservableProperty] private bool _generateRecurring;
    [ObservableProperty] private bool _autoReassignRejected;
    [ObservableProperty] private bool _coverLeave;
    [ObservableProperty] private bool _autoApproveShortLeave;
    [ObservableProperty] private bool _autoCheckOut;
    [ObservableProperty] private bool _warnOverdue;
    [ObservableProperty] private bool _draftPayroll;

    partial void OnGenerateRecurringChanged(bool value) => SaveSettings();
    partial void OnAutoReassignRejectedChanged(bool value) => SaveSettings();
    partial void OnCoverLeaveChanged(bool value) => SaveSettings();
    partial void OnAutoApproveShortLeaveChanged(bool value) => SaveSettings();
    partial void OnAutoCheckOutChanged(bool value) => SaveSettings();
    partial void OnWarnOverdueChanged(bool value) => SaveSettings();
    partial void OnDraftPayrollChanged(bool value) => SaveSettings();

    private async void SaveSettings()
    {
        if (_loading) return;
        await RunAsync(() => engine.SaveSettingsAsync(new AutomationSettings
        {
            GenerateRecurring = GenerateRecurring, AutoReassignRejected = AutoReassignRejected, CoverLeave = CoverLeave,
            AutoApproveShortLeave = AutoApproveShortLeave, AutoCheckOut = AutoCheckOut, WarnOverdue = WarnOverdue, DraftPayroll = DraftPayroll,
        }));
    }

    public override async Task LoadAsync()
    {
        _loading = true;
        try
        {
            var s = await engine.GetSettingsAsync();
            GenerateRecurring = s.GenerateRecurring;
            AutoReassignRejected = s.AutoReassignRejected;
            CoverLeave = s.CoverLeave;
            AutoApproveShortLeave = s.AutoApproveShortLeave;
            AutoCheckOut = s.AutoCheckOut;
            WarnOverdue = s.WarnOverdue;
            DraftPayroll = s.DraftPayroll;
        }
        finally
        {
            _loading = false;
        }

        Suggestions.Clear();
        foreach (var s in await store.ListSuggestionsAsync(SuggestionStatus.Pending)) Suggestions.Add(new SuggestionRow(s));
        Templates.Clear();
        foreach (var t in await templates.ListAsync()) Templates.Add(new TemplateRow(t));
        Logs.Clear();
        var logs = await store.ListLogsAsync(40);
        foreach (var l in logs) Logs.Add(new LogRow(l.Rule, l.Message, l.CreatedAt));

        var today = clock.Now.Date;
        PendingCount = Suggestions.Count;
        ActionsToday = logs.Count(l => l.CreatedAt.ToLocalTime().Date == today);
        ActiveTemplates = Templates.Count(t => t.IsActive);
    }

    [RelayCommand]
    private Task RunNow() => RunAsync(async () =>
    {
        var r = await engine.RunAsync();
        LastRun = $"Lần chạy {clock.Now:HH:mm}: {r.Actions} việc đã làm, {r.Suggestions} gợi ý mới";
        await LoadAsync();
    });

    [RelayCommand]
    private Task Accept(SuggestionRow? row) => row is null ? Task.CompletedTask : RunAsync(async () =>
    {
        await engine.AcceptAsync(row.Suggestion.Id, tenant.DisplayName);
        await LoadAsync();
    });

    [RelayCommand]
    private Task Dismiss(SuggestionRow? row) => row is null ? Task.CompletedTask : RunAsync(async () =>
    {
        await engine.DismissAsync(row.Suggestion.Id, tenant.DisplayName);
        await LoadAsync();
    });

    [RelayCommand]
    private async Task AddTemplate()
    {
        if (await OpenEditorAsync(new RecurringTask())) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task EditTemplate(TemplateRow? row)
    {
        if (row is null) return;
        var fresh = await templates.GetAsync(row.Template.Id);
        if (fresh is not null && await OpenEditorAsync(fresh)) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task DeleteTemplate(TemplateRow? row)
    {
        if (row is null) return;
        if (!Dialogs.Confirm("Xoá việc định kỳ", $"Xoá \"{row.Title}\"? Các việc đã giao trước đó vẫn giữ nguyên.", "Xoá", danger: true)) return;
        await RunAsync(async () =>
        {
            await templates.DeleteAsync(row.Template.Id);
            await LoadAsync();
        });
    }

    [RelayCommand]
    private Task ToggleTemplate(TemplateRow? row) => row is null ? Task.CompletedTask : RunAsync(async () =>
    {
        var fresh = await templates.GetAsync(row.Template.Id);
        if (fresh is null) return;
        fresh.IsActive = !fresh.IsActive;
        await templates.SaveAsync(fresh);
        await LoadAsync();
    });

    private async Task<bool> OpenEditorAsync(RecurringTask template)
    {
        var staff = (await employees.ListAsync()).Where(e => e.IsActive || e.Id == template.PreferredAssigneeId).ToList();
        return Dialogs.ShowEditor(new RecurringTaskEditorViewModel(templates, staff, await departments.ListAsync(), template));
    }
}

public sealed partial class DayOption(int day, string label, bool selected) : ObservableObject
{
    public int Day { get; } = day;
    public string Label { get; } = label;
    [ObservableProperty] private bool _isSelected = selected;
}

public sealed partial class RecurringTaskEditorViewModel : EditorViewModel
{
    private readonly IRecurringTaskRepository _repo;
    private readonly RecurringTask _t;

    public RecurringTaskEditorViewModel(IRecurringTaskRepository repo, IReadOnlyList<Employee> staff, IReadOnlyList<Department> departments, RecurringTask t)
    {
        _repo = repo;
        _t = t;
        Assignees = [new Option<int?>(null, "Để hệ thống chọn người hợp nhất"), .. staff.Select(e => new Option<int?>(e.Id, $"{e.FullName} · {e.Position}"))];
        Departments = [new Option<int?>(null, "Mọi tổ"), .. departments.Select(d => new Option<int?>(d.Id, d.Name))];
        Assignee = Assignees.FirstOrDefault(a => a.Value == t.PreferredAssigneeId) ?? Assignees[0];
        Department = Departments.FirstOrDefault(d => d.Value == t.DepartmentId) ?? Departments[0];
        TaskTitle = t.Title;
        Description = t.Description;
        Location = t.Location;
        Priority = Priorities.First(p => p.Value == t.Priority);
        StartTime = TimeSpan.FromMinutes(t.StartMinute).ToString(@"hh\:mm");
        DueTime = TimeSpan.FromMinutes(t.DueMinute).ToString(@"hh\:mm");
        AutoAssign = t.AutoAssign;
        IsActive = t.IsActive;
        string[] names = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
        var days = t.Days;
        Days = names.Select((n, i) => new DayOption(i + 1, n, days.Contains(i + 1))).ToList();
    }

    public override string Title => _t.Id == 0 ? "Thêm việc định kỳ" : "Sửa việc định kỳ";
    public override double Width => 640;

    public IReadOnlyList<Option<int?>> Assignees { get; }
    public IReadOnlyList<Option<int?>> Departments { get; }
    public IReadOnlyList<Option<TaskPriority>> Priorities { get; } = Options.Of<TaskPriority>();
    public IReadOnlyList<DayOption> Days { get; }

    [ObservableProperty] private string _taskTitle;
    [ObservableProperty] private string? _description;
    [ObservableProperty] private string? _location;
    [ObservableProperty] private Option<TaskPriority> _priority;
    [ObservableProperty] private Option<int?> _assignee;
    [ObservableProperty] private Option<int?> _department;
    [ObservableProperty] private string _startTime;
    [ObservableProperty] private string _dueTime;
    [ObservableProperty] private bool _autoAssign;
    [ObservableProperty] private bool _isActive;

    protected override async Task SaveCoreAsync()
    {
        if (string.IsNullOrWhiteSpace(TaskTitle)) throw new DomainException("Vui lòng nhập tên công việc.");
        var days = Days.Where(d => d.IsSelected).Select(d => d.Day).ToList();
        if (days.Count == 0) throw new DomainException("Chọn ít nhất một ngày trong tuần.");
        var start = ParseTime(StartTime, "Giờ bắt đầu");
        var due = ParseTime(DueTime, "Giờ hạn chót");
        if (due <= start) throw new DomainException("Giờ hạn chót phải sau giờ bắt đầu.");
        _t.Title = TaskTitle.Trim();
        _t.Description = string.IsNullOrWhiteSpace(Description) ? null : Description.Trim();
        _t.Location = string.IsNullOrWhiteSpace(Location) ? null : Location.Trim();
        _t.Priority = Priority.Value;
        _t.PreferredAssigneeId = Assignee.Value;
        _t.DepartmentId = Department.Value;
        _t.Weekdays = string.Join(",", days);
        _t.StartMinute = (int)start.TotalMinutes;
        _t.DueMinute = (int)due.TotalMinutes;
        _t.AutoAssign = AutoAssign;
        _t.IsActive = IsActive;
        _t.Department = null;
        _t.PreferredAssignee = null;
        await _repo.SaveAsync(_t);
    }

    private static TimeSpan ParseTime(string? text, string field) =>
        TimeSpan.TryParseExact(text?.Trim(), [@"hh\:mm", @"h\:mm"], null, out var t) && t < TimeSpan.FromDays(1)
            ? t
            : throw new DomainException($"{field} phải có dạng HH:mm, ví dụ 07:30.");
}
