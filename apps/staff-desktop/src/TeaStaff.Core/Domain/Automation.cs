// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaStaff.Core.Domain;

/// <summary>
/// Work that repeats on fixed weekdays (picking rounds, watering, machine checks). The
/// automation engine turns it into a task every matching day.
/// </summary>
public class RecurringTask : TenantEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Location { get; set; }
    public TaskPriority Priority { get; set; } = TaskPriority.Normal;
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }

    /// <summary>Employee who normally does it; when unavailable the advisor picks someone else.</summary>
    public int? PreferredAssigneeId { get; set; }
    public Employee? PreferredAssignee { get; set; }

    /// <summary>ISO weekdays, 1 = Monday … 7 = Sunday, comma separated (e.g. "1,2,3,4,5,6").</summary>
    public string Weekdays { get; set; } = "1,2,3,4,5,6";
    public int StartMinute { get; set; } = 7 * 60;
    public int DueMinute { get; set; } = 17 * 60;

    /// <summary>True: the task goes straight to the best-ranked person. False: it waits as a suggestion for the owner.</summary>
    public bool AutoAssign { get; set; }
    public bool IsActive { get; set; } = true;
    public DateOnly? LastGeneratedOn { get; set; }

    public IReadOnlySet<int> Days => Weekdays.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(d => int.TryParse(d, out var n) ? n : 0).Where(n => n is >= 1 and <= 7).ToHashSet();

    public bool RunsOn(DateOnly day) => Days.Contains(day.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)day.DayOfWeek);
}

public enum SuggestionKind { AssignRecurring, ReassignRejected, ReassignLeave, ApproveLeave, FieldAlert }

public enum SuggestionStatus { Pending, Accepted, Dismissed }

/// <summary>
/// Something the engine prepared but a person must confirm, with the facts behind it.
/// One click on "Đồng ý" carries it out.
/// </summary>
public class AutomationSuggestion : TenantEntity
{
    public SuggestionKind Kind { get; set; }
    public SuggestionStatus Status { get; set; } = SuggestionStatus.Pending;
    public string Title { get; set; } = string.Empty;

    /// <summary>Facts behind the suggestion, one per line.</summary>
    public string? Detail { get; set; }
    public int? TaskId { get; set; }
    public int? TemplateId { get; set; }
    public int? LeaveId { get; set; }
    public int? EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public DateOnly? ForDate { get; set; }

    /// <summary>Work proposed by a field sensor alert (Tea IoT Station): what to do and where.</summary>
    public string? TaskTitle { get; set; }
    public string? TaskLocation { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? ResolvedBy { get; set; }
}

/// <summary>An action the engine carried out on its own, kept for the owner to review.</summary>
public class AutomationLog : TenantEntity
{
    public string Rule { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}
