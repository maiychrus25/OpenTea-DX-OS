// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Desktop.Converters;
using TeaStaff.Desktop.Services;

namespace TeaStaff.Desktop.ViewModels;

public sealed record StatCard(string Label, string Value, string Hint, string Glyph, string Target);

public sealed record DepartmentLoad(string Name, int Open, int Done, double Ratio);

public sealed partial class DashboardViewModel(
    IDialogService dialogs, IEmployeeRepository employees, ITaskRepository tasks, IAttendanceRepository attendance,
    ILeaveRepository leaves, IPayslipRepository payslips, IClock clock, ITenantContext tenant) : PageViewModel(dialogs)
{
    public override string Title => "Tổng quan";
    public override string Subtitle => $"Xin chào {tenant.DisplayName}, đây là tình hình nhân sự hôm nay.";
    public override IReadOnlyCollection<string> WatchedAreas => [DataAreas.Tasks, DataAreas.Attendance, DataAreas.Leaves, DataAreas.Employees];

    public ObservableCollection<StatCard> Stats { get; } = [];
    public ObservableCollection<WorkTask> UrgentTasks { get; } = [];
    public ObservableCollection<LeaveRequest> PendingLeaves { get; } = [];
    public ObservableCollection<DepartmentLoad> Departments { get; } = [];

    [ObservableProperty] private int _presentToday;
    [ObservableProperty] private int _activeEmployees;
    [ObservableProperty] private double _presentRatio;
    [ObservableProperty] private string _todayLabel = string.Empty;

    public event EventHandler<string>? NavigateRequested;

    public override async Task LoadAsync()
    {
        var now = clock.Now;
        var today = DateOnly.FromDateTime(now);
        var staff = await employees.ListAsync();
        var allTasks = await tasks.ListAsync();
        var todayRecords = await attendance.ListAsync(today, today);
        var allLeaves = await leaves.ListAsync();
        var lastMonth = now.AddMonths(-1);
        var slips = await payslips.ListAsync(now.Year, now.Month);
        if (slips.Count == 0) slips = await payslips.ListAsync(lastMonth.Year, lastMonth.Month);

        var active = staff.Where(e => e.Status == EmployeeStatus.Active).ToList();
        var open = allTasks.Where(t => t.IsOpen).ToList();
        var overdue = open.Count(t => t.IsOverdue(now));
        var pending = allLeaves.Where(l => l.Status == LeaveStatus.Pending).ToList();

        ActiveEmployees = active.Count;
        PresentToday = todayRecords.Count(r => r.Status is AttendanceStatus.Present or AttendanceStatus.HalfDay);
        PresentRatio = ActiveEmployees == 0 ? 0 : (double)PresentToday / ActiveEmployees;
        TodayLabel = now.ToString("dddd, dd/MM/yyyy", MoneyConverter.Vi);

        Stats.Clear();
        Stats.Add(new StatCard("Nhân viên đang làm", active.Count.ToString(), $"{staff.Count} hồ sơ trong HTX", "", "employees"));
        Stats.Add(new StatCard("Việc đang thực hiện", open.Count.ToString(), overdue > 0 ? $"{overdue} việc quá hạn" : "Không có việc quá hạn", "", "tasks"));
        Stats.Add(new StatCard("Đơn nghỉ chờ duyệt", pending.Count.ToString(), pending.Count > 0 ? "Cần xử lý" : "Đã xử lý hết", "", "leaves"));
        Stats.Add(new StatCard("Quỹ lương", MoneyConverter.Format(slips.Sum(s => s.NetPay)),
            slips.Count == 0 ? "Chưa tính lương tháng này" : $"Tháng {slips[0].Month}/{slips[0].Year} · {slips.Count} phiếu", "", "payroll"));

        UrgentTasks.Clear();
        foreach (var t in open.OrderBy(t => t.IsOverdue(now) ? 0 : 1).ThenByDescending(t => t.Priority).ThenBy(t => t.DueDate).Take(6))
            UrgentTasks.Add(t);

        PendingLeaves.Clear();
        foreach (var l in pending.Take(5)) PendingLeaves.Add(l);

        Departments.Clear();
        foreach (var g in allTasks.Where(t => t.Status != WorkTaskStatus.Cancelled)
                     .GroupBy(t => t.Assignee?.DepartmentId)
                     .Select(g => new
                     {
                         Name = staff.FirstOrDefault(e => e.DepartmentId == g.Key)?.Department?.Name ?? "Chưa phân tổ",
                         Open = g.Count(t => t.IsOpen),
                         Done = g.Count(t => t.Status == WorkTaskStatus.Completed),
                     })
                     .OrderByDescending(x => x.Open + x.Done))
        {
            var total = g.Open + g.Done;
            Departments.Add(new DepartmentLoad(g.Name, g.Open, g.Done, total == 0 ? 0 : (double)g.Done / total));
        }
        OnPropertyChanged(nameof(Subtitle));
    }

    [RelayCommand]
    private void Open(string target) => NavigateRequested?.Invoke(this, target);
}
