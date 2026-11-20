// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;
using TeaStaff.Desktop.Controls;
using TeaStaff.Desktop.Converters;
using TeaStaff.Desktop.Services;

namespace TeaStaff.Desktop.ViewModels;

public sealed record KpiTile(string Label, string Value, string Tone);

public sealed record LegendItem(string Label, string Value, Brush Brush);

public sealed record AttentionItem(string Title, string Detail, string Tone);

/// <summary>Visual HR report: KPIs, task and attendance charts, and lists of items that need the owner.</summary>
public sealed partial class ReportsViewModel(
    IDialogService dialogs, IEmployeeRepository employees, ITaskRepository tasks, IAttendanceRepository attendance,
    ILeaveRepository leaves, IPayslipRepository payslips, IClock clock) : PageViewModel(dialogs)
{
    public override string Title => "Báo cáo";
    public override string Subtitle => "Báo cáo trực quan về công việc, chấm công, nghỉ phép và quỹ lương.";
    public override IReadOnlyCollection<string> WatchedAreas => [DataAreas.Tasks, DataAreas.Attendance, DataAreas.Leaves, DataAreas.Employees, DataAreas.Payroll];

    public IReadOnlyList<Option<int>> Periods { get; } =
        [new(7, "7 ngày qua"), new(30, "1 tháng qua"), new(90, "3 tháng qua")];

    [ObservableProperty] private Option<int>? _period;
    partial void OnPeriodChanged(Option<int>? value) => _ = RunAsync(LoadAsync);

    public ObservableCollection<KpiTile> Kpis { get; } = [];
    [ObservableProperty] private IReadOnlyList<ChartPoint> _statusBars = [];
    [ObservableProperty] private IReadOnlyList<ChartPoint> _priorityShare = [];
    [ObservableProperty] private IReadOnlyList<LegendItem> _priorityLegend = [];
    [ObservableProperty] private IReadOnlyList<ChartSeries> _trendSeries = [];
    [ObservableProperty] private IReadOnlyList<string> _trendLabels = [];
    [ObservableProperty] private IReadOnlyList<ChartSeries> _attendanceSeries = [];
    [ObservableProperty] private IReadOnlyList<string> _attendanceLabels = [];
    [ObservableProperty] private IReadOnlyList<ChartPoint> _payrollBars = [];
    [ObservableProperty] private IReadOnlyList<ChartPoint> _teamBars = [];
    public ObservableCollection<AttentionItem> TaskAttention { get; } = [];
    public ObservableCollection<AttentionItem> StaffAttention { get; } = [];
    public ObservableCollection<AttentionItem> LeaveAttention { get; } = [];

    public static readonly Brush NewTaskBrush = ChartBase.Palette[1];
    public static readonly Brush DoneTaskBrush = ChartBase.Palette[0];
    public static readonly Brush PresentBrush = ChartBase.Palette[3];
    public static readonly Brush LeaveBrush = ChartBase.Palette[2];

    public override async Task LoadAsync()
    {
        Period ??= Periods[1];
        var days = Period.Value;
        var now = clock.Now;
        var today = DateOnly.FromDateTime(now);
        var from = today.AddDays(-(days - 1));

        var staff = await employees.ListAsync();
        var active = staff.Where(e => e.Status == EmployeeStatus.Active).ToList();
        var allTasks = (await tasks.ListAsync()).Where(t => t.Status != WorkTaskStatus.Cancelled || t.UpdatedAt.ToLocalTime() >= from.ToDateTime(TimeOnly.MinValue)).ToList();
        var records = await attendance.ListAsync(from, today);
        var allLeaves = await leaves.ListAsync();

        // KPIs
        var overdue = allTasks.Where(t => t.IsOverdue(now)).ToList();
        var notStarted = allTasks.Count(t => t.Status == WorkTaskStatus.Assigned);
        var dueSoon = allTasks.Count(t => t.IsOpen && !t.IsOverdue(now) && t.DueDate <= now.AddDays(3));
        var pending = allLeaves.Where(l => l.Status == LeaveStatus.Pending).ToList();
        var checkedIn = records.Where(r => r.WorkDate == today).Select(r => r.EmployeeId).ToHashSet();
        var missingToday = active.Where(e => !checkedIn.Contains(e.Id)).ToList();
        var incomplete = active.Where(e => string.IsNullOrWhiteSpace(e.Phone) || string.IsNullOrWhiteSpace(e.BankAccount) || string.IsNullOrWhiteSpace(e.IdentityNumber)).ToList();
        Kpis.Clear();
        Kpis.Add(new KpiTile("VIỆC QUÁ HẠN", overdue.Count.ToString(), "Danger"));
        Kpis.Add(new KpiTile("VIỆC CHƯA NHẬN", notStarted.ToString(), "Warning"));
        Kpis.Add(new KpiTile("ĐẾN HẠN TRONG 3 NGÀY", dueSoon.ToString(), "Info"));
        Kpis.Add(new KpiTile("ĐƠN NGHỈ CHỜ DUYỆT", pending.Count.ToString(), "Accent"));
        Kpis.Add(new KpiTile("CHƯA CHẤM CÔNG HÔM NAY", missingToday.Count.ToString(), "Danger"));
        Kpis.Add(new KpiTile("HỒ SƠ THIẾU THÔNG TIN", incomplete.Count.ToString(), "Neutral"));

        // Task status distribution
        StatusBars =
        [
            new("Mới giao", allTasks.Count(t => t.Status == WorkTaskStatus.Assigned), ChartBase.Palette[2]),
            new("Đã nhận", allTasks.Count(t => t.Status == WorkTaskStatus.Accepted), ChartBase.Palette[1]),
            new("Đang làm", allTasks.Count(t => t.Status == WorkTaskStatus.InProgress), ChartBase.Palette[7]),
            new("Hoàn thành", allTasks.Count(t => t.Status == WorkTaskStatus.Completed), ChartBase.Palette[3]),
            new("Từ chối / Huỷ", allTasks.Count(t => t.Status is WorkTaskStatus.Rejected or WorkTaskStatus.Cancelled), ChartBase.Palette[5]),
        ];

        // Priority share
        var priorities = new (TaskPriority P, Brush B)[]
        {
            (TaskPriority.Urgent, ChartBase.Palette[4]), (TaskPriority.High, ChartBase.Palette[2]),
            (TaskPriority.Normal, ChartBase.Palette[0]), (TaskPriority.Low, ChartBase.Palette[5]),
        };
        var openTasks = allTasks.Where(t => t.IsOpen).ToList();
        PriorityShare = priorities.Select(x => new ChartPoint(Labels.Of(x.P), openTasks.Count(t => t.Priority == x.P), x.B)).ToList();
        PriorityLegend = priorities.Select(x =>
        {
            var n = openTasks.Count(t => t.Priority == x.P);
            var pct = openTasks.Count == 0 ? 0 : n * 100.0 / openTasks.Count;
            return new LegendItem(Labels.Of(x.P), $"{n} · {pct:0}%", x.B);
        }).ToList();

        // Daily trends
        var dates = Enumerable.Range(0, days).Select(i => from.AddDays(i)).ToList();
        var labelFormat = days <= 31 ? "dd/MM" : "dd/MM";
        TrendLabels = dates.Select(d => d.ToString(labelFormat)).ToList();
        TrendSeries =
        [
            new("Việc mới giao", NewTaskBrush, dates.Select(d => (double)allTasks.Count(t => DateOnly.FromDateTime(t.CreatedAt.ToLocalTime()) == d)).ToList()),
            new("Việc hoàn thành", DoneTaskBrush, dates.Select(d => (double)allTasks.Count(t => t.CompletedAt is { } c && DateOnly.FromDateTime(c) == d)).ToList()),
        ];
        AttendanceLabels = TrendLabels;
        AttendanceSeries =
        [
            new("Có mặt", PresentBrush, dates.Select(d => (double)records.Where(r => r.WorkDate == d).Sum(r => PayrollCalculator.WorkDayValue(r.Status))).ToList()),
            new("Nghỉ phép", LeaveBrush, dates.Select(d => (double)records.Count(r => r.WorkDate == d && r.Status is AttendanceStatus.PaidLeave or AttendanceStatus.UnpaidLeave)).ToList()),
        ];

        // Payroll fund for the last six months
        var bars = new List<ChartPoint>();
        for (var i = 5; i >= 0; i--)
        {
            var m = now.AddMonths(-i);
            var slips = await payslips.ListAsync(m.Year, m.Month);
            bars.Add(new ChartPoint($"T{m.Month}/{m.Year % 100:00}", (double)slips.Sum(s => s.NetPay), ChartBase.Palette[0]));
        }
        PayrollBars = bars;

        // Completed tasks per team in the period
        TeamBars = staff.GroupBy(e => e.Department?.Name ?? "Chưa phân tổ")
            .Select(g =>
            {
                var ids = g.Select(e => e.Id).ToHashSet();
                return new ChartPoint(g.Key, allTasks.Count(t => ids.Contains(t.AssigneeId) && t.Status == WorkTaskStatus.Completed && t.CompletedAt >= from.ToDateTime(TimeOnly.MinValue)));
            })
            .OrderByDescending(p => p.Value).Take(6).ToList();

        // Lists that need the owner
        TaskAttention.Clear();
        foreach (var t in overdue.OrderBy(t => t.DueDate).Take(5))
            TaskAttention.Add(new AttentionItem(t.Title, $"{t.Assignee?.FullName} · quá hạn từ {t.DueDate:dd/MM HH:mm}", "Danger"));
        foreach (var t in allTasks.Where(t => t.Status == WorkTaskStatus.Rejected).Take(5 - Math.Min(5, TaskAttention.Count)))
            TaskAttention.Add(new AttentionItem(t.Title, $"{t.Assignee?.FullName} từ chối: {t.ReportNote}", "Warning"));

        StaffAttention.Clear();
        if (now.Hour >= 8)
            foreach (var e in missingToday.Take(6)) StaffAttention.Add(new AttentionItem(e.FullName, "Chưa chấm công hôm nay", "Danger"));
        foreach (var e in incomplete.Take(6 - StaffAttention.Count))
            StaffAttention.Add(new AttentionItem(e.FullName, "Hồ sơ thiếu số điện thoại, CCCD hoặc tài khoản ngân hàng", "Neutral"));

        LeaveAttention.Clear();
        foreach (var l in pending.Take(6))
            LeaveAttention.Add(new AttentionItem(l.Employee?.FullName ?? "", $"{Labels.Of(l.Type)} {l.Days} ngày · {l.FromDate:dd/MM}–{l.ToDate:dd/MM}" + (l.HasAttachment ? " · có minh chứng" : ""), "Warning"));
    }

    public static string Money(decimal v) => MoneyConverter.Format(v);
}
