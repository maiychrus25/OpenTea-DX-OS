// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Domain;

namespace TeaStaff.Core.Abstractions;

/// <summary>
/// Persistence ports. The desktop ships with an EF Core adapter (SQLite or the shared
/// DX-OS PostgreSQL schema); every call is scoped to the current tenant (HTX code).
/// </summary>
public interface IDepartmentRepository
{
    Task<IReadOnlyList<Department>> ListAsync(CancellationToken ct = default);
    Task<Department> SaveAsync(Department department, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
    Task<int> CountEmployeesAsync(int departmentId, CancellationToken ct = default);
}

public interface IEmployeeRepository
{
    Task<IReadOnlyList<Employee>> ListAsync(CancellationToken ct = default);
    Task<Employee?> GetAsync(int id, CancellationToken ct = default);
    Task<Employee?> FindByUsernameAsync(string username, CancellationToken ct = default);
    Task<bool> CodeExistsAsync(string code, int exceptId, CancellationToken ct = default);
    Task<bool> UsernameExistsAsync(string username, int exceptId, CancellationToken ct = default);
    Task<Employee> SaveAsync(Employee employee, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
    Task<string> NextCodeAsync(CancellationToken ct = default);
}

public interface ITaskRepository
{
    Task<IReadOnlyList<WorkTask>> ListAsync(int? assigneeId = null, CancellationToken ct = default);
    Task<WorkTask?> GetAsync(int id, CancellationToken ct = default);
    Task<WorkTask?> FindByExternalRefAsync(string externalRef, CancellationToken ct = default);
    Task<WorkTask> SaveAsync(WorkTask task, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}

public interface IAttendanceRepository
{
    Task<IReadOnlyList<AttendanceRecord>> ListAsync(DateOnly from, DateOnly to, int? employeeId = null, CancellationToken ct = default);
    Task<AttendanceRecord?> GetAsync(int employeeId, DateOnly day, CancellationToken ct = default);
    Task<AttendanceRecord> SaveAsync(AttendanceRecord record, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}

public interface ILeaveRepository
{
    Task<IReadOnlyList<LeaveRequest>> ListAsync(int? employeeId = null, CancellationToken ct = default);
    Task<LeaveRequest?> GetAsync(int id, CancellationToken ct = default);
    Task<LeaveRequest> SaveAsync(LeaveRequest request, CancellationToken ct = default);
}

public interface IPayslipRepository
{
    Task<IReadOnlyList<Payslip>> ListAsync(int year, int month, CancellationToken ct = default);
    Task<IReadOnlyList<Payslip>> ListForEmployeeAsync(int employeeId, CancellationToken ct = default);
    Task<Payslip> SaveAsync(Payslip payslip, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}

public interface ISettingsRepository
{
    Task<string?> GetAsync(string key, CancellationToken ct = default);
    Task SetAsync(string key, string value, CancellationToken ct = default);
}

public interface IRecurringTaskRepository
{
    Task<IReadOnlyList<RecurringTask>> ListAsync(CancellationToken ct = default);
    Task<RecurringTask?> GetAsync(int id, CancellationToken ct = default);
    Task<RecurringTask> SaveAsync(RecurringTask template, CancellationToken ct = default);
    Task DeleteAsync(int id, CancellationToken ct = default);
}

public interface IAutomationRepository
{
    Task<IReadOnlyList<AutomationSuggestion>> ListSuggestionsAsync(SuggestionStatus? status = null, CancellationToken ct = default);
    Task<AutomationSuggestion?> GetSuggestionAsync(int id, CancellationToken ct = default);
    Task<AutomationSuggestion> SaveSuggestionAsync(AutomationSuggestion suggestion, CancellationToken ct = default);
    Task AddLogAsync(string rule, string message, CancellationToken ct = default);
    Task<IReadOnlyList<AutomationLog>> ListLogsAsync(int take = 50, CancellationToken ct = default);
}

public interface IOwnerAccountRepository
{
    Task<OwnerAccount?> FindAsync(string username, CancellationToken ct = default);
    Task<OwnerAccount> SaveAsync(OwnerAccount account, CancellationToken ct = default);
    Task<bool> AnyAsync(CancellationToken ct = default);
}
