// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;

namespace TeaStaff.Core.Tests;

public class AssignmentAdvisorTests
{
    private static readonly DateTime Now = new(2026, 11, 24, 8, 0, 0);

    private static Employee Staff(int id, int? dept = 1) => new() { Id = id, Code = $"NV{id:000}", FullName = $"Nhân viên {id}", DepartmentId = dept };

    private static WorkTask Done(int assignee, string title, int daysAgo, bool late = false, string? location = null) => new()
    {
        AssigneeId = assignee, Title = title, Location = location, Status = WorkTaskStatus.Completed,
        StartDate = Now.AddDays(-daysAgo).Date.AddHours(7), DueDate = Now.AddDays(-daysAgo).Date.AddHours(17),
        CompletedAt = Now.AddDays(-daysAgo).Date.AddHours(late ? 19 : 15),
    };

    private static AssignmentRequest Request(string title = "Hái chè đồi A3", string? location = "Đồi A3") =>
        new(title, location, Now.Date.AddHours(7), Now.Date.AddHours(17), DepartmentId: 1);

    [Fact]
    public void Prefers_staff_with_similar_finished_work()
    {
        var history = new[] { Done(2, "Hái chè lứa 5 đồi A3", 3), Done(2, "Hái chè đồi B1", 10) };
        var ranked = AssignmentAdvisor.Rank(Request(), [Staff(1), Staff(2)], history, [], [], Now);
        Assert.Equal(2, ranked[0].Employee.Id);
        Assert.Contains(ranked[0].Facts, f => f.Positive && f.Text.Contains("việc tương tự"));
    }

    [Fact]
    public void Staff_on_leave_are_listed_last_and_unavailable()
    {
        var leave = new LeaveRequest { EmployeeId = 1, FromDate = DateOnly.FromDateTime(Now), ToDate = DateOnly.FromDateTime(Now), Status = LeaveStatus.Approved };
        var ranked = AssignmentAdvisor.Rank(Request(), [Staff(1), Staff(2)], [Done(1, "Hái chè đồi A3", 2)], [leave], [], Now);
        Assert.Equal(2, ranked[0].Employee.Id);
        Assert.False(ranked[1].Available);
        Assert.Equal(0, ranked[1].Score);
    }

    [Fact]
    public void Overlapping_open_work_lowers_the_score()
    {
        var busy = new WorkTask { AssigneeId = 1, Title = "Sao chè", Status = WorkTaskStatus.InProgress, StartDate = Now.Date.AddHours(8), DueDate = Now.Date.AddHours(16) };
        var ranked = AssignmentAdvisor.Rank(Request("Bón phân", null), [Staff(1), Staff(2)], [busy], [], [], Now);
        Assert.Equal(2, ranked[0].Employee.Id);
        Assert.Contains(ranked[1].Facts, f => !f.Positive && f.Text.Contains("trùng thời gian"));
    }

    [Fact]
    public void Excluded_employee_is_not_suggested()
    {
        var ranked = AssignmentAdvisor.Rank(Request() with { ExcludeEmployeeId = 1 }, [Staff(1), Staff(2)], [], [], [], Now);
        Assert.DoesNotContain(ranked, c => c.Employee.Id == 1);
    }

    [Fact]
    public void Late_history_reports_the_on_time_rate()
    {
        var history = new[] { Done(1, "Tưới nước", 5, late: true), Done(1, "Tưới nước", 6) };
        var ranked = AssignmentAdvisor.Rank(Request("Tưới nước", null), [Staff(1)], history, [], [], Now);
        Assert.Contains(ranked[0].Facts, f => f.Text == "Đúng hạn 1/2 việc trong 90 ngày");
    }

    [Fact]
    public void Tokens_ignore_accents_and_numbers()
    {
        Assert.Equal(1, AssignmentAdvisor.Similarity(AssignmentAdvisor.Tokens("Hái chè lứa 6"), AssignmentAdvisor.Tokens("hai che")));
    }
}

public class RecurringTaskTests
{
    [Theory]
    [InlineData("1,2,3,4,5,6", 2026, 11, 23, true)]  // Monday
    [InlineData("1,2,3,4,5,6", 2026, 11, 29, false)] // Sunday
    [InlineData("7", 2026, 11, 29, true)]
    [InlineData(" 3 , x ,9", 2026, 11, 25, true)]    // Wednesday, invalid parts ignored
    public void Runs_on_listed_iso_weekdays(string days, int y, int m, int d, bool expected) =>
        Assert.Equal(expected, new TeaStaff.Core.Domain.RecurringTask { Weekdays = days }.RunsOn(new DateOnly(y, m, d)));
}
