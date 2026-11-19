// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaStaff.Core.Domain;

/// <summary>
/// Every persisted row carries <see cref="HtxCode"/>, mirroring the OpenTea DX-OS rule that
/// each table of a mini-app schema must have an <c>htx_code text NOT NULL</c> column.
/// </summary>
public abstract class TenantEntity
{
    public int Id { get; set; }
    public string HtxCode { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class Department : TenantEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ManagerName { get; set; }
}

public class Employee : TenantEntity
{
    public string Code { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public Gender Gender { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? IdentityNumber { get; set; }
    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
    public string Position { get; set; } = string.Empty;
    public DateOnly HireDate { get; set; } = DateOnly.FromDateTime(DateTime.Today);
    public ContractType ContractType { get; set; }
    public SalaryType SalaryType { get; set; }
    public decimal BaseSalary { get; set; }
    public decimal Allowance { get; set; }
    public string? BankAccount { get; set; }
    public string? BankName { get; set; }
    public EmployeeStatus Status { get; set; }
    public int AnnualLeaveDays { get; set; } = 12;
    public string? Note { get; set; }

    /// <summary>Login name for the staff mobile app.</summary>
    public string? Username { get; set; }
    public string? PasswordHash { get; set; }

    /// <summary>Keycloak subject id once the employee is linked to the shared DX-OS account.</summary>
    public string? CoreUserId { get; set; }

    public bool IsActive => Status != EmployeeStatus.Resigned;
}

public class WorkTask : TenantEntity
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Location { get; set; }
    public int AssigneeId { get; set; }
    public Employee? Assignee { get; set; }
    public TaskPriority Priority { get; set; } = TaskPriority.Normal;
    public DateTime StartDate { get; set; } = DateTime.Today;
    public DateTime DueDate { get; set; } = DateTime.Today.AddDays(1);
    public WorkTaskStatus Status { get; set; } = WorkTaskStatus.Assigned;
    public int Progress { get; set; }
    public string? ReportNote { get; set; }
    public string AssignedBy { get; set; } = string.Empty;
    public DateTime? CompletedAt { get; set; }

    public bool IsOpen => Status is WorkTaskStatus.Assigned or WorkTaskStatus.Accepted or WorkTaskStatus.InProgress;
    public bool IsOverdue(DateTime now) => IsOpen && DueDate < now;
}

public class AttendanceRecord : TenantEntity
{
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public DateOnly WorkDate { get; set; }
    public DateTime? CheckIn { get; set; }
    public DateTime? CheckOut { get; set; }
    public AttendanceStatus Status { get; set; }
    public decimal OvertimeHours { get; set; }
    public string? Note { get; set; }
    public RecordSource Source { get; set; }
}

public class LeaveRequest : TenantEntity
{
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public DateOnly FromDate { get; set; }
    public DateOnly ToDate { get; set; }
    public LeaveType Type { get; set; }
    public string? Reason { get; set; }
    public LeaveStatus Status { get; set; } = LeaveStatus.Pending;
    public string? ReviewNote { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public RecordSource Source { get; set; }

    public int Days => ToDate.DayNumber - FromDate.DayNumber + 1;
}

public class Payslip : TenantEntity
{
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public int Year { get; set; }
    public int Month { get; set; }
    public SalaryType SalaryType { get; set; }
    public decimal BaseSalary { get; set; }
    public decimal StandardDays { get; set; }
    public decimal WorkDays { get; set; }
    public decimal PaidLeaveDays { get; set; }
    public decimal OvertimeHours { get; set; }
    public decimal Allowance { get; set; }
    public decimal Bonus { get; set; }
    public decimal Deduction { get; set; }
    public decimal Advance { get; set; }
    public decimal EarnedSalary { get; set; }
    public decimal OvertimePay { get; set; }
    public decimal Insurance { get; set; }
    public decimal GrossPay { get; set; }
    public decimal NetPay { get; set; }
    public PayslipStatus Status { get; set; }
    public string? Note { get; set; }
    public DateTime? PaidAt { get; set; }
}

public class AppSetting : TenantEntity
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

public class OwnerAccount : TenantEntity
{
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
}
