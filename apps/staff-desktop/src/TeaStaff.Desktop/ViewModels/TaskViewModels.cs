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

public sealed class TaskRow(WorkTask task, DateTime now)
{
    public WorkTask Task { get; } = task;
    public bool Overdue { get; } = task.IsOverdue(now);
    public string DueText => Task.DueDate.ToString("dd/MM HH:mm");
    public string AssigneeName => Task.Assignee?.FullName ?? "—";
    /// <summary>Shown after the location of tasks that came from the core's assistant.</summary>
    public string AiMarker => Task.ExternalRef is null ? string.Empty : "  ·  Từ trợ lý AI";
    public string AssigneeCode => Task.Assignee?.Code ?? string.Empty;
}

public sealed record KanbanColumn(string Title, string Tone, IReadOnlyList<TaskRow> Cards, bool CanAdd)
{
    public int Count => Cards.Count;
}

public sealed partial class TasksViewModel(IDialogService dialogs, ITaskRepository tasks, IEmployeeRepository employees, TaskService service,
    ITenantContext tenant, IClock clock, AutomationEngine engine) : PageViewModel(dialogs)
{
    private IReadOnlyList<WorkTask> _all = [];

    public override string Title => "Giao việc";
    public override string Subtitle => "Giao việc cho nhân viên; nhân viên nhận và báo tiến độ trên ứng dụng điện thoại.";
    public override IReadOnlyCollection<string> WatchedAreas => [DataAreas.Tasks];

    public ObservableCollection<TaskRow> Items { get; } = [];
    public ObservableCollection<KanbanColumn> Columns { get; } = [];
    public ObservableCollection<Option<int?>> AssigneeFilters { get; } = [];

    private static readonly (string Title, string Tone, WorkTaskStatus[] Statuses)[] KanbanLayout =
    [
        ("Mới giao", "Warning", [WorkTaskStatus.Assigned]),
        ("Đã nhận", "Info", [WorkTaskStatus.Accepted]),
        ("Đang làm", "Info", [WorkTaskStatus.InProgress]),
        ("Hoàn thành", "Success", [WorkTaskStatus.Completed]),
        ("Từ chối / Huỷ", "Danger", [WorkTaskStatus.Rejected, WorkTaskStatus.Cancelled]),
    ];

    /// <summary>"list" or "board".</summary>
    [ObservableProperty] private string _viewMode = "board";
    public bool IsBoard => ViewMode == "board";
    partial void OnViewModeChanged(string value) => OnPropertyChanged(nameof(IsBoard));

    [RelayCommand]
    private void SetView(string mode) => ViewMode = mode;

    [ObservableProperty] private string _search = string.Empty;
    [ObservableProperty] private string _statusFilter = "open";
    [ObservableProperty] private Option<int?>? _assigneeFilter;
    [ObservableProperty] private string _counts = string.Empty;

    partial void OnSearchChanged(string value) => Apply();
    partial void OnStatusFilterChanged(string value) => Apply();
    partial void OnAssigneeFilterChanged(Option<int?>? value) => Apply();

    public override async Task LoadAsync()
    {
        _all = await tasks.ListAsync();
        var keep = AssigneeFilter?.Value;
        AssigneeFilters.Clear();
        AssigneeFilters.Add(new Option<int?>(null, "Tất cả nhân viên"));
        foreach (var e in (await employees.ListAsync()).Where(e => e.IsActive)) AssigneeFilters.Add(new Option<int?>(e.Id, $"{e.FullName} ({e.Code})"));
        AssigneeFilter = AssigneeFilters.FirstOrDefault(o => o.Value == keep) ?? AssigneeFilters[0];
        Apply();
    }

    [RelayCommand]
    private void Filter(string key) => StatusFilter = key;

    private void Apply()
    {
        var now = clock.Now;
        var q = Search.Trim();
        var list = _all.Where(t =>
            StatusFilter switch
            {
                "open" => t.IsOpen,
                "overdue" => t.IsOverdue(now),
                "done" => t.Status == WorkTaskStatus.Completed,
                "closed" => t.Status is WorkTaskStatus.Rejected or WorkTaskStatus.Cancelled,
                _ => true,
            } &&
            (AssigneeFilter?.Value is null || t.AssigneeId == AssigneeFilter.Value) &&
            (q.Length == 0 || t.Title.Contains(q, StringComparison.OrdinalIgnoreCase) || (t.Location ?? "").Contains(q, StringComparison.OrdinalIgnoreCase)
             || (t.Assignee?.FullName ?? "").Contains(q, StringComparison.OrdinalIgnoreCase)));
        Items.Clear();
        foreach (var t in list) Items.Add(new TaskRow(t, now));

        // Kanban shows every status, so it ignores the status chips but keeps search and assignee.
        var board = _all.Where(t =>
            (AssigneeFilter?.Value is null || t.AssigneeId == AssigneeFilter.Value) &&
            (q.Length == 0 || t.Title.Contains(q, StringComparison.OrdinalIgnoreCase) || (t.Location ?? "").Contains(q, StringComparison.OrdinalIgnoreCase)
             || (t.Assignee?.FullName ?? "").Contains(q, StringComparison.OrdinalIgnoreCase))).ToList();
        Columns.Clear();
        foreach (var (title, tone, statuses) in KanbanLayout)
        {
            var cards = board.Where(t => statuses.Contains(t.Status))
                .OrderBy(t => t.IsOverdue(now) ? 0 : 1).ThenByDescending(t => t.Priority).ThenBy(t => t.DueDate)
                .Select(t => new TaskRow(t, now)).ToList();
            Columns.Add(new KanbanColumn(title, tone, cards, statuses.Contains(WorkTaskStatus.Assigned)));
        }
        Counts =$"{_all.Count(t => t.IsOpen)} đang làm · {_all.Count(t => t.IsOverdue(now))} quá hạn · {_all.Count(t => t.Status == WorkTaskStatus.Completed)} hoàn thành";
    }

    [RelayCommand]
    private async Task Add()
    {
        var staff = (await employees.ListAsync()).Where(e => e.IsActive).ToList();
        if (staff.Count == 0)
        {
            Dialogs.Info("Chưa có nhân viên", "Hãy thêm nhân viên trước khi giao việc.");
            return;
        }
        var now = clock.Now;
        var task = new WorkTask
        {
            StartDate = now.Date.AddHours(7),
            DueDate = now.Date.AddHours(17),
            AssignedBy = tenant.DisplayName,
            AssigneeId = AssigneeFilter?.Value ?? staff[0].Id,
        };
        if (Dialogs.ShowEditor(new TaskEditorViewModel(service, staff, task, engine.RankAsync))) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task Edit(TaskRow? row)
    {
        if (row is null) return;
        var fresh = await tasks.GetAsync(row.Task.Id);
        if (fresh is null) return;
        var staff = (await employees.ListAsync()).Where(e => e.IsActive || e.Id == fresh.AssigneeId).ToList();
        if (Dialogs.ShowEditor(new TaskEditorViewModel(service, staff, fresh, engine.RankAsync))) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task Duplicate(TaskRow? row)
    {
        if (row is null) return;
        var staff = (await employees.ListAsync()).Where(e => e.IsActive).ToList();
        var t = row.Task;
        var copy = new WorkTask
        {
            Title = t.Title, Description = t.Description, Location = t.Location, Priority = t.Priority,
            AssigneeId = t.AssigneeId, AssignedBy = tenant.DisplayName,
            StartDate = clock.Now.Date.AddHours(7), DueDate = clock.Now.Date.AddHours(17),
        };
        if (Dialogs.ShowEditor(new TaskEditorViewModel(service, staff, copy, engine.RankAsync))) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task Cancel(TaskRow? row)
    {
        if (row is null || !row.Task.IsOpen) return;
        if (!Dialogs.Confirm("Huỷ công việc", $"Huỷ \"{row.Task.Title}\"? Nhân viên sẽ không thấy việc này nữa.", "Huỷ việc", danger: true)) return;
        await RunAsync(async () =>
        {
            await service.CancelAsync(row.Task.Id);
            await LoadAsync();
        });
    }

    [RelayCommand]
    private async Task Delete(TaskRow? row)
    {
        if (row is null) return;
        if (!Dialogs.Confirm("Xoá công việc", $"Xoá hẳn \"{row.Task.Title}\" khỏi danh sách? Thao tác này không hoàn tác được.", "Xoá", danger: true)) return;
        await RunAsync(async () =>
        {
            await tasks.DeleteAsync(row.Task.Id);
            await LoadAsync();
        });
    }

    [RelayCommand]
    private void Export()
    {
        var path = Dialogs.SaveFile($"giao-viec-{DateTime.Today:yyyyMMdd}.csv", "CSV (*.csv)|*.csv");
        if (path is null) return;
        CsvExporter.Write(path, ["Công việc", "Nhân viên", "Địa điểm", "Ưu tiên", "Bắt đầu", "Hạn", "Trạng thái", "Tiến độ (%)", "Báo cáo"],
            Items.Select(r => new object?[]
            {
                r.Task.Title, r.AssigneeName, r.Task.Location, Labels.Of(r.Task.Priority), r.Task.StartDate.ToString("dd/MM/yyyy HH:mm"),
                r.Task.DueDate.ToString("dd/MM/yyyy HH:mm"), Labels.Of(r.Task.Status), r.Task.Progress, r.Task.ReportNote,
            }));
        Dialogs.Info("Đã xuất file", path);
    }
}

public sealed partial class TaskEditorViewModel : EditorViewModel
{
    private readonly TaskService _service;
    private readonly WorkTask _task;
    private readonly Func<AssignmentRequest, CancellationToken, Task<IReadOnlyList<AssignmentCandidate>>>? _rank;

    public TaskEditorViewModel(TaskService service, IReadOnlyList<Employee> staff, WorkTask task,
        Func<AssignmentRequest, CancellationToken, Task<IReadOnlyList<AssignmentCandidate>>>? rank = null)
    {
        _service = service;
        _task = task;
        _rank = rank;
        Assignees = staff.Select(e => new Option<int>(e.Id, $"{e.FullName} · {e.Position}")).ToList();
        Assignee = Assignees.FirstOrDefault(a => a.Value == task.AssigneeId) ?? Assignees.FirstOrDefault();
        TaskTitle = task.Title;
        Description = task.Description;
        Location = task.Location;
        Priority = Priorities.First(p => p.Value == task.Priority);
        StartDate = task.StartDate.Date;
        StartTime = task.StartDate.ToString("HH:mm");
        DueDate = task.DueDate.Date;
        DueTime = task.DueDate.ToString("HH:mm");
    }

    public override string Title => _task.Id == 0 ? "Giao việc mới" : "Sửa công việc";
    public override string SaveText => _task.Id == 0 ? "Giao việc" : "Lưu";
    public override double Width => 640;

    public bool IsExisting => _task.Id != 0;
    public string StatusText => Labels.Of(_task.Status);
    public WorkTaskStatus Status => _task.Status;
    public int Progress => _task.Progress;
    public string? ReportNote => _task.ReportNote;

    public IReadOnlyList<Option<int>> Assignees { get; }
    public IReadOnlyList<Option<TaskPriority>> Priorities { get; } = Options.Of<TaskPriority>();

    [ObservableProperty] private Option<int>? _assignee;
    [ObservableProperty] private string _taskTitle;
    [ObservableProperty] private string? _description;
    [ObservableProperty] private string? _location;
    [ObservableProperty] private Option<TaskPriority> _priority;
    [ObservableProperty] private DateTime _startDate;
    [ObservableProperty] private string _startTime;
    [ObservableProperty] private DateTime _dueDate;
    [ObservableProperty] private string _dueTime;

    public bool CanSuggest => _rank is not null;
    public ObservableCollection<CandidateRow> Candidates { get; } = [];
    [ObservableProperty] private string? _suggestNote;

    /// <summary>Ranks the active staff for the task as currently typed, with the facts behind each score.</summary>
    [RelayCommand]
    private async Task Suggest()
    {
        if (_rank is null) return;
        Error = null;
        if (string.IsNullOrWhiteSpace(TaskTitle))
        {
            Error = "Nhập tên công việc trước để hệ thống tìm người phù hợp.";
            return;
        }
        try
        {
            var start = StartDate.Date + ParseTime(StartTime, "Giờ bắt đầu");
            var due = DueDate.Date + ParseTime(DueTime, "Giờ hạn chót");
            var ranked = await _rank(new AssignmentRequest(TaskTitle, Location, start, due, ExcludeEmployeeId: _task.Status == WorkTaskStatus.Rejected ? _task.AssigneeId : null), CancellationToken.None);
            Candidates.Clear();
            foreach (var c in ranked.Where(c => Assignees.Any(a => a.Value == c.Employee.Id)).Take(4)) Candidates.Add(new CandidateRow(c));
            SuggestNote = Candidates.Count == 0 ? "Không có ai phù hợp." : "Xếp theo việc tương tự đã làm, tỉ lệ đúng hạn, việc đang có và nơi làm. Bấm Chọn để giao.";
        }
        catch (DomainException e)
        {
            Error = e.Message;
        }
    }

    [RelayCommand]
    private void Pick(CandidateRow? row)
    {
        if (row is null) return;
        Assignee = Assignees.FirstOrDefault(a => a.Value == row.Candidate.Employee.Id) ?? Assignee;
    }

    protected override async Task SaveCoreAsync()
    {
        _task.Title = TaskTitle ?? string.Empty;
        _task.Description = string.IsNullOrWhiteSpace(Description) ? null : Description.Trim();
        _task.Location = string.IsNullOrWhiteSpace(Location) ? null : Location.Trim();
        _task.Priority = Priority.Value;
        _task.AssigneeId = Assignee?.Value ?? 0;
        _task.StartDate = StartDate.Date + ParseTime(StartTime, "Giờ bắt đầu");
        _task.DueDate = DueDate.Date + ParseTime(DueTime, "Giờ hạn chót");
        _task.Assignee = null;
        // Reassigning a rejected task gives it back to the new assignee.
        if (_task.Status == WorkTaskStatus.Rejected) { _task.Status = WorkTaskStatus.Assigned; _task.Progress = 0; }
        await _service.SaveAsync(_task);
    }

    private static TimeSpan ParseTime(string? text, string field) =>
        TimeSpan.TryParseExact(text?.Trim(), [@"hh\:mm", @"h\:mm"], null, out var t) && t < TimeSpan.FromDays(1)
            ? t
            : throw new DomainException($"{field} phải có dạng HH:mm, ví dụ 07:30.");
}

public sealed class CandidateRow(AssignmentCandidate c)
{
    public AssignmentCandidate Candidate { get; } = c;
    public string Name => Candidate.Employee.FullName;
    public string Percent => Candidate.Available ? $"{Candidate.Percent}%" : "Bận";
    public bool Available => Candidate.Available;
    public string Facts => Candidate.Summary;
}
