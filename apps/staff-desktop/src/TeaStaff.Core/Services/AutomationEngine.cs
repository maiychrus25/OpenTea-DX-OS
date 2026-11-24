// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;

namespace TeaStaff.Core.Services;

/// <summary>Rules the owner can switch on or off in the Automation page.</summary>
public sealed record AutomationSettings
{
    /// <summary>Create the day's tasks from recurring templates.</summary>
    public bool GenerateRecurring { get; init; } = true;

    /// <summary>When staff reject a task, give it to the best-ranked colleague at once (otherwise only suggest).</summary>
    public bool AutoReassignRejected { get; init; }

    /// <summary>Suggest a replacement for open tasks of someone whose leave was approved.</summary>
    public bool CoverLeave { get; init; } = true;

    /// <summary>Approve annual leave of one day when the balance allows and no urgent task is affected.</summary>
    public bool AutoApproveShortLeave { get; init; }

    /// <summary>Close the day for staff who forgot to check out (at 17:00, after 18:30).</summary>
    public bool AutoCheckOut { get; init; } = true;

    /// <summary>Warn the owner once when a task passes its deadline.</summary>
    public bool WarnOverdue { get; init; } = true;

    /// <summary>On the first days of a month, prepare draft payslips of the previous month.</summary>
    public bool DraftPayroll { get; init; } = true;
}

public sealed record AutomationRunResult(int Actions, int Suggestions)
{
    public static readonly AutomationRunResult Empty = new(0, 0);
}

/// <summary>
/// Runs the cooperative's routine on a timer: daily tasks from templates, cover for rejected
/// work and approved leave, forgotten check-outs, overdue warnings and draft payroll.
/// Anything that changes who does what is either a rule the owner switched on or a
/// suggestion waiting for one click; the facts behind every choice are kept with it.
/// </summary>
public sealed class AutomationEngine(
    IRecurringTaskRepository templates, IAutomationRepository store, ITaskRepository tasks, IEmployeeRepository employees,
    ILeaveRepository leaves, IAttendanceRepository attendance, IPayslipRepository payslips, ISettingsRepository settings,
    TaskService taskService, LeaveService leaveService, PayrollService payroll, IClock clock, IDataChangeNotifier notifier, IActivityFeed activity)
{
    public const string AutomationName = "Tự động hoá";
    public static readonly TimeSpan CheckOutAfter = new(18, 30, 0);
    public static readonly TimeSpan CheckOutAt = new(17, 0, 0);
    private const string SettingsPrefix = "automation.";

    private readonly SemaphoreSlim _gate = new(1, 1);

    public async Task<AutomationSettings> GetSettingsAsync(CancellationToken ct = default)
    {
        var d = new AutomationSettings();
        return new AutomationSettings
        {
            GenerateRecurring = await ReadAsync(nameof(d.GenerateRecurring), d.GenerateRecurring, ct),
            AutoReassignRejected = await ReadAsync(nameof(d.AutoReassignRejected), d.AutoReassignRejected, ct),
            CoverLeave = await ReadAsync(nameof(d.CoverLeave), d.CoverLeave, ct),
            AutoApproveShortLeave = await ReadAsync(nameof(d.AutoApproveShortLeave), d.AutoApproveShortLeave, ct),
            AutoCheckOut = await ReadAsync(nameof(d.AutoCheckOut), d.AutoCheckOut, ct),
            WarnOverdue = await ReadAsync(nameof(d.WarnOverdue), d.WarnOverdue, ct),
            DraftPayroll = await ReadAsync(nameof(d.DraftPayroll), d.DraftPayroll, ct),
        };
    }

    public async Task SaveSettingsAsync(AutomationSettings s, CancellationToken ct = default)
    {
        await WriteAsync(nameof(s.GenerateRecurring), s.GenerateRecurring, ct);
        await WriteAsync(nameof(s.AutoReassignRejected), s.AutoReassignRejected, ct);
        await WriteAsync(nameof(s.CoverLeave), s.CoverLeave, ct);
        await WriteAsync(nameof(s.AutoApproveShortLeave), s.AutoApproveShortLeave, ct);
        await WriteAsync(nameof(s.AutoCheckOut), s.AutoCheckOut, ct);
        await WriteAsync(nameof(s.WarnOverdue), s.WarnOverdue, ct);
        await WriteAsync(nameof(s.DraftPayroll), s.DraftPayroll, ct);
    }

    private async Task<bool> ReadAsync(string key, bool fallback, CancellationToken ct) =>
        await settings.GetAsync(SettingsPrefix + key, ct) is { } v && bool.TryParse(v, out var b) ? b : fallback;

    private Task WriteAsync(string key, bool value, CancellationToken ct) => settings.SetAsync(SettingsPrefix + key, value.ToString(), ct);

    /// <summary>Ranks staff for a task with the data the advisor needs.</summary>
    public async Task<IReadOnlyList<AssignmentCandidate>> RankAsync(AssignmentRequest request, CancellationToken ct = default)
    {
        var now = clock.Now;
        var today = DateOnly.FromDateTime(now);
        return AssignmentAdvisor.Rank(request, await employees.ListAsync(ct), await tasks.ListAsync(null, ct), await leaves.ListAsync(null, ct),
            await attendance.ListAsync(today, today, null, ct), now);
    }

    /// <summary>One pass over every rule. Safe to call often: each rule remembers what it already did.</summary>
    public async Task<AutomationRunResult> RunAsync(CancellationToken ct = default)
    {
        if (!await _gate.WaitAsync(0, ct)) return AutomationRunResult.Empty;
        try
        {
            var s = await GetSettingsAsync(ct);
            var known = await store.ListSuggestionsAsync(null, ct);
            var counter = new Counter();
            if (s.GenerateRecurring) await GenerateRecurringAsync(counter, ct);
            await CoverRejectedAsync(s, known, counter, ct);
            if (s.CoverLeave) await CoverLeaveAsync(known, counter, ct);
            if (s.AutoApproveShortLeave) await ApproveShortLeaveAsync(counter, ct);
            if (s.AutoCheckOut) await CloseForgottenCheckOutsAsync(counter, ct);
            if (s.WarnOverdue) await WarnOverdueAsync(counter, ct);
            if (s.DraftPayroll) await DraftPayrollAsync(counter, ct);
            if (counter.Suggestions > 0) notifier.Notify(DataAreas.Automation);
            return new AutomationRunResult(counter.Actions, counter.Suggestions);
        }
        finally
        {
            _gate.Release();
        }
    }

    private sealed class Counter
    {
        public int Actions;
        public int Suggestions;
    }

    private async Task LogAsync(Counter c, string rule, string message, bool announce, CancellationToken ct)
    {
        c.Actions++;
        await store.AddLogAsync(rule, message, ct);
        if (announce) activity.Raise(DataAreas.Automation, message);
    }

    private async Task SuggestAsync(Counter c, AutomationSuggestion suggestion, CancellationToken ct)
    {
        c.Suggestions++;
        await store.SaveSuggestionAsync(suggestion, ct);
    }

    private static string Facts(AssignmentCandidate c) => string.Join("\n", c.Facts.Select(f => (f.Positive ? "✓ " : "• ") + f.Text));

    // ── Recurring work ─────────────────────────────────────────────────────
    private async Task GenerateRecurringAsync(Counter c, CancellationToken ct)
    {
        var now = clock.Now;
        var today = DateOnly.FromDateTime(now);
        foreach (var t in (await templates.ListAsync(ct)).Where(t => t.IsActive && t.RunsOn(today) && t.LastGeneratedOn != today))
        {
            var start = now.Date.AddMinutes(t.StartMinute);
            var due = now.Date.AddMinutes(Math.Max(t.DueMinute, t.StartMinute + 30));
            if (due <= now) continue; // too late for today; try again on the next matching day
            var ranked = await RankAsync(new AssignmentRequest(t.Title, t.Location, start, due, t.DepartmentId), ct);
            var preferred = ranked.FirstOrDefault(r => r.Employee.Id == t.PreferredAssigneeId && r.Available);
            var pick = preferred ?? ranked.FirstOrDefault(r => r.Available);
            t.LastGeneratedOn = today;
            t.Department = null;
            t.PreferredAssignee = null;
            await templates.SaveAsync(t, ct);
            if (pick is null)
            {
                await LogAsync(c, "Việc định kỳ", $"Không có ai rảnh để làm \"{t.Title}\" hôm nay.", true, ct);
                continue;
            }

            if (t.AutoAssign || preferred is not null)
            {
                var task = await taskService.SaveAsync(NewTask(t, start, due, pick.Employee.Id,
                    preferred is not null ? "Việc định kỳ" : $"Việc định kỳ, gợi ý {pick.Percent}%"), ct);
                await LogAsync(c, "Việc định kỳ", $"Đã giao \"{task.Title}\" cho {pick.Employee.FullName}"
                                                  + (preferred is not null ? " (người phụ trách)." : $" ({pick.Summary})."), false, ct);
            }
            else
            {
                await SuggestAsync(c, new AutomationSuggestion
                {
                    Kind = SuggestionKind.AssignRecurring, TemplateId = t.Id, EmployeeId = pick.Employee.Id, ForDate = today,
                    Title = $"Giao \"{t.Title}\" hôm nay cho {pick.Employee.FullName} ({pick.Percent}% phù hợp)",
                    Detail = Facts(pick),
                }, ct);
            }
        }
    }

    private static WorkTask NewTask(RecurringTask t, DateTime start, DateTime due, int assignee, string by) => new()
    {
        Title = t.Title, Description = t.Description, Location = t.Location, Priority = t.Priority,
        StartDate = start, DueDate = due, AssigneeId = assignee, AssignedBy = $"{AutomationName} · {by}",
    };

    // ── Rejected work ──────────────────────────────────────────────────────
    private async Task CoverRejectedAsync(AutomationSettings s, IReadOnlyList<AutomationSuggestion> known, Counter c, CancellationToken ct)
    {
        var now = clock.Now;
        foreach (var task in (await tasks.ListAsync(null, ct)).Where(t => t.Status == WorkTaskStatus.Rejected && t.DueDate > now))
        {
            if (known.Any(k => k.TaskId == task.Id && k.Kind == SuggestionKind.ReassignRejected && k.EmployeeId != task.AssigneeId && k.CreatedAt >= task.UpdatedAt.AddSeconds(-1)))
                continue;
            var ranked = await RankAsync(new AssignmentRequest(task.Title, task.Location, task.StartDate < now ? now : task.StartDate, task.DueDate,
                task.Assignee?.DepartmentId, task.AssigneeId), ct);
            var pick = ranked.FirstOrDefault(r => r.Available);
            if (pick is null) continue;
            var from = task.Assignee?.FullName ?? "nhân viên";

            if (s.AutoReassignRejected)
            {
                var fresh = await tasks.GetAsync(task.Id, ct);
                if (fresh is null || fresh.Status != WorkTaskStatus.Rejected) continue;
                Reassign(fresh, pick.Employee.Id, $"{from} từ chối: {fresh.ReportNote}");
                await taskService.SaveAsync(fresh, ct);
                await store.SaveSuggestionAsync(new AutomationSuggestion
                {
                    Kind = SuggestionKind.ReassignRejected, Status = SuggestionStatus.Accepted, TaskId = task.Id, EmployeeId = pick.Employee.Id,
                    Title = $"Đã giao lại \"{task.Title}\" cho {pick.Employee.FullName}", Detail = Facts(pick), ResolvedAt = now, ResolvedBy = AutomationName,
                }, ct);
                await LogAsync(c, "Giao lại việc bị từ chối", $"{from} từ chối \"{task.Title}\", đã giao lại cho {pick.Employee.FullName} ({pick.Percent}%).", true, ct);
            }
            else
            {
                await SuggestAsync(c, new AutomationSuggestion
                {
                    Kind = SuggestionKind.ReassignRejected, TaskId = task.Id, EmployeeId = pick.Employee.Id,
                    Title = $"{from} từ chối \"{task.Title}\". Giao lại cho {pick.Employee.FullName} ({pick.Percent}%)?",
                    Detail = $"Lý do từ chối: {task.ReportNote}\n" + Facts(pick),
                }, ct);
            }
        }
    }

    private void Reassign(WorkTask task, int employeeId, string note)
    {
        task.AssigneeId = employeeId;
        task.Assignee = null;
        task.Status = WorkTaskStatus.Assigned;
        task.Progress = 0;
        task.CompletedAt = null;
        task.ReportNote = note;
        if (task.StartDate < clock.Now) task.StartDate = clock.Now;
    }

    // ── Approved leave ─────────────────────────────────────────────────────
    private async Task CoverLeaveAsync(IReadOnlyList<AutomationSuggestion> known, Counter c, CancellationToken ct)
    {
        var now = clock.Now;
        var approved = (await leaves.ListAsync(null, ct)).Where(l => l.Status == LeaveStatus.Approved && l.ToDate >= DateOnly.FromDateTime(now)).ToList();
        if (approved.Count == 0) return;
        foreach (var task in (await tasks.ListAsync(null, ct)).Where(t => t.IsOpen && t.DueDate > now))
        {
            var leave = approved.FirstOrDefault(l => l.EmployeeId == task.AssigneeId
                                                     && l.FromDate <= DateOnly.FromDateTime(task.DueDate) && l.ToDate >= DateOnly.FromDateTime(task.StartDate));
            if (leave is null || known.Any(k => k.TaskId == task.Id && k.LeaveId == leave.Id)) continue;
            var ranked = await RankAsync(new AssignmentRequest(task.Title, task.Location, task.StartDate < now ? now : task.StartDate, task.DueDate,
                task.Assignee?.DepartmentId, task.AssigneeId), ct);
            var pick = ranked.FirstOrDefault(r => r.Available);
            if (pick is null) continue;
            await SuggestAsync(c, new AutomationSuggestion
            {
                Kind = SuggestionKind.ReassignLeave, TaskId = task.Id, LeaveId = leave.Id, EmployeeId = pick.Employee.Id,
                Title = $"{task.Assignee?.FullName ?? "Nhân viên"} nghỉ {leave.FromDate:dd/MM}–{leave.ToDate:dd/MM}. Chuyển \"{task.Title}\" cho {pick.Employee.FullName}?",
                Detail = Facts(pick),
            }, ct);
        }
    }

    // ── Short leave ────────────────────────────────────────────────────────
    private async Task ApproveShortLeaveAsync(Counter c, CancellationToken ct)
    {
        var open = await tasks.ListAsync(null, ct);
        foreach (var l in (await leaves.ListAsync(null, ct)).Where(l => l.Status == LeaveStatus.Pending && l.Type == LeaveType.Annual && l.Days == 1))
        {
            var day = l.FromDate;
            var urgent = open.Any(t => t.AssigneeId == l.EmployeeId && t.IsOpen && t.Priority >= TaskPriority.High
                                       && DateOnly.FromDateTime(t.StartDate) <= day && DateOnly.FromDateTime(t.DueDate) >= day);
            if (urgent) continue;
            var remaining = await leaveService.RemainingAnnualDaysAsync(l.EmployeeId, day.Year, ct);
            if (remaining < 0) continue;
            await leaveService.ReviewAsync(l.Id, true, "Duyệt tự động: nghỉ phép năm 1 ngày, còn đủ phép, không có việc gấp.", ct, AutomationName);
            await LogAsync(c, "Duyệt nghỉ ngắn", $"Đã duyệt nghỉ phép ngày {day:dd/MM} của {l.Employee?.FullName ?? "nhân viên"} (còn {remaining} ngày phép).", true, ct);
        }
    }

    // ── Attendance ─────────────────────────────────────────────────────────
    private async Task CloseForgottenCheckOutsAsync(Counter c, CancellationToken ct)
    {
        var now = clock.Now;
        if (now.TimeOfDay < CheckOutAfter) return;
        var today = DateOnly.FromDateTime(now);
        foreach (var r in (await attendance.ListAsync(today, today, null, ct)).Where(r => r.CheckIn is not null && r.CheckOut is null))
        {
            var outAt = now.Date + CheckOutAt;
            if (outAt <= r.CheckIn!.Value) outAt = r.CheckIn.Value.AddHours(4);
            r.CheckOut = outAt;
            r.Status = (outAt - r.CheckIn.Value).TotalHours < 4 ? AttendanceStatus.HalfDay : AttendanceStatus.Present;
            r.OvertimeHours = 0;
            r.Note = string.IsNullOrWhiteSpace(r.Note) ? "Tự chấm ra 17:00 (quên chấm ra)" : r.Note;
            r.Employee = null;
            await attendance.SaveAsync(r, ct);
            var name = (await employees.GetAsync(r.EmployeeId, ct))?.FullName ?? "Nhân viên";
            await LogAsync(c, "Chấm công ra", $"{name} quên chấm ra, đã ghi giờ ra {outAt:HH:mm}.", false, ct);
        }
        if (c.Actions > 0) notifier.Notify(DataAreas.Attendance);
    }

    // ── Overdue ────────────────────────────────────────────────────────────
    private async Task WarnOverdueAsync(Counter c, CancellationToken ct)
    {
        var now = clock.Now;
        var logs = await store.ListLogsAsync(500, ct);
        foreach (var t in (await tasks.ListAsync(null, ct)).Where(t => t.IsOverdue(now)))
        {
            var key = $"#{t.Id} ";
            if (logs.Any(l => l.Rule == "Quá hạn" && l.Message.StartsWith(key, StringComparison.Ordinal))) continue;
            await LogAsync(c, "Quá hạn", $"{key}\"{t.Title}\" của {t.Assignee?.FullName ?? "nhân viên"} đã quá hạn {t.DueDate:dd/MM HH:mm} ({t.Progress}%).", true, ct);
        }
    }

    // ── Payroll ────────────────────────────────────────────────────────────
    private async Task DraftPayrollAsync(Counter c, CancellationToken ct)
    {
        var now = clock.Now;
        if (now.Day > 3) return;
        var prev = new DateOnly(now.Year, now.Month, 1).AddMonths(-1);
        if ((await payslips.ListAsync(prev.Year, prev.Month, ct)).Count > 0) return;
        var made = await payroll.GenerateAsync(prev.Year, prev.Month, ct);
        if (made.Count > 0)
            await LogAsync(c, "Bảng lương", $"Đã lập {made.Count} phiếu lương nháp tháng {prev:MM/yyyy} từ bảng công. Chờ chủ HTX duyệt.", true, ct);
    }

    // ── Owner decisions ────────────────────────────────────────────────────
    public async Task AcceptAsync(int suggestionId, string by, CancellationToken ct = default)
    {
        var s = await store.GetSuggestionAsync(suggestionId, ct) ?? throw new DomainException("Không tìm thấy gợi ý.");
        if (s.Status != SuggestionStatus.Pending) throw new DomainException("Gợi ý này đã được xử lý.");
        var employee = s.EmployeeId is { } eid ? await employees.GetAsync(eid, ct) : null;
        if (employee is null || !employee.IsActive) throw new DomainException("Nhân viên được gợi ý không còn làm việc.");

        switch (s.Kind)
        {
            case SuggestionKind.AssignRecurring:
            {
                var t = await templates.GetAsync(s.TemplateId ?? 0, ct) ?? throw new DomainException("Việc định kỳ đã bị xoá.");
                var day = (s.ForDate ?? DateOnly.FromDateTime(clock.Now)).ToDateTime(TimeOnly.MinValue);
                var start = day.AddMinutes(t.StartMinute);
                var due = day.AddMinutes(Math.Max(t.DueMinute, t.StartMinute + 30));
                if (due <= clock.Now) throw new DomainException("Đã quá giờ của việc này hôm nay.");
                await taskService.SaveAsync(NewTask(t, start, due, employee.Id, $"duyệt bởi {by}"), ct);
                break;
            }
            case SuggestionKind.ReassignRejected:
            case SuggestionKind.ReassignLeave:
            {
                var task = await tasks.GetAsync(s.TaskId ?? 0, ct) ?? throw new DomainException("Công việc đã bị xoá.");
                if (task.Status is WorkTaskStatus.Completed or WorkTaskStatus.Cancelled) throw new DomainException("Công việc đã kết thúc.");
                Reassign(task, employee.Id, s.Kind == SuggestionKind.ReassignLeave ? "Chuyển do người nhận trước nghỉ phép." : $"Giao lại sau khi bị từ chối: {task.ReportNote}");
                await taskService.SaveAsync(task, ct);
                break;
            }
            default:
                throw new DomainException("Loại gợi ý không hỗ trợ.");
        }
        s.Status = SuggestionStatus.Accepted;
        s.ResolvedAt = clock.Now;
        s.ResolvedBy = by;
        s.Employee = null;
        await store.SaveSuggestionAsync(s, ct);
        await store.AddLogAsync("Chủ HTX duyệt", $"{by} đồng ý: {s.Title}", ct);
        notifier.Notify(DataAreas.Automation);
    }

    public async Task DismissAsync(int suggestionId, string by, CancellationToken ct = default)
    {
        var s = await store.GetSuggestionAsync(suggestionId, ct) ?? throw new DomainException("Không tìm thấy gợi ý.");
        if (s.Status != SuggestionStatus.Pending) return;
        s.Status = SuggestionStatus.Dismissed;
        s.ResolvedAt = clock.Now;
        s.ResolvedBy = by;
        s.Employee = null;
        await store.SaveSuggestionAsync(s, ct);
        notifier.Notify(DataAreas.Automation);
    }
}
