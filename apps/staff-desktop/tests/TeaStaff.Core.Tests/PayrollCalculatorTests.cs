// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;

namespace TeaStaff.Core.Tests;

public class PayrollCalculatorTests
{
    private static readonly PayrollPolicy Policy = new(StandardWorkDays: 26m, InsuranceRate: 0.105m, OvertimeMultiplier: 1.5m, HoursPerDay: 8m);

    [Fact]
    public void Monthly_full_attendance_earns_base_salary_minus_insurance()
    {
        var slip = new Payslip { SalaryType = SalaryType.Monthly, BaseSalary = 7_800_000, StandardDays = 26, WorkDays = 26 };
        PayrollCalculator.Recalculate(slip, ContractType.FullTime, Policy);
        Assert.Equal(7_800_000, slip.EarnedSalary);
        Assert.Equal(819_000, slip.Insurance);
        Assert.Equal(6_981_000, slip.NetPay);
    }

    [Fact]
    public void Monthly_salary_is_prorated_and_paid_leave_counts()
    {
        var slip = new Payslip { SalaryType = SalaryType.Monthly, BaseSalary = 5_200_000, StandardDays = 26, WorkDays = 20, PaidLeaveDays = 2 };
        PayrollCalculator.Recalculate(slip, ContractType.Probation, Policy);
        Assert.Equal(4_400_000, slip.EarnedSalary);
        Assert.Equal(0, slip.Insurance);
    }

    [Fact]
    public void Monthly_salary_never_exceeds_base_even_with_extra_days()
    {
        var slip = new Payslip { SalaryType = SalaryType.Monthly, BaseSalary = 5_200_000, StandardDays = 26, WorkDays = 28 };
        PayrollCalculator.Recalculate(slip, ContractType.PartTime, Policy);
        Assert.Equal(5_200_000, slip.EarnedSalary);
    }

    [Fact]
    public void Daily_wage_with_overtime_allowance_bonus_and_deductions()
    {
        var slip = new Payslip
        {
            SalaryType = SalaryType.Daily, BaseSalary = 280_000, WorkDays = 20.5m, OvertimeHours = 4,
            Allowance = 100_000, Bonus = 200_000, Deduction = 50_000, Advance = 1_000_000,
        };
        PayrollCalculator.Recalculate(slip, ContractType.Seasonal, Policy);
        Assert.Equal(5_740_000, slip.EarnedSalary);
        Assert.Equal(210_000, slip.OvertimePay); // 280k / 8h * 4h * 1.5
        Assert.Equal(6_250_000, slip.GrossPay);
        Assert.Equal(0, slip.Insurance);
        Assert.Equal(5_200_000, slip.NetPay);
    }

    [Fact]
    public void Net_pay_is_never_negative()
    {
        var slip = new Payslip { SalaryType = SalaryType.Daily, BaseSalary = 250_000, WorkDays = 1, Advance = 2_000_000 };
        PayrollCalculator.Recalculate(slip, ContractType.Seasonal, Policy);
        Assert.Equal(0, slip.NetPay);
    }

    [Theory]
    [InlineData(AttendanceStatus.Present, 1)]
    [InlineData(AttendanceStatus.HalfDay, 0.5)]
    [InlineData(AttendanceStatus.Absent, 0)]
    [InlineData(AttendanceStatus.PaidLeave, 0)]
    public void Work_day_values(AttendanceStatus status, double expected) =>
        Assert.Equal((decimal)expected, PayrollCalculator.WorkDayValue(status));
}

public class TaskWorkflowTests
{
    private static WorkTask NewTask(WorkTaskStatus status = WorkTaskStatus.Assigned) => new() { Title = "Hái chè", Status = status };

    [Fact]
    public void Staff_accepts_then_reports_progress_then_completes()
    {
        var now = new DateTime(2026, 11, 16, 10, 0, 0);
        var task = NewTask();
        TaskWorkflow.ApplyStaffUpdate(task, WorkTaskStatus.Accepted, null, null, now);
        TaskWorkflow.ApplyStaffUpdate(task, WorkTaskStatus.InProgress, 60, "Đã hái nửa đồi", now);
        Assert.Equal(60, task.Progress);
        TaskWorkflow.ApplyStaffUpdate(task, WorkTaskStatus.Completed, null, null, now);
        Assert.Equal(100, task.Progress);
        Assert.Equal(now, task.CompletedAt);
        Assert.Equal("Đã hái nửa đồi", task.ReportNote);
    }

    [Fact]
    public void Rejecting_requires_a_reason() =>
        Assert.Throws<DomainException>(() => TaskWorkflow.ApplyStaffUpdate(NewTask(), WorkTaskStatus.Rejected, null, " ", DateTime.Now));

    [Theory]
    [InlineData(WorkTaskStatus.Assigned, WorkTaskStatus.Completed)]
    [InlineData(WorkTaskStatus.Completed, WorkTaskStatus.InProgress)]
    [InlineData(WorkTaskStatus.Cancelled, WorkTaskStatus.Accepted)]
    public void Invalid_transitions_are_rejected(WorkTaskStatus from, WorkTaskStatus to) =>
        Assert.Throws<DomainException>(() => TaskWorkflow.ApplyStaffUpdate(NewTask(from), to, null, "x", DateTime.Now));

    [Fact]
    public void In_progress_is_capped_below_100() =>
        Assert.Equal(99, TaskWorkflow.ApplyStaffUpdate(NewTask(WorkTaskStatus.Accepted), WorkTaskStatus.InProgress, 150, null, DateTime.Now).Progress);

    [Fact]
    public void Overdue_only_for_open_tasks()
    {
        var now = new DateTime(2026, 11, 16, 18, 0, 0);
        var open = NewTask(WorkTaskStatus.InProgress);
        open.DueDate = now.AddHours(-1);
        var done = NewTask(WorkTaskStatus.Completed);
        done.DueDate = now.AddHours(-1);
        Assert.True(open.IsOverdue(now));
        Assert.False(done.IsOverdue(now));
    }
}
